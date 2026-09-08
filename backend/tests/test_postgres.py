import pytest
import store
from postgres import translate

def test_query_translation_preserves_literals_and_bindings():
    assert translate("SELECT '?' AS label, end FROM goals WHERE id=:id AND title=?") == "SELECT '?' AS label, \"end\" FROM goals WHERE id=%(id)s AND title=%s"
    assert translate('INSERT OR IGNORE INTO habit_checks VALUES (?,?)').endswith('ON CONFLICT DO NOTHING')

def test_invalid_database_url_fails_closed(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'invalid')
    with pytest.raises(RuntimeError, match='PostgreSQL'):
        with store.database(): pass

def test_vercel_requires_postgres(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('VERCEL', '1')
    with pytest.raises(RuntimeError, match='persistent'):
        with store.database(): pass

def test_database_rolls_back_on_failure(anonymous):
    with pytest.raises(RuntimeError, match='abort'):
        with store.database() as conn:
            conn.execute("INSERT INTO rate_limits VALUES (?,1,0)", ('rollback-test',))
            raise RuntimeError('abort')
    with store.database() as conn:
        assert conn.execute('SELECT count FROM rate_limits WHERE key=?', ('rollback-test',)).fetchone() is None
