# -*- coding: utf-8 -*-
"""
1C:Enterprise Arxa Plan Serveri (Flask + 1C COM Persistent Session).

Bu skript 1C COM bağlantısını və Flask serverini arxa planda fasiləsiz işlədir.
Electron pəncərəsi bağlansa və ya yenidən açılsada, yaxud brauzerdə F5 sıxılsa belə,
1C bağlantısı qırılmır və sabit yaddaşda qalır.
"""
import os
import sys
import time
import subprocess
import threading

try:
    import win32timezone  # noqa: F401 - Required by 1C COM datetime parsing
except ImportError:
    pass

if getattr(sys, 'frozen', False):
    app_dir = os.path.dirname(sys.executable)
else:
    app_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, app_dir)

import database
from app import app
from services.onec_service import one_c

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
                    print(f"🔄 Port 5050-dəki köhnə proses (PID: {pid}) təmizlənir...", flush=True)
                    subprocess.run(f'taskkill /F /PID {pid}', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    killed.add(pid)
    except Exception:
        pass

def warmup_1c():
    """Arxa planda 1C bağlantısını qabaqcadan qurur və hazır saxlayır."""
    time.sleep(0.5)
    try:
        active = database.get_active_base() or {
            "server": "Test1C",
            "ref": "Aztrade_test3",
            "user": "Nesib",
            "password": "15963"
        }
        srv = active.get("server") or "Test1C"
        ref = active.get("ref") or "Aztrade_test3"
        usr = active.get("user") or "Nesib"
        print(f"⏳ [1C SERVERİ] 1C COM bağlantısı qabaqcadan qurulur: [{srv} / {ref} / {usr}]...", flush=True)
        t0 = time.time()
        res = one_c.execute("ping", active)
        print(f"✅ [1C SERVERİ] 1C COM bağlantısı UĞURLA QURULDU ({time.time() - t0:.2f} san)! Yaddaşda aktiv saxlanılır.", flush=True)
    except Exception as e:
        print(f"⚠️ [1C SERVERİ] İlkin bağlantı cəhdi xətası: {e}", flush=True)

if __name__ == "__main__":
    free_port_5050()
    
    # 1C bağlantısını arxa planda qabaqcadan aktivləşdiririk
    threading.Thread(target=warmup_1c, daemon=True).start()

    print("=" * 70)
    print("  🟢 1C:ENTERPRISE ARXA PLAN SERVERİ (FLASK + 1C COM BAĞLANTISI)")
    print("  Ünvan: http://127.0.0.1:5050")
    print("  Vəziyyət: SERVER ARXA PLANDA SABİT QALIR")
    print("=" * 70)
    print("  📌 Bu pəncərəni açıq saxlayın (və ya arxa plana atın).")
    print("  📌 İnterfeys və dəyişiklikləri yoxlamaq üçün:")
    print("     👉 Electron-u açmaq üçün: python run.py")
    print("     👉 Dəyişiklikləri dərhal görmək üçün: F5 və ya Ctrl+R")
    print("     👉 Electron bağlansa da 1C bağlantısı QIRILMIR və lisenziya bitmir!")
    print("=" * 70, flush=True)

    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
