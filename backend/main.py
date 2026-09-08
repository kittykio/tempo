"""Tempo API: private task boards and focus history."""
import os
from pathlib import Path
from typing import Literal
from uuid import uuid4
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from store import database
from auth import router, current_user

app = FastAPI(title='Tempo API', version='0.2.0')
app.include_router(router)
from workspace import router as workspace_router
app.include_router(workspace_router)
from insights import router as insights_router
from subtasks import router as subtasks_router
app.include_router(insights_router)
app.include_router(subtasks_router)

@app.middleware('http')
async def protect_requests(request: Request, call_next):
    if request.url.path.startswith('/api/') and request.method not in ('GET','HEAD','OPTIONS'):
        allowed = set(os.environ.get('TEMPO_ALLOWED_ORIGINS', 'http://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:5173,http://localhost:5173').split(','))
        origin = request.headers.get('origin')
        if (request.headers.get('X-Tempo-Request') != '1'
                or request.headers.get('sec-fetch-site') == 'cross-site'
                or (origin and origin not in allowed)):
            return JSONResponse({'detail':'Request origin could not be verified.'},status_code=403)
    response = await call_next(request)
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    return response

class TaskInput(BaseModel):
    title: str = Field(min_length=1, max_length=160, pattern=r'\S')
    notes: str = Field(default='', max_length=10000)
    status: Literal['todo', 'progress', 'done'] = 'todo'
    priority: Literal['low', 'medium', 'high'] = 'medium'
    estimate: int = Field(default=2, ge=1, le=20)
    previous_notes: str | None = Field(default=None, max_length=10000)

class SessionInput(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    task_id: str | None = None
    minutes: int = Field(ge=1, le=120)

def now():
    return datetime.now(timezone.utc).isoformat()

@app.get('/api/health')
def health():
    return {'status': 'ok'}

@app.get('/api/tasks')
def tasks(user=Depends(current_user)):
    with database() as conn:
        return [dict(row) for row in conn.execute('''
            SELECT t.*, COUNT(s.id) AS sessions, COALESCE(SUM(s.minutes),0) AS focus_minutes
            FROM tasks t LEFT JOIN sessions s ON s.task_id=t.id AND s.user_id=t.user_id
            WHERE t.user_id=?
            GROUP BY t.id ORDER BY t.created_at
        ''', (user['id'],))]

@app.post('/api/tasks', status_code=201)
def create_task(task: TaskInput, user=Depends(current_user)):
    item = {'id': str(uuid4()), **task.model_dump(), 'created_at': now(), 'user_id': user['id'], 'completed_at': now() if task.status=='done' else None}
    item['title'] = item['title'].strip()
    with database() as conn:
        conn.execute('INSERT INTO tasks (id,title,notes,status,priority,estimate,created_at,user_id,completed_at) VALUES (:id,:title,:notes,:status,:priority,:estimate,:created_at,:user_id,:completed_at)', item)
    return {**item, 'sessions': 0, 'focus_minutes': 0}

@app.put('/api/tasks/{task_id}')
def update_task(task_id: str, task: TaskInput, user=Depends(current_user)):
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if task.previous_notes is not None:
            row = conn.execute('SELECT notes FROM tasks WHERE id=? AND user_id=?',(task_id,user['id'])).fetchone()
            if row and row['notes'] != task.previous_notes and row['notes'] != task.notes:
                raise HTTPException(409, 'Task notes changed elsewhere. Copy your edits, then reopen this task.')
        result = conn.execute('''UPDATE tasks SET title=:title, notes=:notes, status=:status,
            priority=:priority, estimate=:estimate, completed_at=CASE WHEN :status!='done' THEN NULL WHEN status='done' THEN completed_at ELSE :finished END WHERE id=:id AND user_id=:user_id''', {**task.model_dump(), 'title': task.title.strip(), 'id': task_id, 'user_id': user['id'], 'finished': now()})
        if not result.rowcount:
            raise HTTPException(404, 'Task not found')
    return {'ok': True}

@app.delete('/api/tasks/{task_id}', status_code=204)
def delete_task(task_id: str, user=Depends(current_user)):
    with database() as conn:
        if not conn.execute('DELETE FROM tasks WHERE id=? AND user_id=?', (task_id,user['id'])).rowcount:
            raise HTTPException(404, 'Task not found')

@app.get('/api/sessions')
def sessions(user=Depends(current_user)):
    with database() as conn:
        return [dict(row) for row in conn.execute('SELECT * FROM sessions WHERE user_id=? ORDER BY completed_at DESC', (user['id'],))]

@app.post('/api/sessions')
def complete_session(session: SessionInput, user=Depends(current_user)):
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        existing = conn.execute('SELECT * FROM sessions WHERE id=?', (session.id,)).fetchone()
        if existing:
            if existing['user_id'] != user['id']:
                raise HTTPException(404, 'Session not found')
            return dict(existing)
        if session.task_id and not conn.execute('SELECT id FROM tasks WHERE id=? AND user_id=?', (session.task_id,user['id'])).fetchone():
            raise HTTPException(404, 'Task not found')
        item = {**session.model_dump(), 'completed_at': now(), 'user_id': user['id']}
        conn.execute('INSERT INTO sessions (id,task_id,minutes,completed_at,user_id) VALUES (:id,:task_id,:minutes,:completed_at,:user_id)', item)
        return item

class NoteInput(BaseModel):
    notes: str = Field(max_length=10000)
    previous_notes: str = Field(max_length=10000)

class StatusInput(BaseModel):
    status: Literal['todo', 'progress', 'done']

@app.patch('/api/tasks/{task_id}/status')
def change_status(task_id: str, data: StatusInput, user=Depends(current_user)):
    with database() as conn:
        if not conn.execute("UPDATE tasks SET status=?,completed_at=CASE WHEN ?!='done' THEN NULL WHEN status='done' THEN completed_at ELSE ? END WHERE id=? AND user_id=?",
                            (data.status,data.status,now(),task_id,user['id'])).rowcount:
            raise HTTPException(404,'Task not found')
    return {'ok':True}

@app.get('/api/tasks/{task_id}/notes')
def task_notes(task_id: str, user=Depends(current_user)):
    with database() as conn:
        row=conn.execute('SELECT notes FROM tasks WHERE id=? AND user_id=?',(task_id,user['id'])).fetchone()
        if not row:
            raise HTTPException(404,'Task not found')
        return dict(row)

@app.put('/api/tasks/{task_id}/notes')
def save_task_notes(task_id: str, data: NoteInput, user=Depends(current_user)):
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row=conn.execute('SELECT notes FROM tasks WHERE id=? AND user_id=?',(task_id,user['id'])).fetchone()
        if not row:
            raise HTTPException(404,'Task not found')
        if row['notes'] != data.previous_notes and row['notes'] != data.notes:
            raise HTTPException(409,'This note changed elsewhere. Copy your draft before loading the latest saved note.')
        conn.execute('UPDATE tasks SET notes=? WHERE id=? AND user_id=?',(data.notes,task_id,user['id']))
    return {'notes':data.notes}

@app.get('/api/scratchpad')
def scratchpad(user=Depends(current_user)):
    with database() as conn:
        row=conn.execute('SELECT notes FROM scratchpads WHERE user_id=?',(user['id'],)).fetchone()
        return {'notes':row['notes'] if row else ''}

@app.put('/api/scratchpad')
def save_scratchpad(data: NoteInput, user=Depends(current_user)):
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row=conn.execute('SELECT notes FROM scratchpads WHERE user_id=?',(user['id'],)).fetchone()
        current=row['notes'] if row else ''
        if current != data.previous_notes and current != data.notes:
            raise HTTPException(409,'This note changed elsewhere. Copy your draft before loading the latest saved note.')
        conn.execute('INSERT INTO scratchpads VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET notes=excluded.notes',
                     (user['id'],data.notes))
    return {'notes':data.notes}

# Serve the production React build after API routes so API paths take precedence.
from fastapi.staticfiles import StaticFiles
FRONTEND_DIST = Path(__file__).parent.parent / 'frontend' / 'dist'
if FRONTEND_DIST.is_dir():
    app.mount('/', StaticFiles(directory=FRONTEND_DIST, html=True), name='frontend')
