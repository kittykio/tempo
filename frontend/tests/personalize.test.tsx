import { styles, darkThemeIds } from "../src/personalize";
import React, { useState } from "react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Personalize,
  applyTheme,
  themes,
  TimerObject,
} from "../src/personalize";
import { Trackers } from "../src/trackers";
import { localDate } from "../src/periods";
const user = {
  id: "a",
  name: "Reader",
  email: "reader@example.com",
  is_demo: false,
};
let preferences = { theme: "sage", timer_style: "ring" };
let goals: any[];
let habits: any[];
beforeEach(() => {
  goals = [];
  habits = [];
  preferences = { theme: "sage", timer_style: "ring" };
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const p = init.body ? JSON.parse(String(init.body)) : {};
      let result: any = {};
      if (url === "/api/account") result = { ...user, name: p.name };
      if (url === "/api/preferences") {
        preferences = p;
        result = p;
      }
      if (url === "/api/goals") {
        if (init.method === "POST") goals.push({ ...p, id: "goal-1" });
        result = init.method === "POST" ? goals[0] : goals;
      }
      if (url === "/api/habits") {
        if (init.method === "POST")
          habits.push({ ...p, id: "habit-1", checks: [] });
        result = init.method === "POST" ? habits[0] : habits;
      }
      if (url.endsWith("/check")) {
        habits[0].checks = p.completed ? [p.day] : [];
      }
      return new Response(JSON.stringify(result), { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  applyTheme("sage");
});
function Settings() {
  const [p, set] = useState(preferences);
  return (
    <Personalize
      user={user}
      logout={async () => {}}
      preferences={p}
      onPreferences={set}
    />
  );
}
it("combines identity into a settings button and updates the visible name", async () => {
  render(<Settings />);
  await userEvent.click(
    screen.getByRole("button", { name: "Account settings for Reader" }),
  );
  await userEvent.clear(screen.getByLabelText("Display name"));
  await userEvent.type(screen.getByLabelText("Display name"), "New name");
  await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await screen.findByText("Profile saved.");
  expect(
    screen.getByRole("button", { name: "Account settings for New name" }),
  ).toBeTruthy();
});
it("saves theme and timer style together", async () => {
  render(<Settings />);
  await userEvent.click(
    screen.getByRole("button", { name: "Account settings for Reader" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Appearance", exact: true }),
  );
  expect(themes).toHaveLength(20);
  await userEvent.click(screen.getByRole("button", { name: "Midnight" }));
  await screen.findByText("Appearance saved.");
  await userEvent.click(screen.getByRole("button", { name: /Growing garden/ }));
  await screen.findByText("Timer style saved.");
  expect(preferences).toEqual({ theme: "midnight", timer_style: "garden" });
  applyTheme("midnight");
  expect(document.documentElement.dataset.theme).toBe("midnight");
  expect(document.documentElement.style.getPropertyValue("--theme-bg")).toBe(
    "#171f29",
  );
});
it("creates a dated goal with a target", async () => {
  render(<Trackers kind="goals" />);
  await screen.findByText("Start with one objective that matters to you.");
  await userEvent.click(screen.getByRole("button", { name: "New goal" }));
  await userEvent.type(screen.getByLabelText("Objective"), "Read books");
  await userEvent.selectOptions(screen.getByLabelText("Timeframe"), "monthly");
  await userEvent.click(
    screen.getByRole("button", { name: "Save", exact: true }),
  );
  await screen.findByRole("heading", { name: "Read books" });
  expect(goals[0].period).toBe("monthly");
  expect(goals[0].target).toBe(10);
});
it("creates a habit and toggles today without duplicating history", async () => {
  render(<Trackers kind="habits" />);
  await screen.findByText("A tiny habit is a good place to start.");
  await userEvent.click(screen.getByRole("button", { name: "New habit" }));
  await userEvent.type(screen.getByLabelText("Habit name"), "Stretch");
  await userEvent.click(
    screen.getByRole("button", { name: "Every day", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save", exact: true }),
  );
  await screen.findByRole("heading", { name: "Stretch" });
  await userEvent.click(
    screen.getByRole("button", { name: `Stretch ${localDate()}`, exact: true }),
  );
  await waitFor(() => expect(habits[0].checks).toEqual([localDate()]));
  await userEvent.click(
    screen.getByRole("button", { name: `Stretch ${localDate()} completed` }),
  );
  await waitFor(() => expect(habits[0].checks).toEqual([]));
});
it("the garden changes as progress advances", () => {
  const view = render(<TimerObject style="garden" progress={0} running />);
  expect(screen.getByText("🌱")).toBeTruthy();
  view.rerender(<TimerObject style="garden" progress={1} running={false} />);
  expect(screen.getByText("🌳")).toBeTruthy();
});

it("keeps companion identity consistent while paused and running", () => {
  for (const [id, label, emoji] of styles.filter(
    (s) => !["ring", "digital", "garden", "hourglass"].includes(s[0]),
  )) {
    const view = render(
      <TimerObject style={id} progress={0} running={false} />,
    );
    expect(screen.getByText(emoji)).toBeTruthy();
    view.rerender(<TimerObject style={id} progress={0.5} running />);
    expect(screen.getByText(emoji)).toBeTruthy();
    view.unmount();
  }
});
it("provides ten light and ten dark presets with the correct native control mode", () => {
  expect(themes.filter((t) => darkThemeIds.has(t[0]))).toHaveLength(10);
  expect(themes.filter((t) => !darkThemeIds.has(t[0]))).toHaveLength(10);
  for (const theme of themes) {
    applyTheme(theme[0]);
    expect(document.documentElement.style.colorScheme).toBe(
      darkThemeIds.has(theme[0]) ? "dark" : "light",
    );
  }
});

it("keeps everyday habits saveable and explains an empty schedule", async () => {
  render(<Trackers kind="habits" />);
  await screen.findByText("A tiny habit is a good place to start.");
  await userEvent.click(screen.getByRole("button", { name: "New habit" }));
  await userEvent.type(screen.getByLabelText("Habit name"), "Walk daily");
  const save = screen.getByRole("button", { name: "Save", exact: true });
  expect(
    screen
      .getByRole("button", { name: "Every day", exact: true })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    expect(
      screen
        .getByRole("button", { name: day, exact: true })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  expect(save).toHaveProperty("disabled", true);
  expect(
    screen.getByText("Choose at least one day, or select Every day."),
  ).toBeTruthy();
  await userEvent.click(
    screen.getByRole("button", { name: "Every day", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Every day", exact: true }),
  );
  expect(save).toHaveProperty("disabled", false);
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    expect(
      screen
        .getByRole("button", { name: day, exact: true })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  await userEvent.click(save);
  await screen.findByRole("heading", { name: "Walk daily" });
  expect(habits[0].days).toEqual([0, 1, 2, 3, 4, 5, 6]);
  await userEvent.click(
    screen.getByRole("button", { name: "Edit Walk daily" }),
  );
  expect(
    screen
      .getByRole("button", { name: "Every day", exact: true })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await userEvent.click(screen.getByRole("button", { name: "New habit" }));
  expect(
    screen
      .getByRole("button", { name: "Every day", exact: true })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});

it("closes settings on the backdrop but not when clicking inside", async () => {
  render(<Settings />);
  await userEvent.click(
    screen.getByRole("button", { name: "Account settings for Reader" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Your Tempo" });
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
    left: 100,
    right: 700,
    top: 100,
    bottom: 700,
    width: 600,
    height: 600,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  });
  fireEvent.click(dialog, { clientX: 120, clientY: 120 });
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(dialog, { clientX: 50, clientY: 50 });
  expect(screen.queryByRole("dialog")).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Account settings for Reader" }),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("offers a regular default separately from the twenty optional presets", async () => {
  render(<Settings />);
  await userEvent.click(
    screen.getByRole("button", { name: "Account settings for Reader" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Appearance", exact: true }),
  );
  expect(themes).toHaveLength(20);
  expect(themes.some((t) => t[0] === "default")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: /Tempo default/ }));
  await screen.findByText("Appearance saved.");
  expect(preferences.theme).toBe("default");
  applyTheme("default");
  expect(document.documentElement.dataset.theme).toBe("default");
  expect(document.documentElement.style.getPropertyValue("--theme-bg")).toBe(
    "#f2f2f2",
  );
});
