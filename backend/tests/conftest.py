import os
import pytest
from fastapi.testclient import TestClient
import main
import store
PASSWORD = 'a quiet morning with tea'
def signup(client, email='reader@example.com'):
    response = client.post('/api/auth/signup', json={'name':'Reader','email':email,'password':PASSWORD})
    assert response.status_code == 201, response.text
    return response.json()
@pytest.fixture
def anonymous(tmp_path, monkeypatch):
    if os.environ.get('TEMPO_TEST_POSTGRES_URL'):
        monkeypatch.setenv('DATABASE_URL', os.environ['TEMPO_TEST_POSTGRES_URL'])
    else:
        monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.delenv('VERCEL', raising=False)
    monkeypatch.setattr(store,'DB_PATH',tmp_path/'test.db')
    monkeypatch.setenv('TEMPO_COOKIE_SECURE','false')
    monkeypatch.delenv('TEMPO_SMTP_HOST',raising=False)
    return TestClient(main.app,headers={'X-Tempo-Request':'1'})
@pytest.fixture
def client(anonymous):
    signup(anonymous)
    return anonymous
