"""Run API tests in a uniquely named, disposable schema, never public tables.
Usage: python test_neon.py (DATABASE_URL or backend/.env required).
"""
import os
from uuid import uuid4
import psycopg
from psycopg import sql
from dotenv import load_dotenv
import pytest
import postgres


def main(test_args=None):
    load_dotenv()
    url = os.environ.get('DATABASE_URL')
    if not url: raise SystemExit('Set DATABASE_URL before running Neon tests.')
    schema = 'tempo_test_' + uuid4().hex
    original_connect = psycopg.connect
    with original_connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    class TestConnection(psycopg.Connection):
        def execute(self, query, params=None, **kwargs):
            if self.info.transaction_status == psycopg.pq.TransactionStatus.IDLE:
                super().execute(sql.SQL('SET LOCAL search_path TO {}').format(sql.Identifier(schema)))
            return super().execute(query, params, **kwargs)
    def isolated_connect(*args, **kwargs):
        return TestConnection.connect(*args, **kwargs)
    postgres.psycopg.connect = isolated_connect
    os.environ['TEMPO_TEST_POSTGRES_URL'] = url
    class Cleanup:
        @pytest.fixture(autouse=True)
        def clean(self):
            with postgres.postgres_database(url) as conn:
                conn.raw.execute('TRUNCATE users, rate_limits CASCADE')
    try:
        result = pytest.main(test_args or ['tests', '-q', '-x', '--tb=short', '-k', 'not legacy_data'], plugins=[Cleanup()])
    finally:
        postgres.psycopg.connect = original_connect
        with original_connect(url, autocommit=True) as admin:
            admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
        os.environ.pop('TEMPO_TEST_POSTGRES_URL', None)
    raise SystemExit(result)

if __name__ == '__main__': main()
