"""SQLite storage with an additive migration from the original local workspace."""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.environ.get('TEMPO_DB', Path(__file__).with_name('tempo.db')))

@contextmanager
def database():
    with sqlite3.connect(DB_PATH, timeout=15) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys = ON')
        conn.executescript('''
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
          title TEXT NOT NULL, period TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
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
        ''')
        conn.execute('BEGIN IMMEDIATE')
        # Old rows stay unclaimed, never visible through an account's API.
        for table in ('tasks', 'sessions'):
            if 'user_id' not in {r['name'] for r in conn.execute(f'PRAGMA table_info({table})')}:
                conn.execute(f'ALTER TABLE {table} ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE')
            conn.execute(f'CREATE INDEX IF NOT EXISTS {table}_user ON {table}(user_id)')
        additions={'tasks':{'completed_at':'TEXT'},'goals':{'source':"TEXT NOT NULL DEFAULT 'manual'",'habit_id':'TEXT','timezone':"TEXT NOT NULL DEFAULT 'UTC'"},'preferences':{'sound':'INTEGER NOT NULL DEFAULT 0','notifications':'INTEGER NOT NULL DEFAULT 0'}}
        for table,columns in additions.items():
            existing={r['name'] for r in conn.execute(f'PRAGMA table_info({table})')}
            for name,definition in columns.items():
                if name not in existing:conn.execute(f'ALTER TABLE {table} ADD COLUMN {name} {definition}')
        conn.commit()
        yield conn
