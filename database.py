# -*- coding: utf-8 -*-
import sqlite3
import json
import os
import datetime

DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DB_PATH = os.path.join(DB_DIR, "report_settings.db")

def get_connection():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cur = conn.cursor()

    # 1. Presets Table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL COLLATE NOCASE,
            user_name TEXT DEFAULT 'Administrator',
            open_on_startup INTEGER DEFAULT 0,
            save_on_close INTEGER DEFAULT 0,
            config_json TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    """)

    # 2. Current Active Session Settings Table (guarantees persistence across refresh)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS current_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            active_preset_name TEXT,
            config_json TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    """)

    # 3. Custom 1C Bases Table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS custom_bases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            server TEXT NOT NULL,
            ref TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    """)

    # 4. Hidden / Deleted Bases Table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS hidden_bases (
            server TEXT NOT NULL,
            ref TEXT NOT NULL,
            PRIMARY KEY (server, ref)
        )
    """)

    conn.commit()

    # Check if presets table is empty, then seed with 1C database presets
    cur.execute("SELECT COUNT(*) as cnt FROM presets")
    cnt = cur.fetchone()["cnt"]
    if cnt == 0:
        seed_default_presets(conn)

    conn.close()
    print(f"[SQL BAZA HAZIR] SQLite bazasi ise salindi: {DB_PATH}", flush=True)

def seed_default_presets(conn):
    cur = conn.cursor()
    
    clean_config = {
        "startDate": "01.09.2026",
        "endDate": "30.09.2026",
        "priceType": "20",
        "priceTypes": ["20"],
        "parameters": {
            "negativeRed": True,
            "showGrandTotals": True,
            "showDetails": False,
            "useProperties": True
        },
        "indicators": {
            "barcode": True,
            "barcodeUnit": True,
            "barcodeBox": True,
            "barcodeBlock": False,
            "showPrice": True,
            "showSum": True,
            "qtyStart": True,
            "qtyIn": True,
            "qtyOut": True,
            "qtyEnd": True,
            "qtyTurnover": False
        },
        "rowGroupings": [
            { "field": "Склад", "type": "Элементы" },
            { "field": "Номенклатура", "type": "Элементы" }
        ],
        "colGroupings": [],
        "filters": []
    }

    anbar_qaligi_config = dict(clean_config)
    anbar_qaligi_config["filters"] = [
        {
            "active": True,
            "field": "Склад",
            "comparison": "in_list",
            "value": "Anbar Gəncə; Anbar Müvəqqəti Gəncə"
        }
    ]

    seeds = [
        ("Основная", clean_config, 0, 0),
        ("Anbar Qaligi", anbar_qaligi_config, 0, 0),
        ("Anbar Qaligi 1", clean_config, 0, 0),
        ("anbar qaligi region", clean_config, 0, 0),
        ("kompl", clean_config, 0, 1),
        ("loreal stok", clean_config, 0, 0),
        ("loreal stok basic", clean_config, 0, 0),
        ("mc eded", clean_config, 0, 0),
        ("region anbar qaligi", clean_config, 0, 0),
        ("Админ", clean_config, 0, 0),
        ("акция", clean_config, 0, 1),
        ("aksiya", clean_config, 0, 0)
    ]

    for name, cfg, startup, save_close in seeds:
        cur.execute("""
            INSERT OR IGNORE INTO presets (name, user_name, open_on_startup, save_on_close, config_json)
            VALUES (?, 'Administrator', ?, ?, ?)
        """, (name, startup, save_close, json.dumps(cfg, ensure_ascii=False)))

    conn.commit()

def get_all_presets():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, user_name, open_on_startup, save_on_close, config_json, updated_at
        FROM presets
        ORDER BY id ASC
    """)
    rows = cur.fetchall()
    presets = []
    for r in rows:
        try:
            cfg = json.loads(r["config_json"])
        except Exception:
            cfg = {}
        preset = {
            "id": r["id"],
            "name": r["name"],
            "user": r["user_name"],
            "open_on_startup": bool(r["open_on_startup"]),
            "save_on_close": bool(r["save_on_close"]),
            "updated_at": r["updated_at"],
            **cfg
        }
        presets.append(preset)
    conn.close()
    return presets

def save_preset(name, config, user_name="Administrator", open_on_startup=0, save_on_close=0):
    conn = get_connection()
    cur = conn.cursor()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # If open_on_startup is 1, reset others
    if open_on_startup:
        cur.execute("UPDATE presets SET open_on_startup = 0")

    cur.execute("""
        INSERT INTO presets (name, user_name, open_on_startup, save_on_close, config_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
            user_name = excluded.user_name,
            open_on_startup = excluded.open_on_startup,
            save_on_close = excluded.save_on_close,
            config_json = excluded.config_json,
            updated_at = excluded.updated_at
    """, (name, user_name, int(open_on_startup), int(save_on_close), json.dumps(config, ensure_ascii=False), now_str))

    conn.commit()
    conn.close()
    return True

def delete_preset(name):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM presets WHERE name = ?", (name,))
    affected = cur.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def rename_preset(old_name, new_name):
    conn = get_connection()
    cur = conn.cursor()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        UPDATE presets
        SET name = ?, updated_at = ?
        WHERE name = ?
    """, (new_name, now_str, old_name))
    affected = cur.rowcount
    conn.commit()
    conn.close()
    return affected > 0

def duplicate_preset(source_name, target_name):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT config_json, user_name FROM presets WHERE name = ?", (source_name,))
    row = cur.fetchone()
    if not row:
        conn.close()
        return False

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        INSERT INTO presets (name, user_name, open_on_startup, save_on_close, config_json, updated_at)
        VALUES (?, ?, 0, 0, ?, ?)
    """, (target_name, row["user_name"], row["config_json"], now_str))
    conn.commit()
    conn.close()
    return True

def set_startup_preset(name, is_startup):
    conn = get_connection()
    cur = conn.cursor()
    # Reset all first
    cur.execute("UPDATE presets SET open_on_startup = 0")
    if is_startup:
        cur.execute("UPDATE presets SET open_on_startup = 1 WHERE name = ?", (name,))
    conn.commit()
    conn.close()
    return True

def set_save_on_close(name, is_save):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE presets SET save_on_close = ? WHERE name = ?", (1 if is_save else 0, name))
    conn.commit()
    conn.close()
    return True

def save_current_settings(config, active_preset_name=""):
    conn = get_connection()
    cur = conn.cursor()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        INSERT INTO current_settings (id, active_preset_name, config_json, updated_at)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            active_preset_name = excluded.active_preset_name,
            config_json = excluded.config_json,
            updated_at = excluded.updated_at
    """, (active_preset_name, json.dumps(config, ensure_ascii=False), now_str))
    conn.commit()
    conn.close()
    return True

def get_current_settings():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT active_preset_name, config_json FROM current_settings WHERE id = 1")
    row = cur.fetchone()
    conn.close()
    if row:
        try:
            cfg = json.loads(row["config_json"])
            return {
                "active_preset_name": row["active_preset_name"] or "",
                "config": cfg
            }
        except Exception:
            return None
    return None

def get_custom_bases():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, title, server, ref FROM custom_bases ORDER BY id DESC")
    rows = cur.fetchall()
    conn.close()
    return [{"id": r["id"], "title": r["title"], "server": r["server"], "ref": r["ref"], "is_custom": True} for r in rows]

def get_hidden_bases():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT server, ref FROM hidden_bases")
    rows = cur.fetchall()
    conn.close()
    return {(str(r["server"]).strip().lower(), str(r["ref"]).strip().lower()) for r in rows}

def add_custom_base(title, server, ref):
    conn = get_connection()
    cur = conn.cursor()
    server = server.strip()
    ref = ref.strip()
    title = title.strip() or f"{server} / {ref}"

    # If previously hidden, unhide it
    cur.execute("DELETE FROM hidden_bases WHERE LOWER(server) = LOWER(?) AND LOWER(ref) = LOWER(?)", (server, ref))

    # Check if already exists in custom_bases
    cur.execute("SELECT id FROM custom_bases WHERE LOWER(server) = LOWER(?) AND LOWER(ref) = LOWER(?)", (server, ref))
    row = cur.fetchone()
    if row:
        cur.execute("UPDATE custom_bases SET title = ? WHERE id = ?", (title, row["id"]))
    else:
        cur.execute("INSERT INTO custom_bases (title, server, ref) VALUES (?, ?, ?)", (title, server, ref))
    conn.commit()
    conn.close()
    return True

def delete_base(server, ref):
    conn = get_connection()
    cur = conn.cursor()
    server = server.strip()
    ref = ref.strip()
    # Delete from custom_bases
    cur.execute("DELETE FROM custom_bases WHERE LOWER(server) = LOWER(?) AND LOWER(ref) = LOWER(?)", (server, ref))
    # Also record in hidden_bases so system/v8i base is hidden as well
    cur.execute("INSERT OR REPLACE INTO hidden_bases (server, ref) VALUES (?, ?)", (server, ref))
    conn.commit()
    conn.close()
    return True
