from fastapi.testclient import TestClient
import main
from conftest import signup

def test_notes_are_private_and_saved(client):
    task=client.post('/api/tasks',json={'title':'Read','notes':'First idea'}).json()
    assert client.put('/api/tasks/'+task['id']+'/notes',json={'notes':'A thought\nA next step','previous_notes':'First idea'}).status_code==200
    assert client.get('/api/tasks/'+task['id']+'/notes').json()['notes']=='A thought\nA next step'
    assert client.put('/api/scratchpad',json={'notes':'Private thought','previous_notes':''}).status_code==200
    other=TestClient(main.app,headers={'X-Tempo-Request':'1'});signup(other,'other@example.com')
    assert other.get('/api/scratchpad').json()=={'notes':''}
    assert other.get('/api/tasks/'+task['id']+'/notes').status_code==404
    assert other.put('/api/tasks/'+task['id']+'/notes',json={'notes':'Wrong','previous_notes':''}).status_code==404
    assert client.get('/api/scratchpad').json()['notes']=='Private thought'

def test_stale_saves_do_not_overwrite_notes(client):
    task=client.post('/api/tasks',json={'title':'Read'}).json()
    for endpoint in ['/api/scratchpad','/api/tasks/'+task['id']+'/notes']:
        assert client.put(endpoint,json={'notes':'Newer','previous_notes':''}).status_code==200
        assert client.put(endpoint,json={'notes':'Stale','previous_notes':''}).status_code==409
        assert client.get(endpoint).json()['notes']=='Newer'
        # Retrying an already-saved request is harmless.
        assert client.put(endpoint,json={'notes':'Newer','previous_notes':''}).status_code==200
        assert client.put(endpoint,json={'notes':'','previous_notes':'Newer'}).status_code==200

def test_moving_task_preserves_notes_and_task_edit_detects_conflicts(client):
    task=client.post('/api/tasks',json={'title':'Read','notes':'Original'}).json()
    client.put('/api/tasks/'+task['id']+'/notes',json={'notes':'New note','previous_notes':'Original'})
    assert client.patch('/api/tasks/'+task['id']+'/status',json={'status':'done'}).status_code==200
    saved=client.get('/api/tasks').json()[0]
    assert saved['notes']=='New note' and saved['status']=='done'
    assert client.put('/api/tasks/'+task['id'],json={**task,'previous_notes':'Original'}).status_code==409

def test_note_validation_and_signed_out_access(anonymous):
    assert anonymous.get('/api/scratchpad').status_code==401
    assert anonymous.put('/api/scratchpad',json={'notes':'Hi','previous_notes':''}).status_code==401
    signup(anonymous)
    assert anonymous.put('/api/scratchpad',json={'notes':'a'*10001,'previous_notes':''}).status_code==422
    assert anonymous.get('/api/tasks/missing/notes').status_code==404
