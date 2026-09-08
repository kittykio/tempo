"""PostgreSQL storage for the application's small, SQLite-style query interface.

Values always use psycopg parameter binding. The transaction-scoped advisory
lock preserves BEGIN IMMEDIATE's serialization for read/modify/write workflows.
It works with Neon's transaction pooler; it is never a session-level lock.
"""
from contextlib import contextmanager
from threading import Lock
import re
import psycopg
from psycopg import ClientCursor
from pg_schema import SCHEMA

_schema_lock = Lock()
_initialized = set()
_TOKEN = re.compile(r"('(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|:[A-Za-z_][A-Za-z_0-9]*|\?|\b[A-Za-z_][A-Za-z_0-9]*\b)")

class Row(dict):
    def __getitem__(self, key):
        if isinstance(key, int):
            return tuple(self.values())[key]
        return super().__getitem__(key)

def row_factory(cursor):
    names = [column.name for column in (cursor.description or [])]
    return lambda values: Row((name, value) for name, value in zip(names, values) if name != '_tempo_order')

def translate(query):
    def token(match):
        value = match.group()
        if value == '?': return '%s'
        if value.startswith(':'): return '%(' + value[1:] + ')s'
        if value == 'end': return '"end"'
        if value == 'rowid': return '_tempo_order'
        return value
    # Escape literal percent signs before introducing psycopg placeholders.
    query = _TOKEN.sub(token, query.replace('%', '%%'))
    query = query.replace('INSERT OR IGNORE INTO', 'INSERT INTO') + (' ON CONFLICT DO NOTHING' if 'INSERT OR IGNORE INTO' in query else '')
    query = query.replace('SET count=count+1', 'SET count=rate_limits.count+1')
    query = query.replace('INSERT INTO habits VALUES', 'INSERT INTO habits (id,user_id,title,days,created) VALUES')
    query = query.replace('INSERT INTO subtasks VALUES', 'INSERT INTO subtasks (id,task_id,title,done) VALUES')
    return query

class Connection:
    def __init__(self, raw): self.raw = raw
    def execute(self, query, params=None):
        if query.strip().upper() == 'BEGIN IMMEDIATE':
            return self.raw.execute('SELECT pg_advisory_xact_lock(782164001)')
        if isinstance(params, dict):
            params = {k: int(v) if isinstance(v, bool) else v for k, v in params.items()}
        elif params is not None:
            params = tuple(int(v) if isinstance(v, bool) else v for v in params)
        return self.raw.execute(translate(query), params)
    def commit(self): self.raw.commit()
    def rollback(self): self.raw.rollback()

@contextmanager
def postgres_database(url):
    with psycopg.connect(url, connect_timeout=15, cursor_factory=ClientCursor,
                         row_factory=row_factory, prepare_threshold=None) as raw:
        # Once per process; a database lock also serializes concurrent cold starts.
        with _schema_lock:
            if url not in _initialized:
                raw.execute('SELECT pg_advisory_xact_lock(782164002)')
                raw.execute(SCHEMA)
                raw.commit()
                _initialized.add(url)
        yield Connection(raw)
