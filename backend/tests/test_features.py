from datetime import date
from fastapi.testclient import TestClient
import main
from store import database
from conftest import signup

def goal(**kw):
    return {'title':'Focus','period':'monthly','start':'2026-09-01','end':'2026-09-30','target':10,'progress':0,'unit':'sessions','source':'focus_sessions','timezone':'Asia/Tokyo',**kw}

def add_session(client,id,stamp,minutes=25):
    assert client.post('/api/sessions',json={'id':id,'minutes':minutes}).status_code==200
    with database() as conn:conn.execute('UPDATE sessions SET completed_at=? WHERE id=?',(stamp,id))

def test_auto_progress_counts_timezone_boundaries_and_deduplicates(client):
    g=client.post('/api/goals',json=goal()).json()
    add_session(client,'a','2026-08-31T15:00:00+00:00') # September in Tokyo
    add_session(client,'b','2026-09-30T14:59:59+00:00',50)
    add_session(client,'c','2026-09-30T15:00:00+00:00') # October in Tokyo
    client.post('/api/sessions',json={'id':'a','minutes':25})
    assert client.get('/api/goals').json()[0]['progress']==2
    assert client.put('/api/goals/'+g['id'],json=goal(source='focus_minutes',progress=999,target=60)).status_code==200
    item=client.get('/api/goals').json()[0]
    assert item['progress']==75 and item['unit']=='minutes' # Can exceed the target.
    other=TestClient(main.app,headers={'X-Tempo-Request':'1'});signup(other,'other@example.com')
    other.post('/api/goals',json=goal())
    assert other.get('/api/goals').json()[0]['progress']==0
    assert client.post('/api/goals',json=goal(timezone='Invalid/Zone')).status_code==422

def test_habit_link_scope_and_undo(client):
    day=date.today().isoformat()
    h=client.post('/api/habits',json={'title':'Read','days':list(range(7)),'created':day}).json()
    g=client.post('/api/goals',json=goal(source='habit_checkins',habit_id=h['id'],start=day,end=day)).json()
    check={'day':day,'today':day,'completed':True}
    client.put('/api/habits/'+h['id']+'/check',json=check)
    assert client.get('/api/goals').json()[0]['progress']==1
    client.put('/api/habits/'+h['id']+'/check',json={**check,'completed':False})
    assert client.get('/api/goals').json()[0]['progress']==0
    other=TestClient(main.app,headers={'X-Tempo-Request':'1'});signup(other,'other@example.com')
    assert other.post('/api/goals',json=goal(source='habit_checkins',habit_id=h['id'])).status_code==404
    client.delete('/api/habits/'+h['id'])
    assert client.get('/api/goals').json()[0]['habit_id']==h['id'] # Does not silently become all habits.

def test_subtasks_crud_isolation_and_parent_status(client):
    task=client.post('/api/tasks',json={'title':'Project'}).json()
    path='/api/tasks/'+task['id']+'/subtasks'
    sub=client.post(path,json={'title':'Small step'}).json()
    assert client.put(path+'/'+sub['id'],json={'title':'Renamed step','done':True}).status_code==200
    assert client.get(path).json()[0]['done']==1
    assert client.get('/api/tasks').json()[0]['status']=='todo'
    other=TestClient(main.app,headers={'X-Tempo-Request':'1'});signup(other,'other@example.com')
    assert other.get(path).status_code==404
    assert other.post(path,json={'title':'intrude'}).status_code==404
    assert other.put(path+'/'+sub['id'],json={'title':'intrude'}).status_code==404
    assert other.delete(path+'/'+sub['id']).status_code==404
    assert client.post(path,json={'title':'  '}).status_code==422
    client.delete('/api/tasks/'+task['id'])
    with database() as conn:assert conn.execute('SELECT COUNT(*) FROM subtasks').fetchone()[0]==0

def test_review_months_timezone_completion_and_history(client):
    add_session(client,'aug','2026-08-15T00:00:00+00:00',30)
    add_session(client,'sep','2026-08-31T15:00:00+00:00',25)
    add_session(client,'oct','2026-09-30T15:00:00+00:00',50)
    task=client.post('/api/tasks',json={'title':'Finish me'}).json()
    client.patch('/api/tasks/'+task['id']+'/status',json={'status':'done'})
    with database() as conn:conn.execute('UPDATE tasks SET completed_at=? WHERE id=?',('2026-09-01T00:00:00+00:00',task['id']))
    client.patch('/api/tasks/'+task['id']+'/status',json={'status':'done'})
    url='/api/review?start=2026-09-01&end=2026-09-30&timezone=Asia/Tokyo&period=monthly'
    r=client.get(url).json()
    assert r['minutes']==25 and r['previous_minutes']==30 and r['sessions']==1
    assert len(r['daily'])==30 and r['daily'][0]['minutes']==25
    assert r['completed_tasks'][0]['title']=='Finish me' and len(r['focus_sessions'])==1
    client.patch('/api/tasks/'+task['id']+'/status',json={'status':'progress'})
    assert client.get(url).json()['completed_tasks']==[]
    other=TestClient(main.app,headers={'X-Tempo-Request':'1'});signup(other,'other@example.com')
    assert other.get(url).json()['minutes']==0
    assert client.get('/api/review?start=2026-09-30&end=2026-09-01').status_code==422

def test_alert_settings_default_off_and_persist(client):
    prefs=client.get('/api/preferences').json()
    assert prefs['sound'] is False and prefs['notifications'] is False
    assert client.put('/api/preferences',json={**prefs,'sound':True,'notifications':True}).status_code==200
    assert client.get('/api/preferences').json()['sound'] is True

def test_new_endpoints_require_auth(anonymous):
    for path in ['/api/review?start=2026-09-01&end=2026-09-30','/api/tasks/x/subtasks']:
        assert anonymous.get(path).status_code==401
