"""Durable read-job results; credentials and access tokens are never stored."""
import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def request_fingerprint(action, payload):
    safe = {k: v for k, v in payload.items() if k not in ('password', 'Pwd', '_job_id')}
    return digest(json.dumps([action, safe], sort_keys=True, ensure_ascii=False, default=str))


class JobStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('''CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, fingerprint TEXT NOT NULL,
                action TEXT NOT NULL, state TEXT NOT NULL, result TEXT, error TEXT,
                created REAL NOT NULL, updated REAL NOT NULL)''')
            db.execute('''CREATE TABLE IF NOT EXISTS chunks (
                job_id TEXT NOT NULL, sequence INTEGER NOT NULL, data TEXT NOT NULL,
                PRIMARY KEY(job_id, sequence))''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db: yield db
        finally: db.close()

    def create(self, request_id, token, action, payload):
        if not isinstance(request_id, str) or not 16 <= len(request_id) <= 128:
            raise ValueError('Invalid request ID')
        if not isinstance(token, str) or not 32 <= len(token) <= 256:
            raise ValueError('Invalid job access token')
        job_id = digest(request_id)
        fingerprint = request_fingerprint(action, payload)
        token_hash = digest(token)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
            if old:
                if old['token_hash'] != token_hash or old['fingerprint'] != fingerprint:
                    raise ValueError('Request ID belongs to a different request')
                if old['state'] != 'interrupted':
                    return job_id, False
                db.execute("UPDATE jobs SET state='queued',error=NULL,result=NULL,updated=? WHERE id=?", (time.time(), job_id))
                db.execute('DELETE FROM chunks WHERE job_id=?', (job_id,))
                return job_id, True
            now = time.time()
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,NULL,NULL,?,?)',
                       (job_id, token_hash, fingerprint, action, 'queued', now, now))
        return job_id, True

    def get(self, job_id, token, after=-1):
        with self.connect() as db:
            row = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
        if row is None or row['token_hash'] != digest(token):
            raise PermissionError('Job not found or access denied')
        with self.connect() as db:
            chunks = db.execute('SELECT sequence,data FROM chunks WHERE job_id=? AND sequence>? ORDER BY sequence LIMIT 21', (job_id, int(after))).fetchall()
        selected, size = [], 0
        for chunk in chunks:
            length = len(chunk['data'].encode('utf-8'))
            if selected and (len(selected) >= 20 or size + length > 128*1024): break
            selected.append(chunk)
            size += length
        return {'job_id': row['id'], 'state': row['state'], 'action': row['action'],
                'result': json.loads(row['result']) if row['result'] is not None else None,
                'error': row['error'], 'updated': row['updated'],
                'chunks': [{'sequence': c['sequence'], 'data': json.loads(c['data'])} for c in selected],
                'has_more': len(chunks) > len(selected)}

    def chunk(self, job_id, sequence, data):
        with self.connect() as db:
            db.execute('INSERT INTO chunks VALUES (?,?,?)', (job_id, sequence, json.dumps(data, ensure_ascii=False, default=str)))
            db.execute('UPDATE jobs SET updated=? WHERE id=?', (time.time(), job_id))

    def running(self, job_id):
        with self.connect() as db:
            db.execute("UPDATE jobs SET state='running',updated=? WHERE id=? AND state='queued'", (time.time(), job_id))

    def finish(self, job_id, result=None, error=None):
        encoded = json.dumps(result, ensure_ascii=False, default=str) if error is None else None
        with self.connect() as db:
            db.execute('UPDATE jobs SET state=?,result=?,error=?,updated=? WHERE id=?',
                       ('failed' if error is not None else 'succeeded', encoded, str(error) if error is not None else None, time.time(), job_id))

    def interrupt_pending(self):
        with self.connect() as db:
            db.execute("UPDATE jobs SET state='interrupted',error='Bağlantı prosesi yeniləndi; oxuma işini yenidən başladın.',updated=? WHERE state IN ('queued','running')", (time.time(),))
