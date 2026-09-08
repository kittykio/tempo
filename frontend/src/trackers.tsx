import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "./api";
import { localDate, rangeFor } from "./periods";
import { habitStreaks } from "./streaks";
type Goal = {
  source?: string;
  habit_id?: string | null;
  timezone?: string;
  id: string;
  title: string;
  period: string;
  start: string;
  end: string;
  target: number;
  progress: number;
  unit: string;
};
type Habit = {
  id: string;
  title: string;
  days: number[];
  created: string;
  checks: string[];
};
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function Trackers({ kind }: { kind: "goals" | "habits" }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Goal | Habit | null>(null);
  const [adding, setAdding] = useState(false);
  const [period, setPeriod] = useState("weekly");
  const [range, setRange] = useState(rangeFor("weekly", localDate()));
  const [source, setSource] = useState("manual");
  const [habitId, setHabitId] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [week, setWeek] = useState(0);
  async function load() {
    const [g, h] = await Promise.all([
      api<Goal[]>("goals"),
      api<Habit[]>("habits"),
    ]);
    setGoals(g);
    setHabits(h);
    setLoaded(true);
  }
  useEffect(() => {
    const refresh = () => void load().catch((e) => setError(e.message));
    refresh();
    window.addEventListener("tempo:activity", refresh);
    return () => window.removeEventListener("tempo:activity", refresh);
  }, []);
  useEffect(() => {
    setEditing(null);
    setAdding(false);
    setError("");
  }, [kind]);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function begin(item?: Goal | Habit) {
    setEditing(item || null);
    setAdding(true);
    if (kind === "goals") {
      const g = item as Goal | undefined;
      setPeriod(g?.period || "weekly");
      setSource(g?.source || "focus_sessions");
      setHabitId(g?.habit_id || "");
      setRange(
        g ? { start: g.start, end: g.end } : rangeFor("weekly", localDate()),
      );
    } else setDays((item as Habit | undefined)?.days || []);
  }
  const monday = new Date(rangeFor("weekly", localDate()).start + "T12:00:00");
  monday.setDate(monday.getDate() + week * 7);
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return localDate(d);
  });
  return (
    <div className="settings-body trackers">
      <div className="tracker-heading">
        <div>
          <h3>
            {kind === "goals"
              ? "Give your time a direction."
              : "Small things, done often."}
          </h3>
          <p className="field-help">
            {kind === "goals"
              ? "Set a target for a date range. Update progress as you go."
              : "Choose your days and check in. Missed days are just a fresh start."}
          </p>
        </div>
        <button className="primary" onClick={() => begin()} disabled={busy}>
          <Plus size={16} /> {kind === "goals" ? "New goal" : "New habit"}
        </button>
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}
          {!loaded && <button onClick={() => void run(load)}>Retry</button>}
        </p>
      )}
      {adding && (
        <form
          className="tracker-form"
          key={editing?.id || kind}
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const payload =
              kind === "goals"
                ? {
                    title: data.get("title"),
                    period,
                    ...range,
                    target: Number(data.get("target")),
                    progress:
                      source === "manual" ? Number(data.get("progress")) : 0,
                    unit:
                      source === "manual"
                        ? data.get("unit")
                        : source === "focus_minutes"
                          ? "minutes"
                          : source === "habit_checkins"
                            ? "check-ins"
                            : "sessions",
                    source,
                    habit_id:
                      source === "habit_checkins" ? habitId || null : null,
                    timezone:
                      (editing as Goal)?.timezone ||
                      Intl.DateTimeFormat().resolvedOptions().timeZone,
                  }
                : {
                    title: data.get("title"),
                    days,
                    created: (editing as Habit)?.created || localDate(),
                  };
            const ok = await run(() =>
              api(`${kind}${editing ? "/" + editing.id : ""}`, {
                method: editing ? "PUT" : "POST",
                body: JSON.stringify(payload),
              }),
            );
            if (ok) {
              setAdding(false);
              setEditing(null);
            }
          }}
        >
          <h4>
            {editing ? "Edit" : "Create"} {kind === "goals" ? "goal" : "habit"}
          </h4>
          <label>
            {kind === "goals" ? "Objective" : "Habit name"}
            <input
              name="title"
              defaultValue={editing?.title}
              required
              maxLength={160}
              placeholder={
                kind === "goals" ? "Read more this month" : "Read before bed"
              }
            />
          </label>
          {kind === "goals" ? (
            <>
              <label>
                Timeframe
                <select
                  value={period}
                  onChange={(e) => {
                    setPeriod(e.target.value);
                    if (e.target.value !== "custom")
                      setRange(rangeFor(e.target.value, localDate()));
                  }}
                >
                  {["daily", "weekly", "monthly", "yearly", "custom"].map(
                    (p) => (
                      <option key={p} value={p}>
                        {p[0].toUpperCase() + p.slice(1)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Start
                  <input
                    type="date"
                    value={range.start}
                    required
                    onChange={(e) => {
                      if (e.target.value)
                        setRange(
                          period === "custom"
                            ? { ...range, start: e.target.value }
                            : rangeFor(period, e.target.value),
                        );
                    }}
                  />
                </label>
                <label>
                  End
                  <input
                    type="date"
                    value={range.end}
                    min={range.start}
                    required
                    readOnly={period !== "custom"}
                    onChange={(e) =>
                      setRange({ ...range, end: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Track progress
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="manual">Manually</option>
                  <option value="focus_sessions">
                    Completed focus sessions
                  </option>
                  <option value="focus_minutes">Focus minutes</option>
                  <option value="habit_checkins">Habit check-ins</option>
                </select>
              </label>
              {source === "habit_checkins" && (
                <label>
                  Habit
                  <select
                    value={habitId}
                    onChange={(e) => setHabitId(e.target.value)}
                  >
                    <option value="">All habits</option>
                    {habitId && !habits.some((h) => h.id === habitId) && (
                      <option value={habitId}>Deleted habit</option>
                    )}
                    {habits.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {source !== "manual" && (
                <p className="field-help">
                  Updates automatically from saved activity within the goal’s
                  dates. Calendar timezone:{" "}
                  {(editing as Goal)?.timezone ||
                    Intl.DateTimeFormat().resolvedOptions().timeZone}
                  .
                </p>
              )}
              <div className="form-row">
                <label>
                  Target
                  <input
                    type="number"
                    name="target"
                    min={1}
                    max={1000000}
                    defaultValue={(editing as Goal)?.target || 10}
                    required
                  />
                </label>
                <label>
                  Progress
                  <input
                    type="number"
                    name="progress"
                    disabled={source !== "manual"}
                    min={0}
                    max={1000000}
                    defaultValue={(editing as Goal)?.progress || 0}
                    required
                  />
                </label>
                <label>
                  Unit
                  <input
                    name="unit"
                    disabled={source !== "manual"}
                    key={source}
                    defaultValue={
                      source === "focus_minutes"
                        ? "minutes"
                        : source === "habit_checkins"
                          ? "check-ins"
                          : source === "focus_sessions"
                            ? "sessions"
                            : (editing as Goal)?.unit || "sessions"
                    }
                    required
                    maxLength={30}
                  />
                </label>
              </div>
              <p className="field-help">
                Each goal covers these dates. Create a new goal for the next
                period.
              </p>
            </>
          ) : (
            <fieldset>
              <legend>Scheduled days</legend>
              <button
                type="button"
                className="everyday-preset"
                aria-pressed={days.length === 7}
                onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}
              >
                <Check size={15} /> Every day
              </button>
              <p className="field-help" role="status">
                {days.length === 7
                  ? "Every day selected. Click a checked day to turn it off."
                  : days.length
                    ? `${days.length} ${days.length === 1 ? "day" : "days"} selected each week.`
                    : "Choose at least one day, or select Every day."}
              </p>
              <div className="weekday-picks">
                {weekdays.map((day, i) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={days.includes(i)}
                    onClick={() =>
                      setDays((current) =>
                        current.includes(i)
                          ? current.filter((d) => d !== i)
                          : [...current, i],
                      )
                    }
                  >
                    {days.includes(i) && <Check size={12} aria-hidden="true" />}
                    {day}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="form-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy || (kind === "habits" && !days.length)}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
      {!loaded && !error && <p role="status">Loading…</p>}
      {loaded && kind === "goals" && (
        <div className="goal-list">
          {goals.length === 0 && (
            <p className="empty">
              Start with one objective that matters to you.
            </p>
          )}
          {goals.map((g) => (
            <article className="goal-card" key={g.id}>
              <div className="goal-top">
                <span className="goal-period">
                  {g.period} ·{" "}
                  {g.progress >= g.target
                    ? "Complete"
                    : g.end < localDate()
                      ? "Ended"
                      : g.start > localDate()
                        ? "Upcoming"
                        : "In progress"}
                </span>
                <span>
                  <button
                    aria-label={`Edit ${g.title}`}
                    onClick={() => begin(g)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    aria-label={`Delete ${g.title}`}
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`Delete goal “${g.title}”?`))
                        void run(() =>
                          api(`goals/${g.id}`, { method: "DELETE" }),
                        );
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
              <h4>{g.title}</h4>
              <p>
                {g.start} — {g.end}
              </p>
              <progress
                value={g.progress}
                max={g.target}
                aria-label={`${g.title} progress`}
              />
              <div className="goal-progress">
                <span>
                  {g.progress} / {g.target} {g.unit}
                </span>
                <button
                  disabled={
                    busy ||
                    g.progress >= g.target ||
                    (!!g.source && g.source !== "manual")
                  }
                  onClick={() =>
                    void run(() =>
                      api(`goals/${g.id}`, {
                        method: "PUT",
                        body: JSON.stringify({
                          ...g,
                          progress: g.progress + 1,
                        }),
                      }),
                    )
                  }
                >
                  <Plus size={14} />{" "}
                  {g.source && g.source !== "manual" ? "Automatic" : "Log one"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {loaded && kind === "habits" && (
        <>
          <div className="week-navigation">
            <button
              aria-label="Previous week"
              onClick={() => setWeek((w) => w - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <span>
              {dates[0]} — {dates[6]}
            </span>
            <button
              aria-label="Next week"
              disabled={week >= 0}
              onClick={() => setWeek((w) => w + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {habits.length === 0 && (
            <p className="empty">A tiny habit is a good place to start.</p>
          )}
          {habits.map((h) => (
            <article className="habit-card" key={h.id}>
              <div className="goal-top">
                <h4>{h.title}</h4>
                <span>
                  <button
                    aria-label={`Edit ${h.title}`}
                    onClick={() => begin(h)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    disabled={busy}
                    aria-label={`Delete ${h.title}`}
                    onClick={() => {
                      if (confirm(`Delete habit “${h.title}” and its history?`))
                        void run(() =>
                          api(`habits/${h.id}`, { method: "DELETE" }),
                        );
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
              <StreakSummary habit={h} />
              <div className="habit-week">
                {dates.map((day, i) => {
                  const done = h.checks.includes(day);
                  const scheduled = h.days.includes(i) && day >= h.created;
                  return (
                    <div key={day}>
                      <small>{weekdays[i]}</small>
                      <button
                        title={day}
                        aria-label={`${h.title} ${day}${done ? " completed" : ""}`}
                        aria-pressed={done}
                        disabled={
                          busy || day > localDate() || (!scheduled && !done)
                        }
                        onClick={() =>
                          void run(() =>
                            api(`habits/${h.id}/check`, {
                              method: "PUT",
                              body: JSON.stringify({
                                day,
                                today: localDate(),
                                completed: !done,
                              }),
                            }),
                          )
                        }
                      >
                        {done ? (
                          <Check size={18} />
                        ) : scheduled ? (
                          Number(day.slice(-2))
                        ) : (
                          "–"
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="field-help">
                {h.checks.filter((d) => dates.includes(d)).length} check-ins
                this week · {h.checks.length} total
              </p>
            </article>
          ))}
        </>
      )}
    </div>
  );
}

function StreakSummary({ habit }: { habit: Habit }) {
  const { current, best } = habitStreaks(habit);
  return (
    <div className="habit-streaks" aria-label={`${habit.title} streaks`}>
      <span>
        <strong>{current}</strong> current streak
      </span>
      <span>
        <strong>{best}</strong> best streak
      </span>
      <small>
        Consecutive scheduled days · today stays open until midnight
      </small>
    </div>
  );
}
