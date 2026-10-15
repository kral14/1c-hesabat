"""Persistent local service with Python source reload, independent of Electron."""
import os
import sys
from pathlib import Path
import time
import subprocess

ROOT = Path(__file__).resolve().parent
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8')

def require_waitress():
    import importlib
    dependency_path = str(ROOT / '.runtime-deps')
    if dependency_path not in sys.path:
        sys.path.insert(0, dependency_path)
    try:
        return importlib.import_module('waitress').serve
    except ModuleNotFoundError as error:
        if error.name != 'waitress':
            raise
        raise RuntimeError(
            'Waitress quraşdırılmayıb. Bu kompüterdə bir dəfə çalışdırın:\n'
            f'"{sys.executable}" -m pip install -r "{ROOT / "requirements-runtime.txt"}"'
        ) from error
def source_files():
    return sorted(list(ROOT.glob('*.py')) + list((ROOT/'services').rglob('*.py')) + list((ROOT/'routes').rglob('*.py')))

def source_signature():
    return {str(path):(path.stat().st_mtime_ns,path.stat().st_size) for path in source_files() if path.exists()}

def syntax_error():
    for path in source_files():
        try: compile(path.read_bytes(),str(path),'exec')
        except (SyntaxError,OSError) as error: return str(error)
    return None

def runtime_lock(port):
    (ROOT/'logs').mkdir(exist_ok=True)
    handle=open(ROOT/'logs'/f'runtime-{port}.lock','a+b')
    try:
        if handle.seek(0,2)==0: handle.write(b'0');handle.flush()
        handle.seek(0)
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
    except OSError:
        handle.close();return None
    return handle

def child_main(proxy):
    os.environ['REPORTER_AUTO_RELOAD'] = '1'
    for key in ('WERKZEUG_RUN_MAIN','WERKZEUG_SERVER_FD'): os.environ.pop(key,None)
    if proxy:
        import local_proxy
        if '--office-url' in sys.argv:
            local_proxy.OFFICE_SERVER_URL = sys.argv[sys.argv.index('--office-url') + 1].rstrip('/')
        application, port, host = local_proxy.proxy_app, 5051, '127.0.0.1'
    else:
        from app import app
        application, port, host = app, 5050, '127.0.0.1'
    import threading
    serve = require_waitress()
    port = int(os.environ.get('REPORTER_PROXY_PORT' if proxy else 'REPORTER_API_PORT', port))
    listen = f'127.0.0.1:{port}'
    if not proxy and os.environ.get('REPORTER_LOOPBACK_ONLY') != '1':
        import socket, ipaddress
        lan_ip = os.environ.get('REPORTER_LAN_HOST') or socket.gethostbyname(socket.gethostname())
        try:
            address = ipaddress.ip_address(lan_ip)
            if address.is_private and not address.is_loopback: listen += f' {lan_ip}:{port}'
        except ValueError: pass
    def stop_on_request():
        stop_file=Path(sys.argv[sys.argv.index('--stop-file')+1])
        while not stop_file.exists(): time.sleep(.25)
        if not proxy:
            from services.onec_service import one_c
            one_c.close_all()
        os._exit(0)
    threading.Thread(target=stop_on_request,daemon=True).start()
    serve(application, listen=listen, threads=8, channel_timeout=120)

def stop_child(process):
    if process.poll() is not None: return
    try:
        process.stop_file.write_text('restart',encoding='utf-8');process.wait(timeout=6)
    except (OSError,subprocess.TimeoutExpired):
        process.terminate();process.wait(timeout=6)

def main():
    proxy='--proxy' in sys.argv
    if '--child' in sys.argv: child_main(proxy);return 0
    lock=runtime_lock(int(os.environ.get('REPORTER_PROXY_PORT' if proxy else 'REPORTER_API_PORT', 5051 if proxy else 5050)))
    if lock is None:
        print('Existing runtime supervisor is already running.',flush=True);return 0
    environment=dict(os.environ)
    for key in ('WERKZEUG_RUN_MAIN','WERKZEUG_SERVER_FD'): environment.pop(key,None)
    def start():
        import uuid
        stop_file=ROOT/'logs'/f'runtime-stop-{uuid.uuid4().hex}.txt'
        process=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),*sys.argv[1:],'--child','--stop-file',str(stop_file)],
            cwd=ROOT,env=environment,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        process.stop_file=stop_file
        return process
    process=start();signature=source_signature();changed_at=None
    try:
        while True:
            if process.poll() is not None:
                print(f'HTTP child exited ({process.returncode}); restarting API without stopping COM worker.',flush=True)
                time.sleep(2)
                process=start()
                continue
            current=source_signature()
            if current!=signature:
                signature=current;changed_at=time.monotonic()
            if changed_at is not None and time.monotonic()-changed_at>=1.5:
                error=syntax_error()
                if error: print(f'Source error; keeping existing service: {error}',flush=True)
                else:
                    print('Python source changed: restarting HTTP service; Electron stays open.',flush=True)
                    stop_child(process);process=start()
                changed_at=None
            time.sleep(.5)
    finally:
        stop_child(process);lock.close()

if __name__ == '__main__': raise SystemExit(main())
