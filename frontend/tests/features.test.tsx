import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Subtasks } from "../src/subtasks";
import { Review } from "../src/review";
import { Trackers } from "../src/trackers";
import { Personalize } from "../src/personalize";
import { setApiAccount } from "../src/api";
import { completionAlert, prepareAudio } from "../src/alerts";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
beforeEach(() => {
  setApiAccount(null);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("adds, completes and renames a subtask without changing the parent task", async () => {
  let items: any[] = [];
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit = {}) => {
      paths.push(path);
      const data = init.body ? JSON.parse(String(init.body)) : {};
      if (init.method === "POST")
        items.push({ id: "step", ...data, done: false });
      if (init.method === "PUT") items[0] = data;
      return json(init.method === "GET" || !init.method ? items : {});
    }),
  );
  const view = render(<Subtasks taskId="task" />);
  const details = view.container.querySelector("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  const user = userEvent.setup();
  await waitFor(() =>
    expect(screen.getByLabelText("New subtask")).toHaveProperty(
      "disabled",
      false,
    ),
  );
  await user.type(screen.getByLabelText("New subtask"), "Outline");
  await user.click(screen.getByRole("button", { name: "Add", exact: true }));
  await screen.findByLabelText("Complete Outline");
  await user.click(screen.getByLabelText("Complete Outline"));
  await waitFor(() => expect(items[0].done).toBe(true));
  await user.clear(screen.getByLabelText("Rename Outline"));
  await user.type(screen.getByLabelText("Rename Outline"), "Draft outline");
  await user.tab();
  await screen.findByLabelText("Complete Draft outline");
  expect(paths.every((p) => p.startsWith("/api/tasks/task/subtasks"))).toBe(
    true,
  );
});
it("reviews switch between calendar weeks and months with detailed history", async () => {
  const queries: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      queries.push(new URL("https://tempo.test" + path).searchParams);
      return json({
        minutes: 25,
        sessions: 1,
        previous_minutes: 0,
        active_days: 1,
        daily: [{ day: "2026-09-07", minutes: 25 }],
        focus_sessions: [
          {
            id: "session",
            title: "Write draft",
            minutes: 25,
            completed_at: "2026-09-07T10:00:00Z",
          },
        ],
        completed_tasks: [],
        habits: [],
        goals: [],
      });
    }),
  );
  render(<Review />);
  await screen.findByText("Write draft");
  expect(queries[0].get("period")).toBe("weekly");
  await userEvent.selectOptions(screen.getByLabelText("Review"), "monthly");
  await screen.findByText("Write draft");
  expect(queries.at(-1)?.get("period")).toBe("monthly");
  expect(queries.at(-1)?.get("start")?.endsWith("-01")).toBe(true);
});
it("automatic goal source locks manual progress and sends the selected habit", async () => {
  let body: any;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit = {}) => {
      if (init.method === "POST") {
        body = JSON.parse(String(init.body));
        return json({ ...body, id: "g" });
      }
      return json(
        path === "/api/habits"
          ? [
              {
                id: "h",
                title: "Read",
                days: [0],
                created: "2026-01-01",
                checks: [],
              },
            ]
          : [],
      );
    }),
  );
  render(<Trackers kind="goals" />);
  await screen.findByText("Start with one objective that matters to you.");
  await userEvent.click(screen.getByRole("button", { name: "New goal" }));
  await userEvent.type(screen.getByLabelText("Objective"), "Read regularly");
  await userEvent.selectOptions(
    screen.getByLabelText("Track progress"),
    "habit_checkins",
  );
  await userEvent.selectOptions(screen.getByLabelText("Habit"), "h");
  expect(screen.getByLabelText("Progress")).toHaveProperty("disabled", true);
  await userEvent.click(
    screen.getByRole("button", { name: "Save", exact: true }),
  );
  await waitFor(() => expect(body?.habit_id).toBe("h"));
  expect(body.source).toBe("habit_checkins");
  expect(body.progress).toBe(0);
});
it("completion notifications are opt-in, deduplicated and do not replay stale timers", () => {
  const NotificationMock = vi.fn(function (this: any) {
    this.close = vi.fn();
  });
  Object.assign(NotificationMock, {
    permission: "granted",
    requestPermission: vi.fn(),
  });
  vi.stubGlobal("Notification", NotificationMock);
  const p = { id: "one", userId: "a", deadline: Date.now(), focus: true };
  completionAlert(p);
  expect(NotificationMock).not.toHaveBeenCalled();
  completionAlert({ ...p, id: "two", notifications: true });
  completionAlert({ ...p, id: "two", notifications: true });
  expect(NotificationMock).toHaveBeenCalledTimes(1);
  completionAlert({
    ...p,
    id: "old",
    notifications: true,
    deadline: Date.now() - 120000,
  });
  expect(NotificationMock).toHaveBeenCalledTimes(1);
  expect((NotificationMock as any).requestPermission).not.toHaveBeenCalled();
});
it("audio starts only after activation and schedules a gentle three-note chime", async () => {
  const start = vi.fn();
  class AudioMock {
    state = "suspended";
    currentTime = 0;
    destination = {};
    async resume() {
      this.state = "running";
    }
    createOscillator() {
      return {
        frequency: { value: 0 },
        connect: vi.fn(),
        start,
        stop: vi.fn(),
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
    }
  }
  vi.stubGlobal("AudioContext", AudioMock);
  await prepareAudio();
  completionAlert({
    id: "sound",
    userId: "a",
    deadline: Date.now(),
    focus: false,
    sound: true,
  });
  expect(start).toHaveBeenCalledTimes(3);
});
it("denied notification permission does not save an enabled setting", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.stubGlobal(
    "Notification",
    Object.assign(vi.fn(), {
      permission: "default",
      requestPermission: vi.fn(async () => "denied"),
    }),
  );
  const fetchMock = vi.fn(async () => json({}));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <Personalize
      user={{ id: "a", name: "Reader", email: "r@example.com", is_demo: false }}
      logout={async () => {}}
      preferences={{ theme: "default", timer_style: "ring" }}
      onPreferences={() => {}}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Account settings for Reader" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Appearance", exact: true }),
  );
  await userEvent.click(screen.getByLabelText("Browser notifications"));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("blocked"),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
