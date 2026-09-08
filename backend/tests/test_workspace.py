from datetime import date,timedelta
from fastapi.testclient import TestClient
import main
from conftest import signup,PASSWORD

def other():
    c=TestClient(main.app,headers={'X-Tempo-Request':'1'});signup(c,'other@example.com');return c

def test_profile_and_preferences_persist(client):
    assert client.put('/api/account',json={'name':'A new name'}).json()['name']=='A new name'
    assert client.get('/api/auth/me').json()['name']=='A new name'
    assert client.put('/api/account',json={'name':'  '}).status_code==422
    for theme in ['sage','sand','rose','lavender','ocean','sky','peach','mint','slate','midnight']:
        p={'theme':theme,'timer_style':'garden'}
        assert client.put('/api/preferences',json=p).status_code==200
        assert client.get('/api/preferences').json()=={**p,'sound':False,'notifications':False}
    assert client.put('/api/preferences',json={'theme':'unknown'}).status_code==422
    assert other().get('/api/preferences').json()=={'theme':'default','timer_style':'ring','sound':False,'notifications':False}

def test_password_change_requires_current_and_revokes_old_sessions(client):
    another=TestClient(main.app,headers={'X-Tempo-Request':'1'})
    another.post('/api/auth/login',json={'email':'reader@example.com','password':PASSWORD})
    assert client.put('/api/account/password',json={'current_password':'wrong','password':'a new very long password'}).status_code==400
    assert client.put('/api/account/password',json={'current_password':PASSWORD,'password':'a new very long password'}).status_code==200
    assert client.get('/api/auth/me').status_code==200
    assert another.get('/api/auth/me').status_code==401

def test_goal_lifecycle_and_isolation(client):
    payload={'title':'Read','period':'monthly','start':'2026-09-01','end':'2026-09-30','target':10,'progress':0,'unit':'chapters'}
    g=client.post('/api/goals',json=payload).json();assert g['id']
    stranger=other();assert stranger.get('/api/goals').json()==[]
    assert stranger.put('/api/goals/'+g['id'],json=payload).status_code==404
    assert stranger.delete('/api/goals/'+g['id']).status_code==404
    assert client.put('/api/goals/'+g['id'],json={**payload,'progress':10}).status_code==200
    assert client.get('/api/goals').json()[0]['progress']==10
    assert client.post('/api/goals',json={**payload,'end':'2026-08-01'}).status_code==422
    assert client.post('/api/goals',json={**payload,'progress':11}).status_code==422
    assert client.delete('/api/goals/'+g['id']).status_code==204
    assert client.get('/api/goals').json()==[]

def test_habit_schedule_idempotency_history_and_privacy(client):
    today=date.today();day=today.isoformat()
    payload={'title':'Read','days':[today.weekday()],'created':day}
    h=client.post('/api/habits',json=payload).json();assert h['id']
    check={'day':day,'today':day,'completed':True}
    for _ in range(2):assert client.put('/api/habits/'+h['id']+'/check',json=check).status_code==200
    assert client.get('/api/habits').json()[0]['checks']==[day]
    stranger=other();assert stranger.get('/api/habits').json()==[]
    assert stranger.put('/api/habits/'+h['id']+'/check',json=check).status_code==404
    assert stranger.put('/api/habits/'+h['id'],json=payload).status_code==404
    assert stranger.delete('/api/habits/'+h['id']).status_code==404
    assert client.put('/api/habits/'+h['id']+'/check',json={**check,'day':(today+timedelta(days=1)).isoformat()}).status_code==422
    assert client.put('/api/habits/'+h['id'],json={**payload,'days':[(today.weekday()+1)%7]}).status_code==200
    assert client.get('/api/habits').json()[0]['checks']==[day]
    assert client.put('/api/habits/'+h['id']+'/check',json={**check,'completed':False}).status_code==200
    assert client.get('/api/habits').json()[0]['checks']==[]
    assert client.put('/api/habits/'+h['id']+'/check',json=check).status_code==422
    assert client.post('/api/habits',json={**payload,'days':[]}).status_code==422
    assert client.delete('/api/habits/'+h['id']).status_code==204

def test_workspace_requires_auth(anonymous):
    for path in ['preferences','goals','habits']:
        assert anonymous.get('/api/'+path).status_code==401

def test_every_appearance_option_round_trips(client):
    from typing import get_args
    from workspace import Theme, Style
    themes=get_args(Theme)
    styles=get_args(Style)
    assert len(themes)==21 and len(styles)==12
    for theme in themes:
        payload={'theme':theme,'timer_style':'cat'}
        assert client.put('/api/preferences',json=payload).status_code==200
        assert client.get('/api/preferences').json()=={**payload,'sound':False,'notifications':False}
    for style in styles:
        payload={'theme':'midnight','timer_style':style}
        assert client.put('/api/preferences',json=payload).status_code==200
        assert client.get('/api/preferences').json()=={**payload,'sound':False,'notifications':False}

def test_settings_survive_logout_and_fresh_login(client):
    chosen={'theme':'amethyst','timer_style':'black-cat'}
    assert client.put('/api/preferences',json=chosen).status_code==200
    assert client.put('/api/account',json={'name':'Saved name'}).status_code==200
    assert client.post('/api/auth/logout').status_code==204
    fresh=TestClient(main.app,headers={'X-Tempo-Request':'1'})
    assert fresh.post('/api/auth/login',json={'email':'reader@example.com','password':PASSWORD}).status_code==200
    assert fresh.get('/api/preferences').json()=={**chosen,'sound':False,'notifications':False}
    assert fresh.get('/api/auth/me').json()['name']=='Saved name'
