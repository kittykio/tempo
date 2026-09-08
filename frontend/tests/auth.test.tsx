import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountGate } from "../src/auth";
import { setApiAccount } from "../src/api";
const account = {
  id: "account-a",
  name: "Reader",
  email: "reader@example.com",
  is_demo: false,
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let requests: { url: string; init: RequestInit }[];
let routes: Record<string, () => Response>;
beforeEach(() => {
  setApiAccount(null);
  localStorage.clear();
  history.replaceState(null, "", "/");
  requests = [];
  routes = {
    "/api/auth/me": () => json({ detail: "Sign in" }, 401),
    "/api/auth/config": () => json({ password_reset_available: true }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      requests.push({ url, init });
      return routes[url]?.() || json({ detail: "Unexpected request" }, 500);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount() {
  return render(
    <AccountGate>
      {(user, logout) => (
        <section>
          <h1>{user.name} board</h1>
          <button onClick={() => void logout()}>Sign out</button>
        </section>
      )}
    </AccountGate>,
  );
}

describe("Tempo accounts", () => {
  it("signs up, validates confirmation, and sends the CSRF header", async () => {
    const user = userEvent.setup();
    routes["/api/auth/signup"] = () => json(account, 201);
    mount();
    await user.click(
      await screen.findByRole("button", { name: "Create an account" }),
    );
    await user.type(screen.getByLabelText("Your name"), "Reader");
    await user.type(
      screen.getByLabelText("Email address"),
      "reader@example.com",
    );
    await user.type(
      screen.getByLabelText("Password", {
        exact: false,
        selector: 'input[name="password"]',
      }),
      "a quiet morning with tea",
    );
    await user.type(
      screen.getByLabelText("Confirm password"),
      "this does not match",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "The passwords do not match.",
    );
    expect(requests.some((r) => r.url === "/api/auth/signup")).toBe(false);
    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(
      screen.getByLabelText("Confirm password"),
      "a quiet morning with tea",
    );
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByRole("heading", { name: "Reader board" }),
    ).toBeTruthy();
    const request = requests.find((r) => r.url === "/api/auth/signup")!;
    expect(request.init.headers).toMatchObject({ "X-Tempo-Request": "1" });
    expect(JSON.parse(String(request.init.body)).email).toBe(
      "reader@example.com",
    );
  });
  it("restores the current account and removes the board on sign-out", async () => {
    routes["/api/auth/me"] = () => json(account);
    routes["/api/auth/logout"] = () => new Response(null, { status: 204 });
    mount();
    await screen.findByRole("heading", { name: "Reader board" });
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(
      await screen.findByRole("heading", { name: "Back to your rhythm." }),
    ).toBeTruthy();
    expect(screen.queryByText("Reader board")).toBeNull();
  });
  it("unmounts private content on expiry or account changes", async () => {
    routes["/api/auth/me"] = () => json(account);
    mount();
    await screen.findByText("Reader board");
    fireEvent(window, new Event("tempo:unauthorized"));
    expect(
      await screen.findByRole("button", { name: "Sign in", exact: true }),
    ).toBeTruthy();
    expect(screen.queryByText("Reader board")).toBeNull();
  });
  it("opens an isolated demo without requiring form fields", async () => {
    routes["/api/auth/demo"] = () =>
      json({ ...account, name: "Demo explorer", is_demo: true }, 201);
    mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Explore the demo" }),
    );
    expect(await screen.findByText("Demo explorer board")).toBeTruthy();
  });
  it("shows login errors without exposing the board", async () => {
    routes["/api/auth/login"] = () =>
      json({ detail: "Email or password is incorrect." }, 401);
    mount();
    const user = userEvent.setup();
    await screen.findByLabelText("Email address");
    await user.type(
      screen.getByLabelText("Email address"),
      "reader@example.com",
    );
    await user.type(screen.getByLabelText("Password"), "incorrect");
    await user.click(
      screen.getByRole("button", { name: "Sign in", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Email or password is incorrect.",
    );
    expect(screen.queryByText("Reader board")).toBeNull();
  });
  it("shows reset email configuration honestly", async () => {
    routes["/api/auth/config"] = () =>
      json({ password_reset_available: false });
    mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Forgot password?" }),
    );
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText(/Reset emails aren’t enabled/)).toBeTruthy();
  });
  it("submits reset fragments once, clears the URL, and returns to login", async () => {
    history.replaceState(null, "", "/#reset=secret-reset-token");
    routes["/api/auth/reset-password"] = () => json({ message: "Updated" });
    mount();
    const user = userEvent.setup();
    await screen.findByLabelText("New password", { exact: false });
    await user.type(
      screen.getByLabelText("New password", { exact: false }),
      "a completely new password",
    );
    await user.type(
      screen.getByLabelText("Confirm password"),
      "a completely new password",
    );
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await screen.findByRole("button", { name: "Sign in", exact: true });
    await waitFor(() => expect(location.hash).toBe(""));
    expect(
      JSON.parse(
        String(
          requests.find((r) => r.url === "/api/auth/reset-password")!.init.body,
        ),
      ).token,
    ).toBe("secret-reset-token");
  });
});
