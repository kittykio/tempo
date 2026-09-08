"""Idempotent PostgreSQL schema; existing account data is retained."""

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT NOT NULL,
          password_hash TEXT, demo_expires INTEGER, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL,
          status TEXT NOT NULL, priority TEXT NOT NULL, estimate INTEGER NOT NULL,
          created_at TEXT NOT NULL, user_id TEXT REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY, task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
          minutes INTEGER NOT NULL, completed_at TEXT NOT NULL,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS subtasks (
          id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS preferences (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          theme TEXT NOT NULL DEFAULT 'default', timer_style TEXT NOT NULL DEFAULT 'ring'
        );
        CREATE TABLE IF NOT EXISTS goals (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL, period TEXT NOT NULL, start TEXT NOT NULL, "end" TEXT NOT NULL,
          target INTEGER NOT NULL, progress INTEGER NOT NULL DEFAULT 0, unit TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS habits (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL, days TEXT NOT NULL, created TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS habit_checks (
          habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
          day TEXT NOT NULL, PRIMARY KEY(habit_id,day)
        );
        CREATE TABLE IF NOT EXISTS scratchpads (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          notes TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS auth_sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS password_resets (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL
        );

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TEXT;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS habit_id TEXT;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS sound INTEGER NOT NULL DEFAULT 0;
ALTER TABLE preferences ADD COLUMN IF NOT EXISTS notifications INTEGER NOT NULL DEFAULT 0;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS _tempo_order BIGSERIAL;
ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS _tempo_order BIGSERIAL;
CREATE INDEX IF NOT EXISTS tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
"""
