"""HTTP process facade for the independent, loopback-only COM owner."""
import os
import secrets
import subprocess
import sys
import threading
import time
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]


class WorkerUnavailable(RuntimeError):
    pass


class QueueView:
    def __init__(self, gateway): self.gateway = gateway
    def empty(self): return self.gateway.status().get('queued', 0) == 0


class OneCGateway:
    def __init__(self, port=None, root=None, auto_start=True):
        self.root = Path(root or ROOT)
        self.port = int(port or os.environ.get('REPORTER_WORKER_PORT', 5052))
        self.url = f'http://127.0.0.1:{self.port}'
        self.auto_start = auto_start
        self.req_q = QueueView(self)
        self._lock = threading.Lock()
        self._http = threading.local()
        self._status = None
        self._status_at = 0

    def key(self):
        path = self.root / 'logs' / f'worker-{self.port}.key'
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with path.open('x', encoding='ascii') as file: file.write(secrets.token_hex(32))
        except FileExistsError:
            pass
        key = path.read_text(encoding='ascii').strip()
        if len(key) != 64: raise WorkerUnavailable('Worker authentication key is invalid')
        return key

    def request(self, path, data=None, timeout=5):
        try:
            if not hasattr(self._http, 'session'):
                self._http.session = requests.Session()
                self._http.session.trust_env = False
            response = self._http.session.post(self.url + path, json=data or {},
                headers={'X-Worker-Key': self.key()}, timeout=(1.5, timeout))
            body = response.json()
        except (requests.RequestException, ValueError) as error:
            raise WorkerUnavailable('1C bağlantı prosesi əlçatan deyil.') from error
        if not response.ok or not body.get('success'):
            if body.get('error_type') == 'TimeoutError': raise TimeoutError(body.get('error'))
            if body.get('error_type') == 'PermissionError': raise PermissionError(body.get('error'))
            if body.get('error_type') == 'ValueError': raise ValueError(body.get('error'))
            raise RuntimeError(body.get('error') or 'Worker request failed')
        return body

    def status(self, refresh=False):
        if not refresh and self._status is not None and time.monotonic()-self._status_at < .2:
            return self._status
        try: status = self.request('/status', timeout=2)['status']
        except WorkerUnavailable: status = {'available': False, 'busy': False, 'queued': 0, 'session_count': 0, 'session_tokens': []}
        self._status, self._status_at = status, time.monotonic()
        return status

    @property
    def busy(self): return self.status().get('busy', False)

    @property
    def connections(self):
        # Compatibility diagnostics only. COM objects never leave their owner process.
        return {token: token for token in self.status().get('session_tokens', [])}

    def ensure_worker(self):
        if self.status(refresh=True).get('available'): return
        if not self.auto_start: raise WorkerUnavailable('1C bağlantı prosesi başlamayıb.')
        with self._lock:
            if self.status(refresh=True).get('available'): return
            self.key()
            flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            env = dict(os.environ, REPORTER_WORKER_PORT=str(self.port))
            with (self.root/'logs'/f'worker-{self.port}.log').open('ab') as output:
                subprocess.Popen([sys.executable, str(self.root/'services'/'onec_worker_process.py')],
                    cwd=self.root, env=env, creationflags=flags, stdout=output, stderr=subprocess.STDOUT)
            deadline = time.monotonic()+15
            while time.monotonic() < deadline:
                if self.status(refresh=True).get('available'): return
                time.sleep(.2)
            raise WorkerUnavailable('1C bağlantı prosesi başlamadı; worker loqunu yoxlayın.')

    def execute(self, action, payload, retry=2, timeout=None):
        self.ensure_worker()
        timeout = timeout if timeout is not None else 300
        if not (action.startswith(('get_', 'search_', 'find_', 'resolve_')) or action in ('ping', 'connection_probe', 'universal_report', 'universal_sales', 'generate', 'order_analysis')):
            retry = 0
        result = self.request('/execute', {'action': action, 'payload': payload, 'retry': retry, 'timeout': timeout}, timeout=timeout+5)
        self._status_at = 0
        return result['result']

    def start_job(self, action, payload, request_id, token):
        self.ensure_worker()
        return self.request('/jobs/start', {'action': action, 'payload': payload, 'request_id': request_id, 'token': token}, timeout=5)

    def job(self, job_id, token, after=-1):
        self.ensure_worker()
        return self.request('/jobs/status', {'job_id': job_id, 'token': token, 'after': after}, timeout=5)['job']

    def shutdown_worker(self, confirmed=False):
        if not confirmed: raise PermissionError('Sessiyanı bağlamaq üçün açıq təsdiq lazımdır.')
        result = self.request('/shutdown', {'confirmed': True}, timeout=5)
        deadline = time.monotonic()+8
        while time.monotonic() < deadline:
            try: self.request('/status', timeout=1)
            except WorkerUnavailable:
                self._status_at = 0
                return result
            time.sleep(.15)
        raise TimeoutError('Bağlantı prosesi hələ dayanmayıb; yenidən yoxlayın.')

    def restart_worker(self, confirmed=False):
        if confirmed is not True:
            raise PermissionError('COM-u yeniləmək üçün açıq təsdiq lazımdır.')
        from services.worker_lifecycle import WorkerHandle
        state = self.status(refresh=True)
        if state.get('available'):
            handle = WorkerHandle(state['pid'])
            try:
                try:
                    self.shutdown_worker(confirmed=True)
                except TimeoutError:
                    handle.terminate()
                if handle.handle and not handle.wait(2000):
                    handle.terminate()
            finally:
                handle.close()
        self._status_at = 0
        self.ensure_worker()
        return self.status(refresh=True)

    def close_all(self):
        # An API restart or Electron close must not destroy the independent COM owner.
        return None
