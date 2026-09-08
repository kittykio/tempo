"""Derived goal progress and calendar reviews. All reads are scoped to the account."""
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, Depends, HTTPException
from auth import current_user
from store import database
router=APIRouter(prefix='/api')

def zone(name):
    try:return ZoneInfo(name)
    except (ZoneInfoNotFoundError,ValueError):raise HTTPException(422,'Choose a valid timezone')
def local_day(value,tz):
    dt=datetime.fromisoformat(value)
    if dt.tzinfo is None:dt=dt.replace(tzinfo=ZoneInfo('UTC'))
    return dt.astimezone(tz).date().isoformat()
def goal_progress(conn,row):
    item=dict(row);source=item['source']
    if source=='manual':return item
    if source in ('focus_sessions','focus_minutes'):
        tz=zone(item['timezone'])
        rows=conn.execute('SELECT minutes,completed_at FROM sessions WHERE user_id=?',(item['user_id'],))
        matches=[r for r in rows if item['start']<=local_day(r['completed_at'],tz)<=item['end']]
        item['progress']=len(matches) if source=='focus_sessions' else sum(r['minutes'] for r in matches)
    else:
        item['progress']=conn.execute('''SELECT COUNT(*) FROM habit_checks c JOIN habits h ON h.id=c.habit_id
        WHERE h.user_id=? AND c.day BETWEEN ? AND ? AND (? IS NULL OR h.id=?)''',
        (item['user_id'],item['start'],item['end'],item['habit_id'],item['habit_id'])).fetchone()[0]
    return item

@router.get('/review')
def review(start:date,end:date,timezone:str='UTC',period:Literal['weekly','monthly']='weekly',user=Depends(current_user)):
    if end<start or (end-start).days>366:raise HTTPException(422,'Choose a range of up to one year')
    tz=zone(timezone);lo=start.isoformat();hi=end.isoformat();length=(end-start).days+1
    previous_start=(start-timedelta(days=length)).isoformat();previous_end=(start-timedelta(days=1)).isoformat()
    if period=='monthly':
        previous_last=start.replace(day=1)-timedelta(days=1)
        previous_start=previous_last.replace(day=1).isoformat();previous_end=previous_last.isoformat()
    with database() as conn:
        sessions=list(conn.execute('SELECT s.id,s.minutes,s.completed_at,t.title FROM sessions s LEFT JOIN tasks t ON t.id=s.task_id AND t.user_id=s.user_id WHERE s.user_id=? ORDER BY s.completed_at DESC',(user['id'],)))
        dated=[(local_day(s['completed_at'],tz),s['minutes']) for s in sessions]
        current=[(d,m) for d,m in dated if lo<=d<=hi]
        previous=[m for d,m in dated if previous_start<=d<=previous_end]
        daily=[{'day':(start+timedelta(days=i)).isoformat(),'minutes':sum(m for d,m in current if d==(start+timedelta(days=i)).isoformat())} for i in range(length)]
        completed=[dict(r) for r in conn.execute('SELECT id,title,completed_at FROM tasks WHERE user_id=? AND status=\'done\' AND completed_at IS NOT NULL',(user['id'],)) if lo<=local_day(r['completed_at'],tz)<=hi]
        habits=[dict(r) for r in conn.execute('''SELECT h.id,h.title,COUNT(c.day) AS checkins FROM habits h LEFT JOIN habit_checks c ON c.habit_id=h.id AND c.day BETWEEN ? AND ? WHERE h.user_id=? GROUP BY h.id ORDER BY h.rowid''',(lo,hi,user['id']))]
        goals=[goal_progress(conn,r) for r in conn.execute('SELECT * FROM goals WHERE user_id=? AND start<=? AND end>=? ORDER BY end',(user['id'],hi,lo))]
    return {'start':lo,'end':hi,'minutes':sum(m for _,m in current),'sessions':len(current),'previous_minutes':sum(previous),'previous_sessions':len(previous),'active_days':len({d for d,_ in current}),'daily':daily,'focus_sessions':[dict(r) for r in sessions if lo<=local_day(r['completed_at'],tz)<=hi],'completed_tasks':completed,'habits':habits,'goals':goals}
