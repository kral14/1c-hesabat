"""Single independent COM owner, with an authenticated loopback control interface."""
import hmac
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')

# Only read operations may become resumable jobs. Writes use the synchronous path.
READ_ACTIONS = frozenset(('audit_history', 'get_audit_list', 'get_audit_diff', 'get_audit_events',
    'get_documents_list', 'get_document_details', 'universal_report', 'universal_sales',
    'generate', 'order_analysis'))


PROCESS_STARTED_AT = time.time()

def main():
    from managed_runtime import runtime_lock
    from services.job_store import JobStore
    from services.onec_worker import OneCService
    import database
    port = int(os.environ.get('REPORTER_WORKER_PORT', 5052))
    lock = runtime_lock(port)
    if lock is None: return 0
    database.init_db()
    key = (ROOT/'logs'/f'worker-{port}.key').read_text(encoding='ascii').strip()
    store = JobStore(ROOT/'data'/f'connection_jobs-{port}.db')
    store.interrupt_pending()
    worker = OneCService()
    worker.on_action_start = store.running
    stopping = threading.Event()

    def fragments(job_id, sequence, kind, value):
        text = json.dumps(value, ensure_ascii=False, default=str)
        for offset in range(0, len(text), 16000):
            store.chunk(job_id, sequence, {'kind': kind, 'fragment': text[offset:offset+16000],
                'complete': offset+16000 >= len(text)})
            sequence += 1
        return sequence

    def perform(job_id, action, payload):
        try:
            if action == 'audit_history':
                from services.documents.base import parse_query_datetime
                first = parse_query_datetime(payload.get('date_from'))
                last = parse_query_datetime(payload.get('date_to'), is_end=True)
                if not first or not last or first > last: raise ValueError('Audit üçün düzgün tarix aralığı seçin.')
                data = dict(payload, _job_id=job_id)
                snapshot = worker.execute('get_audit_diff', dict(data, include_events=False), retry=0)
                sequence = fragments(job_id, 0, 'snapshot-fragment', snapshot)
                cursor, count = '', 0
                while True:
                    page = worker.execute('get_audit_events', dict(data, cursor=cursor), retry=0)
                    count += len(page['events'])
                    # Fragment even a very busy day into bounded network responses.
                    sequence = fragments(job_id, sequence, 'events-fragment', {**page, 'total_count': count})
                    following = page['next_cursor']
                    if not following: break
                    if following == cursor: raise RuntimeError('Audit cursor did not advance')
                    cursor = following
                result = {'event_count': count, 'scanned_to': page['scanned_to']}
            else:
                result = worker.execute(action, dict(payload, _job_id=job_id), retry=0)
                fragments(job_id, 0, 'result-fragment', result)
                result = {'chunked': True}
            store.finish(job_id, result=result)
        except Exception as error:
            store.finish(job_id, error=str(error))

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass

        def reply(self, status, body):
            encoded = json.dumps(body, ensure_ascii=False, default=str).encode('utf-8')
            try:
                self.send_response(status)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
            except (BrokenPipeError, ConnectionResetError): pass

        def do_POST(self):
            if not hmac.compare_digest(self.headers.get('X-Worker-Key', ''), key):
                return self.reply(403, {'success': False, 'error': 'Access denied'})
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 <= length <= 16*1024*1024: raise ValueError('Invalid request size')
                self.connection.settimeout(10)
                data = json.loads(self.rfile.read(length) or b'{}')
                if not isinstance(data, dict): raise ValueError('Invalid request')
                if self.path == '/status':
                    from services.connection_status import worker_snapshot
                    status = worker_snapshot(worker, os.getpid(), PROCESS_STARTED_AT)
                    return self.reply(200, {'success': True, 'status': status})
                if stopping.is_set(): raise RuntimeError('Worker is shutting down')
                if self.path == '/execute':
                    if not worker.is_alive(): raise RuntimeError('COM işçisi dayanıb; təsdiqli əlaqə bərpasını istifadə edin.')
                    timeout = min(max(float(data.get('timeout', 300)), .01), 3600)
                    result = worker.execute(data['action'], data.get('payload') or {},
                        retry=min(max(int(data.get('retry', 0)), 0), 2), timeout=timeout)
                    return self.reply(200, {'success': True, 'result': result})
                if self.path == '/jobs/start':
                    if not worker.is_alive(): raise RuntimeError('COM işçisi dayanıb; təsdiqli əlaqə bərpasını istifadə edin.')
                    action, payload = data.get('action'), data.get('payload') or {}
                    if action not in READ_ACTIONS: raise ValueError('This operation cannot be retried as a job')
                    if not isinstance(payload, dict): raise ValueError('Invalid job payload')
                    # Freeze the target at acceptance, not when a delayed job reaches COM.
                    active = database.get_active_base() or {}
                    payload = dict(payload)
                    for field in ('server', 'ref', 'user'):
                        if not payload.get(field): payload[field] = active.get(field)
                    if 'password' not in payload: payload['password'] = active.get('password', '')
                    if not all(payload.get(field) for field in ('server','ref','user')):
                        raise ValueError('İş üçün server, baza və istifadəçi seçilməlidir.')
                    job_id, created = store.create(data.get('request_id'), data.get('token'), action, payload)
                    if created:
                        threading.Thread(target=perform, args=(job_id, action, payload), daemon=True).start()
                    return self.reply(200, {'success': True, 'job_id': job_id, 'created': created})
                if self.path == '/jobs/status':
                    return self.reply(200, {'success': True, 'job': store.get(data['job_id'], data['token'], data.get('after', -1))})
                if self.path == '/shutdown':
                    if data.get('confirmed') is not True: raise PermissionError('Explicit confirmation is required')
                    stopping.set()
                    self.reply(200, {'success': True})
                    def stop():
                        store.interrupt_pending()
                        worker.close_all()
                        os._exit(0)
                    threading.Thread(target=stop, daemon=True).start()
                    return
                raise ValueError('Unknown worker operation')
            except Exception as error:
                self.reply(400, {'success': False, 'error': str(error), 'error_type': type(error).__name__})

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    print(f'Persistent 1C worker ready on loopback port {port}', flush=True)
    try: server.serve_forever()
    finally: worker.close_all(); server.server_close(); lock.close()
    return 0


if __name__ == '__main__': raise SystemExit(main())
