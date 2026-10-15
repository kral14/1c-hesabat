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
LOCAL_SERVER_URL = f"http://127.0.0.1:{int(os.environ.get('REPORTER_API_PORT', 5050))}"
PROXY_SERVER_URL = f"http://127.0.0.1:{int(os.environ.get('REPORTER_PROXY_PORT', 5051))}"

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
        req = urllib.request.Request(PROXY_SERVER_URL + '/ping')
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
    from managed_runtime import require_waitress
    require_waitress()
    log_path = os.path.join(app_dir, 'logs', 'managed_proxy.log')
    try:
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
        os.makedirs(os.path.join(app_dir,'logs'),exist_ok=True)
        log_offset = os.path.getsize(log_path) if os.path.exists(log_path) else 0
        with open(log_path,'ab') as output:
            process = subprocess.Popen([sys.executable,os.path.join(app_dir,'managed_runtime.py'),
                              '--proxy','--office-url',office_url],cwd=app_dir,creationflags=flags,
                             stdout=output,stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            time.sleep(0.1)
            if is_proxy_running():
                print(f"🟢 Lokal UI Proxy uğurla hazır oldu! (127.0.0.1:5051)", flush=True)
                return True
            if process.poll() not in (None, 0):
                break
    except Exception as e:
        raise RuntimeError(f'Proxy başlamadı: {e}\nLoq: {log_path}') from e
    with open(log_path, 'rb') as output:
        output.seek(log_offset)
        details = output.read()[-2000:].decode('utf-8', errors='replace').strip()
    raise RuntimeError(f'Lokal proxy (5051) hazır olmadı. Loq: {log_path}\n{details or "Başlatma cavabı gözlənilir; yenidən Başla basın."}')

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

def ensure_1c_connection(target_url, credentials=None):
    """Verify the selected backend's 1C connection before opening Electron."""
    print('🔗 1C bağlantısı hazırlanır və yoxlanılır...', flush=True)
    req = urllib.request.Request(target_url.rstrip('/') + '/api/ping_connection',
        data=json.dumps(credentials or {}).encode('utf-8'), headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            status = json.load(response)
    except Exception as error:
        raise RuntimeError('1C bağlantısı yoxlanmadı. Server/şəbəkə bağlantısını yoxlayın: ' + str(error)) from error
    if not status.get('success') or not status.get('connected'):
        raise RuntimeError('1C bağlantısı qurulmadı: ' + str(status.get('error') or 'Server 1C ilə bağlı deyil.'))
    print('✅ 1C bağlantısı hazırdır: ' + str(status.get('server', '')) + ' / ' + str(status.get('ref', '')), flush=True)
    return status

def prepare_mode(mode, office_url, check_connection=True):
    if mode == 'office':
        if not ensure_server(LOCAL_SERVER_URL):
            raise RuntimeError('Lokal server başlamadı. Server loqunu və 5050 portunu yoxlayın.')
        if check_connection: ensure_1c_connection(LOCAL_SERVER_URL)
        return LOCAL_SERVER_URL
    parsed = urlparse(office_url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Ofis serverinin düzgün http/https ünvanını daxil edin.')
    if not is_url_active(office_url, timeout=3):
        raise RuntimeError('Ofis serveri əlçatan deyil. Cloudflare WARP bağlantısını və server ünvanını yoxlayın.')
    if not ensure_proxy_server(office_url):
        raise RuntimeError('Lokal proxy (5051) başlamadı. Tətbiq açılmadı.')
    if check_connection: ensure_1c_connection(PROXY_SERVER_URL)
    return PROXY_SERVER_URL

def get_startup_bases(target_url):
    """Read saved bases without opening or changing any 1C session."""
    with urllib.request.urlopen(target_url.rstrip('/') + '/api/bases', timeout=15) as response:
        data = json.load(response)
    if not data.get('success', True): raise RuntimeError(data.get('error') or 'Bazalar yüklənmədi.')
    active = data.get('active_base') or {}
    bases, seen = [], set()
    for base in [*(data.get('bases') or []), active]:
        server, ref = str(base.get('server') or '').strip(), str(base.get('ref') or '').strip()
        identity = (server.casefold(), ref.casefold())
        if not server or not ref or identity in seen: continue
        seen.add(identity)
        # Keep credentials out of launcher widget state and labels.
        bases.append({'server':server, 'ref':ref, 'title':str(base.get('title') or f'{server} / {ref}')})
    active_index = next((index for index, base in enumerate(bases)
                         if base['server'].casefold() == str(active.get('server','')).casefold()
                         and base['ref'].casefold() == str(active.get('ref','')).casefold()), 0)
    return bases, active_index


def select_startup_base(target_url, selected):
    """Persist the explicitly confirmed selection; choosing a row never calls it."""
    if not selected.get('server') or not selected.get('ref'): raise ValueError('Bazanı seçin.')
    with urllib.request.urlopen(target_url.rstrip('/') + '/api/bases', timeout=15) as response:
        active = json.load(response).get('active_base') or {}
    if all(str(active.get(key,'')).casefold() == str(selected[key]).casefold() for key in ('server','ref')):
        return  # Preserve the retained session's saved credentials.
    body = {key:selected[key] for key in ('server','ref','title') if key in selected}
    request = urllib.request.Request(target_url.rstrip('/') + '/api/bases/set_active',
        data=json.dumps(body).encode('utf-8'), headers={'Content-Type':'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=15) as response:
        result = json.load(response)
    if not result.get('success'): raise RuntimeError(result.get('error') or 'Baza seçimi saxlanmadı.')


def manage_startup_sessions(target_url, parent=None, selected_base=None):
    from services.cluster_gui import open_cluster_gui
    if selected_base is None:
        with urllib.request.urlopen(target_url.rstrip('/') + '/api/bases', timeout=15) as response:
            active = json.load(response).get('active_base') or {}
    else:
        active = selected_base
    server, ref = active.get('server'), active.get('ref')
    if not server or not ref: raise RuntimeError('Sessiyalar üçün aktiv baza seçilməlidir.')
    action = open_cluster_gui(server_agent=server + ':1540', target_base=ref,
                              backend_url=target_url, parent=parent)
    return action

def show_mode_selector():
    import tkinter as tk
    from tkinter import ttk
    settings = load_settings()
    root = tk.Tk()
    root.title('1C — İş və ev bağlantısı')
    root.geometry('680x440')
    root.minsize(600, 420)
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
    ttk.Label(frame, text='1C informasiya bazası:').pack(anchor='w', pady=(15, 4))
    base_row = ttk.Frame(frame)
    base_row.pack(fill='x')
    base_choice = ttk.Combobox(base_row, state='readonly')
    base_choice.pack(side='left',fill='x',expand=True)
    refresh_bases = ttk.Button(base_row, text='Yenilə')
    refresh_bases.pack(side='right',padx=(8,0))
    ttk.Label(frame, textvariable=status, wraplength=550).pack(anchor='w', pady=15)
    result = {'selection': None}
    loaded = {'bases':[], 'key':None, 'target':None, 'busy':False}
    events = queue.Queue()
    controls = ttk.Frame(frame)
    controls.pack(fill='x')
    def set_busy(busy):
        loaded['busy'] = busy
        for control in (office_choice,home_choice,entry,refresh_bases,start):
            control.config(state='disabled' if busy else 'normal')
        base_choice.config(state='disabled' if busy else 'readonly')
    def load_bases():
        if loaded['busy']: return
        selected_mode, url = mode.get(), address.get().strip().rstrip('/')
        set_busy(True)
        status.set('Bazalar yüklənir...')
        def worker():
            try:
                target = prepare_mode(selected_mode,url,check_connection=False)
                bases, active_index = get_startup_bases(target)
                if not bases: raise RuntimeError('Saxlanmış baza tapılmadı. Əvvəlcə proqramda baza əlavə edin.')
                events.put(('bases',(selected_mode,url,target,bases,active_index)))
            except Exception as error: events.put(('error',str(error)))
        threading.Thread(target=worker,daemon=True).start()
    def launch():
        if loaded['busy']: return
        selected_mode, url = mode.get(), address.get().strip().rstrip('/')
        if loaded['key'] != (selected_mode,url):
            load_bases()
            return
        index = base_choice.current()
        if not 0 <= index < len(loaded['bases']):
            status.set('Siyahıdan informasiya bazasını seçin.')
            return
        set_busy(True)
        events.put(('ready',(selected_mode,url,loaded['target'],dict(loaded['bases'][index]))))
    start = ttk.Button(controls, text='Başla', command=launch)
    start.pack(side='right')
    ttk.Button(controls, text='Bağla', command=root.destroy).pack(side='right', padx=8)
    refresh_bases.config(command=load_bases)
    office_choice.config(command=load_bases)
    home_choice.config(command=load_bases)
    entry.bind('<FocusOut>',lambda event: load_bases() if not loaded['busy'] and loaded['key'] != (mode.get(),address.get().strip().rstrip('/')) else None)
    def poll():
        try:
            kind, data = events.get_nowait()
            if kind == 'error':
                status.set(data)
                set_busy(False)
            elif kind == 'bases':
                selected_mode,url,target,bases,active_index = data
                loaded.update(bases=bases,key=(selected_mode,url),target=target)
                base_choice.config(values=[f"{base['title']} ({base['server']} / {base['ref']})" for base in bases])
                base_choice.current(active_index)
                status.set('Bazanı seçin və “Başla” düyməsinə basın.')
                set_busy(False)
            elif kind == 'ready':
                selected_mode, url, target, selected = data
                action = manage_startup_sessions(target, parent=root, selected_base=selected)
                if action is None:
                    status.set('Sessiya seçimi ləğv edildi.')
                    set_busy(False)
                else:
                    status.set('Mövcud bağlantı istifadə olunur...' if action == 'reuse' else '1C bağlantısı hazırlanır...')
                    def connect_worker():
                        try:
                            select_startup_base(target,selected)
                            if action != 'reuse': ensure_1c_connection(target)
                            events.put(('connected', (selected_mode, url, target)))
                        except Exception as error: events.put(('error', str(error)))
                    threading.Thread(target=connect_worker, daemon=True).start()
            else:
                selected_mode, url, target = data
                with open(CONFIG_FILE, 'w', encoding='utf-8') as destination:
                    json.dump({'mode': selected_mode, 'office_url': url}, destination, ensure_ascii=False, indent=2)
                result['selection'] = (selected_mode, target)
                root.destroy()
                return
        except queue.Empty: pass
        except Exception as error:
            status.set(str(error))
            set_busy(False)
        root.after(100, poll)
    root.bind('<Return>', lambda event: launch() if str(start['state']) != 'disabled' else None)
    root.bind('<Escape>', lambda event: root.destroy())
    poll()
    root.after(100,load_bases)
    root.mainloop()
    return result['selection']

def main(argv=None):
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--office', '--local', '--ofis', '--offline', action='store_true')
    modes.add_argument('--home', '--ev', '--warp', '--remote', action='store_true')
    parser.add_argument('--office-url', default=OFFICE_SERVER_URL)
    parser.add_argument('--no-session-gui', action='store_true')
    parser.add_argument('url', nargs='?')
    args = parser.parse_args(argv)
    if args.url:
        if urlparse(args.url).scheme not in ('http', 'https'): parser.error('URL http/https olmalıdır')
        target = args.url
    elif args.office or args.home:
        target = prepare_mode('office' if args.office else 'home', args.office_url, check_connection=False)
    else:
        selection = show_mode_selector()
        if selection is None: return 0
        _, target = selection
    if args.url or args.office or args.home:
        action = 'connect' if args.no_session_gui else manage_startup_sessions(target)
        if action is None: return 0
        if action != 'reuse': ensure_1c_connection(target)
    open_electron(target)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
