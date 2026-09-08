import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, Settings, Target, Check, ChevronDown } from "lucide-react";
import { api, type User } from "./api";
import { chime, prepareAudio } from "./alerts";
import { Trackers } from "./trackers";
import "./personalize.css";
export const defaultTheme = [
  "default",
  "Tempo default",
  "#f2f2f2",
  "#ffffff",
  "#e6e6e6",
  "#c5c5c5",
  "#252525",
  "#595959",
  "#404040",
];
export const themes = [
  [
    "slate",
    "Gray",
    "#f2f2f2",
    "#ffffff",
    "#e6e6e6",
    "#c5c5c5",
    "#252525",
    "#595959",
    "#404040",
  ],
  [
    "sage",
    "Sage",
    "#e8edda",
    "#fbfcf3",
    "#d7e0bd",
    "#aeba90",
    "#293421",
    "#52603d",
    "#466523",
  ],
  [
    "sand",
    "Warm sand",
    "#f4e5c8",
    "#fff9ed",
    "#e9d3a4",
    "#cbb27d",
    "#42331d",
    "#6d5532",
    "#875718",
  ],
  [
    "rose",
    "Dusty rose",
    "#f8dfe7",
    "#fff6f9",
    "#efc4d4",
    "#d59bae",
    "#4c2335",
    "#824257",
    "#a02859",
  ],
  [
    "lavender",
    "Lavender",
    "#ece2fb",
    "#faf6ff",
    "#d9c7f1",
    "#b89bd8",
    "#39234e",
    "#694487",
    "#7136a0",
  ],
  [
    "ocean",
    "Ocean",
    "#d7eef0",
    "#f4fcfc",
    "#b6dfe2",
    "#83b9c0",
    "#173d43",
    "#2f646d",
    "#08677a",
  ],
  [
    "sky",
    "Soft sky",
    "#dfeaff",
    "#f7faff",
    "#c5d8fa",
    "#9bb7e0",
    "#1f365e",
    "#3e5b89",
    "#2655b8",
  ],
  [
    "peach",
    "Peach",
    "#ffe3d1",
    "#fff7f0",
    "#f8c7a9",
    "#dca180",
    "#4f2d20",
    "#814b34",
    "#aa421a",
  ],
  [
    "mint",
    "Fresh mint",
    "#d7f5e9",
    "#f4fff9",
    "#b3e9d2",
    "#80bda8",
    "#153e34",
    "#326955",
    "#087657",
  ],
  [
    "ivory",
    "Ivory",
    "#fffdf4",
    "#ffffff",
    "#efeee8",
    "#bfbdb2",
    "#292823",
    "#626056",
    "#252521",
  ],
  [
    "midnight",
    "Midnight",
    "#171f29",
    "#212d43",
    "#2b3955",
    "#495f82",
    "#e9f0ff",
    "#bbcbee",
    "#a0b9ff",
  ],
  [
    "forest-night",
    "Forest night",
    "#101f12",
    "#1b3020",
    "#29422a",
    "#4b6540",
    "#edf3db",
    "#bfcea3",
    "#c5da7b",
  ],
  [
    "ember",
    "Ember",
    "#261410",
    "#392019",
    "#512a20",
    "#825042",
    "#ffeadb",
    "#e9b7a2",
    "#ff936e",
  ],
  [
    "rosewood",
    "Rosewood",
    "#2b1020",
    "#401c31",
    "#592841",
    "#85536d",
    "#ffe8f4",
    "#e5b0ce",
    "#ff9acb",
  ],
  [
    "amethyst",
    "Amethyst",
    "#201130",
    "#322045",
    "#462c60",
    "#725291",
    "#f4e9ff",
    "#d4b6f0",
    "#d2a0ff",
  ],
  [
    "deep-ocean",
    "Deep ocean",
    "#071e29",
    "#102f3d",
    "#174454",
    "#3b6675",
    "#e0faff",
    "#9fd3df",
    "#61d5ed",
  ],
  [
    "moonlight",
    "Moonlight",
    "#191b36",
    "#272b4b",
    "#373c65",
    "#5c6290",
    "#efefff",
    "#c2c6eb",
    "#b6b8ff",
  ],
  [
    "copper",
    "Copper",
    "#282015",
    "#3b2e1c",
    "#514024",
    "#7d6541",
    "#fff1d8",
    "#ddc49b",
    "#f0bc66",
  ],
  [
    "pine",
    "Pine",
    "#09251f",
    "#133b32",
    "#205145",
    "#447869",
    "#e4fff2",
    "#a6d8c3",
    "#65e2ae",
  ],
  [
    "charcoal",
    "Charcoal",
    "#181818",
    "#252525",
    "#343434",
    "#5b5b5b",
    "#f3f3ee",
    "#c6c6bd",
    "#e8e4cf",
  ],
];
export const darkThemeIds = new Set([
  "midnight",
  "forest-night",
  "ember",
  "rosewood",
  "amethyst",
  "deep-ocean",
  "moonlight",
  "copper",
  "pine",
  "charcoal",
]);
export const styles = [
  ["ring", "Classic ring", "◷"],
  ["digital", "Desk clock", "▣"],
  ["hourglass", "Hourglass", "⏳"],
  ["garden", "Growing garden", "🌱"],
  ["cat", "Cat companion", "🐈"],
  ["black-cat", "Black cat", "🐈‍⬛"],
  ["fox", "Fox companion", "🦊"],
  ["panda", "Panda companion", "🐼"],
  ["bunny", "Bunny companion", "🐰"],
  ["turtle", "Slow and steady", "🐢"],
  ["coffee", "Coffee break", "☕"],
  ["moon", "Moon watch", "🌙"],
];
export type Preferences = {
  theme: string;
  timer_style: string;
  sound?: boolean;
  notifications?: boolean;
};
export function applyTheme(id: string) {
  const t = themes.find((t) => t[0] === id) || defaultTheme;
  ["bg", "surface", "soft", "line", "text", "muted", "accent"].forEach(
    (key, i) =>
      document.documentElement.style.setProperty(`--theme-${key}`, t[i + 2]),
  );
  document.documentElement.dataset.theme = t[0];
  const mode = darkThemeIds.has(t[0]) ? "dark" : "light";
  document.documentElement.dataset.mode = mode;
  document.documentElement.style.colorScheme = mode;
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      aria-label={title}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          close();
      }}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="settings-heading">
        <h2>{title}</h2>
        <button aria-label="Close settings" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Personalize({
  user,
  logout,
  preferences,
  onPreferences,
}: {
  user: User;
  logout: () => Promise<void>;
  preferences: Preferences;
  onPreferences: (p: Preferences) => void;
}) {
  const [profile, setProfile] = useState(user);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"account" | "appearance" | "goals" | "habits">(
    "account",
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function show(next: typeof tab) {
    setTab(next);
    setOpen(true);
    setError("");
    setMessage("");
  }
  return (
    <>
      <div className="account-controls">
        <button className="tracker-launch" onClick={() => show("goals")}>
          <Target size={17} />
          <span>Goals & habits</span>
        </button>
        <button
          className="account-button"
          aria-label={`Account settings for ${profile.name}`}
          onClick={() => show("account")}
        >
          <span className="account-avatar">
            {profile.name[0].toUpperCase()}
          </span>
          <span className="account-name">{profile.name}</span>
          <ChevronDown size={14} />
        </button>
      </div>
      {open && (
        <Modal
          title="Your Tempo"
          close={() => {
            if (!busy) setOpen(false);
          }}
        >
          <nav className="settings-tabs" aria-label="Settings sections">
            {(["account", "appearance", "goals", "habits"] as const).map(
              (t) => (
                <button
                  key={t}
                  aria-pressed={tab === t}
                  onClick={() => {
                    setTab(t);
                    setError("");
                    setMessage("");
                  }}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ),
            )}
          </nav>
          {error && (
            <p role="alert" className="message error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="message">
              {message}
            </p>
          )}
          {tab === "account" && (
            <div className="settings-body">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void run(async () => {
                    const changed = await api<User>("account", {
                      method: "PUT",
                      body: JSON.stringify({ name: data.get("name") }),
                    });
                    setProfile(changed);
                    setMessage("Profile saved.");
                  });
                }}
              >
                <h3>Your profile</h3>
                <label>
                  Display name
                  <input
                    name="name"
                    defaultValue={profile.name}
                    required
                    maxLength={60}
                  />
                </label>
                <label>
                  Email address
                  <input value={profile.email || "Demo account"} readOnly />
                </label>
                <p className="field-help">
                  Your email is your sign-in address.
                </p>
                <button className="primary" disabled={busy}>
                  Save profile
                </button>
              </form>
              {!user.is_demo && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const data = new FormData(form);
                    if (data.get("password") !== data.get("confirm")) {
                      setError("New passwords do not match.");
                      return;
                    }
                    void run(async () => {
                      await api("account/password", {
                        method: "PUT",
                        body: JSON.stringify({
                          current_password: data.get("current"),
                          password: data.get("password"),
                        }),
                      });
                      form.reset();
                      setMessage(
                        "Password updated. Other devices have been signed out.",
                      );
                    });
                  }}
                >
                  <h3>Change password</h3>
                  <label>
                    Current password
                    <input
                      type="password"
                      name="current"
                      autoComplete="current-password"
                      required
                      maxLength={128}
                    />
                  </label>
                  <label>
                    New password
                    <input
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      minLength={15}
                      maxLength={128}
                      required
                    />
                  </label>
                  <label>
                    Confirm new password
                    <input
                      type="password"
                      name="confirm"
                      autoComplete="new-password"
                      minLength={15}
                      maxLength={128}
                      required
                    />
                  </label>
                  <p className="field-help">Use at least 15 characters.</p>
                  <button className="primary" disabled={busy}>
                    Update password
                  </button>
                </form>
              )}
              <button
                className="signout-button"
                disabled={busy}
                onClick={() => void run(logout)}
              >
                Sign out
              </button>
            </div>
          )}
          {tab === "appearance" && (
            <div className="settings-body">
              <h3>A palette for your pace</h3>
              <p className="field-help">
                Choose the colors that feel comfortable to you.
              </p>
              <button
                className="default-appearance"
                aria-pressed={preferences.theme === "default"}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const p = await api<Preferences>("preferences", {
                      method: "PUT",
                      body: JSON.stringify({
                        ...preferences,
                        theme: "default",
                      }),
                    });
                    onPreferences(p);
                    setMessage("Appearance saved.");
                  })
                }
              >
                <span className="default-preview" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <strong>Tempo default</strong>
                  <small>Neutral grays. Color where it matters.</small>
                </span>
                {preferences.theme === "default" && <Check size={17} />}
              </button>
              {(["light", "dark"] as const).map((mode) => (
                <section
                  key={mode}
                  className="palette-group"
                  aria-label={`${mode} presets`}
                >
                  <h4>
                    {mode === "light" ? "Light presets" : "Dark presets"}{" "}
                    <span>10 colors</span>
                  </h4>
                  <div className="theme-grid">
                    {themes
                      .filter(
                        (t) => darkThemeIds.has(t[0]) === (mode === "dark"),
                      )
                      .map((t) => (
                        <button
                          key={t[0]}
                          aria-pressed={preferences.theme === t[0]}
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const p = await api<Preferences>("preferences", {
                                method: "PUT",
                                body: JSON.stringify({
                                  ...preferences,
                                  theme: t[0],
                                }),
                              });
                              onPreferences(p);
                              setMessage("Appearance saved.");
                            })
                          }
                        >
                          <span
                            className="palette-swatch"
                            style={{ background: t[2] }}
                          >
                            <i style={{ background: t[8] }} />
                            <i style={{ background: t[4] }} />
                            <i style={{ background: t[5] }} />
                          </span>
                          <span>
                            {t[1]}
                            {preferences.theme === t[0] && <Check size={14} />}
                          </span>
                        </button>
                      ))}
                  </div>
                </section>
              ))}
              <h3>Session alerts</h3>
              <label className="alert-option">
                <input
                  type="checkbox"
                  checked={!!preferences.sound}
                  disabled={busy}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    void run(async () => {
                      if (enabled) await prepareAudio();
                      const p = await api<Preferences>("preferences", {
                        method: "PUT",
                        body: JSON.stringify({
                          ...preferences,
                          sound: enabled,
                        }),
                      });
                      onPreferences(p);
                      if (enabled) chime();
                      setMessage("Sound preference saved.");
                    });
                  }}
                />{" "}
                Completion sound
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await prepareAudio();
                    chime();
                  })
                }
              >
                Test sound
              </button>
              <label className="alert-option">
                <input
                  type="checkbox"
                  checked={!!preferences.notifications}
                  disabled={busy}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    void run(async () => {
                      if (enabled) {
                        if (typeof Notification === "undefined")
                          throw new Error(
                            "This browser does not support notifications.",
                          );
                        const permission =
                          await Notification.requestPermission();
                        if (permission !== "granted")
                          throw new Error(
                            "Notifications are blocked. Enable them in browser site settings, then try again.",
                          );
                      }
                      const p = await api<Preferences>("preferences", {
                        method: "PUT",
                        body: JSON.stringify({
                          ...preferences,
                          notifications: enabled,
                        }),
                      });
                      onPreferences(p);
                      setMessage("Notification preference saved.");
                    });
                  }}
                />{" "}
                Browser notifications
              </label>
              <p className="field-help">
                Alerts work while Tempo is open. Browser permission is needed on
                each device. Sound may need a Start or Resume click after a
                refresh. Your device’s silent mode still applies.
              </p>
              <h3>Your focus companion</h3>
              <p className="field-help">
                Same timer, a different look. Switch even during a session.
              </p>
              <div className="timer-style-grid">
                {styles.map((s) => (
                  <button
                    key={s[0]}
                    disabled={busy}
                    aria-pressed={preferences.timer_style === s[0]}
                    onClick={() =>
                      void run(async () => {
                        const p = await api<Preferences>("preferences", {
                          method: "PUT",
                          body: JSON.stringify({
                            ...preferences,
                            timer_style: s[0],
                          }),
                        });
                        onPreferences(p);
                        setMessage("Timer style saved.");
                      })
                    }
                  >
                    <span aria-hidden="true">{s[2]}</span>
                    {s[1]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(tab === "goals" || tab === "habits") && <Trackers kind={tab} />}
        </Modal>
      )}
    </>
  );
}
export function TimerObject({
  style,
  progress,
  running,
}: {
  style: string;
  progress: number;
  running: boolean;
}) {
  if (style === "ring" || style === "digital") return null;
  const selected = styles.find((s) => s[0] === style) || styles[2];
  const emoji =
    style === "garden"
      ? ["🌱", "🌿", "🪴", "🌳"][
          Math.min(3, Math.max(0, Math.floor(progress * 4)))
        ]
      : style === "hourglass" && progress >= 1
        ? "⌛"
        : selected[2];
  return (
    <div
      className="timer-object"
      aria-label={
        style === "garden" ? "Garden grows with session progress" : selected[1]
      }
    >
      <span aria-hidden="true">{emoji}</span>
      <small>
        {style === "garden"
          ? "A little time to grow."
          : style === "cat"
            ? running
              ? "Keeping you company."
              : "Ready when you are."
            : "One moment at a time."}
      </small>
    </div>
  );
}
