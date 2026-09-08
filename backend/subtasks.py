from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from auth import current_user
from store import database
router=APIRouter(prefix='/api/tasks')
class Subtask(BaseModel):
    title:str=Field(min_length=1,max_length=160,pattern=r'\S')
    done:bool=False

def owned(conn,task_id,user):
    if not conn.execute('SELECT id FROM tasks WHERE id=? AND user_id=?',(task_id,user['id'])).fetchone():raise HTTPException(404,'Task not found')
@router.get('/{task_id}/subtasks')
def get(task_id:str,user=Depends(current_user)):
    with database() as conn:
        owned(conn,task_id,user)
        return [dict(r) for r in conn.execute('SELECT * FROM subtasks WHERE task_id=? ORDER BY rowid',(task_id,))]
@router.post('/{task_id}/subtasks',status_code=201)
def create(task_id:str,data:Subtask,user=Depends(current_user)):
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE');owned(conn,task_id,user)
        if conn.execute('SELECT COUNT(*) FROM subtasks WHERE task_id=?',(task_id,)).fetchone()[0]>=100:raise HTTPException(422,'A task can have up to 100 subtasks')
        item={'id':str(uuid4()),'task_id':task_id,'title':data.title.strip(),'done':data.done}
        conn.execute('INSERT INTO subtasks VALUES (:id,:task_id,:title,:done)',item)
        return item
@router.put('/{task_id}/subtasks/{subtask_id}')
def update(task_id:str,subtask_id:str,data:Subtask,user=Depends(current_user)):
    with database() as conn:
        owned(conn,task_id,user)
        if not conn.execute('UPDATE subtasks SET title=?,done=? WHERE id=? AND task_id=?',(data.title.strip(),data.done,subtask_id,task_id)).rowcount:raise HTTPException(404,'Subtask not found')
    return {'ok':True}
@router.delete('/{task_id}/subtasks/{subtask_id}',status_code=204)
def remove(task_id:str,subtask_id:str,user=Depends(current_user)):
    with database() as conn:
        owned(conn,task_id,user)
        if not conn.execute('DELETE FROM subtasks WHERE id=? AND task_id=?',(subtask_id,task_id)).rowcount:raise HTTPException(404,'Subtask not found')
