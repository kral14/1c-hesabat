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

def is_server_running():
    try:
        req = urllib.request.Request("http://127.0.0.1:5050/api/bases")
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            return resp.status == 200
    except Exception:
        return False

def ensure_server():
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

def open_electron():
    print("Masaüstü Electron Pəncərəsi açılır...", flush=True)
    try:
        electron_cmd = os.path.join(app_dir, "node_modules", ".bin", "electron.cmd")
        if os.path.exists(electron_cmd):
            cmd = f'"{electron_cmd}" "{app_dir}"'
        else:
            cmd = f'npx -y electron "{app_dir}"'
        
        proc = subprocess.Popen(cmd, cwd=app_dir, shell=True)
        proc.wait()
        print("\n[Electron pəncərəsi bağlandı] Arxa plan 1C serveri (server.py) aktiv qalmağa davam edir.", flush=True)
    except Exception as e:
        print(f"Electron xətası: {e}", flush=True)

if __name__ == "__main__":
    ensure_server()
    open_electron()
