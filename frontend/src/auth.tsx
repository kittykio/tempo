import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Check, LockKeyhole, Timer } from "lucide-react";
import { api, ApiError, setApiAccount, type User } from "./api";

export function AccountGate({
  children,
}: {
  children: (user: User, logout: () => Promise<void>) => ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [resetToken] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("reset") || "",
  );
  const [resetDone, setResetDone] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  async function check() {
    setChecking(true);
    setConnectionError("");
    try {
      const account = await api<User>("auth/me");
      setApiAccount(account.id);
      setUser(account);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setConnectionError(
          "Unable to connect to Tempo. Check the server and retry.",
        );
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void check();
    const clear = () => {
      setUser(null);
      setApiAccount(null);
      document.title = "Tempo — Sign in";
    };
    // A different tab may have signed in with a different account. Unmount the old board.
    const storage = (e: StorageEvent) => {
      if (e.key === "tempo-account-change") {
        clear();
        void check();
      }
    };
    window.addEventListener("tempo:unauthorized", clear);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("tempo:unauthorized", clear);
      window.removeEventListener("storage", storage);
    };
  }, []);
  function broadcast() {
    try {
      localStorage.setItem("tempo-account-change", crypto.randomUUID());
    } catch {
      /* Session cookies still work without local storage. */
    }
  }
  function signedIn(account: User) {
    setApiAccount(account.id);
    setUser(account);
    setConnectionError("");
    broadcast();
  }
  async function logout() {
    await api("auth/logout", { method: "POST" });
    setApiAccount(null);
    setUser(null);
    broadcast();
    document.title = "Tempo — Sign in";
  }
  if (checking)
    return (
      <div className="auth-loading" role="status">
        Getting your workspace ready…
      </div>
    );
  if (resetToken && !resetDone)
    return (
      <AuthScreen
        onSignedIn={signedIn}
        initialToken={resetToken}
        onResetDone={() => {
          setResetDone(true);
          setLoginNotice("Password updated. Sign in with your new password.");
          setUser(null);
          setApiAccount(null);
          broadcast();
          history.replaceState(null, "", location.pathname);
        }}
      />
    );
  if (connectionError)
    return (
      <div className="auth-loading" role="alert">
        {connectionError}
        <button className="primary" onClick={() => void check()}>
          Retry
        </button>
      </div>
    );
  return user ? (
    children(user, logout)
  ) : (
    <AuthScreen onSignedIn={signedIn} initialNotice={loginNotice} />
  );
}

function AuthScreen({
  onSignedIn,
  initialToken = "",
  initialNotice = "",
  onResetDone,
}: {
  onSignedIn: (user: User) => void;
  initialToken?: string;
  initialNotice?: string;
  onResetDone?: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(
    initialToken ? "reset" : "login",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);
  const [resetAvailable, setResetAvailable] = useState(false);
  useEffect(() => {
    void api<{ password_reset_available: boolean }>("auth/config")
      .then((c) => setResetAvailable(c.password_reset_available))
      .catch(() => {});
  }, []);
  function change(next: typeof mode) {
    setMode(next);
    setError("");
    setNotice("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (
      (mode === "signup" || mode === "reset") &&
      password !== form.get("confirm")
    ) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "forgot") {
        const response = await api<{ message: string }>(
          "auth/forgot-password",
          {
            method: "POST",
            body: JSON.stringify({ email: form.get("email") }),
          },
        );
        setNotice(response.message);
      } else if (mode === "reset") {
        await api("auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token: initialToken, password }),
        });
        onResetDone?.();
        change("login");
        setNotice("Password updated. Sign in with your new password.");
      } else {
        const user = await api<User>(`auth/${mode}`, {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            password,
            ...(mode === "signup" ? { name: form.get("name") } : {}),
          }),
        });
        onSignedIn(user);
      }
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Unable to connect. Please try again."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    setError("");
    try {
      onSignedIn(await api<User>("auth/demo", { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="auth-brand" href="/">
          tempo<span>•</span>
        </a>
        <div>
          <span className="eyebrow">A LITTLE STRUCTURE. A LITTLE FOCUS.</span>
          <h1>
            Make space
            <br />
            for your rhythm.
          </h1>
          <p>Your tasks, your time, your own quiet corner to make progress.</p>
          <ul>
            <li>
              <Check size={18} /> A board that moves with you
            </li>
            <li>
              <Timer size={18} /> Focus, one session at a time
            </li>
            <li>
              <LockKeyhole size={18} /> A workspace that’s yours
            </li>
          </ul>
        </div>
        <small>Progress over perfection.</small>
      </section>
      <section className="auth-card">
        <div className="eyebrow">WELCOME TO TEMPO</div>
        <h2>
          {mode === "signup"
            ? "Find your starting point."
            : mode === "forgot"
              ? "A fresh way back in."
              : mode === "reset"
                ? "Choose a new password."
                : "Back to your rhythm."}
        </h2>
        <p>
          {mode === "signup"
            ? "Create your personal focus workspace."
            : mode === "forgot"
              ? "We’ll email you a link to reset your password."
              : mode === "reset"
                ? "Use a long password you haven’t used elsewhere."
                : "Sign in and pick up where you left off."}
        </p>
        {error && (
          <div className="message error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="message" role="status">
            {notice}
          </div>
        )}
        <form key={mode} onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Your name
              <input
                autoComplete="name"
                name="name"
                maxLength={60}
                required
                placeholder="What should we call you?"
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                placeholder="you@example.com"
              />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              {mode === "reset" ? "New password" : "Password"}
              <input
                type="password"
                name="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "login" ? 1 : 15}
                maxLength={128}
              />
              {mode !== "login" && (
                <small>
                  At least 15 characters. A memorable phrase works well.
                </small>
              )}
            </label>
          )}
          {(mode === "signup" || mode === "reset") && (
            <label>
              Confirm password
              <input
                type="password"
                name="confirm"
                autoComplete="new-password"
                required
                minLength={15}
                maxLength={128}
              />
            </label>
          )}
          {mode === "login" && (
            <button
              className="auth-text-link"
              type="button"
              onClick={() => change("forgot")}
            >
              Forgot password?
            </button>
          )}
          {mode === "forgot" && !resetAvailable && (
            <p className="reset-unavailable">
              Reset emails aren’t enabled on this instance yet. Contact the app
              owner for help.
            </p>
          )}
          <button
            className="primary auth-submit"
            disabled={busy || (mode === "forgot" && !resetAvailable)}
          >
            {busy
              ? "One moment…"
              : mode === "signup"
                ? "Create account"
                : mode === "forgot"
                  ? "Send reset link"
                  : mode === "reset"
                    ? "Update password"
                    : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        {mode === "login" || mode === "signup" ? (
          <>
            <p className="auth-switch">
              {mode === "login" ? "New here?" : "Already have an account?"}{" "}
              <button
                disabled={busy}
                onClick={() => change(mode === "login" ? "signup" : "login")}
              >
                {mode === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
            <div className="auth-divider">
              <span>JUST LOOKING AROUND?</span>
            </div>
            <button
              className="demo-button"
              disabled={busy}
              onClick={() => void demo()}
            >
              Explore the demo
              <ArrowRight size={16} />
            </button>
            <p className="demo-note">
              Your own sample board. No sign-up needed.
              <br />
              Demo workspaces expire after 24 hours.
            </p>
          </>
        ) : (
          <button
            className="auth-text-link"
            disabled={busy}
            onClick={() => change("login")}
          >
            Back to sign in
          </button>
        )}
      </section>
    </main>
  );
}
