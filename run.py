# -*- coding: utf-8 -*-
import subprocess
import threading
import time
import os
import sys

# Ensure scratch directory is in path
app_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, app_dir)

from app import app

def open_electron():
    time.sleep(1.5)
    try:
        # Terminate any lingering zombie electron processes so window always opens
        subprocess.run('taskkill /F /IM electron.exe', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
    print("Masaüstü Electron Pəncərəsi açılır...", flush=True)
    try:
        electron_cmd = os.path.join(app_dir, "node_modules", ".bin", "electron.cmd")
        if os.path.exists(electron_cmd):
            cmd = f'"{electron_cmd}" "{app_dir}"'
        else:
            cmd = f'npx -y electron "{app_dir}"'
        subprocess.Popen(cmd, cwd=app_dir, shell=True)
    except Exception as e:
def free_port_5050():
    try:
        res = subprocess.run('netstat -ano | findstr :5050', shell=True, capture_output=True, text=True)
        lines = res.stdout.strip().splitlines()
        my_pid = os.getpid()
        killed = set()
        for line in lines:
            if "LISTENING" in line:
                parts = line.strip().split()
                pid = int(parts[-1])
                if pid != my_pid and pid > 0 and pid not in killed:
                    print(f"🔄 Port 5050-dəki köhnə server prosesi (PID: {pid}) təmizlənir...", flush=True)
                    subprocess.run(f'taskkill /F /PID {pid}', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    killed.add(pid)
    except Exception:
        pass

if __name__ == "__main__":
    free_port_5050()
    threading.Thread(target=open_electron, daemon=True).start()
    print("=" * 60)
    print("  1C:ENTERPRISE ELECTRON MASAÜSTÜ TƏTBİQİ İŞƏ DÜŞDÜ")
    print("  Ünvan: http://127.0.0.1:5050")
    print("=" * 60)
    app.run(host="127.0.0.1", port=5050, debug=False)
