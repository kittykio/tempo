# Tempo

A solo focus workspace that brings a Kanban board and Pomodoro timer together.

## What works

- Write task notes from the card editor or beside the timer, with up to 10,000 characters per note.
- Keep a private scratchpad for thoughts unrelated to a task. Save notes to your account; unsaved drafts stay in this browser under your account ID and survive refreshes.

- Sign up, sign in, and sign out with private task boards and focus history.
- Explore a separate demo workspace without registering (expires after 24 hours).
- Reset forgotten passwords through a single-use emailed link when SMTP is configured.

- Create, edit, delete, and prioritize tasks, with notes and estimated Pomodoros.
- Move tasks between To do, In progress, and Done by dragging or using a keyboard-accessible select.
- Select a task for a focus session or start an open session.
- Pause, resume, and reset focus timers, short breaks, and long breaks.
- Preserve the timer across refreshes using a saved deadline; background-tab throttling does not slow the countdown.
- Save completed sessions exactly once, including after a refresh or retry.
- Review task focus totals, daily session totals, and seven-day focus history.
- Keep completed focus history when a task is deleted.

## Stack

React, TypeScript, and Vite on the frontend. FastAPI and Pydantic on the backend, with PostgreSQL for hosting and SQLite for local development. SQLite keeps the first version easy to run without a separate database service. The backend owns account data; browser storage holds the local timer and unsaved note drafts.

## Run locally

Requires Python 3.11+ and Node.js 22.6+ (Node.js 22.18+ recommended).

Terminal 1:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.lock.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` requests to FastAPI on port 8000. Interactive API documentation is at http://localhost:8000/docs.

Create an account to open a private board, or choose **Explore the demo** for sample tasks. New account boards start empty. Add a task, choose **Focus** on its card, and start a session. Finishing a session logs time without marking the task done. Resetting discards an unfinished session. A completed focus timer switches to a short break; start the break when ready. Long breaks are selected manually.

## Validate

```sh
cd backend
.venv/bin/python -m pytest -q
cd ../frontend
npm run build
npm test
```

The timer tests verify background-tab timing, refresh recovery, pause behavior, and completion boundaries.

The API tests cover account isolation, authentication, session expiry and revocation, CSRF protection, rate limits, demo isolation, password resets, legacy data migration, task workflows, and concurrent completion deduplication. Interface tests cover sign-up validation, sign-in errors, restored sessions, logout, expiry, demo access, and the reset flow.

## Production build

Build the frontend, then run FastAPI. When `frontend/dist` exists at backend startup, FastAPI serves the built UI at `/` as well as the API:

```sh
cd frontend
npm ci
npm run build
cd ../backend
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

A Dockerfile is also included. Mount a persistent volume at `/data` for the SQLite database:

```sh
docker build -t tempo .
docker run --rm -p 127.0.0.1:8000:8000 -v tempo-data:/data tempo
```

## Accounts and deployment settings

Accounts use salted scrypt password hashes and opaque server-side sessions in HttpOnly, SameSite cookies. Session and reset secrets are stored as hashes. Sessions expire after 14 days; logout revokes the current session, and password reset revokes all sessions. Passwords require 15–128 characters. Authentication attempts are rate limited in the database by client IP and, for login/reset, by email.

The frontend sends a custom request header for CSRF protection. All task and focus-session queries enforce the signed-in owner. Each browser timer is stored under that user's ID; changing accounts in another tab clears the old board, and an identity header prevents stale tabs from writing into a newly signed-in account.

For HTTPS deployment, configure these environment variables (see `backend/.env.example`):

- `TEMPO_COOKIE_SECURE=true`
- `TEMPO_PUBLIC_URL=https://your-tempo-domain.example`
- `TEMPO_ALLOWED_ORIGINS=https://your-tempo-domain.example` (comma-separated exact browser origins, no trailing slash)
- `TEMPO_DB` pointing to persistent storage

Do not enable secure cookies for plain HTTP local development. Configure trusted proxy IPs explicitly on your host so IP rate limiting uses the actual client address; do not trust arbitrary forwarded headers. Demo workspaces expire after 24 hours and are deleted on the next demo creation.

### Password reset email

Set `TEMPO_SMTP_HOST`, `TEMPO_SMTP_PORT` (default 587), `TEMPO_MAIL_FROM`, and `TEMPO_PUBLIC_URL`. If the SMTP server requires authentication, also set `TEMPO_SMTP_USER` and `TEMPO_SMTP_PASSWORD`. SMTP requires STARTTLS. The backend loads `backend/.env` automatically without overriding existing process environment variables. Configure production values in your host's environment settings.

Reset requests return the same message for known and unknown addresses. Links expire in 30 minutes, are single-use, and never appear in API responses or application logs. Tokens are carried in a URL fragment to keep them out of server request logs. The UI explains when email is not configured. A delivery error is logged without personal data; the user can request another link. No real SMTP service is configured in this checkout; delivery is mocked in tests.

### Existing local data

The database migration is additive. Old tasks and focus sessions remain in the database with no account owner and are hidden from all signed-in users. They are never claimed by the first registration.

To transfer the old board, create your account, back up the SQLite database, then run this local administrator command from `backend`:

```sh
.venv/bin/python claim_legacy.py --email your-account@example.com
```

This assigns all unclaimed tasks and history to that account and can safely be run again. It is not exposed as an HTTP endpoint. A pre-account backup, if created during the upgrade, is named `tempo.pre-accounts.db`; keep it private.

## Current scope

Tasks and completed sessions follow the account across devices. The active timer remains local to one browser. Its completion is recorded when Tempo is open or next reopened, so its history timestamp reflects when completion is received. Use one timer tab at a time. Background notifications, email-address verification, social login, and account deletion are not implemented. Fonts are optional Google Fonts with system fallbacks.

Password hashing and reset design follow the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [forgot-password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Notes

The timer sidebar contains **Task notes** for the selected focus task and a **Scratchpad** for general thoughts. Use **Save** to sync to your account. Task notes also appear in each card’s editor and as a short preview on the board. Notes support plain text, including line breaks and pasted links.

Failed saves keep the draft. Saving a stale note reports a conflict instead of silently replacing a newer saved note; copy any writing you want to keep before choosing **Discard draft & load saved note**. Unsaved drafts stay on the current browser and are separate for each account and task. Deleting a task deletes its saved note; scratchpad content belongs to the account, and demo notes expire with the demo workspace.

## Account settings, goals, habits, and appearance

Click the avatar and name together in the upper-right corner to open **Your Tempo**. Account settings let you update your display name, change your password, or sign out. Your sign-in email is displayed read-only. Password changes require the current password and sign out other devices.

**Goals & habits** also opens the tracking controls directly. Goals support daily, Monday–Sunday weekly, calendar-month, calendar-year, and custom date ranges. Each goal has a title, numeric target, and progress source. Use **Log one** or edit progress for manual goals; automatic goals derive their unit and progress from saved activity. Goals do not automatically repeat. Choose manual progress or automatic focus-session, focus-minute, or habit-check-in tracking. Completed and past goals remain available until deleted.

Habits have a weekday schedule, editable names, and dated check-ins. Navigate previous weeks to view or correct history. Future days, days before creation, and unscheduled days cannot be marked complete. Check-ins can be undone; editing a schedule preserves existing history. Deleting a habit removes its check-ins. Calendar dates use the browser's local day.

Appearance includes **10 light presets** (Sage, Warm sand, Dusty rose, Lavender, Ocean, Soft sky, Peach, Fresh mint, Gray, Ivory) and **10 dark presets** (Midnight, Forest night, Ember, Rosewood, Amethyst, Deep ocean, Moonlight, Copper, Pine, Charcoal), displayed in separate groups. All dark presets use dark native form controls and matching semantic colors.

Twelve timer presentations share the same timer state: Classic ring, Desk clock, Hourglass, Growing garden, Cat companion, Black cat, Fox companion, Panda companion, Bunny companion, Slow and steady, Coffee break, and Moon watch. The yellow cat remains yellow while paused and running; the black cat is a separate choice. The picker and timer share each companion's emoji definition. The garden changes as the session progresses. Fun companions use native emoji, whose appearance varies by device. Switching styles never resets the session. Preferences, goals, and habits are private to each account and persist across sign-ins; demo data expires with its workspace.

New habits start with no scheduled days selected. Choose individual weekdays or **Every day** explicitly. Habit cards show **current** and **best** streaks, calculated from saved check-ins and the current weekday schedule. Unscheduled days do not interrupt a streak. A missed scheduled day resets the current streak once that day ends; an unfinished habit today does not reset it early. Undoing or correcting a check-in recalculates both streaks. Changing the weekday schedule recalculates streaks against that new schedule.

The default app appearance is **Tempo default**: neutral gray backgrounds, white cards, charcoal text, and semantic status colors. It is used on the sign-in screen and for accounts without a saved theme preference. The Gray preset remains a separate optional palette; explicitly saved choices continue to be restored.

**Tempo default** is a separate appearance outside the 20 optional presets. It uses neutral gray surfaces with semantic blue To do, amber In progress, and green Done indicators. Priority labels and habit completions retain distinct semantic colors across all themes. Explicitly saved presets remain selected until changed; choose Tempo default in Appearance to return to the regular app look.

## Automatic progress, reviews, alerts, and subtasks

- **Automatic goals:** Choose completed focus sessions, focus minutes, or habit check-ins. Habit goals can track all habits or one selected habit. Activity is counted within the inclusive goal dates, using the calendar timezone saved with that goal. Repeated session saves do not count twice. Undoing check-ins reduces progress. Totals can exceed the target. Existing goals stay manual; new goals default to focus-session tracking. Deleting a linked habit leaves a zero-progress link rather than broadening it to all habits.
- **Reviews:** The board's **Reviews** tab has weekly (Monday–Sunday) and calendar-month views, previous/next navigation, daily focus bars, the detailed focus-session list, completed tasks, check-ins per habit, and overlapping goals. Weekly comparisons use the previous week; monthly comparisons use the previous calendar month. Current partial periods compare against the full previous period. Dates use the browser timezone. Goal progress is shown for each goal's full range. Task completion dates are recorded from this version onward; existing undated completions cannot be reconstructed. Task counts include tasks still marked Done and exclude reopened/deleted tasks. Deleted habits and their check-ins no longer appear in reviews.
- **Alerts:** In **Appearance → Session alerts**, enable the completion sound and/or browser notifications. Both start off and save to the account. Browser permission must be granted on each device; it is requested only from the notification checkbox. Sound uses Web Audio, with a test button and activation when starting/resuming the timer. Alerts work while the app is open (including a background tab), not after the browser is closed. Browsers, OS silent modes, and mobile restrictions can suppress delivery. Old completed timers are not announced when returning more than a minute later. Alert retries are deduplicated.
- **Subtasks:** Expand **Subtasks** on a task card to add, check off, rename (saved on leaving the field), or delete small steps. Up to 100 subtasks per task. Completing subtasks never changes the parent's status. Deleting the parent deletes its subtasks. Every endpoint checks task ownership.

Schema changes are additive: goal tracking fields, alert preferences, task completion timestamps, and a subtasks table. No account data is reset. New automated tests cover timezone/date boundaries, goal over-completion, check-in undo, review isolation, subtask permissions, alert opt-in/deduplication, and UI workflows. Tests mock sound and notifications; they do not trigger real desktop alerts.


## Neon / PostgreSQL

Install the updated `backend/requirements.lock.txt`, then set `DATABASE_URL` in
`backend/.env` or your hosting environment to the Neon PostgreSQL connection URL.
Use Neon's pooled URL with its SSL parameters intact. `.env` is ignored by Git.
The backend now loads this file automatically; explicit environment variables win.

When `DATABASE_URL` is set, all accounts, tasks, sessions, notes, goals, habits,
preferences, and subtasks use PostgreSQL. With no URL (or an explicitly empty
`DATABASE_URL`), local development uses the existing SQLite file. On Vercel a
missing URL fails explicitly, rather than storing accounts on temporary disk.
A malformed or unreachable PostgreSQL URL never silently falls back to SQLite.

Tables and indexes are created additively on the first database access per
process. Concurrent initializations use a PostgreSQL transaction advisory lock.
Existing read/modify/write workflows also use a transaction advisory lock to
preserve session deduplication, note conflict detection, and auth consistency.
This conservative shared lock serializes those transactions; higher-traffic
installations should move to scoped locks or atomic statements.
Connections commit on success, roll back on exceptions, and close afterward.

The Neon database starts with its own accounts. Existing local SQLite data is
preserved but is **not automatically uploaded**. Switching databases requires
signing in again or creating an account in the selected database.

For HTTPS hosting set `TEMPO_COOKIE_SECURE=true`, `TEMPO_PUBLIC_URL` to your
actual app URL, and `TEMPO_ALLOWED_ORIGINS` to that exact origin without a trailing
slash. SMTP remains optional for password-reset email. The repository includes a root `app.py` entry point and `vercel.json`
that builds the React frontend and selects Singapore (`sin1`). Import the
repository root into Vercel using the FastAPI preset. API routes and the built
frontend share the same origin. Set the four production environment variables
above (including `DATABASE_URL`) in Vercel; the ignored local `.env` is not uploaded.
The configuration has been checked locally; a live Vercel deployment is still required.

Run the standard SQLite suite with `.venv/bin/python -m pytest -q`. To verify a
Neon database, run `.venv/bin/python test_neon.py` from `backend`. This creates a
uniquely named temporary schema, runs the API suite there (excluding the SQLite
legacy-file migration), then drops only that test schema in a finally block.
It requires schema-creation permission and never truncates the public app tables.
