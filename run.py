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
        subprocess.Popen("npx electron .", cwd=app_dir, shell=True)
    except Exception as e:
        print(f"Electron xətası: {e}", flush=True)

if __name__ == "__main__":
    threading.Thread(target=open_electron, daemon=True).start()
    print("=" * 60)
    print("  1C:ENTERPRISE ELECTRON MASAÜSTÜ TƏTBİQİ İŞƏ DÜŞDÜ")
    print("  Ünvan: http://127.0.0.1:5050")
    print("=" * 60)
    app.run(host="127.0.0.1", port=5050, debug=False)
