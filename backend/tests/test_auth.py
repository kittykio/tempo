import sqlite3
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
import auth
import main
import store
from conftest import signup, PASSWORD

def other_client():
    return TestClient(main.app,headers={'X-Tempo-Request':'1'})

def test_private_endpoints_require_login(anonymous):
    for method,path,payload in [('get','/api/tasks',None),('get','/api/sessions',None),('post','/api/tasks',{'title':'Private'}),('post','/api/sessions',{'id':'x','minutes':25}),('put','/api/tasks/x',{'title':'changed'}),('delete','/api/tasks/x',None)]:
        assert anonymous.request(method,path,**({'json':payload} if payload else {})).status_code==401

def test_signup_session_cookie_login_logout(anonymous):
    response=anonymous.post('/api/auth/signup',json={'name':' Reader ','email':'READER@EXAMPLE.COM','password':PASSWORD})
    assert response.status_code==201
    user=response.json()
    assert user['email']=='reader@example.com' and user['name']=='Reader'
    assert 'password_hash' not in user
    assert 'HttpOnly' in response.headers['set-cookie'] and 'SameSite=lax' in response.headers['set-cookie']
    token=anonymous.cookies.get(auth.COOKIE)
    with store.database() as conn:
        stored=conn.execute('SELECT password_hash FROM users').fetchone()[0]
        assert PASSWORD not in stored and stored.startswith('scrypt$')
        assert conn.execute('SELECT token_hash FROM auth_sessions').fetchone()[0] != token
    assert anonymous.get('/api/auth/me').json()==user
    assert anonymous.post('/api/auth/logout').status_code==204
    assert anonymous.get('/api/tasks').status_code==401
    stale=other_client();stale.cookies.set(auth.COOKIE,token)
    assert stale.get('/api/auth/me').status_code==401
    assert anonymous.post('/api/auth/login',json={'email':user['email'],'password':'wrong'}).status_code==401
    assert anonymous.post('/api/auth/login',json={'email':user['email'],'password':PASSWORD}).status_code==200

def test_user_isolation_and_identity_binding(client):
    owner=client.get('/api/auth/me').json()
    task=client.post('/api/tasks',json={'title':'Personal work'}).json()
    session={'id':'private-session','task_id':task['id'],'minutes':25}
    assert client.post('/api/sessions',json=session).status_code==200
    other=other_client();signup(other,'other@example.com')
    assert other.get('/api/tasks').json()==[] and other.get('/api/sessions').json()==[]
    assert other.put('/api/tasks/'+task['id'],json={'title':'Intrusion'}).status_code==404
    assert other.delete('/api/tasks/'+task['id']).status_code==404
    assert other.post('/api/sessions',json=session).status_code==404
    assert other.post('/api/sessions',json={**session,'id':'new-id'}).status_code==404
    assert other.get('/api/tasks',headers={'X-Tempo-User':owner['id']}).status_code==401
    assert other.post('/api/tasks',json={'title':'wrong account'},headers={'X-Tempo-User':owner['id']}).status_code==401
    assert client.get('/api/tasks').json()[0]['title']=='Personal work'

def test_expiry_and_secure_cookie(anonymous,monkeypatch):
    monkeypatch.setenv('TEMPO_COOKIE_SECURE','true')
    response=anonymous.post('/api/auth/signup',json={'name':'Reader','email':'test@example.com','password':PASSWORD})
    assert 'Secure' in response.headers['set-cookie']
    client=other_client();client.cookies.set(auth.COOKIE,anonymous.cookies.get(auth.COOKIE))
    with store.database() as conn: conn.execute('UPDATE auth_sessions SET expires=0')
    assert client.get('/api/tasks').status_code==401

def test_csrf_protection(anonymous):
    assert TestClient(main.app).post('/api/auth/demo').status_code==403
    assert anonymous.post('/api/auth/demo',headers={'Origin':'https://attacker.example'}).status_code==403
    assert anonymous.post('/api/auth/demo',headers={'Sec-Fetch-Site':'cross-site'}).status_code==403
    assert anonymous.post('/api/auth/demo',headers={'Origin':'http://localhost:5173'}).status_code==201

def test_rate_limit_persists(anonymous):
    with store.database() as conn:
        conn.execute('INSERT INTO rate_limits VALUES (?,?,?)',('login:ip:testclient',20,auth.timestamp()+900))
    response=anonymous.post('/api/auth/login',json={'email':'someone@example.com','password':'incorrect'})
    assert response.status_code==429 and response.headers['retry-after']=='900'

def test_demo_isolation_and_expiry(anonymous):
    first=anonymous.post('/api/auth/demo').json();first_tasks=anonymous.get('/api/tasks').json()
    other=other_client();second=other.post('/api/auth/demo').json()
    assert first['is_demo'] and second['is_demo'] and first['id']!=second['id']
    assert len(first_tasks)==4
    assert other.delete('/api/tasks/'+first_tasks[0]['id']).status_code==404
    with store.database() as conn: conn.execute('UPDATE users SET demo_expires=0 WHERE id=?',(first['id'],))
    assert anonymous.get('/api/tasks').status_code==401
    third=other_client();third.post('/api/auth/demo')
    with store.database() as conn:
        assert conn.execute('SELECT id FROM tasks WHERE user_id=?',(first['id'],)).fetchone() is None
    assert len(other.get('/api/tasks').json())==4

def test_reset_email_single_use_revokes_sessions(client,monkeypatch):
    outbox=[]
    monkeypatch.setattr(auth,'reset_configured',lambda:True)
    monkeypatch.setattr(auth,'send_reset_email',lambda email,token:outbox.append((email,token)))
    another=other_client();another.post('/api/auth/login',json={'email':'reader@example.com','password':PASSWORD})
    known=client.post('/api/auth/forgot-password',json={'email':'reader@example.com'})
    unknown=client.post('/api/auth/forgot-password',json={'email':'nobody@example.com'})
    assert known.json()==unknown.json() and len(outbox)==1
    token=outbox[0][1]
    with store.database() as conn:
        assert conn.execute('SELECT token_hash FROM password_resets').fetchone()[0]!=token
    password='a completely different long password'
    assert client.post('/api/auth/reset-password',json={'token':token,'password':password}).status_code==200
    assert another.get('/api/auth/me').status_code==401
    assert client.post('/api/auth/reset-password',json={'token':token,'password':password}).status_code==400
    assert client.post('/api/auth/login',json={'email':'reader@example.com','password':PASSWORD}).status_code==401
    assert client.post('/api/auth/login',json={'email':'reader@example.com','password':password}).status_code==200

def test_reset_expired_and_unconfigured(client):
    assert client.get('/api/auth/config').json()['password_reset_available'] is False
    assert client.post('/api/auth/forgot-password',json={'email':'reader@example.com'}).status_code==503
    user=client.get('/api/auth/me').json();token='expired-token-01234567890123456789'
    with store.database() as conn:
        conn.execute('INSERT INTO password_resets VALUES (?,?,0)',(auth.digest(token),user['id']))
    assert client.post('/api/auth/reset-password',json={'token':token,'password':PASSWORD}).status_code==400

def test_signup_validation_and_duplicate(anonymous):
    for body in [{'name':'A','email':'bad-email','password':PASSWORD},{'name':'A','email':'a@example.com','password':'short'},{'name':'   ','email':'a@example.com','password':PASSWORD}]:
        assert anonymous.post('/api/auth/signup',json=body).status_code==422
    signup(anonymous)
    assert anonymous.post('/api/auth/signup',json={'name':'B','email':'reader@example.com','password':PASSWORD}).status_code==409

def test_concurrent_completions_are_idempotent(client):
    token=client.cookies.get(auth.COOKIE)
    def finish(_):
        other=other_client();other.cookies.set(auth.COOKIE,token)
        return other.post('/api/sessions',json={'id':'same-id','minutes':25}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(finish,range(2)))==[200,200]
    assert len(client.get('/api/sessions').json())==1

def test_legacy_data_stays_unclaimed(anonymous):
    with sqlite3.connect(store.DB_PATH) as conn:
        conn.executescript("""
        CREATE TABLE tasks (id TEXT PRIMARY KEY,title TEXT,notes TEXT,status TEXT,priority TEXT,estimate INTEGER,created_at TEXT);
        CREATE TABLE sessions (id TEXT PRIMARY KEY,task_id TEXT,minutes INTEGER,completed_at TEXT);
        INSERT INTO tasks VALUES ('legacy','Keep this','','todo','low',1,'2026-01-01');
        INSERT INTO sessions VALUES ('old-session','legacy',25,'2026-01-01');
        """)
    signup(anonymous)
    assert anonymous.get('/api/tasks').json()==[] and anonymous.get('/api/sessions').json()==[]
    with store.database() as conn:
        assert conn.execute('SELECT title,user_id FROM tasks').fetchone()['user_id'] is None
        assert conn.execute('SELECT COUNT(*) FROM sessions').fetchone()[0]==1
