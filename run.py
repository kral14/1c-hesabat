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

app_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, app_dir)

OFFICE_SERVER_URL = os.environ.get("OFFICE_SERVER_URL", "http://172.16.1.63:5050")
LOCAL_SERVER_URL = "http://127.0.0.1:5050"
PROXY_SERVER_URL = "http://127.0.0.1:5051"

def is_url_active(url, timeout=1.2):
    try:
        req = urllib.request.Request(f"{url}/api/bases")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False

def is_server_running(url=LOCAL_SERVER_URL):
    return is_url_active(url, timeout=0.8)

def ensure_proxy_server(office_url):
    """Ofis serveri üçün ev kompüterində lokal UI proxy başladır."""
    if is_server_running(PROXY_SERVER_URL):
        print(f"✅ Lokal UI Proxy (127.0.0.1:5051) artıq işləyir -> {office_url}", flush=True)
        return True

    print(f"🚀 Lokal UI Proxy işə salınır (Lokal UI + Ofis 1C API: {office_url})...", flush=True)
    try:
        import local_proxy
        t = threading.Thread(target=local_proxy.start_proxy, args=(5051,), daemon=True)
        t.start()
        for _ in range(25):
            time.sleep(0.1)
            if is_server_running(PROXY_SERVER_URL):
                print(f"🟢 Lokal UI Proxy uğurla hazır oldu! (127.0.0.1:5051)", flush=True)
                return True
    except Exception as e:
        print(f"⚠️ Proxy başladılarkən xəta: {e}", flush=True)

    return False

def ensure_server(target_url):
    if is_server_running(LOCAL_SERVER_URL):
        print("✅ Arxa plan 1C serveri (server.py) artıq işləyir. Mövcud 1C bağlantısı istifadə olunur.", flush=True)
        return True

    print("⚠️ Arxa plan serveri (server.py) tapılmadı!", flush=True)
    print("🔄 Server arxa planda işə salınır (python server.py)...", flush=True)

    server_script = os.path.join(app_dir, "server.py")
    creation_flags = 0
    if sys.platform == "win32":
        creation_flags = subprocess.CREATE_NEW_CONSOLE

    subprocess.Popen([sys.executable, server_script], cwd=app_dir, creationflags=creation_flags)

    # Server cavab verənə qədər gözləyirik
    for _ in range(30):
        time.sleep(0.3)
        if is_server_running(LOCAL_SERVER_URL):
            print("✅ Arxa plan serveri işə düşdü və cavab verir!", flush=True)
            return True

    print("⚠️ Serverin tam hazır olması üçün gözlənilir, Electron açılır...", flush=True)
    return False

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

if __name__ == "__main__":
    force_office = any(arg in sys.argv for arg in ["--office", "--warp", "--remote"])
    custom_url = next((arg for arg in sys.argv[1:] if arg.startswith("http://") or arg.startswith("https://")), None)

    if custom_url:
        target_server = custom_url
        print(f"🔗 Xüsusi server təyin edildi: {target_server}", flush=True)
        open_electron(target_server)
    elif force_office or is_url_active(OFFICE_SERVER_URL, timeout=1.5):
        print(f"🟢 [Cloudflare WARP] Ofis kompüteri ({OFFICE_SERVER_URL}) aşkar edildi!", flush=True)
        ensure_proxy_server(OFFICE_SERVER_URL)
        open_electron(PROXY_SERVER_URL)
    else:
        ensure_server(LOCAL_SERVER_URL)
        open_electron(LOCAL_SERVER_URL)
