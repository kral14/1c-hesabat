# -*- coding: utf-8 -*-
"""
1C Ofis Bağlantısını Yoxlama Skripti (Cloudflare WARP / 172.16.1.63:5050)
"""
import sys
import socket
import urllib.request
import json
import time

TARGET_IP = "172.16.1.63"
TARGET_PORT = 5050
TARGET_URL = f"http://{TARGET_IP}:{TARGET_PORT}"

def test_connection():
    print("=" * 65)
    print(f"🔍 1C OFİS BAĞLANTISI YOXLANIŞI ({TARGET_URL})")
    print("=" * 65)

    # 1. Socket test (Port açıqdırmı?)
    print(f"1. Şəbəkə portu yoxlanılır ({TARGET_IP}:{TARGET_PORT})...", end=" ", flush=True)
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2.5)
    t0 = time.time()
    try:
        s.connect((TARGET_IP, TARGET_PORT))
        s.close()
        ms = int((time.time() - t0) * 1000)
        print(f"✅ UĞURLU! ({ms} ms)")
    except Exception as e:
        print(f"❌ BAĞLANTI ALINMADI: {e}")
        print("   👉 Səbəb: Ofis kompüterində server.py işləmir, host=0.0.0.0 edilməyib və ya Firewall bloklayır.")
        return False

    # 2. HTTP API test
    print(f"2. 1C Flask API yoxlanılır ({TARGET_URL}/api/bases)...", end=" ", flush=True)
    try:
        req = urllib.request.Request(f"{TARGET_URL}/api/bases")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print("✅ UĞURLU! (HTTP 200 OK)")
            active = data.get("active_base", {})
            print(f"   📌 Aktiv Baza: {active.get('title')} [{active.get('server')}/{active.get('ref')}]")
    except Exception as e:
        print(f"❌ XƏTA: {e}")
        return False

    # 3. 1C Ping test
    print(f"3. 1C COM bağlantısı yoxlanılır ({TARGET_URL}/api/ping_connection)...", end=" ", flush=True)
    try:
        req = urllib.request.Request(
            f"{TARGET_URL}/api/ping_connection",
            data=b"{}",
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            ping_data = json.loads(resp.read().decode('utf-8'))
            if ping_data.get("connected"):
                print("✅ 1C COM AKTİVDİR VƏ İŞLƏYİR!")
            else:
                print(f"⚠️ 1C Bağlantı cavabı: {ping_data}")
    except Exception as e:
        print(f"⚠️ Ping xətası: {e}")

    print("=" * 65)
    print("🎉 ƏLA! Evdən ofis 1C sisteminə birbaşa canlı qoşulma hazırdır!")
    print(f"👉 Brauzerdə açmaq üçün: {TARGET_URL}")
    print("👉 Masaüstü tətbiqini açmaq üçün: python run.py")
    print("=" * 65)
    return True

if __name__ == "__main__":
    test_connection()
