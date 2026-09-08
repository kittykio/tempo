"""Account preferences, dated objectives, and scheduled habit check-ins."""
import json
from datetime import date
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, model_validator
from auth import current_user, hash_password, verify_password, throttle, issue_session
from store import database
from insights import goal_progress,zone

router=APIRouter(prefix='/api',tags=['workspace'])
Theme=Literal['default','sage','sand','rose','lavender','ocean','sky','peach','mint','slate','ivory','midnight','forest-night','ember','rosewood','amethyst','deep-ocean','moonlight','copper','pine','charcoal']
Style=Literal['ring','digital','hourglass','garden','cat','black-cat','fox','panda','bunny','turtle','coffee','moon']
class Preferences(BaseModel):
    theme: Theme='default'
    timer_style: Style='ring'
    sound: bool=False
    notifications: bool=False
class Profile(BaseModel):
    name: str=Field(min_length=1,max_length=60,pattern=r'\S')
class PasswordChange(BaseModel):
    current_password: str=Field(min_length=1,max_length=128)
    password: str=Field(min_length=15,max_length=128)

@router.get('/preferences')
def preferences(user=Depends(current_user)):
    with database() as conn:
        row=conn.execute('SELECT theme,timer_style,sound,notifications FROM preferences WHERE user_id=?',(user['id'],)).fetchone()
        return Preferences(**dict(row)) if row else Preferences()
@router.put('/preferences')
def save_preferences(data:Preferences,user=Depends(current_user)):
    with database() as conn:
        conn.execute('INSERT INTO preferences (user_id,theme,timer_style,sound,notifications) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme,timer_style=excluded.timer_style,sound=excluded.sound,notifications=excluded.notifications',(user['id'],data.theme,data.timer_style,data.sound,data.notifications))
    return data
@router.put('/account')
def profile(data:Profile,user=Depends(current_user)):
    with database() as conn:
        conn.execute('UPDATE users SET name=? WHERE id=?',(data.name.strip(),user['id']))
    return {**user,'name':data.name.strip()}
@router.put('/account/password')
def password(data:PasswordChange,request:Request,response:Response,user=Depends(current_user)):
    throttle(request,'change-password',limit=10)
    with database() as conn:
        row=conn.execute('SELECT password_hash FROM users WHERE id=?',(user['id'],)).fetchone()
    if user['is_demo']:
        raise HTTPException(400,'Demo accounts do not have passwords.')
    if not verify_password(data.current_password,row['password_hash']):
        raise HTTPException(400,'Current password is incorrect.')
    replacement=hash_password(data.password)
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if not conn.execute('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?',(replacement,user['id'],row['password_hash'])).rowcount:
            raise HTTPException(409,'Account changed. Sign in again before retrying.')
        conn.execute('DELETE FROM auth_sessions WHERE user_id=?',(user['id'],))
        conn.execute('DELETE FROM password_resets WHERE user_id=?',(user['id'],))
        issue_session(conn,user['id'],request,response)
    return {'message':'Password updated. Other devices have been signed out.'}

class Goal(BaseModel):
    source: Literal['manual','focus_sessions','focus_minutes','habit_checkins']='manual'
    habit_id: str | None=None
    timezone: str=Field(default='UTC',max_length=100)
    title: str=Field(min_length=1,max_length=160,pattern=r'\S')
    period: Literal['daily','weekly','monthly','yearly','custom']
    start: date
    end: date
    target: int=Field(ge=1,le=1000000)
    progress: int=Field(default=0,ge=0,le=1000000)
    unit: str=Field(min_length=1,max_length=30,pattern=r'\S')
    @model_validator(mode='after')
    def dates(self):
        if self.end<self.start: raise ValueError('End date must follow the start date')
        zone(self.timezone)
        if self.source!='manual':
            self.progress=0
            self.unit={'focus_sessions':'sessions','focus_minutes':'minutes','habit_checkins':'check-ins'}[self.source]
        if self.source!='habit_checkins': self.habit_id=None
        if self.progress>self.target: raise ValueError('Progress cannot exceed the target')
        return self
@router.get('/goals')
def goals(user=Depends(current_user)):
    with database() as conn:
        return [goal_progress(conn,r) for r in conn.execute('SELECT * FROM goals WHERE user_id=? ORDER BY end,start',(user['id'],))]
@router.post('/goals',status_code=201)
def add_goal(data:Goal,user=Depends(current_user)):
    item={**data.model_dump(mode='json'),'id':str(uuid4()),'user_id':user['id']}
    with database() as conn:
        validate_goal_habit(conn,data,user)
        conn.execute('INSERT INTO goals (id,user_id,title,period,start,end,target,progress,unit,source,habit_id,timezone) VALUES (:id,:user_id,:title,:period,:start,:end,:target,:progress,:unit,:source,:habit_id,:timezone)',item)
    return item
@router.put('/goals/{goal_id}')
def edit_goal(goal_id:str,data:Goal,user=Depends(current_user)):
    with database() as conn:
        validate_goal_habit(conn,data,user)
        if not conn.execute('UPDATE goals SET title=:title,period=:period,start=:start,end=:end,target=:target,progress=:progress,unit=:unit,source=:source,habit_id=:habit_id,timezone=:timezone WHERE id=:id AND user_id=:user_id',{**data.model_dump(mode='json'),'id':goal_id,'user_id':user['id']}).rowcount:
            raise HTTPException(404,'Goal not found')
    return data
@router.delete('/goals/{goal_id}',status_code=204)
def delete_goal(goal_id:str,user=Depends(current_user)):
    with database() as conn:
        if not conn.execute('DELETE FROM goals WHERE id=? AND user_id=?',(goal_id,user['id'])).rowcount:raise HTTPException(404,'Goal not found')

class Habit(BaseModel):
    title: str=Field(min_length=1,max_length=160,pattern=r'\S')
    days: list[int]=Field(min_length=1,max_length=7)
    created: date
    @model_validator(mode='after')
    def valid_days(self):
        if len(set(self.days))!=len(self.days) or any(d<0 or d>6 for d in self.days):raise ValueError('Choose unique weekdays from Monday to Sunday')
        return self
@router.get('/habits')
def habits(user=Depends(current_user)):
    with database() as conn:
        rows=conn.execute('SELECT * FROM habits WHERE user_id=? ORDER BY rowid',(user['id'],)).fetchall()
        return [{**dict(r),'days':json.loads(r['days']),'checks':[c['day'] for c in conn.execute('SELECT day FROM habit_checks WHERE habit_id=? ORDER BY day',(r['id'],))]} for r in rows]
@router.post('/habits',status_code=201)
def add_habit(data:Habit,user=Depends(current_user)):
    item={**data.model_dump(mode='json'),'id':str(uuid4()),'user_id':user['id']}
    with database() as conn:conn.execute('INSERT INTO habits VALUES (:id,:user_id,:title,:days,:created)',{**item,'days':json.dumps(item['days'])})
    return {**item,'checks':[]}
@router.put('/habits/{habit_id}')
def edit_habit(habit_id:str,data:Habit,user=Depends(current_user)):
    with database() as conn:
        # Keep the original creation date and historic check-ins when changing the schedule.
        if not conn.execute('UPDATE habits SET title=?,days=? WHERE id=? AND user_id=?',(data.title,json.dumps(data.days),habit_id,user['id'])).rowcount:raise HTTPException(404,'Habit not found')
    return {'ok':True}
class CheckIn(BaseModel):
    day: date
    today: date
    completed: bool
@router.put('/habits/{habit_id}/check')
def check(habit_id:str,data:CheckIn,user=Depends(current_user)):
    # Accept the browser's calendar day, within real-world timezone bounds.
    if abs((data.today-date.today()).days)>1 or data.day>data.today:raise HTTPException(422,'Choose today or a previous day')
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        row=conn.execute('SELECT * FROM habits WHERE id=? AND user_id=?',(habit_id,user['id'])).fetchone()
        if not row:raise HTTPException(404,'Habit not found')
        if data.completed and (data.day.isoformat()<row['created'] or data.day.weekday() not in json.loads(row['days'])):raise HTTPException(422,'This habit is not scheduled for that day')
        if data.completed:conn.execute('INSERT OR IGNORE INTO habit_checks VALUES (?,?)',(habit_id,data.day.isoformat()))
        else:conn.execute('DELETE FROM habit_checks WHERE habit_id=? AND day=?',(habit_id,data.day.isoformat()))
    return {'ok':True}
@router.delete('/habits/{habit_id}',status_code=204)
def delete_habit(habit_id:str,user=Depends(current_user)):
    with database() as conn:
        if not conn.execute('DELETE FROM habits WHERE id=? AND user_id=?',(habit_id,user['id'])).rowcount:raise HTTPException(404,'Habit not found')

def validate_goal_habit(conn,data,user):
    if data.habit_id and not conn.execute('SELECT id FROM habits WHERE id=? AND user_id=?',(data.habit_id,user['id'])).fetchone():raise HTTPException(404,'Habit not found')
