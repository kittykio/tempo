"""Opaque cookie sessions, scrypt passwords, and single-use password resets."""
import hashlib
import hmac
import os
import re
import secrets
import smtplib
import ssl
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator
from store import database

router = APIRouter(prefix='/api/auth', tags=['accounts'])
COOKIE = 'tempo_session'
SESSION_SECONDS = 60 * 60 * 24 * 14

def timestamp():
    return int(time.time())

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    key = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**17, r=8, p=1, maxmem=256*1024*1024)
    return f'scrypt${salt}${key.hex()}'

def verify_password(password, stored):
    # Missing accounts perform the same expensive hash as existing accounts.
    expected = stored or 'scrypt$' + '00'*16 + '$' + '00'*64
    try:
        return hmac.compare_digest(hash_password(password, expected.split('$')[1]), expected)
    except (ValueError, IndexError):
        return False

class EmailInput(BaseModel):
    email: str = Field(max_length=254)

    @field_validator('email')
    @classmethod
    def valid_email(cls, value):
        value = value.strip().lower()
        if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', value):
            raise ValueError('Enter a valid email address')
        return value

class LoginInput(EmailInput):
    password: str = Field(min_length=1, max_length=128)

class SignupInput(EmailInput):
    name: str = Field(min_length=1, max_length=60, pattern=r'\S')
    password: str = Field(min_length=15, max_length=128)

class ResetInput(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=15, max_length=128)

def public_user(row):
    return {'id': row['id'], 'name': row['name'], 'email': row['email'], 'is_demo': row['demo_expires'] is not None}

def throttle(request, action, email=None, limit=20):
    now = timestamp()
    keys = [f'{action}:ip:{request.client.host if request.client else "unknown"}']
    if email:
        keys.append(f'{action}:email:{digest(email)}')
    blocked = False
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        conn.execute('DELETE FROM rate_limits WHERE expires <= ?', (now,))
        for key in keys:
            conn.execute('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1', (key, now+900))
            if conn.execute('SELECT count FROM rate_limits WHERE key=?', (key,)).fetchone()['count'] > limit:
                blocked = True
    if blocked:
        raise HTTPException(429, 'Too many attempts. Please try again in 15 minutes.', headers={'Retry-After':'900'})

def current_user(request: Request):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, 'Please sign in to continue.')
    with database() as conn:
        row = conn.execute('''SELECT u.* FROM users u JOIN auth_sessions a ON a.user_id=u.id
          WHERE a.token_hash=? AND a.expires>? AND (u.demo_expires IS NULL OR u.demo_expires>?)''',
          (digest(token), timestamp(), timestamp())).fetchone()
        if not row:
            raise HTTPException(401, 'Your session has expired. Please sign in again.')
        expected = request.headers.get('X-Tempo-User')
        if expected and expected != row['id']:
            raise HTTPException(401, 'The signed-in account changed. Please reload.')
        return public_user(row)

def issue_session(conn, user_id, request, response, lifetime=SESSION_SECONDS):
    previous = request.cookies.get(COOKIE)
    if previous:
        conn.execute('DELETE FROM auth_sessions WHERE token_hash=?', (digest(previous),))
    conn.execute('DELETE FROM auth_sessions WHERE expires<=?', (timestamp(),))
    token = secrets.token_urlsafe(32)
    conn.execute('INSERT INTO auth_sessions VALUES (?,?,?)', (digest(token), user_id, timestamp()+lifetime))
    response.set_cookie(COOKIE, token, max_age=lifetime, httponly=True,
                        secure=os.environ.get('TEMPO_COOKIE_SECURE','false').lower()=='true', samesite='lax', path='/')

@router.get('/me')
def me(user=Depends(current_user)):
    return user

@router.post('/signup', status_code=201)
def signup(data: SignupInput, request: Request, response: Response):
    throttle(request, 'signup', limit=10)
    password_hash = hash_password(data.password)
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        if conn.execute('SELECT id FROM users WHERE email=?', (data.email,)).fetchone():
            raise HTTPException(409, 'Unable to create this account. Try signing in or resetting your password.')
        user_id = str(uuid4())
        conn.execute('INSERT INTO users VALUES (?,?,?,?,NULL,?)', (user_id,data.email,data.name.strip(),password_hash,datetime.now(timezone.utc).isoformat()))
        issue_session(conn,user_id,request,response)
        return public_user(conn.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone())

@router.post('/login')
def login(data: LoginInput, request: Request, response: Response):
    throttle(request,'login',data.email)
    with database() as conn:
        row = conn.execute('SELECT * FROM users WHERE email=?', (data.email,)).fetchone()
    if not verify_password(data.password, row['password_hash'] if row else None):
        raise HTTPException(401, 'Email or password is incorrect.')
    with database() as conn:
        # Serialize with resets so they revoke any concurrently issued session.
        conn.execute('BEGIN IMMEDIATE')
        current = conn.execute('SELECT * FROM users WHERE id=? AND password_hash=?', (row['id'],row['password_hash'])).fetchone()
        if not current:
            raise HTTPException(401, 'Email or password is incorrect.')
        issue_session(conn,row['id'],request,response)
        return public_user(row)

@router.post('/logout', status_code=204)
def logout(request: Request, response: Response):
    with database() as conn:
        conn.execute('DELETE FROM auth_sessions WHERE token_hash=?', (digest(request.cookies.get(COOKIE,'')),))
    response.delete_cookie(COOKIE, path='/')

@router.post('/demo', status_code=201)
def demo(request: Request, response: Response):
    throttle(request,'demo',limit=10)
    user_id = str(uuid4())
    created = datetime.now(timezone.utc).isoformat()
    with database() as conn:
        conn.execute('DELETE FROM users WHERE demo_expires<=?',(timestamp(),))
        conn.execute('INSERT INTO users VALUES (?,NULL,?,NULL,?,?)',(user_id,'Demo explorer',timestamp()+86400,created))
        for title,notes,status,priority,estimate in [
            ('Sketch a new idea','Start with a few rough shapes.','todo','medium',2),
            ('Read a chapter','Leave yourself a note about what stood out.','todo','low',1),
            ('Make something small','Pick a first step and give it 25 minutes.','progress','high',3),
            ('Plan a quieter morning','A little space to think.','done','low',1)]:
            conn.execute('INSERT INTO tasks (id,title,notes,status,priority,estimate,created_at,user_id) VALUES (?,?,?,?,?,?,?,?)',
                         (str(uuid4()),title,notes,status,priority,estimate,created,user_id))
        issue_session(conn,user_id,request,response,86400)
        return public_user(conn.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone())

def reset_configured():
    return all(os.environ.get(key) for key in ('TEMPO_SMTP_HOST','TEMPO_MAIL_FROM','TEMPO_PUBLIC_URL'))

@router.get('/config')
def config():
    return {'password_reset_available': reset_configured()}

def send_reset_email(email, token):
    message = EmailMessage()
    message['Subject'] = 'Reset your Tempo password'
    message['From'] = os.environ['TEMPO_MAIL_FROM']
    message['To'] = email
    # Fragment keeps the reset secret out of HTTP request logs and referrers.
    url = os.environ['TEMPO_PUBLIC_URL'].rstrip('/') + '/#reset=' + token
    message.set_content(f'Reset your Tempo password:\n\n{url}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email.')
    with smtplib.SMTP(os.environ['TEMPO_SMTP_HOST'], int(os.environ.get('TEMPO_SMTP_PORT','587')), timeout=15) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        if os.environ.get('TEMPO_SMTP_USER'):
            smtp.login(os.environ['TEMPO_SMTP_USER'],os.environ['TEMPO_SMTP_PASSWORD'])
        smtp.send_message(message)

def deliver_reset(email, token):
    try:
        send_reset_email(email,token)
    except (OSError,smtplib.SMTPException):
        # Never log secrets or disclose whether an address has an account.
        import logging
        logging.getLogger('tempo').error('Password reset email delivery failed; check SMTP configuration.')

@router.post('/forgot-password')
def forgot_password(data: EmailInput, request: Request, background: BackgroundTasks):
    throttle(request,'reset-request',data.email,limit=5)
    if not reset_configured():
        raise HTTPException(503,'Password reset email is not configured. Contact the app owner.')
    with database() as conn:
        conn.execute('DELETE FROM password_resets WHERE expires<=?',(timestamp(),))
        row = conn.execute('SELECT id FROM users WHERE email=?',(data.email,)).fetchone()
        if row:
            token = secrets.token_urlsafe(32)
            conn.execute('DELETE FROM password_resets WHERE user_id=?',(row['id'],))
            conn.execute('INSERT INTO password_resets VALUES (?,?,?)',(digest(token),row['id'],timestamp()+1800))
            background.add_task(deliver_reset,data.email,token)
    return {'message':'If an account uses that email, a reset link will arrive shortly.'}

@router.post('/reset-password')
def reset_password(data: ResetInput, request: Request, response: Response):
    throttle(request,'reset-submit',limit=10)
    with database() as conn:
        row=conn.execute('SELECT user_id FROM password_resets WHERE token_hash=? AND expires>?',(digest(data.token),timestamp())).fetchone()
    if not row:
        raise HTTPException(400,'This reset link is invalid or expired. Request a new one.')
    password_hash=hash_password(data.password)
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        consumed=conn.execute('DELETE FROM password_resets WHERE token_hash=? AND expires>?',(digest(data.token),timestamp()))
        if not consumed.rowcount:
            raise HTTPException(400,'This reset link is invalid or expired. Request a new one.')
        conn.execute('UPDATE users SET password_hash=? WHERE id=?',(password_hash,row['user_id']))
        conn.execute('DELETE FROM password_resets WHERE user_id=?',(row['user_id'],))
        conn.execute('DELETE FROM auth_sessions WHERE user_id=?',(row['user_id'],))
    response.delete_cookie(COOKIE,path='/')
    return {'message':'Password updated. Sign in with your new password.'}
