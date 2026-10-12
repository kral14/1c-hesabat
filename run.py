# -*- coding: utf-8 -*-
"""
1C:Enterprise Electron Desktop Runner.

Bu skript sadəcə Electron interfeys pəncərəsini açır.
Əgər ofis serverinə (Cloudflare WARP) qoşuluruqsa, ən son interfeys dəyişikliklərini (HTML, JS, CSS)
lokal diskdən götürən və 1C məlumatlarını ofisdən çəkən Smart Proxy işə salınır.
Beləliklə, ofis kompüterində heç bir fayl yeniləməyə ehtiyac qalmır!
"""
import os
import sys
import time
import threading
import subprocess
import urllib.request
import json
import queue
import argparse
from urllib.parse import urlparse
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

app_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, app_dir)

OFFICE_SERVER_URL = os.environ.get("OFFICE_SERVER_URL", "http://172.16.1.63:5050")
LOCAL_SERVER_URL = "http://127.0.0.1:5050"
PROXY_SERVER_URL = "http://127.0.0.1:5051"

def is_url_active(url, timeout=2.5):
    try:
        req = urllib.request.Request(f"{url}/api/bases")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False

def is_server_running(url=LOCAL_SERVER_URL):
    try:
        with urllib.request.urlopen(url+'/api/runtime/status',timeout=1.0) as response:
            return response.status==200
    except Exception:
        return is_url_active(url, timeout=1.0)

def is_proxy_running():
    try:
        req = urllib.request.Request("http://127.0.0.1:5051/ping")
        with urllib.request.urlopen(req, timeout=0.5) as resp:
            return resp.status == 200
    except Exception:
        return False

def ensure_proxy_server(office_url):
    """Ofis serveri üçün ev kompüterində lokal UI proxy başladır."""
    if is_proxy_running():
        try:
            with urllib.request.urlopen(PROXY_SERVER_URL + '/proxy-status', timeout=1) as response:
                status = json.load(response)
                current_target = status.get('office_url', '').rstrip('/')
            if current_target != office_url.rstrip('/'):
                raise RuntimeError('5051 portundakı proxy başqa ofis ünvanına bağlıdır. Köhnə proxy-ni bağlayıb yenidən başladın.')
        except (OSError, ValueError) as error:
            raise RuntimeError('Mövcud proxy ünvanını yoxlamaq mümkün olmadı. Proxy-ni bağlayıb yenidən başladın.') from error
        if status.get('auto_reload'):
            print(f"✅ Avtomatik yenilənən lokal proxy işləyir -> {office_url}", flush=True)
            return True
        stop_legacy_local_server(port=5051, pattern=r'(run|local_proxy)\.py')

    print(f"🚀 Lokal UI Proxy işə salınır (Lokal UI + Ofis 1C API: {office_url})...", flush=True)
    try:
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        os.makedirs(os.path.join(app_dir,'logs'),exist_ok=True)
        with open(os.path.join(app_dir,'logs','managed_proxy.log'),'ab') as output:
            subprocess.Popen([sys.executable,os.path.join(app_dir,'managed_runtime.py'),
                              '--proxy','--office-url',office_url],cwd=app_dir,creationflags=flags,
                             stdout=output,stderr=subprocess.STDOUT)
        for _ in range(25):
            time.sleep(0.1)
            if is_proxy_running():
                print(f"🟢 Lokal UI Proxy uğurla hazır oldu! (127.0.0.1:5051)", flush=True)
                return True
    except Exception as e:
        print(f"⚠️ Proxy başladılarkən xəta: {e}", flush=True)

    return False

def ensure_server(target_url):
    if is_server_running(LOCAL_SERVER_URL):
        try:
            with urllib.request.urlopen(LOCAL_SERVER_URL + '/api/runtime/status', timeout=1) as response:
                if json.load(response).get('auto_reload'):
                    print('✅ Avtomatik yenilənən arxa plan xidməti artıq işləyir.', flush=True)
                    return True
        except (OSError, ValueError):
            pass
        stop_legacy_local_server()

    print("🔄 Avtomatik yenilənən arxa plan xidməti başladılır. Electron açıq qalacaq.", flush=True)

    server_script = os.path.join(app_dir, "managed_runtime.py")
    creation_flags = 0
    if sys.platform == "win32":
        creation_flags = subprocess.CREATE_NO_WINDOW

    os.makedirs(os.path.join(app_dir, 'logs'), exist_ok=True)
    service_env=dict(os.environ)
    for key in ('WERKZEUG_RUN_MAIN','WERKZEUG_SERVER_FD'): service_env.pop(key,None)
    with open(os.path.join(app_dir, 'logs', 'managed_runtime.log'), 'ab') as output:
        service_process=subprocess.Popen([sys.executable, server_script], cwd=app_dir, creationflags=creation_flags,
                         env=service_env,
                         stdout=output, stderr=subprocess.STDOUT)

    # Server cavab verənə qədər gözləyirik
    for _ in range(60):
        time.sleep(0.3)
        if is_server_running(LOCAL_SERVER_URL):
            print("✅ Arxa plan serveri işə düşdü və cavab verir!", flush=True)
            return True
        if service_process.poll() not in (None,0): break

    print("⚠️ Lokal server cavab vermədi. Ətraflı səbəb: logs/managed_runtime.log", flush=True)
    return False

def stop_legacy_local_server(port=5050, pattern=r'(app|server)\.py'):
    """Only migrate the verified Python listener belonging to this workspace."""
    if sys.platform != 'win32':
        raise RuntimeError('Köhnə arxa plan xidmətini bir dəfə bağlayıb run.py-ni açın.')
    script = r'''
    $listener = Get-NetTCPConnection -LocalPort ([int]$env:REPORTER_PORT) -State Listen | Select-Object -First 1
    if (!$listener) { exit 0 }
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($owner.Name -notmatch '^python(w)?\.exe$' -or
        $owner.CommandLine -notmatch $env:REPORTER_PROCESS_PATTERN -or
        !$owner.CommandLine.Replace('/','\').ToLower().Contains($env:REPORTER_WORKSPACE.Replace('/','\').ToLower())) { exit 4 }
    Stop-Process -Id $listener.OwningProcess -ErrorAction Stop
    '''
    environment = dict(os.environ, REPORTER_WORKSPACE=app_dir, REPORTER_PORT=str(port), REPORTER_PROCESS_PATTERN=pattern)
    result = subprocess.run(['powershell','-NoProfile','-Command',script],env=environment,
        creationflags=subprocess.CREATE_NO_WINDOW, capture_output=True)
    if result.returncode:
        raise RuntimeError('5050 xidmətinin bu layihəyə aid olduğunu təsdiqləmək mümkün olmadı. Köhnə xidməti bir dəfə bağlayın.')

def open_electron(target_url):
    print(f"Masaüstü Electron Pəncərəsi açılır ({target_url})...", flush=True)
    try:
        os.environ["SERVER_URL"] = target_url
        electron_cmd = os.path.join(app_dir, "node_modules", ".bin", "electron.cmd")
        if os.path.exists(electron_cmd):
            cmd = f'"{electron_cmd}" "{app_dir}" "{target_url}"'
        else:
            cmd = f'npx -y electron "{app_dir}" "{target_url}"'
        
        proc = subprocess.Popen(cmd, cwd=app_dir, shell=True)
        proc.wait()
        print("\n[Electron pəncərəsi bağlandı] Sistem aktiv qalmağa davam edir.", flush=True)
    except Exception as e:
        print(f"Electron xətası: {e}", flush=True)

CONFIG_FILE = os.path.join(app_dir, 'run_mode.json')

def load_settings():
    try:
        with open(CONFIG_FILE, encoding='utf-8') as source:
            settings = json.load(source)
        return {'mode': settings.get('mode', 'office'), 'office_url': settings.get('office_url', OFFICE_SERVER_URL)}
    except (OSError, ValueError, TypeError):
        return {'mode': 'office', 'office_url': OFFICE_SERVER_URL}

def prepare_mode(mode, office_url):
    if mode == 'office':
        if not ensure_server(LOCAL_SERVER_URL):
            raise RuntimeError('Lokal server başlamadı. Server loqunu və 5050 portunu yoxlayın.')
        return LOCAL_SERVER_URL
    parsed = urlparse(office_url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Ofis serverinin düzgün http/https ünvanını daxil edin.')
    if not is_url_active(office_url, timeout=3):
        raise RuntimeError('Ofis serveri əlçatan deyil. Cloudflare WARP bağlantısını və server ünvanını yoxlayın.')
    if not ensure_proxy_server(office_url):
        raise RuntimeError('Lokal proxy (5051) başlamadı. Tətbiq açılmadı.')
    return PROXY_SERVER_URL

def show_mode_selector():
    import tkinter as tk
    from tkinter import ttk
    settings = load_settings()
    root = tk.Tk()
    root.title('1C — İş və ev bağlantısı')
    root.geometry('600x340')
    root.minsize(560, 320)
    mode = tk.StringVar(value=settings['mode'] if settings['mode'] in ('office', 'home') else 'office')
    address = tk.StringVar(value=settings['office_url'])
    status = tk.StringVar(value='Haradan qoşulacağınızı seçin.')
    frame = ttk.Frame(root, padding=22)
    frame.pack(fill='both', expand=True)
    ttk.Label(frame, text='1C:Enterprise — Qoşulma rejimi', font=('Segoe UI', 15, 'bold')).pack(anchor='w', pady=(0, 18))
    office_choice = ttk.Radiobutton(frame, text='🏢 İş / Ofis — lokal server (127.0.0.1:5050)', variable=mode, value='office')
    office_choice.pack(anchor='w', pady=6)
    home_choice = ttk.Radiobutton(frame, text='🏠 Ev — WARP vasitəsilə ofis serverinə bağlantı', variable=mode, value='home')
    home_choice.pack(anchor='w', pady=6)
    ttk.Label(frame, text='Ofis serverinin ünvanı (ev rejimi üçün):').pack(anchor='w', pady=(15, 4))
    entry = ttk.Entry(frame, textvariable=address)
    entry.pack(fill='x')
    ttk.Label(frame, textvariable=status, wraplength=550).pack(anchor='w', pady=15)
    result = {'selection': None}
    events = queue.Queue()
    controls = ttk.Frame(frame)
    controls.pack(fill='x')
    def launch():
        selected_mode, url = mode.get(), address.get().strip().rstrip('/')
        start.config(state='disabled')
        for control in (office_choice, home_choice, entry): control.config(state='disabled')
        status.set('Bağlantı hazırlanır...')
        def worker():
            try: events.put(('ready', (selected_mode, url, prepare_mode(selected_mode, url))))
            except Exception as error: events.put(('error', str(error)))
        threading.Thread(target=worker, daemon=True).start()
    start = ttk.Button(controls, text='Başla', command=launch)
    start.pack(side='right')
    ttk.Button(controls, text='Bağla', command=root.destroy).pack(side='right', padx=8)
    def poll():
        try:
            kind, data = events.get_nowait()
            if kind == 'error':
                status.set(data)
                start.config(state='normal')
                for control in (office_choice, home_choice, entry): control.config(state='normal')
            else:
                selected_mode, url, target = data
                with open(CONFIG_FILE, 'w', encoding='utf-8') as destination:
                    json.dump({'mode': selected_mode, 'office_url': url}, destination, ensure_ascii=False, indent=2)
                result['selection'] = (selected_mode, target)
                root.destroy()
                return
        except queue.Empty: pass
        except OSError as error:
            status.set('Seçim yadda saxlanılmadı: ' + str(error))
            start.config(state='normal')
            for control in (office_choice, home_choice, entry): control.config(state='normal')
        root.after(100, poll)
    root.bind('<Return>', lambda event: launch() if str(start['state']) != 'disabled' else None)
    root.bind('<Escape>', lambda event: root.destroy())
    poll()
    root.mainloop()
    return result['selection']

def main(argv=None):
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--office', '--local', '--ofis', '--offline', action='store_true')
    modes.add_argument('--home', '--ev', '--warp', '--remote', action='store_true')
    parser.add_argument('--office-url', default=OFFICE_SERVER_URL)
    parser.add_argument('url', nargs='?')
    args = parser.parse_args(argv)
    if args.url:
        if urlparse(args.url).scheme not in ('http', 'https'): parser.error('URL http/https olmalıdır')
        target = args.url
    elif args.office or args.home:
        target = prepare_mode('office' if args.office else 'home', args.office_url)
    else:
        selection = show_mode_selector()
        if selection is None: return 0
        _, target = selection
    open_electron(target)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
