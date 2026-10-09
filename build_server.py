# -*- coding: utf-8 -*-
"""
PyInstaller build script for 1C Reporter Server.
Packages server.py into server_dist/1c_server.exe
"""
import os
import sys
import subprocess
import shutil

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(ROOT_DIR, "server_dist")

def build_server():
    print("====================================================")
    print("📦 [1/2] Python 1C Serveri PyInstaller ilə paketlənir...")
    print("====================================================")

    # Clean old build
    build_temp = os.path.join(ROOT_DIR, "build")
    dist_temp = os.path.join(ROOT_DIR, "dist")
    if os.path.exists(build_temp):
        shutil.rmtree(build_temp, ignore_errors=True)
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR, ignore_errors=True)

    # Ensure required runtime folders exist
    os.makedirs(os.path.join(ROOT_DIR, "data"), exist_ok=True)
    os.makedirs(os.path.join(ROOT_DIR, "epf_cache"), exist_ok=True)
    os.makedirs(os.path.join(ROOT_DIR, "exports"), exist_ok=True)

    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name=1c_server",
        "--onedir",
        "--noconfirm",
        "--clean",
        "--distpath=" + OUTPUT_DIR,
        "--add-data=templates;templates",
        "--add-data=static;static",
        "--add-data=data;data",
        "--collect-all=win32com",
        "--hidden-import=win32timezone",
        "--hidden-import=win32api",
        "--hidden-import=win32con",
        "--hidden-import=win32com",
        "--hidden-import=win32com.client",
        "--hidden-import=win32com.client.gencache",
        "--hidden-import=pythoncom",
        "--hidden-import=pywintypes",
        "--hidden-import=sqlite3",
        "--hidden-import=openpyxl",
        "--hidden-import=services.common",
        "--hidden-import=services.onec_service",
        "--hidden-import=services.catalog_handlers",
        "--hidden-import=services.report_handlers",
        "--hidden-import=services.document_handlers",
        "--hidden-import=services.audit_service",
        "--hidden-import=services.documents.base",
        "--hidden-import=services.documents.generic",
        "--hidden-import=services.documents.realization",
        "--hidden-import=services.documents.vozvrat",
        "--hidden-import=routes.base_routes",
        "--hidden-import=routes.report_routes",
        "--hidden-import=routes.catalog_routes",
        "--hidden-import=routes.document_routes",
        "--hidden-import=excel_generator",
        "--hidden-import=virtual_1c",
        "--hidden-import=offline_service",
        "--hidden-import=database",
        "--hidden-import=app",
        os.path.join(ROOT_DIR, "server.py")
    ]

    print("İcra edilir:", " ".join(cmd))
    res = subprocess.run(cmd, cwd=ROOT_DIR)
    if res.returncode != 0:
        print("❌ PyInstaller qurulması zamanı xəta baş verdi!")
        sys.exit(1)

    print("\n✅ Python 1C Serveri uğurla paketləndi!")
    print(f"Ünvan: {OUTPUT_DIR}\\1c_server\\1c_server.exe\n")

if __name__ == "__main__":
    build_server()
