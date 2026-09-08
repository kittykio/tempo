import { useState } from "react";
import { api } from "./api";
type Item = { id: string; title: string; done: boolean };
export function Subtasks({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<Item[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [title, setTitle] = useState("");
  async function load() {
    setItems(await api<Item[]>(`tasks/${taskId}/subtasks`));
    setLoaded(true);
  }
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="subtasks"
      onToggle={(e) => {
        if (e.currentTarget.open && !loaded && !busy) void run(load);
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      <summary>
        Subtasks{" "}
        {loaded && `${items.filter((i) => i.done).length}/${items.length}`}
      </summary>
      {error && (
        <p role="alert">
          {error}
          <button type="button" onClick={() => void run(load)}>
            Retry
          </button>
        </p>
      )}
      {items.map((item) => (
        <div className="subtask-row" key={item.id}>
          <input
            aria-label={`Complete ${item.title}`}
            type="checkbox"
            checked={!!item.done}
            disabled={busy}
            onChange={(e) =>
              void run(() =>
                api(`tasks/${taskId}/subtasks/${item.id}`, {
                  method: "PUT",
                  body: JSON.stringify({ ...item, done: e.target.checked }),
                }),
              )
            }
          />
          <input
            aria-label={`Rename ${item.title}`}
            defaultValue={item.title}
            key={item.title}
            maxLength={160}
            disabled={busy}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (!value) {
                e.target.value = item.title;
                return;
              }
              if (value !== item.title)
                void run(() =>
                  api(`tasks/${taskId}/subtasks/${item.id}`, {
                    method: "PUT",
                    body: JSON.stringify({ ...item, title: value }),
                  }),
                );
            }}
          />
          <button
            type="button"
            aria-label={`Delete ${item.title}`}
            disabled={busy}
            onClick={() =>
              void run(() =>
                api(`tasks/${taskId}/subtasks/${item.id}`, {
                  method: "DELETE",
                }),
              )
            }
          >
            ×
          </button>
        </div>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim() || busy) return;
          if (
            await run(() =>
              api(`tasks/${taskId}/subtasks`, {
                method: "POST",
                body: JSON.stringify({ title: title.trim() }),
              }),
            )
          )
            setTitle("");
        }}
      >
        <input
          aria-label="New subtask"
          value={title}
          maxLength={160}
          placeholder="A small next step…"
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy || !loaded}
        />
        <button disabled={busy || !loaded || !title.trim()}>Add</button>
      </form>
    </details>
  );
}
