import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteEditor, NotesPanel } from "../src/notes";
import { setApiAccount } from "../src/api";
let saved = "";
let fail = false;
beforeEach(() => {
  localStorage.clear();
  setApiAccount("user-a");
  saved = "";
  fail = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit = {}) => {
      if (init.method === "PUT") {
        if (fail) throw new TypeError("Offline. Try saving again.");
        saved = JSON.parse(String(init.body)).notes;
      }
      return new Response(JSON.stringify({ notes: saved }), { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const props = {
  storageKey: "tempo-note:user-a:scratchpad",
  endpoint: "scratchpad",
  label: "Private scratchpad",
  hint: "A thought",
  onSaved: vi.fn(),
};
it("saves multiline notes and removes the local draft after confirmation", async () => {
  const user = userEvent.setup();
  render(<NoteEditor {...props} />);
  await screen.findByText("All changes saved");
  await user.type(screen.getByRole("textbox"), "An idea{enter}A next step");
  expect(localStorage.getItem(props.storageKey)).toContain("An idea");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Saved to your account");
  expect(saved).toBe("An idea\nA next step");
  expect(localStorage.getItem(props.storageKey)).toBeNull();
});
it("keeps drafts through failures and refreshes without crossing accounts", async () => {
  const user = userEvent.setup();
  const mounted = render(<NoteEditor {...props} />);
  await screen.findByText("All changes saved");
  await user.type(screen.getByRole("textbox"), "Keep this draft");
  fail = true;
  await user.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("textbox")).toHaveProperty(
    "value",
    "Keep this draft",
  );
  mounted.unmount();
  const restored = render(<NoteEditor {...props} />);
  await screen.findByText("Unsaved draft");
  expect(screen.getByRole("textbox")).toHaveProperty(
    "value",
    "Keep this draft",
  );
  restored.unmount();
  render(<NoteEditor {...props} storageKey="tempo-note:user-b:scratchpad" />);
  await screen.findByText("All changes saved");
  expect(screen.getByRole("textbox")).toHaveProperty("value", "");
});
it("detects a conflicting draft and only discards it on explicit action", async () => {
  saved = "A newer saved note";
  localStorage.setItem(
    props.storageKey,
    JSON.stringify({ notes: "My unsaved draft", previous_notes: "" }),
  );
  render(<NoteEditor {...props} />);
  await screen.findByRole("alert");
  expect(screen.getByRole("textbox")).toHaveProperty(
    "value",
    "My unsaved draft",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Discard draft & load saved note" }),
  );
  await screen.findByText("All changes saved");
  expect(screen.getByRole("textbox")).toHaveProperty("value", saved);
});
it("offers the scratchpad without a task and explains where task notes belong", async () => {
  render(<NotesPanel userId="user-a" onSaved={() => {}} />);
  await screen.findByLabelText("Private scratchpad");
  await userEvent.click(screen.getByRole("button", { name: "Task notes" }));
  expect(screen.getByText(/Choose Focus on a task/)).toBeTruthy();
});

it("restores the local draft when retrying a failed initial load", async () => {
  localStorage.setItem(
    props.storageKey,
    JSON.stringify({ notes: "Do not lose this", previous_notes: "" }),
  );
  vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Offline"));
  render(<NoteEditor {...props} />);
  await screen.findByRole("alert");
  await userEvent.click(
    screen.getByRole("button", { name: "Retry loading note" }),
  );
  await screen.findByText("Unsaved draft");
  expect(screen.getByRole("textbox")).toHaveProperty(
    "value",
    "Do not lose this",
  );
});
