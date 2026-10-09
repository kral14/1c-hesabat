# -*- coding: utf-8 -*-
"""
1C:Enterprise Electron Desktop Runner.

Bu skript sadəcə Electron interfeys pəncərəsini açır.
Əgər server.py artıq işləyirsə, serverə toxunmur və birbaşa Electron-u açır.
Electron bağlandıqda da server.py arxa planda işləməyə və 1C bağlantısını saxlamağa davam edir.
"""
import os
import sys
import time
import subprocess
import urllib.request

app_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, app_dir)

OFFICE_SERVER_URL = os.environ.get("OFFICE_SERVER_URL", "http://172.16.1.63:5050")
LOCAL_SERVER_URL = "http://127.0.0.1:5050"

def is_url_active(url, timeout=1.2):
    try:
        req = urllib.request.Request(f"{url}/api/bases")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False

def is_server_running():
    return is_url_active(LOCAL_SERVER_URL, timeout=0.8)

def ensure_server(target_url):
    if target_url != LOCAL_SERVER_URL:
        # Ofis serverinə qoşuluruqsa, lokal serveri işə salmağa ehtiyac yoxdur
        print(f"🌐 [Cloudflare WARP] Ofis serveri istifadə olunur: {target_url}", flush=True)
        return True

    if is_server_running():
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
        if is_server_running():
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
    # Parametrlərdən və ya Cloudflare WARP-dan hədəf serveri müəyyənləşdiririk
    target_server = LOCAL_SERVER_URL

    force_office = any(arg in sys.argv for arg in ["--office", "--warp", "--remote"])
    custom_url = next((arg for arg in sys.argv[1:] if arg.startswith("http://") or arg.startswith("https://")), None)

    if custom_url:
        target_server = custom_url
        print(f"🔗 Xüsusi server təyin edildi: {target_server}", flush=True)
    elif force_office or is_url_active(OFFICE_SERVER_URL, timeout=1.5):
        target_server = OFFICE_SERVER_URL
        print(f"🟢 [Cloudflare WARP] Ofis kompüteri (172.16.1.63:5050) aşkar edildi və seçildi!", flush=True)
    else:
        target_server = LOCAL_SERVER_URL

    ensure_server(target_server)
    open_electron(target_server)
