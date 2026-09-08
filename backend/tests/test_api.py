def test_task_lifecycle_and_history(client):
    created = client.post('/api/tasks', json={'title':'Write a chapter','estimate':2})
    assert created.status_code == 201
    task = created.json()
    assert client.put('/api/tasks/'+task['id'], json={**task,'status':'progress'}).status_code == 200
    session = {'id':'first-session','task_id':task['id'],'minutes':25}
    assert client.post('/api/sessions',json=session).status_code == 200
    # Retrying a completion after refresh must not double-count it.
    client.post('/api/sessions',json=session)
    stored = client.get('/api/tasks').json()[0]
    assert stored['sessions'] == 1 and stored['focus_minutes'] == 25
    assert stored['status'] == 'progress'  # Completing a timer does not finish a task.
    assert client.delete('/api/tasks/'+task['id']).status_code == 204
    assert client.get('/api/tasks').json() == []
    assert client.get('/api/sessions').json()[0]['task_id'] is None

def test_validation_and_missing_records(client):
    assert client.post('/api/tasks',json={'title':'   '}).status_code == 422
    assert client.post('/api/tasks',json={'title':'Task','status':'unknown'}).status_code == 422
    assert client.post('/api/tasks',json={'title':'Task','estimate':0}).status_code == 422
    assert client.post('/api/sessions',json={'id':'x','minutes':0}).status_code == 422
    assert client.post('/api/sessions',json={'id':'x','minutes':25,'task_id':'missing'}).status_code == 404
    assert client.delete('/api/tasks/missing').status_code == 404

def test_open_focus(client):
    response = client.post('/api/sessions',json={'id':'open-focus','minutes':25})
    assert response.status_code == 200
    assert response.json()['task_id'] is None
