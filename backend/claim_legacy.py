"""Local administrator command: assign the old local board to an existing account."""
import argparse
from store import database


def claim(email):
    with database() as conn:
        conn.execute('BEGIN IMMEDIATE')
        user = conn.execute('SELECT id FROM users WHERE email=? AND demo_expires IS NULL', (email.strip().lower(),)).fetchone()
        if not user:
            raise ValueError('Create that account in Tempo first.')
        tasks = conn.execute('UPDATE tasks SET user_id=? WHERE user_id IS NULL', (user['id'],)).rowcount
        sessions = conn.execute('UPDATE sessions SET user_id=? WHERE user_id IS NULL', (user['id'],)).rowcount
        return tasks, sessions

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Assign all unclaimed legacy tasks and sessions to one existing account. Back up the database first.')
    parser.add_argument('--email',required=True)
    args=parser.parse_args()
    try:
        tasks,sessions=claim(args.email)
        print(f'Assigned {tasks} tasks and {sessions} focus sessions.')
    except ValueError as error:
        parser.exit(1,str(error)+'\n')
