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
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

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

from services.cluster_service import (
    get_cluster_sessions,
    auto_cleanup_hanging_sessions,
    format_sessions_table
)

def warmup_1c():
    """Arxa planda 1C bağlantısını qabaqcadan qurur və hazır saxlayır."""
    time.sleep(0.5)
    active = database.get_active_base() or {
        "server": "Test1C",
        "ref": "Aztrade_test3",
        "user": "Nesib",
        "password": "15963"
    }
    srv = active.get("server") or "Test1C"
    ref = active.get("ref") or "Aztrade_test3"
    usr = active.get("user") or "Nesib"

    # 1. 1C Klasterini yoxla və asılı qalmış COM sessiyaları varsa təmizlə
    try:
        cleaned = auto_cleanup_hanging_sessions(server_agent=f"{srv}:1540", target_base=ref)
        if cleaned > 0:
            print(f"🧹 [1C KLASTER] {cleaned} ədəd asılı qalmış (qopmuş) COM sessiyası avtomatik bağlandı və lisenziya azad edildi.", flush=True)
        
        # Aktiv sessiyaları ekranda göstər
        sessions = get_cluster_sessions(server_agent=f"{srv}:1540", target_base=ref)
        print("\n📋 [1C KLASTER] BAZADA AKTİV SESSIYALAR:")
        print(format_sessions_table(sessions), flush=True)
        print("💡 (Sessiyaları sonlandırmaq üçün istədiyiniz vaxt 'sessiyalar.bat' və ya 'python manage_sessions.py' işlədə bilərsiniz)\n", flush=True)
    except Exception as e_cl:
        print(f"ℹ️ [1C KLASTER] Sessiya monitorinqi: {e_cl}", flush=True)

    # 2. 1C COM bağlantısını qur
    try:
        print(f"⏳ [1C SERVERİ] 1C COM bağlantısı qabaqcadan qurulur: [{srv} / {ref} / {usr}]...", flush=True)
        t0 = time.time()
        res = one_c.execute("ping", active)
        print(f"✅ [1C SERVERİ] 1C COM bağlantısı UĞURLA QURULDU ({time.time() - t0:.2f} san)! Yaddaşda aktiv saxlanılır.", flush=True)
    except Exception as e:
        print(f"⚠️ [1C SERVERİ] İlkin bağlantı cəhdi xətası: {e}", flush=True)
        # Əgər lisenziya xətası olarsa cari sessiyaları təkrar göstər
        try:
            sessions = get_cluster_sessions(server_agent=f"{srv}:1540", target_base=ref)
            print("⚠️ [1C LİSENZİYA MƏŞĞULDUR] Hazırda lisenziyanı tutan sessiyalar:")
            print(format_sessions_table(sessions), flush=True)
        except Exception:
            pass

if __name__ == "__main__":
    free_port_5050()

    # 1. Flask serverini arxa planda dərhal başladırıq (Port 5050 dinləməyə başlayır)
    def run_flask():
        app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)

    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    print("=" * 70)
    print("  🟢 1C:ENTERPRISE ARXA PLAN SERVERİ (FLASK + 1C COM BAĞLANTISI)")
    print("  Ünvan: http://0.0.0.0:5050 (Lokal: http://127.0.0.1:5050 / Şəbəkə: http://172.16.1.63:5050)")
    print("  Vəziyyət: SERVER ARXA PLANDA SABİT QALIR")
    print("=" * 70)
    print("  📌 Bu pəncərəni açıq saxlayın (və ya arxa plana atın).")
    print("  📌 İnterfeys və dəyişiklikləri yoxlamaq üçün:")
    print("     👉 Electron-u açmaq üçün: python run.py")
    print("     👉 Dəyişiklikləri dərhal görmək üçün: F5 və ya Ctrl+R")
    print("     👉 Electron bağlansa da 1C bağlantısı QIRILMIR və lisenziya bitmir!")
    print("=" * 70, flush=True)

    # 2. 1C Klaster Sessiya İdarəetmə GUI pəncərəsini açırıq
    active_b = database.get_active_base() or {}
    srv_host = active_b.get("server") or "Test1C"
    ref_name = active_b.get("ref") or "Aztrade_test3"

    if "--no-gui" not in sys.argv:
        try:
            from services.cluster_gui import open_cluster_gui
            print("🖥️ [1C KLASTER] Sessiya və lisenziya idarəetmə pəncərəsi ekrana gətirilir...", flush=True)
            open_cluster_gui(server_agent=f"{srv_host}:1540", target_base=ref_name)
        except Exception as e_gui:
            print(f"ℹ️ [GUI Bildiriş] GUI pəncərəsi açıla bilmədi ({e_gui}), konsol rejimində davam edilir.", flush=True)

    # 3. İstifadəçi 'Keç' edəndən və ya pəncərəni bağlayandan sonra 1C COM bağlantısını qururuq
    threading.Thread(target=warmup_1c, daemon=True).start()

    # Serveri daimi işlək saxlayırıq
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nServer dayandırıldı.")

