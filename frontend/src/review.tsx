import { useEffect, useState } from "react";
import { api } from "./api";
import { localDate, rangeFor } from "./periods";
type Data = {
  focus_sessions: {
    id: string;
    title: string | null;
    completed_at: string;
    minutes: number;
  }[];
  minutes: number;
  sessions: number;
  previous_minutes: number;
  active_days: number;
  daily: { day: string; minutes: number }[];
  completed_tasks: { id: string; title: string }[];
  habits: { id: string; title: string; checkins: number }[];
  goals: {
    id: string;
    title: string;
    progress: number;
    target: number;
    unit: string;
  }[];
};
export function Review() {
  const [period, setPeriod] = useState("weekly"),
    [anchor, setAnchor] = useState(localDate()),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const range = rangeFor(period, anchor);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    const query = new URLSearchParams({
      ...range,
      period,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    api<Data>(`review?${query}`)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, period, retry]);
  useEffect(() => {
    const refresh = () => setRetry((n) => n + 1);
    window.addEventListener("tempo:activity", refresh);
    return () => window.removeEventListener("tempo:activity", refresh);
  }, []);
  function navigate(direction: number) {
    const d = new Date(range.start + "T12:00:00");
    if (period === "weekly") d.setDate(d.getDate() + 7 * direction);
    else d.setMonth(d.getMonth() + direction);
    setAnchor(localDate(d));
  }
  return (
    <section className="review">
      <div className="review-controls">
        <label>
          Review
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <button aria-label="Previous period" onClick={() => navigate(-1)}>
          ←
        </button>
        <span>
          {range.start} — {range.end}
        </span>
        <button
          aria-label="Next period"
          disabled={range.end >= localDate()}
          onClick={() => navigate(1)}
        >
          →
        </button>
        <button
          onClick={() => {
            setAnchor(localDate());
            setRetry((n) => n + 1);
          }}
        >
          Today
        </button>
        <button onClick={() => setRetry((n) => n + 1)}>Refresh</button>
      </div>
      {error ? (
        <p role="alert">
          {error}
          <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </p>
      ) : !data ? (
        <p role="status">Loading review…</p>
      ) : (
        <>
          <div className="review-totals">
            <div>
              <strong>{data.minutes}</strong> focus minutes
              <small>
                {data.minutes - data.previous_minutes >= 0 ? "+" : ""}
                {data.minutes - data.previous_minutes} vs previous period
              </small>
            </div>
            <div>
              <strong>{data.sessions}</strong> sessions
              <small>{data.active_days} active days</small>
            </div>
            <div>
              <strong>{data.completed_tasks.length}</strong> tasks completed
              <small>
                {data.habits.reduce((n, h) => n + h.checkins, 0)} habit
                check-ins
              </small>
            </div>
          </div>
          <h3>Your focus rhythm</h3>
          <div className="review-chart" aria-label="Daily focus minutes">
            {data.daily.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.minutes} minutes`}>
                <span
                  style={{
                    height: Math.max(
                      2,
                      (d.minutes /
                        Math.max(1, ...data.daily.map((x) => x.minutes))) *
                        100,
                    ),
                  }}
                />
                <small>{Number(d.day.slice(-2))}</small>
                <span className="sr-only">
                  {d.day}: {d.minutes} minutes
                </span>
              </div>
            ))}
          </div>
          {!data.sessions && (
            <p className="field-help">No focus sessions in this period yet.</p>
          )}
          <h3>Focus sessions</h3>
          {data.focus_sessions.map((s) => (
            <p key={s.id}>
              {s.title || "Open focus"}
              <strong className="review-value">{s.minutes} min</strong>
              <small style={{ display: "block", color: "var(--theme-muted)" }}>
                {new Date(s.completed_at).toLocaleString()}
              </small>
            </p>
          ))}
          <h3>Completed tasks</h3><p className="field-help">Tasks still marked Done, completed in this period. Older tasks without a completion date are excluded.</p>
          {data.completed_tasks.length ? (
            data.completed_tasks.map((t) => <p key={t.id}>✓ {t.title}</p>)
          ) : (
            <p className="field-help">
              No dated task completions in this period.
            </p>
          )}
          <h3>Habits</h3>
          {data.habits.length ? (
            data.habits.map((h) => (
              <p key={h.id}>
                {h.title}
                <strong className="review-value">{h.checkins} check-ins</strong>
              </p>
            ))
          ) : (
            <p className="field-help">
              Add a habit to start tracking consistency.
            </p>
          )}
          <h3>Goals overlapping this period</h3>
          <p className="field-help">
            Progress covers each goal’s full date range.
          </p>
          {data.goals.map((g) => (
            <div key={g.id}>
              <p>
                {g.title}
                <strong className="review-value">
                  {g.progress}/{g.target} {g.unit}
                </strong>
              </p>
              <progress value={g.progress} max={g.target} />
            </div>
          ))}
        </>
      )}
    </section>
  );
}
