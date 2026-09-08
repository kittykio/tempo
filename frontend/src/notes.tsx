import { useEffect, useState } from "react";
import { NotebookPen, Save } from "lucide-react";
import { api } from "./api";

type Note = { notes: string };
function readDraft(
  key: string,
): { notes: string; previous_notes: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value &&
      typeof value.notes === "string" &&
      typeof value.previous_notes === "string" &&
      value.notes.length <= 10000 &&
      value.previous_notes.length <= 10000
      ? value
      : null;
  } catch {
    return null;
  }
}
export function NotesPanel({
  userId,
  task,
  onSaved,
}: {
  userId: string;
  task?: { id: string; title: string; notes: string };
  onSaved: (id: string, notes: string) => void;
}) {
  const [mode, setMode] = useState<"task" | "scratchpad">("scratchpad");
  const selected = mode === "task" && task;
  return (
    <section className="notes-panel" aria-label="Notes">
      <div className="notes-heading">
        <NotebookPen size={17} />
        <h2>Room for a thought</h2>
      </div>
      <div className="notes-tabs">
        <button aria-pressed={mode === "task"} onClick={() => setMode("task")}>
          Task notes
        </button>
        <button
          aria-pressed={mode === "scratchpad"}
          onClick={() => setMode("scratchpad")}
        >
          Scratchpad
        </button>
      </div>
      {mode === "task" && !task ? (
        <p className="notes-hint">
          Choose Focus on a task to keep its ideas and next steps here. You can
          also add notes from any card’s editor.
        </p>
      ) : (
        <NoteEditor
          key={`${userId}:${selected ? selected.id : "scratchpad"}`}
          storageKey={`tempo-note:${userId}:${selected ? selected.id : "scratchpad"}`}
          endpoint={selected ? `tasks/${selected.id}/notes` : "scratchpad"}
          savedNotes={selected ? selected.notes : undefined}
          label={
            selected ? `Notes for ${selected.title}` : "Private scratchpad"
          }
          hint={
            selected
              ? "Ideas, links, questions, next steps…"
              : "Capture a thought. Come back to it later."
          }
          onSaved={(notes) => {
            if (selected) onSaved(selected.id, notes);
          }}
        />
      )}
    </section>
  );
}
export function NoteEditor({
  storageKey,
  endpoint,
  label,
  hint,
  onSaved,
  savedNotes,
}: {
  storageKey: string;
  endpoint: string;
  label: string;
  hint: string;
  savedNotes?: string;
  onSaved: (notes: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [base, setBase] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localError, setLocalError] = useState("");
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<Note>(endpoint)
      .then((note) => {
        if (cancelled) return;
        const cached = readDraft(storageKey);
        setDraft(cached?.notes ?? note.notes);
        setBase(cached?.previous_notes ?? note.notes);
        setReady(true);
        if (
          cached &&
          cached.previous_notes !== note.notes &&
          cached.notes !== note.notes
        ) {
          setConflict(true);
          setError(
            "This note changed elsewhere. Copy your draft before loading the latest saved note.",
          );
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, storageKey]);
  useEffect(() => {
    if (ready && savedNotes !== undefined && savedNotes !== base) {
      if (draft === base) {
        setDraft(savedNotes);
        setBase(savedNotes);
      } else if (draft !== savedNotes) {
        setConflict(true);
        setError(
          "This note changed elsewhere. Copy your draft before loading the latest saved note.",
        );
      }
    }
  }, [savedNotes]);
  function change(text: string) {
    setDraft(text);
    setSaved(false);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ notes: text, previous_notes: base }),
      );
      setLocalError("");
    } catch {
      setLocalError(
        "Browser draft storage is unavailable. Save before leaving this note.",
      );
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const note = await api<Note>(endpoint, {
        method: "PUT",
        body: JSON.stringify({ notes: draft, previous_notes: base }),
      });
      setBase(note.notes);
      setDraft(note.notes);
      setSaved(true);
      setConflict(false);
      onSaved(note.notes);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* Server save succeeded. */
      }
    } catch (e) {
      setError((e as Error).message);
      if ((e as { status?: number }).status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  async function loadSaved() {
    setBusy(true);
    try {
      const note = await api<Note>(endpoint);
      const cached = !ready ? readDraft(storageKey) : null;
      if (cached) {
        setDraft(cached.notes);
        setBase(cached.previous_notes);
        setReady(true);
        const changed =
          cached.previous_notes !== note.notes && cached.notes !== note.notes;
        setConflict(changed);
        setError(
          changed
            ? "This note changed elsewhere. Copy your draft before loading the latest saved note."
            : "",
        );
        return;
      }
      setDraft(note.notes);
      setBase(note.notes);
      setReady(true);
      setError("");
      setConflict(false);
      onSaved(note.notes);
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const dirty = draft !== base;
  return (
    <div className="note-editor">
      <label>
        {label}
        <textarea
          aria-label={label}
          placeholder={hint}
          value={draft}
          onChange={(e) => change(e.target.value)}
          disabled={!ready || busy}
          rows={6}
          maxLength={10000}
        />
      </label>
      {error && (
        <p className="note-error" role="alert">
          {error}
        </p>
      )}
      {localError && (
        <p className="note-error" role="alert">
          {localError}
        </p>
      )}
      {(!ready || conflict) && error && (
        <button
          className="notes-reload"
          disabled={busy}
          onClick={() => void loadSaved()}
        >
          {conflict ? "Discard draft & load saved note" : "Retry loading note"}
        </button>
      )}
      <div className="note-actions">
        <span role="status">
          {!ready
            ? "Loading…"
            : busy
              ? "Saving…"
              : dirty
                ? "Unsaved draft"
                : saved
                  ? "Saved to your account"
                  : "All changes saved"}
        </span>
        <button disabled={!ready || busy || !dirty} onClick={() => void save()}>
          <Save size={14} /> Save
        </button>
      </div>
      <small className="note-count">
        {draft.length.toLocaleString()} / 10,000
      </small>
    </div>
  );
}
