import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Circle,
  Coffee,
  LayoutDashboard,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import "./style.css";
import { secondsLeft } from "./timer";
import { api, type User } from "./api";
import { AccountGate } from "./auth";
import { Review } from "./review";
import { Subtasks } from "./subtasks";
import { completionAlert, prepareAudio } from "./alerts";
import { NotesPanel } from "./notes";
import {
  Personalize,
  TimerObject,
  applyTheme,
  type Preferences,
} from "./personalize";

type Status = "todo" | "progress" | "done";
type Task = {
  id: string;
  title: string;
  notes: string;
  status: Status;
  priority: "low" | "medium" | "high";
  estimate: number;
  sessions: number;
  focus_minutes: number;
};
type Session = {
  id: string;
  task_id: string | null;
  minutes: number;
  completed_at: string;
};
type Clock = {
  mode: "focus" | "short" | "long";
  duration: number;
  remaining: number;
  deadline: number | null;
  taskId: string | null;
  sessionId: string;
};
const durations = { focus: 25, short: 5, long: 15 };
const columns: { id: Status; title: string; description: string }[] = [
  { id: "todo", title: "To do", description: "Make room for what matters." },
  { id: "progress", title: "In progress", description: "One thing at a time." },
  { id: "done", title: "Done", description: "A little progress, every day." },
];
const freshClock = (mode: Clock["mode"] = "focus"): Clock => ({
  mode,
  duration: durations[mode],
  remaining: durations[mode] * 60,
  deadline: null,
  taskId: null,
  sessionId: crypto.randomUUID(),
});
function readClock(userId: string): Clock {
  try {
    const c = JSON.parse(
      localStorage.getItem(`tempo-clock:${userId}`) || "null",
    );
    if (
      c &&
      c.mode in durations &&
      Number.isFinite(c.remaining) &&
      Number.isFinite(c.duration) &&
      typeof c.sessionId === "string" &&
      (c.deadline === null || Number.isFinite(c.deadline))
    )
      return c;
  } catch {
    /* Use a fresh clock if storage is unavailable or corrupt. */
  }
  return freshClock();
}
function App({ user, logout }: { user: User; logout: () => Promise<void> }) {
  const [preferences, setPreferences] = useState<Preferences>({
    theme: "default",
    timer_style: "ring",
  });
  useEffect(() => {
    let alive = true;
    api<Preferences>("preferences")
      .then((p) => {
        if (alive) {
          setPreferences(p);
          applyTheme(p.theme);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      applyTheme("default");
    };
  }, []);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clock, setClock] = useState<Clock>(() => readClock(user.id));
  const [tick, setTick] = useState(Date.now());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState<Partial<Task> | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"board" | "insights">("board");
  const [dragging, setDragging] = useState<string | null>(null);
  const completing = useRef(false);
  const remaining = secondsLeft(clock, tick);
  const active = tasks.find((t) => t.id === clock.taskId);
  const today = new Date().toLocaleDateString();
  const todaySessions = sessions.filter(
    (s) => new Date(s.completed_at).toLocaleDateString() === today,
  );
  const minutes = todaySessions.reduce((sum, s) => sum + s.minutes, 0);
  async function reload() {
    const [t, s] = await Promise.all([
      api<Task[]>("tasks"),
      api<Session[]>("sessions"),
    ]);
    setTasks(t);
    setSessions(s);
    setLoaded(true);
  }
  useEffect(() => {
    reload().catch(() =>
      setError("Tempo cannot reach the server. Start the backend, then retry."),
    );
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(`tempo-clock:${user.id}`, JSON.stringify(clock));
    } catch {
      setError(
        "Browser storage is unavailable. Your timer cannot survive a refresh.",
      );
    }
  }, [clock]);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    document.title = clock.deadline
      ? `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")} · Tempo`
      : "Tempo — Find your rhythm";
  }, [remaining, clock.deadline]);
  useEffect(() => {
    if (!clock.deadline || remaining > 0 || completing.current || !loaded)
      return;
    completing.current = true;
    const finish = async () => {
      try {
        completionAlert({
          ...preferences,
          id: clock.sessionId,
          deadline: clock.deadline!,
          userId: user.id,
          focus: clock.mode === "focus",
        });
        if (clock.mode === "focus")
          await api("sessions", {
            method: "POST",
            body: JSON.stringify({
              id: clock.sessionId,
              task_id: tasks.some((t) => t.id === clock.taskId)
                ? clock.taskId
                : null,
              minutes: clock.duration,
            }),
          });
        setNotice(
          clock.mode === "focus"
            ? "Session complete. Nice work — take a breather."
            : "Break complete. Ready for a fresh start?",
        );
        setClock({
          ...freshClock(clock.mode === "focus" ? "short" : "focus"),
          taskId: clock.taskId,
        });
        await reload();
      } catch (e) {
        setError(
          (e as Error).message +
            " Your completed timer is saved; retry to log it.",
        );
      } finally {
        completing.current = false;
      }
    };
    void finish();
  }, [remaining, clock, loaded]);
  async function move(task: Task, status: Status) {
    try {
      await api(`tasks/${task.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function selectTask(task: Task) {
    if (
      clock.deadline ||
      (clock.remaining < clock.duration * 60 && remaining > 0)
    ) {
      setNotice("Reset or finish this session before switching tasks.");
      return;
    }
    setClock({ ...clock, taskId: task.id });
    if (task.status === "todo") void move(task, "progress");
  }
  function switchMode(mode: Clock["mode"]) {
    if (clock.deadline || clock.remaining < clock.duration * 60) {
      setNotice("Reset or finish this session before changing modes.");
      return;
    }
    setClock({ ...freshClock(mode), taskId: clock.taskId });
  }
  async function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const data = {
      title: String(form.get("title")).trim(),
      notes: String(form.get("notes")),
      previous_notes: modal?.notes ?? "",
      priority: form.get("priority"),
      estimate: Number(form.get("estimate")),
      status: modal?.status || "todo",
    };
    if (!data.title) return;
    setBusy(true);
    try {
      await api(modal?.id ? `tasks/${modal.id}` : "tasks", {
        method: modal?.id ? "PUT" : "POST",
        body: JSON.stringify(data),
      });
      await reload();
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeTask() {
    if (!modal?.id) return;
    setBusy(true);
    try {
      await api(`tasks/${modal.id}`, { method: "DELETE" });
      await reload();
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app">
      <aside className="rail">
        <a className="brand" href="/" aria-label="Tempo home">
          t<span>•</span>
        </a>
        <button
          className={view === "board" ? "rail-button selected" : "rail-button"}
          onClick={() => setView("board")}
          aria-label="Board"
        >
          <LayoutDashboard size={21} />
        </button>
        <button
          className={
            view === "insights" ? "rail-button selected" : "rail-button"
          }
          onClick={() => setView("insights")}
          aria-label="Focus insights"
        >
          <Timer size={22} />
        </button>
      </aside>
      <div className="workspace">
        <header>
          <div className="wordmark">
            tempo<span> / </span>
            <small>Your workspace</small>
          </div>
          <Personalize
            user={user}
            logout={logout}
            preferences={preferences}
            onPreferences={(p) => {
              setPreferences(p);
              applyTheme(p.theme);
            }}
          />
          <span className="date">
            {new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        </header>
        <main>
          {user.is_demo && (
            <div className="message demo-banner">
              You’re exploring a private demo. This board expires in 24 hours.
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">A LITTLE STRUCTURE. A LITTLE FOCUS.</div>
              <h1>
                {view === "board"
                  ? "Find your rhythm."
                  : "Your time, well spent."}
              </h1>
              <p>
                {view === "board"
                  ? "Make a plan, pick a task, and give it your attention."
                  : "Small sessions add up to meaningful progress."}
              </p>
            </div>
            <button
              className="primary"
              onClick={() => setModal({ status: "todo" })}
            >
              <Plus size={18} /> New task
            </button>
          </div>
          {error && (
            <div className="message error" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  void reload()
                    .then(() => setClock((c) => ({ ...c })))
                    .catch(() => setError("Still unable to reach the server."));
                }}
              >
                Retry
              </button>
            </div>
          )}
          {notice && (
            <div className="message" role="status">
              {notice}
              <button
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="stats">
            <div>
              <span className="stat-icon">
                <Timer size={19} />
              </span>
              <span>
                <strong>
                  {minutes}
                  <small> min</small>
                </strong>
                <label>Focused today</label>
              </span>
            </div>
            <div>
              <span className="stat-icon">
                <Circle size={18} />
              </span>
              <span>
                <strong>
                  {todaySessions.length}
                  <small> sessions</small>
                </strong>
                <label>One step at a time</label>
              </span>
            </div>
            <div>
              <span className="stat-icon">
                <Check size={20} />
              </span>
              <span>
                <strong>
                  {tasks.filter((t) => t.status === "done").length}
                  <small> tasks</small>
                </strong>
                <label>On your done list</label>
              </span>
            </div>
            <div className="gentle-note">
              Progress over perfection.<span>You’ve got this.</span>
            </div>
          </div>
          <div className="content">
            <section className="board-area">
              <div className="section-heading">
                <div className="view-tabs">
                  <button
                    className={view === "board" ? "active" : ""}
                    onClick={() => setView("board")}
                  >
                    <LayoutDashboard size={16} /> My board
                  </button>
                  <button
                    className={view === "insights" ? "active" : ""}
                    onClick={() => setView("insights")}
                  >
                    <Timer size={16} /> Reviews
                  </button>
                </div>
                <span className="task-total">{tasks.length} tasks</span>
              </div>
              {!loaded ? (
                <div className="empty">
                  {error
                    ? "Your board will appear when the server reconnects."
                    : "Getting your workspace ready…"}
                </div>
              ) : view === "board" ? (
                <div className="board">
                  {columns.map((col) => (
                    <section
                      className={`column ${col.id}`}
                      key={col.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const task = tasks.find(
                          (t) =>
                            t.id ===
                            (dragging || e.dataTransfer.getData("text/plain")),
                        );
                        if (task) void move(task, col.id);
                        setDragging(null);
                      }}
                    >
                      <div className="column-heading">
                        <h2>
                          <span className="dot" />
                          {col.title}
                          <span className="count">
                            {tasks.filter((t) => t.status === col.id).length}
                          </span>
                        </h2>
                        <button
                          aria-label={`Add task to ${col.title}`}
                          onClick={() => setModal({ status: col.id })}
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                      <p className="column-description">{col.description}</p>
                      <div className="cards">
                        {tasks
                          .filter((t) => t.status === col.id)
                          .map((task) => (
                            <article
                              key={task.id}
                              className={`task-card ${active?.id === task.id ? "focused" : ""}`}
                              draggable
                              onDragStart={(e) => {
                                setDragging(task.id);
                                e.dataTransfer.setData("text/plain", task.id);
                              }}
                              onDragEnd={() => setDragging(null)}
                            >
                              <div className="card-top">
                                <span className={`priority ${task.priority}`}>
                                  {task.priority}
                                </span>
                                <button
                                  aria-label={`Edit ${task.title}`}
                                  onClick={() => setModal(task)}
                                >
                                  <MoreHorizontal size={19} />
                                </button>
                              </div>
                              <h3>{task.title}</h3>
                              {task.notes && (
                                <p className="task-notes">{task.notes}</p>
                              )}
                              <Subtasks taskId={task.id} />
                              <div
                                className="session-dots"
                                aria-label={`${task.sessions} of ${task.estimate} estimated sessions`}
                              >
                                {Array.from(
                                  { length: Math.min(task.estimate, 8) },
                                  (_, i) => (
                                    <span
                                      className={
                                        i < task.sessions ? "filled" : ""
                                      }
                                      key={i}
                                    />
                                  ),
                                )}
                                <span className="session-count">
                                  {task.sessions}/{task.estimate}
                                </span>
                              </div>
                              <div className="card-footer">
                                <span>
                                  <Timer size={13} />
                                  {task.focus_minutes}m
                                </span>
                                <button
                                  className="focus-task"
                                  onClick={() => selectTask(task)}
                                  disabled={task.status === "done"}
                                >
                                  {active?.id === task.id
                                    ? "Selected"
                                    : "Focus"}
                                  <Play size={12} />
                                </button>
                              </div>
                              <label className="move-label">
                                Move to
                                <select
                                  aria-label={`Move ${task.title}`}
                                  value={task.status}
                                  onChange={(e) =>
                                    void move(task, e.target.value as Status)
                                  }
                                >
                                  {columns.map((c) => (
                                    <option value={c.id} key={c.id}>
                                      {c.title}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={12} />
                              </label>
                            </article>
                          ))}
                        {!tasks.some((t) => t.status === col.id) && (
                          <div className="column-empty">
                            {col.id === "todo"
                              ? "A fresh start. Add your first task."
                              : col.id === "progress"
                                ? "Your next focus starts here."
                                : "Good things take a little time."}
                          </div>
                        )}
                      </div>
                      <button
                        className="add-card"
                        onClick={() => setModal({ status: col.id })}
                      >
                        <Plus size={16} /> Add task
                      </button>
                    </section>
                  ))}
                </div>
              ) : (
                <Review />
              )}
              <div className="board-caption">
                <span className="tiny-dot" /> Your work, at your pace.
                <span>Drag cards or use “Move to” to organize.</span>
              </div>
            </section>
            <aside className="timer-panel">
              <div className="timer-title">
                <span>
                  <Timer size={18} /> Focus timer
                </span>
                <span className="live-dot" />
              </div>
              <div className="timer-tabs">
                {(["focus", "short", "long"] as const).map((m) => (
                  <button
                    key={m}
                    className={clock.mode === m ? "active" : ""}
                    onClick={() => switchMode(m)}
                  >
                    {m === "focus"
                      ? "Pomodoro"
                      : m === "short"
                        ? "Short break"
                        : "Long break"}
                  </button>
                ))}
              </div>
              <div
                className={`clock-face timer-${preferences.timer_style}`}
                style={
                  {
                    "--progress": `${(1 - remaining / (clock.duration * 60)) * 360}deg`,
                  } as React.CSSProperties
                }
              >
                <div>
                  <TimerObject
                    style={preferences.timer_style}
                    progress={1 - remaining / (clock.duration * 60)}
                    running={!!clock.deadline}
                  />
                  <span className="clock-label">
                    {clock.mode === "focus"
                      ? "TIME TO FOCUS"
                      : "TAKE A BREATHER"}
                  </span>
                  <div
                    className="digits"
                    role="timer"
                    aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds`}
                  >
                    {String(Math.floor(remaining / 60)).padStart(2, "0")}
                    <span>:</span>
                    {String(remaining % 60).padStart(2, "0")}
                  </div>
                  <span className="clock-subtitle">
                    {clock.deadline
                      ? "You’re in your rhythm."
                      : "A fresh moment awaits."}
                  </span>
                </div>
              </div>
              <label className="duration-setting">
                Session length{" "}
                <span>
                  <input
                    aria-label="Session length in minutes"
                    type="number"
                    min="1"
                    max="120"
                    value={clock.duration}
                    disabled={
                      !!clock.deadline || remaining < clock.duration * 60
                    }
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isInteger(value) && value >= 1 && value <= 120)
                        setClock((c) => ({
                          ...c,
                          duration: value,
                          remaining: value * 60,
                        }));
                    }}
                  />{" "}
                  min
                </span>
              </label>
              <div className="timer-controls">
                <button
                  className="primary start"
                  disabled={!loaded || remaining === 0}
                  onClick={() => {
                    if (preferences.sound)
                      void prepareAudio().catch((e) => setNotice(e.message));
                    setTick(Date.now());
                    setClock((c) => ({
                      ...c,
                      remaining,
                      deadline: c.deadline
                        ? null
                        : Date.now() + remaining * 1000,
                    }));
                  }}
                >
                  {clock.deadline ? <Pause size={17} /> : <Play size={17} />}{" "}
                  {clock.deadline
                    ? "Pause"
                    : remaining < clock.duration * 60
                      ? "Resume"
                      : "Start session"}
                </button>
                <button
                  className="reset"
                  aria-label="Reset timer"
                  onClick={() =>
                    setClock({
                      ...freshClock(clock.mode),
                      duration: clock.duration,
                      remaining: clock.duration * 60,
                      taskId: clock.taskId,
                    })
                  }
                >
                  <RotateCcw size={18} />
                </button>
              </div>
              <div className="active-task">
                <span className="eyebrow">WORKING ON</span>
                {active ? (
                  <strong>{active.title}</strong>
                ) : (
                  <strong>Space for your next idea</strong>
                )}
                <p>
                  {active
                    ? `${active.sessions} of ${active.estimate} estimated sessions complete`
                    : "Choose Focus on a card, or start an open session."}
                </p>
              </div>
              <div className="session-tracker">
                {Array.from({ length: 4 }, (_, i) => (
                  <span
                    key={i}
                    className={i < todaySessions.length % 4 ? "complete" : ""}
                  >
                    <Check size={13} />
                  </span>
                ))}
                <span>{todaySessions.length} today</span>
              </div>
              <NotesPanel
                userId={user.id}
                task={active}
                onSaved={(id, notes) =>
                  setTasks((current) =>
                    current.map((task) =>
                      task.id === id ? { ...task, notes } : task,
                    ),
                  )
                }
              />
              <div className="break-tip">
                <Coffee size={21} />
                <p>
                  A small reminder
                  <span>
                    Let your breaks be breaks.
                    <br />
                    Stretch, breathe, look outside.
                  </span>
                </p>
              </div>
            </aside>
          </div>
        </main>
        <footer>
          tempo <span>Make time for what matters.</span>
          <span>Made for a little more focus.</span>
        </footer>
      </div>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <TaskDialog
            error={error}
            modal={modal}
            busy={busy}
            save={saveTask}
            close={() => setModal(null)}
            remove={removeTask}
          />
        </div>
      )}
    </div>
  );
}
function TaskDialog({
  error,
  modal,
  busy,
  save,
  close,
  remove,
}: {
  error: string;
  modal: Partial<Task>;
  busy: boolean;
  save: (e: React.FormEvent<HTMLFormElement>) => void;
  close: () => void;
  remove: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      className="task-dialog"
    >
      <form onSubmit={save}>
        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}
        <div className="dialog-heading">
          <h2>{modal.id ? "Edit task" : "A new little goal"}</h2>
          <button
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <label>
          What would you like to work on?
          <input
            name="title"
            autoFocus
            required
            maxLength={160}
            defaultValue={modal.title}
            placeholder="Give your task a name"
          />
        </label>
        <label>
          Task notes
          <textarea
            name="notes"
            maxLength={10000}
            defaultValue={modal.notes}
            placeholder="Notes, ideas, or a small first step…"
            rows={3}
          />
        </label>
        <div className="form-row">
          <label>
            Priority
            <select name="priority" defaultValue={modal.priority || "medium"}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label>
            Estimated Pomodoros
            <input
              type="number"
              name="estimate"
              min="1"
              max="20"
              defaultValue={modal.estimate || 2}
              required
            />
          </label>
        </div>
        <div className="dialog-footer">
          {modal.id && (
            <button
              className="delete"
              type="button"
              disabled={busy}
              onClick={remove}
            >
              <Trash2 size={16} /> Delete
            </button>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save task"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}

createRoot(document.getElementById("root")!).render(
  <AccountGate>
    {(user, logout) => <App key={user.id} user={user} logout={logout} />}
  </AccountGate>,
);
