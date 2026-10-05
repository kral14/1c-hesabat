# -*- coding: utf-8 -*-
import os
import re
import time
import threading
from flask import Blueprint, render_template, request, jsonify
import database
import offline_service
from services.common import print_server_error
from services.onec_service import one_c

base_bp = Blueprint("base_bp", __name__)

def parse_ibases():
    v8i_path = os.path.expandvars(r"%APPDATA%\1C\1CEStart\ibases.v8i")
    raw_v8i = []
    if os.path.exists(v8i_path):
        cur_name = None; cur_server = None; cur_ref = None
        with open(v8i_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if line.startswith("[") and line.endswith("]"):
                    if cur_name and cur_server and cur_ref:
                        raw_v8i.append({"title": cur_name, "server": cur_server, "ref": cur_ref})
                    cur_name = line[1:-1]; cur_server = None; cur_ref = None
                elif "Connect=Srvr=" in line:
                    m = re.search(r'Srvr="([^"]+)";Ref="([^"]+)";', line, re.IGNORECASE)
                    if m:
                        cur_server = m.group(1); cur_ref = m.group(2)
        if cur_name and cur_server and cur_ref:
            raw_v8i.append({"title": cur_name, "server": cur_server, "ref": cur_ref})

    hidden_set = database.get_hidden_bases()
    custom_list = database.get_custom_bases()

    bases = []
    seen = set()

    # 1. User-added custom bases first
    for cb in custom_list:
        k = (str(cb["server"]).strip().lower(), str(cb["ref"]).strip().lower())
        if k not in hidden_set and k not in seen:
            bases.append({
                "title": cb["title"],
                "server": cb["server"],
                "ref": cb["ref"],
                "is_custom": True
            })
            seen.add(k)

    # 2. System / v8i bases (if not hidden and not duplicate)
    for b in raw_v8i:
        k = (str(b["server"]).strip().lower(), str(b["ref"]).strip().lower())
        if k not in hidden_set and k not in seen:
            bases.append({
                "title": b["title"],
                "server": b["server"],
                "ref": b["ref"],
                "is_custom": False
            })
            seen.add(k)

    # 3. Default fallback if Aztrade_test3 is not hidden and not already present
    default_key = ("test1c", "aztrade_test3")
    if default_key not in hidden_set and default_key not in seen:
        bases.insert(0, {
            "title": "Aztrade Test Bazası #1",
            "server": "Test1C",
            "ref": "Aztrade_test3",
            "is_custom": False
        })

    # 4. Offline Database (Local SQLite)
    if offline_service.is_offline_db_ready():
        bases.insert(0, {
            "title": "🟢 Offline 1C Baza (Lokal SQLite)",
            "server": "Localhost",
            "ref": "Offline_1C",
            "is_custom": False,
            "is_offline": True
        })

    return bases


@base_bp.route("/")
def index():
    return render_template("index.html")

@base_bp.route("/api/bases", methods=["GET"])
def get_bases():
    try:
        active_b = database.get_active_base()
        all_bases = parse_ibases()
        if not active_b and all_bases:
            active_b = all_bases[0]
        return jsonify({
            "success": True, 
            "bases": all_bases,
            "active_base": active_b
        })
    except Exception as e:
        print_server_error("/api/bases", e)
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/bases/set_active", methods=["POST"])
def set_active_base_endpoint():
    try:
        data = request.json or {}
        server = (data.get("server") or "").strip()
        ref = (data.get("ref") or "").strip()
        title = (data.get("title") or "").strip()
        user = (data.get("user") or "").strip()
        pwd = data.get("password")
        if server and ref:
            database.set_active_base(server, ref, title, user, pwd)
            print(f"📌 [AKTİV BAZA TƏYİN EDİLDİ] {title} ({server} / {ref})", flush=True)
        return jsonify({"success": True, "active_base": database.get_active_base()})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/bases/add", methods=["POST"])
def add_base_endpoint():
    try:
        data = request.json or {}
        server = (data.get("server") or "").strip()
        ref = (data.get("ref") or "").strip()
        title = (data.get("title") or "").strip()
        if not server or not ref:
            return jsonify({"success": False, "error": "Server (Srvr) və Baza (Ref) adları mütləq daxil edilməlidir!"})
        if not title:
            title = f"{server} / {ref}"
        database.add_custom_base(title, server, ref)
        database.set_active_base(server, ref, title)
        print(f"💾 [1C BAZA ƏLAVƏ EDİLDİ] Başlıq: {title} | Server: {server} | Ref: {ref}", flush=True)
        return jsonify({"success": True, "bases": parse_ibases(), "active_base": database.get_active_base()})
    except Exception as e:
        print_server_error("/api/bases/add", e, data)
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/bases/delete", methods=["POST"])
def delete_base_endpoint():
    try:
        data = request.json or {}
        server = (data.get("server") or "").strip()
        ref = (data.get("ref") or "").strip()
        if not server or not ref:
            return jsonify({"success": False, "error": "Silinəcək server və baza adı tələb olunur."})
        database.delete_base(server, ref)
        cur_active = database.get_active_base()
        if cur_active and cur_active["server"].lower() == server.lower() and cur_active["ref"].lower() == ref.lower():
            all_b = parse_ibases()
            if all_b:
                database.set_active_base(all_b[0]["server"], all_b[0]["ref"], all_b[0]["title"])
        print(f"🗑️ [1C BAZA SİLİNDİ] Server: {server} | Ref: {ref}", flush=True)
        return jsonify({"success": True, "bases": parse_ibases(), "active_base": database.get_active_base()})
    except Exception as e:
        print_server_error("/api/bases/delete", e, data)
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/ping_connection", methods=["GET", "POST"])
def ping_connection_endpoint():
    data = request.json if (request.method == "POST" and request.is_json) else {}
    try:
        active = database.get_active_base() or {}
        payload = {
            "server": data.get("server") or active.get("server") or "Aztrade3",
            "ref": data.get("ref") or active.get("ref") or "Aztrade2023",
            "user": data.get("user") or active.get("user") or "Nesib",
            "password": data.get("password") or active.get("password") or "15963"
        }
        res = one_c.execute("ping", payload)
        return jsonify({
            "success": True,
            "connected": True,
            "server": payload["server"],
            "ref": payload["ref"]
        })
    except Exception as e:
        print_server_error("/api/ping_connection", e, data)
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/login", methods=["POST"])
def user_login():
    data = request.json or {}
    try:
        print(f"🔑 [1C GİRİŞ CƏHDİ] Server: {data.get('server')} | Baza: {data.get('ref')} | İstifadəçi: {data.get('user')}", flush=True)
        res = one_c.execute("get_reports", data)
        print(f"✅ [1C GİRİŞ UĞURLU] İstifadəçi: {data.get('user')} uğurla bağlandı!", flush=True)
        database.set_active_base(
            data.get('server'),
            data.get('ref'),
            data.get('dbTitle') or f"{data.get('server')} / {data.get('ref')}",
            data.get('user'),
            data.get('password')
        )
        return jsonify({"success": True, "user": data.get("user"), **res})
    except Exception as e:
        print_server_error("/api/login", e, data)
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/presets", methods=["GET"])
def get_presets_endpoint():
    try:
        presets = database.get_all_presets()
        return jsonify(presets)
    except Exception as e:
        print(f"Error fetching presets: {e}", flush=True)
        return jsonify([])

@base_bp.route("/api/presets/save", methods=["POST"])
def save_presets_endpoint():
    try:
        data = request.json or {}
        name = data.get("name", "").strip()
        config = data.get("config", {})
        user_name = data.get("user", "Administrator")
        open_on_startup = int(data.get("open_on_startup", 0))
        save_on_close = int(data.get("save_on_close", 0))

        if not name:
            return jsonify({"success": False, "error": "Preset adı tələb olunur."})

        success = database.save_preset(name, config, user_name, open_on_startup, save_on_close)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/presets/delete", methods=["POST"])
def delete_preset_endpoint():
    try:
        data = request.json or {}
        name = data.get("name", "").strip()
        if not name:
            return jsonify({"success": False, "error": "Silinəcək preset adı tələb olunur."})
        success = database.delete_preset(name)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/presets/rename", methods=["POST"])
def rename_preset_endpoint():
    try:
        data = request.json or {}
        old_name = data.get("old_name", "").strip()
        new_name = data.get("new_name", "").strip()
        if not old_name or not new_name:
            return jsonify({"success": False, "error": "Köhnə və yeni ad tələb olunur."})
        success = database.rename_preset(old_name, new_name)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/presets/duplicate", methods=["POST"])
def duplicate_preset_endpoint():
    try:
        data = request.json or {}
        source_name = data.get("source_name", "").strip()
        target_name = data.get("target_name", "").strip()
        if not source_name or not target_name:
            return jsonify({"success": False, "error": "Mənbə və hədəf ad tələb olunur."})
        success = database.duplicate_preset(source_name, target_name)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/presets/set_startup", methods=["POST"])
def set_startup_endpoint():
    try:
        data = request.json or {}
        name = data.get("name", "").strip()
        is_startup = bool(data.get("is_startup", False))
        success = database.set_startup_preset(name, is_startup)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/presets/set_save_on_close", methods=["POST"])
def set_save_on_close_endpoint():
    try:
        data = request.json or {}
        name = data.get("name", "").strip()
        is_save = bool(data.get("is_save", False))
        success = database.set_save_on_close(name, is_save)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/current_settings", methods=["GET", "POST"])
def current_settings_endpoint():
    try:
        if request.method == "POST":
            data = request.json or {}
            config = data.get("config", {})
            active_name = data.get("active_preset_name", "")
            database.save_current_settings(config, active_name)
            return jsonify({"success": True})
        else:
            cur_sett = database.get_current_settings()
            return jsonify({"success": True, "data": cur_sett})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/app/minimize", methods=["POST", "GET"])
def app_minimize_endpoint():
    try:
        import win32gui, win32con
        def enum_cb(hwnd, extra):
            title = win32gui.GetWindowText(hwnd)
            if "1C:Предприятие" in title or "Товары на складах" in title:
                win32gui.ShowWindow(hwnd, win32con.SW_MINIMIZE)
        win32gui.EnumWindows(enum_cb, None)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@base_bp.route("/api/app/close", methods=["POST", "GET"])
def app_close_endpoint():
    def shutdown_later():
        time.sleep(0.5)
        os.system("taskkill /F /IM electron.exe >nul 2>&1")
    threading.Thread(target=shutdown_later, daemon=True).start()
    return jsonify({"success": True})
