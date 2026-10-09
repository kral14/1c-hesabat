# -*- coding: utf-8 -*-
"""
Offline 1C Data Service Provider
Operates directly on data/offline_1c_data.db SQLite database when 1C COMConnector
is not installed or unavailable (e.g. running from home computer).
"""
import os
import sqlite3
import datetime
import re

import zipfile

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "offline_1c_data.db")
ZIP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "offline_1c_data.zip")

def is_offline_db_ready():
    if not os.path.exists(DB_PATH) or os.path.getsize(DB_PATH) <= 1024:
        if os.path.exists(ZIP_PATH) and os.path.getsize(ZIP_PATH) > 1024:
            try:
                print("📦 [OFFLINE BAZA] 'offline_1c_data.zip' arxivindən SQLite bazası çıxarılır...", flush=True)
                with zipfile.ZipFile(ZIP_PATH, 'r') as zf:
                    zf.extractall(os.path.dirname(DB_PATH))
                print("✅ [OFFLINE BAZA] Baza uğurla çıxarıldı!", flush=True)
            except Exception as e_unzip:
                print(f"⚠️ [OFFLINE BAZA XƏTASI] Zip çıxarılmadı: {e_unzip}", flush=True)
    return os.path.exists(DB_PATH) and os.path.getsize(DB_PATH) > 1024

def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def format_1c_datetime(dt_val):
    if not dt_val:
        return ""
    if hasattr(dt_val, "strftime"):
        try:
            return dt_val.strftime("%d.%m.%Y %H:%M:%S")
        except Exception:
            pass
    s = str(dt_val).strip()
    m_iso = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2}):(\d{1,2}))?", s)
    if m_iso:
        y, mo, d, hh, mm, ss = m_iso.groups()
        return f"{int(d):02d}.{int(mo):02d}.{int(y):04d} {int(hh or 0):02d}:{int(mm or 0):02d}:{int(ss or 0):02d}"
    m_dot = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?", s)
    if m_dot:
        d, mo, y, hh, mm, ss = m_dot.groups()
        return f"{int(d):02d}.{int(mo):02d}.{int(y):04d} {int(hh or 0):02d}:{int(mm or 0):02d}:{int(ss or 0):02d}"
    return s[:19]

def normalize_iso_datetime(d_str, is_end=False):
    if not d_str:
        return ""
    d_str = str(d_str).strip()
    m_dot = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?", d_str)
    if m_dot:
        d, mo, y, hh, mm, ss = m_dot.groups()
        hh = int(hh) if hh is not None else (23 if is_end else 0)
        mm = int(mm) if mm is not None else (59 if is_end else 0)
        ss = int(ss) if ss is not None else (59 if is_end else 0)
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d} {hh:02d}:{mm:02d}:{ss:02d}"
    m_iso = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?", d_str)
    if m_iso:
        y, mo, d, hh, mm, ss = m_iso.groups()
        hh = int(hh) if hh is not None else (23 if is_end else 0)
        mm = int(mm) if mm is not None else (59 if is_end else 0)
        ss = int(ss) if ss is not None else (59 if is_end else 0)
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d} {hh:02d}:{mm:02d}:{ss:02d}"
    return d_str

# 1. Ping
def ping():
    return "pong (Offline SQLite)"

# 2. Get Users
def get_users():
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT DISTINCT responsible AS name FROM price_documents WHERE responsible IS NOT NULL AND responsible != '' ORDER BY responsible")
        rows = cur.fetchall()
        users = [{"name": r["name"].strip(), "code": f"{i+1:03d}"} for i, r in enumerate(rows)]
        if not users:
            users = [{"name": "Keleshov Nasib", "code": "001"}, {"name": "Admin", "code": "002"}]
        return users
    finally:
        conn.close()

# 3. Get Portfolios
def get_portfolios():
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT parent AS p FROM nomenklatura 
            WHERE parent IS NOT NULL AND parent != '' AND parent NOT LIKE '!%'
            ORDER BY parent LIMIT 100
        """)
        rows = cur.fetchall()
        portfolios = [r["p"].strip() for r in rows if r["p"] and r["p"].strip()]
        return portfolios
    finally:
        conn.close()

# 4. Get Agents
def get_agents():
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT podrazdelenie AS a FROM sales_turnover 
            WHERE podrazdelenie IS NOT NULL AND podrazdelenie != ''
            ORDER BY podrazdelenie LIMIT 100
        """)
        rows = cur.fetchall()
        agents = [r["a"].strip() for r in rows if r["a"] and r["a"].strip()]
        return agents
    finally:
        conn.close()

# 5. Search Kontragents
def search_kontragents(query=""):
    conn = get_connection()
    try:
        cur = conn.cursor()
        q = f"%{query.strip()}%"
        cur.execute("""
            SELECT name, code, inn FROM kontragenty 
            WHERE is_group = 0 AND (name LIKE ? OR code LIKE ? OR inn LIKE ?)
            ORDER BY name LIMIT 30
        """, (q, q, q))
        return [{"name": r["name"].strip(), "code": r["code"].strip(), "inn": r["inn"] or ""} for r in cur.fetchall()]
    finally:
        conn.close()

# 6. Search Nomenklatura
def search_nomenklatura(query=""):
    conn = get_connection()
    try:
        cur = conn.cursor()
        q = f"%{query.strip()}%"
        cur.execute("""
            SELECT name, artikul, code, barcode, unit FROM nomenklatura 
            WHERE is_group = 0 AND (name LIKE ? OR artikul LIKE ? OR code LIKE ? OR barcode LIKE ?)
            ORDER BY name LIMIT 35
        """, (q, q, q, q))
        return [{
            "name": r["name"].strip(),
            "artikul": r["artikul"] or "",
            "code": r["code"].strip(),
            "barcode": r["barcode"] or "",
            "unit": r["unit"] or ""
        } for r in cur.fetchall()]
    finally:
        conn.close()

# 7. Get All Price Types
def get_all_price_types():
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT code, name FROM price_types ORDER BY name")
        rows = cur.fetchall()
        if not rows:
            return [{"code": "20", "name": "20", "desc": "20"}]
        return [{"code": r["code"] or r["name"], "name": r["name"], "desc": r["name"]} for r in rows]
    finally:
        conn.close()

# 8. Get Documents List (Universal Documents Engine)
def get_documents_list(payload):
    doc_type = payload.get("doc_type") or "РеализацияТоваровУслуг"
    limit_count = int(payload.get("limit", 0))
    offset = int(payload.get("offset", 0))
    search_str = payload.get("search", "").strip().lower()
    filters = payload.get("filters") or []
    date_from = payload.get("date_from", "").strip()
    date_to = payload.get("date_to", "").strip()
    last_date = payload.get("last_date", "").strip()
    last_number = payload.get("last_number", "").strip()

    if search_str or filters:
        if limit_count <= 0 or limit_count < 5000:
            limit_count = 5000
        offset = 0

    conn = get_connection()
    try:
        cur = conn.cursor()

        norm_from = normalize_iso_datetime(date_from, is_end=False)
        norm_to = normalize_iso_datetime(date_to, is_end=True)

        # 1. Установка цен номенклатуры
        if doc_type == "УстановкаЦенНоменклатуры":
            sql = "SELECT doc_number, doc_date, comment, responsible, status FROM price_documents"
            conditions = []
            params = []
            if norm_from:
                conditions.append("doc_date >= ?")
                params.append(norm_from)
            if norm_to:
                conditions.append("doc_date <= ?")
                params.append(norm_to)
            if last_date:
                conditions.append("doc_date < ?")
                params.append(normalize_iso_datetime(last_date))
            if conditions:
                sql += " WHERE " + " AND ".join(conditions)
            if limit_count and limit_count > 0:
                sql += " ORDER BY doc_date DESC LIMIT ? OFFSET ?"
                params.extend([limit_count, offset])
            else:
                sql += " ORDER BY doc_date DESC"
            cur.execute(sql, params)
            rows = cur.fetchall()

            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 145, "align": "left"},
                {"key": "number", "label": "Номер", "width": 115, "align": "left"},
                {"key": "responsible", "label": "Ответственный", "width": 160, "align": "left"},
                {"key": "comment", "label": "Комментарий", "width": 300, "align": "left"}
            ]

            items = []
            for r in rows:
                stat = r["status"] or ""
                posted = ("проведен" in stat.lower() and "не проведен" not in stat.lower())
                item = {
                    "number": r["doc_number"],
                    "date": format_1c_datetime(r["doc_date"]),
                    "responsible": r["responsible"] or "Keleshov Nasib",
                    "comment": r["comment"] or "",
                    "posted": posted,
                    "deleted": False,
                    "status": "posted" if posted else "draft",
                    "data_version": f"off_{r['doc_number']}"
                }
                if search_str:
                    target = f"{item['number']} {item['date']} {item['responsible']} {item['comment']}".lower()
                    if search_str not in target:
                        continue
                items.append(item)

            has_more = (len(items) == limit_count) if (limit_count and limit_count > 0) else False
            last_item = items[-1] if items else None
            return {
                "doc_type": "УстановкаЦенНоменклатуры",
                "doc_title": "Установка цен номенклатуры",
                "columns": columns,
                "items": items,
                "total": len(items),
                "has_more": has_more,
                "last_date": last_item["date"] if last_item else "",
                "last_number": last_item["number"] if last_item else ""
            }

        # 2. Реализация товаров и услуг (Sales Documents)
        elif doc_type == "РеализацияТоваровУслуг":
            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 145, "align": "left"},
                {"key": "number", "label": "Номер", "width": 115, "align": "left"},
                {"key": "kontragent", "label": "Контрагент", "width": 240, "align": "left"},
                {"key": "golovnoy_kontragent", "label": "Головной контрагент", "width": 180, "align": "left"},
                {"key": "agent", "label": "Агент", "width": 140, "align": "left"},
                {"key": "kontragent_code", "label": "Код контрагента", "width": 115, "align": "left"},
                {"key": "portfolio", "label": "Портфель", "width": 130, "align": "left"},
                {"key": "amount", "label": "Сумма", "width": 110, "align": "right"},
                {"key": "warehouse", "label": "Склад", "width": 150, "align": "left"},
                {"key": "deal", "label": "Номер заказа", "width": 130, "align": "left"},
                {"key": "obrabotka_number", "label": "Номер обработки", "width": 130, "align": "left"},
                {"key": "vms_status", "label": "Статус ВМС", "width": 130, "align": "center"},
                {"key": "contract", "label": "Договор контрагента", "width": 160, "align": "left"},
                {"key": "contract_price_type", "label": "Тип цен", "width": 120, "align": "left"},
                {"key": "pogruzka_marshrut", "label": "Пагрузка маршрут", "width": 130, "align": "center"},
                {"key": "pogruzka_voditel", "label": "Пагрузка водитель", "width": 150, "align": "left"},
                {"key": "responsible", "label": "Ответственный", "width": 160, "align": "left"},
                {"key": "comment", "label": "Комментарий", "width": 200, "align": "left"}
            ]

            sql = "SELECT * FROM documents_realization"
            conditions = []
            params = []
            if norm_from:
                conditions.append("date >= ?")
                params.append(norm_from)
            if norm_to:
                conditions.append("date <= ?")
                params.append(norm_to)
            if last_date and not search_str and not filters:
                if last_number:
                    conditions.append("(date < ? OR (date = ? AND number < ?))")
                    params.extend([normalize_iso_datetime(last_date), normalize_iso_datetime(last_date), last_number])
                else:
                    conditions.append("date < ?")
                    params.append(normalize_iso_datetime(last_date))

            if search_str:
                s_param = f"%{search_str}%"
                conditions.append("(number LIKE ? OR kontragent LIKE ? OR kontragent_code LIKE ? OR comment LIKE ? OR deal LIKE ? OR contract LIKE ? OR agent LIKE ? OR warehouse LIKE ? OR pogruzka_marshrut LIKE ? OR pogruzka_voditel LIKE ?)")
                params.extend([s_param] * 10)

            if conditions:
                sql += " WHERE " + " AND ".join(conditions)

            sql += " ORDER BY date DESC, number DESC"
            if limit_count and limit_count > 0:
                sql += " LIMIT ? OFFSET ?"
                params.extend([limit_count, offset])

            cur.execute(sql, params)
            rows = cur.fetchall()

            items = []
            for r in rows:
                item = {
                    "number": r["number"],
                    "date": format_1c_datetime(r["date"]),
                    "posted": bool(r["posted"]),
                    "deleted": bool(r["deleted"]),
                    "status": "posted" if r["posted"] else "draft",
                    "kontragent": r["kontragent"] or "",
                    "kontragent_code": r["kontragent_code"] or "",
                    "golovnoy_kontragent": r["golovnoy_kontragent"] or "",
                    "agent": r["agent"] or "",
                    "amount": float(r["amount"] or 0.0),
                    "warehouse": r["warehouse"] or "",
                    "deal": r["deal"] or "",
                    "obrabotka_number": r["obrabotka_number"] or "",
                    "vms_status": r["vms_status"] or "",
                    "contract": r["contract"] or "",
                    "portfolio": r["portfolio"] or "",
                    "contract_price_type": r["contract_price_type"] or "",
                    "pogruzka_marshrut": r["pogruzka_marshrut"] or "",
                    "pogruzka_voditel": r["pogruzka_voditel"] or "",
                    "pogruzka_count": 1 if r["pogruzka_marshrut"] else 0,
                    "responsible": r["responsible"] or "",
                    "comment": r["comment"] or "",
                    "data_version": r["data_version"] or f"off_{r['number']}"
                }
                items.append(item)

            has_more = (len(items) == limit_count) if (limit_count and limit_count > 0) else False
            last_item = items[-1] if items else None
            return {
                "doc_type": "РеализацияТоваровУслуг",
                "doc_title": "Реализация товаров и услуг",
                "columns": columns,
                "items": items,
                "total": len(items),
                "total_count": len(items),
                "has_more": has_more,
                "last_date": last_item["date"] if last_item else "",
                "last_number": last_item["number"] if last_item else ""
            }

        # 3. Возврат товаров от покупателя (Customer Returns)
        elif doc_type == "ВозвратТоваровОтПокупателя":
            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 145, "align": "left"},
                {"key": "number", "label": "Номер", "width": 115, "align": "left"},
                {"key": "kontragent", "label": "Контрагент", "width": 240, "align": "left"},
                {"key": "golovnoy_kontragent", "label": "Головной контрагент", "width": 180, "align": "left"},
                {"key": "agent", "label": "Агент", "width": 140, "align": "left"},
                {"key": "amount", "label": "Сумма", "width": 110, "align": "right"},
                {"key": "warehouse", "label": "Склад", "width": 160, "align": "left"},
                {"key": "deal", "label": "Сделка / Заказ", "width": 130, "align": "left"},
                {"key": "contract", "label": "Договор", "width": 160, "align": "left"},
                {"key": "responsible", "label": "Ответственный", "width": 160, "align": "left"},
                {"key": "comment", "label": "Комментарий", "width": 200, "align": "left"}
            ]

            sql = "SELECT * FROM documents_vozvrat"
            conditions = []
            params = []
            if norm_from:
                conditions.append("date >= ?")
                params.append(norm_from)
            if norm_to:
                conditions.append("date <= ?")
                params.append(norm_to)
            if last_date and not search_str:
                if last_number:
                    conditions.append("(date < ? OR (date = ? AND number < ?))")
                    params.extend([normalize_iso_datetime(last_date), normalize_iso_datetime(last_date), last_number])
                else:
                    conditions.append("date < ?")
                    params.append(normalize_iso_datetime(last_date))

            if search_str:
                s_param = f"%{search_str}%"
                conditions.append("(number LIKE ? OR kontragent LIKE ? OR kontragent_code LIKE ? OR comment LIKE ? OR deal LIKE ? OR contract LIKE ? OR agent LIKE ?)")
                params.extend([s_param] * 7)

            if conditions:
                sql += " WHERE " + " AND ".join(conditions)

            sql += " ORDER BY date DESC, number DESC"
            if limit_count and limit_count > 0:
                sql += " LIMIT ? OFFSET ?"
                params.extend([limit_count, offset])

            cur.execute(sql, params)
            rows = cur.fetchall()

            items = []
            for r in rows:
                item = {
                    "number": r["number"],
                    "date": format_1c_datetime(r["date"]),
                    "posted": bool(r["posted"]),
                    "deleted": bool(r["deleted"]),
                    "status": "posted" if r["posted"] else "draft",
                    "kontragent": r["kontragent"] or "",
                    "kontragent_code": r["kontragent_code"] or "",
                    "golovnoy_kontragent": r["golovnoy_kontragent"] or "",
                    "agent": r["agent"] or "",
                    "amount": float(r["amount"] or 0.0),
                    "warehouse": r["warehouse"] or "",
                    "deal": r["deal"] or "",
                    "contract": r["contract"] or "",
                    "responsible": r["responsible"] or "",
                    "comment": r["comment"] or "",
                    "data_version": r["data_version"] or f"off_vozv_{r['number']}"
                }
                items.append(item)

            has_more = (len(items) == limit_count) if (limit_count and limit_count > 0) else False
            last_item = items[-1] if items else None
            return {
                "doc_type": "ВозвратТоваровОтПокупателя",
                "doc_title": "Возврат товаров от покупателя",
                "columns": columns,
                "items": items,
                "total": len(items),
                "total_count": len(items),
                "has_more": has_more,
                "last_date": last_item["date"] if last_item else "",
                "last_number": last_item["number"] if last_item else ""
            }

        # 4. Погрузки машин (Loading machine documents)
        elif doc_type in ["ПогрузкиМашин", "ПогрузкаМашин"]:
            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 145, "align": "left"},
                {"key": "number", "label": "Номер", "width": 115, "align": "left"},
                {"key": "marshrut", "label": "Маршрут", "width": 130, "align": "center"},
                {"key": "voditel", "label": "Водитель", "width": 180, "align": "left"},
                {"key": "warehouse", "label": "Склад", "width": 160, "align": "left"},
                {"key": "realization_count", "label": "Кол-во накладных", "width": 120, "align": "right"},
                {"key": "amount", "label": "Общая сумма", "width": 120, "align": "right"},
                {"key": "responsible", "label": "Ответственный", "width": 160, "align": "left"}
            ]

            sql = "SELECT * FROM documents_pogruzka"
            conditions = []
            params = []
            if norm_from:
                conditions.append("date >= ?")
                params.append(norm_from)
            if norm_to:
                conditions.append("date <= ?")
                params.append(norm_to)
            if last_date and not search_str:
                if last_number:
                    conditions.append("(date < ? OR (date = ? AND number < ?))")
                    params.extend([normalize_iso_datetime(last_date), normalize_iso_datetime(last_date), last_number])
                else:
                    conditions.append("date < ?")
                    params.append(normalize_iso_datetime(last_date))

            if search_str:
                s_param = f"%{search_str}%"
                conditions.append("(number LIKE ? OR marshrut LIKE ? OR voditel LIKE ? OR warehouse LIKE ? OR responsible LIKE ?)")
                params.extend([s_param] * 5)

            if conditions:
                sql += " WHERE " + " AND ".join(conditions)

            sql += " ORDER BY date DESC, number DESC"
            if limit_count and limit_count > 0:
                sql += " LIMIT ? OFFSET ?"
                params.extend([limit_count, offset])

            cur.execute(sql, params)
            rows = cur.fetchall()

            items = []
            for r in rows:
                item = {
                    "number": r["number"],
                    "date": format_1c_datetime(r["date"]),
                    "posted": bool(r["posted"]),
                    "deleted": bool(r["deleted"]),
                    "status": "posted" if r["posted"] else "draft",
                    "marshrut": r["marshrut"] or "",
                    "voditel": r["voditel"] or "",
                    "warehouse": r["warehouse"] or "",
                    "realization_count": int(r["realization_count"] or 0),
                    "amount": float(r["amount"] or 0.0),
                    "responsible": r["responsible"] or "",
                    "comment": r["comment"] or ""
                }
                items.append(item)

            has_more = (len(items) == limit_count) if (limit_count and limit_count > 0) else False
            last_item = items[-1] if items else None
            return {
                "doc_type": "ПогрузкиМашин",
                "doc_title": "Погрузка машин",
                "columns": columns,
                "items": items,
                "total": len(items),
                "total_count": len(items),
                "has_more": has_more,
                "last_date": last_item["date"] if last_item else "",
                "last_number": last_item["number"] if last_item else ""
            }

        # 5. Поступление товаров и услуг (Purchase Documents)
        elif doc_type == "ПоступлениеТоваровУслуг":
            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 145, "align": "left"},
                {"key": "number", "label": "Номер", "width": 125, "align": "left"},
                {"key": "kontragent", "label": "Контрагент", "width": 260, "align": "left"},
                {"key": "warehouse", "label": "Склад", "width": 160, "align": "left"},
                {"key": "amount", "label": "Сумма", "width": 110, "align": "right"},
                {"key": "responsible", "label": "Ответственный", "width": 140, "align": "left"},
                {"key": "comment", "label": "Комментарий", "width": 220, "align": "left"}
            ]

            sql = "SELECT * FROM documents_postuplenie"
            conditions = []
            params = []
            if norm_from:
                conditions.append("date >= ?")
                params.append(norm_from)
            if norm_to:
                conditions.append("date <= ?")
                params.append(norm_to)
            if search_str:
                s_param = f"%{search_str}%"
                conditions.append("(number LIKE ? OR kontragent LIKE ? OR warehouse LIKE ? OR comment LIKE ?)")
                params.extend([s_param] * 4)

            if conditions:
                sql += " WHERE " + " AND ".join(conditions)

            sql += " ORDER BY date DESC, number DESC"
            if limit_count and limit_count > 0:
                sql += " LIMIT ? OFFSET ?"
                params.extend([limit_count, offset])

            cur.execute(sql, params)
            rows = cur.fetchall()

            items = []
            for r in rows:
                item = {
                    "number": r["number"],
                    "date": format_1c_datetime(r["date"]),
                    "posted": bool(r["posted"]),
                    "deleted": bool(r["deleted"]),
                    "status": "posted" if r["posted"] else "draft",
                    "kontragent": r["kontragent"] or "",
                    "warehouse": r["warehouse"] or "",
                    "amount": float(r["amount"] or 0.0),
                    "responsible": r["responsible"] or "",
                    "comment": r["comment"] or ""
                }
                items.append(item)

            return {
                "doc_type": "ПоступлениеТоваровУслуг",
                "doc_title": "Поступление товаров и услуг",
                "columns": columns,
                "items": items,
                "total": len(items)
            }

        # 6. Заказ покупателя (Customer Orders)
        elif doc_type == "ЗаказПокупателя":
            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 145, "align": "left"},
                {"key": "number", "label": "Номер", "width": 125, "align": "left"},
                {"key": "kontragent", "label": "Контрагент", "width": 260, "align": "left"},
                {"key": "warehouse", "label": "Склад", "width": 160, "align": "left"},
                {"key": "amount", "label": "Сумма", "width": 110, "align": "right"},
                {"key": "responsible", "label": "Ответственный", "width": 140, "align": "left"},
                {"key": "comment", "label": "Комментарий", "width": 220, "align": "left"}
            ]

            sql = "SELECT * FROM documents_zakaz"
            conditions = []
            params = []
            if norm_from:
                conditions.append("date >= ?")
                params.append(norm_from)
            if norm_to:
                conditions.append("date <= ?")
                params.append(norm_to)
            if search_str:
                s_param = f"%{search_str}%"
                conditions.append("(number LIKE ? OR kontragent LIKE ? OR kontragent_code LIKE ? OR warehouse LIKE ? OR comment LIKE ?)")
                params.extend([s_param] * 5)

            if conditions:
                sql += " WHERE " + " AND ".join(conditions)

            sql += " ORDER BY date DESC, number DESC"
            if limit_count and limit_count > 0:
                sql += " LIMIT ? OFFSET ?"
                params.extend([limit_count, offset])

            cur.execute(sql, params)
            rows = cur.fetchall()

            items = []
            for r in rows:
                item = {
                    "number": r["number"],
                    "date": format_1c_datetime(r["date"]),
                    "posted": bool(r["posted"]),
                    "deleted": bool(r["deleted"]),
                    "status": "posted" if r["posted"] else "draft",
                    "kontragent": r["kontragent"] or "",
                    "warehouse": r["warehouse"] or "",
                    "amount": float(r["amount"] or 0.0),
                    "responsible": r["responsible"] or "",
                    "comment": r["comment"] or ""
                }
                items.append(item)

            return {
                "doc_type": "ЗаказПокупателя",
                "doc_title": "Заказ покупателя",
                "columns": columns,
                "items": items,
                "total": len(items)
            }

        # 7. Fallback for others
        else:
            title_map = {
                "СписаниеТоваров": "Списание товаров",
                "ОприходованиеТоваров": "Оприходование товаров",
                "ИнвентаризацияТоваровНаСкладе": "Инвентаризация товаров на складе"
            }
            doc_title = title_map.get(doc_type, doc_type)
            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 135, "align": "left"},
                {"key": "number", "label": "Номер", "width": 125, "align": "left"},
                {"key": "warehouse", "label": "Склад", "width": 220, "align": "left"},
                {"key": "amount", "label": "Сумма", "width": 110, "align": "right"},
                {"key": "responsible", "label": "Ответственный", "width": 140, "align": "left"},
                {"key": "comment", "label": "Комментарий", "width": 240, "align": "left"}
            ]
            return {
                "doc_type": doc_type,
                "doc_title": doc_title,
                "columns": columns,
                "items": [],
                "total": 0
            }
    finally:
        conn.close()

# 8.5. Get Price Document Details (Установка цен номенклатуры)
def get_price_document(payload):
    doc_number = payload.get("number", "").strip()
    conn = get_connection()
    try:
        cur = conn.cursor()
        doc = None
        if doc_number:
            cur.execute("SELECT doc_number, doc_date, comment, responsible, status FROM price_documents WHERE doc_number = ?", (doc_number,))
            doc = cur.fetchone()

        if not doc:
            cur.execute("SELECT doc_number, doc_date, comment, responsible, status FROM price_documents ORDER BY doc_date DESC LIMIT 1")
            doc = cur.fetchone()

        if not doc:
            return {
                "number": doc_number or "00000000001",
                "date": datetime.datetime.now().strftime("%d.%m.%Y %H:%M:%S"),
                "posted": False,
                "responsible": "Keleshov Nasib",
                "comment": "",
                "zero_prices": False,
                "price_types": ["20", "cost"],
                "all_price_types": ["20", "cost", "60", "30", "10", "100", "50"],
                "items": [],
                "total_items": 0
            }

        d_num = doc["doc_number"]
        posted = ("проведен" in str(doc["status"]).lower() and "не проведен" not in str(doc["status"]).lower())

        cur.execute("SELECT item_code, item_name, unit, price_type, price FROM price_document_rows WHERE doc_number = ? ORDER BY id ASC", (d_num,))
        rows = cur.fetchall()

        if not rows:
            cur.execute("SELECT code, name FROM nomenklatura LIMIT 15")
            n_rows = cur.fetchall()
            items = []
            pts = ["20", "cost"]
            for nr in n_rows:
                items.append({
                    "code": nr["code"],
                    "name": nr["name"],
                    "artikul": "",
                    "barcode": "",
                    "unit": "əd",
                    "prices": {"20": 4.50, "cost": 3.20}
                })
            doc_price_types = pts
        else:
            item_dict = {}
            item_order = []
            doc_price_types = []
            for r in rows:
                c = r["item_code"]
                pt = r["price_type"]
                pr = float(r["price"] or 0.0)
                if pt and pt not in doc_price_types:
                    doc_price_types.append(pt)
                if c not in item_dict:
                    item_dict[c] = {
                        "code": c,
                        "name": r["item_name"],
                        "artikul": "",
                        "barcode": "",
                        "unit": r["unit"] or "əd",
                        "prices": {}
                    }
                    item_order.append(c)
                if pt:
                    item_dict[c]["prices"][pt] = pr
            items = [item_dict[c] for c in item_order]

        cur.execute("SELECT name FROM price_types ORDER BY name")
        all_price_types = [r["name"].strip() for r in cur.fetchall()]
        if not all_price_types:
            all_price_types = ["20", "cost", "60", "30", "10", "100", "50"]
        for pt in doc_price_types:
            if pt not in all_price_types:
                all_price_types.append(pt)

        return {
            "number": d_num,
            "date": format_1c_datetime(doc["doc_date"]),
            "posted": posted,
            "responsible": doc["responsible"] or "Keleshov Nasib",
            "comment": doc["comment"] or "",
            "zero_prices": False,
            "price_types": doc_price_types if doc_price_types else ["20", "cost"],
            "all_price_types": all_price_types,
            "items": items,
            "total_items": len(items)
        }
    finally:
        conn.close()

# 9. Get Universal Document Details (Header and Rows)
def get_document_details(payload):
    doc_type = payload.get("doc_type") or "УстановкаЦенНоменклатуры"
    doc_number = payload.get("number", "").strip()

    if doc_type == "УстановкаЦенНоменклатуры":
        return get_price_document(payload)

    conn = get_connection()
    try:
        cur = conn.cursor()

        # 1. РеализацияТоваровУслуг
        if doc_type == "РеализацияТоваровУслуг":
            clean_num = doc_number.replace("С", "C").replace("с", "c")
            alt_num = clean_num.replace("C", "С")

            cur.execute("""
                SELECT * FROM documents_realization 
                WHERE number = ? OR number = ? OR number LIKE ?
                ORDER BY date DESC LIMIT 1
            """, (clean_num, alt_num, f"%{clean_num}%"))
            doc = cur.fetchone()

            if not doc:
                raise ValueError(f"Sənəd №{doc_number} tapılmadı")

            d_num = doc["number"]
            cur.execute("""
                SELECT line_no, item_code, item_name, unit, quantity, price, sum, vat 
                FROM documents_realization_rows 
                WHERE doc_number = ? OR doc_number = ? 
                ORDER BY line_no ASC
            """, (d_num, d_num.replace("C", "С")))
            rows = cur.fetchall()

            doc_items = []
            tot_sum = 0.0
            tot_vat = 0.0
            for idx, r in enumerate(rows, 1):
                qty = float(r["quantity"] or 0)
                sm = float(r["sum"] or 0)
                pr = float(r["price"] or 0)
                vt = float(r["vat"] or 0)
                tot_sum += sm
                tot_vat += vt
                doc_items.append({
                    "line_number": int(r["line_no"] or idx),
                    "line_num": int(r["line_no"] or idx),
                    "code": str(r["item_code"] or "").strip(),
                    "artikul": "",
                    "name": str(r["item_name"] or "").strip(),
                    "unit": str(r["unit"] or "əd").strip(),
                    "coefficient": 1.0,
                    "quantity": qty,
                    "price": pr,
                    "amount": sm,
                    "sum": sm,
                    "discount_percent": 0.0,
                    "vat_rate": "18%" if vt > 0 else "Без НДС",
                    "vat_amount": vt,
                    "vat_sum": vt,
                    "total_amount": round(sm + vt, 2),
                    "total": round(sm + vt, 2)
                })

            header_data = {
                "number": d_num,
                "date": format_1c_datetime(doc["date"]),
                "posted": bool(doc["posted"]),
                "deleted": bool(doc["deleted"]),
                "organization": "Aztrade MMC",
                "kontragent": doc["kontragent"] or "",
                "kontragent_code": doc["kontragent_code"] or "",
                "golovnoy_kontragent": doc["golovnoy_kontragent"] or "",
                "agent": doc["agent"] or "",
                "contract": doc["contract"] or "Основной договор",
                "warehouse": doc["warehouse"] or "Основной склад",
                "price_type": doc["contract_price_type"] or "Оптовая",
                "currency": "AZN",
                "amount": float(doc["amount"] or tot_sum),
                "total_vat": round(tot_vat, 2),
                "responsible": doc["responsible"] or "Keleshov Nasib",
                "comment": doc["comment"] or "",
                "deal": doc["deal"] or "",
                "obrabotka_number": doc["obrabotka_number"] or "",
                "vms_status": doc["vms_status"] or "",
                "pogruzka_marshrut": doc["pogruzka_marshrut"] or "",
                "pogruzka_voditel": doc["pogruzka_voditel"] or "",
                "marshrut": doc["pogruzka_marshrut"] or "",
                "voditel": doc["pogruzka_voditel"] or ""
            }

            return {
                "doc_type": "РеализацияТоваровУслуг",
                "doc_title": "Реализация товаров и услуг",
                "header": header_data,
                "lines": doc_items,
                "items": doc_items,
                "total_lines": len(doc_items)
            }

        # 2. ВозвратТоваровОтПокупателя
        elif doc_type == "ВозвратТоваровОтПокупателя":
            cur.execute("""
                SELECT * FROM documents_vozvrat 
                WHERE number = ? OR number LIKE ? 
                ORDER BY date DESC LIMIT 1
            """, (doc_number, f"%{doc_number}%"))
            doc = cur.fetchone()

            if not doc:
                raise ValueError(f"Sənəd №{doc_number} tapılmadı")

            d_num = doc["number"]
            cur.execute("""
                SELECT line_no, item_code, item_name, unit, quantity, price, sum 
                FROM documents_vozvrat_rows 
                WHERE doc_number = ? 
                ORDER BY line_no ASC
            """, (d_num,))
            rows = cur.fetchall()

            doc_items = []
            tot_sum = 0.0
            for idx, r in enumerate(rows, 1):
                qty = float(r["quantity"] or 0)
                sm = float(r["sum"] or 0)
                pr = float(r["price"] or 0)
                tot_sum += sm
                doc_items.append({
                    "line_number": int(r["line_no"] or idx),
                    "line_num": int(r["line_no"] or idx),
                    "code": str(r["item_code"] or "").strip(),
                    "artikul": "",
                    "name": str(r["item_name"] or "").strip(),
                    "unit": str(r["unit"] or "əd").strip(),
                    "coefficient": 1.0,
                    "quantity": qty,
                    "price": pr,
                    "amount": sm,
                    "sum": sm,
                    "vat_rate": "Без НДС",
                    "vat_amount": 0.0,
                    "total_amount": sm,
                    "total": sm
                })

            header_data = {
                "number": d_num,
                "date": format_1c_datetime(doc["date"]),
                "posted": bool(doc["posted"]),
                "deleted": bool(doc["deleted"]),
                "organization": "Aztrade MMC",
                "kontragent": doc["kontragent"] or "",
                "kontragent_code": doc["kontragent_code"] or "",
                "golovnoy_kontragent": doc["golovnoy_kontragent"] or "",
                "agent": doc["agent"] or "",
                "contract": doc["contract"] or "Основной договор",
                "warehouse": doc["warehouse"] or "Основной склад",
                "currency": "AZN",
                "amount": float(doc["amount"] or tot_sum),
                "responsible": doc["responsible"] or "Keleshov Nasib",
                "comment": doc["comment"] or "",
                "deal": doc["deal"] or ""
            }

            return {
                "doc_type": "ВозвратТоваровОтПокупателя",
                "doc_title": "Возврат товаров от покупателя",
                "header": header_data,
                "lines": doc_items,
                "items": doc_items,
                "total_lines": len(doc_items)
            }

        # 3. ПогрузкиМашин
        elif doc_type in ["ПогрузкиМашин", "ПогрузкаМашин"]:
            cur.execute("""
                SELECT * FROM documents_pogruzka 
                WHERE number = ? OR number LIKE ? 
                ORDER BY date DESC LIMIT 1
            """, (doc_number, f"%{doc_number}%"))
            doc = cur.fetchone()

            if not doc:
                raise ValueError(f"Sənəd №{doc_number} tapılmadı")

            d_num = doc["number"]
            cur.execute("""
                SELECT 
                    pr.line_no, pr.realization_number,
                    dr.date AS real_date, dr.kontragent, dr.amount, dr.warehouse
                FROM documents_pogruzka_rows pr
                LEFT JOIN documents_realization dr ON dr.number = pr.realization_number
                WHERE pr.doc_number = ?
                ORDER BY pr.line_no ASC
            """, (d_num,))
            rows = cur.fetchall()

            real_items = []
            tot_amt = 0.0
            for idx, r in enumerate(rows, 1):
                amt = float(r["amount"] or 0)
                tot_amt += amt
                real_items.append({
                    "line_number": int(r["line_no"] or idx),
                    "realization_number": r["realization_number"] or "",
                    "number": r["realization_number"] or "",
                    "date": format_1c_datetime(r["real_date"]),
                    "kontragent": r["kontragent"] or "",
                    "amount": amt,
                    "warehouse": r["warehouse"] or ""
                })

            header_data = {
                "number": d_num,
                "date": format_1c_datetime(doc["date"]),
                "posted": bool(doc["posted"]),
                "deleted": bool(doc["deleted"]),
                "marshrut": doc["marshrut"] or "",
                "voditel": doc["voditel"] or "",
                "warehouse": doc["warehouse"] or "",
                "amount": round(tot_amt, 2),
                "realization_count": len(real_items),
                "responsible": doc["responsible"] or "Keleshov Nasib",
                "comment": doc["comment"] or ""
            }

            return {
                "doc_type": "ПогрузкиМашин",
                "doc_title": "Погрузка машин",
                "header": header_data,
                "lines": real_items,
                "items": real_items,
                "total_lines": len(real_items)
            }

        # 4. Generic Fallback
        else:
            cur.execute("SELECT item_code, item_name, quantity FROM stock_balances LIMIT 15")
            st_rows = cur.fetchall()
            doc_items = []
            tot_sum = 0.0
            for idx, sr in enumerate(st_rows, 1):
                qty = float(sr["quantity"] or 1)
                pr = 10.50
                sm = round(qty * pr, 2)
                tot_sum += sm
                doc_items.append({
                    "line": idx,
                    "code": sr["item_code"],
                    "name": sr["item_name"],
                    "unit": "əd",
                    "quantity": qty,
                    "price": pr,
                    "sum": sm
                })

            return {
                "number": doc_number,
                "date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "doc_type": doc_type,
                "doc_title": doc_type,
                "amount": round(tot_sum, 2),
                "responsible": "Keleshov Nasib",
                "comment": f"Документ {doc_type}",
                "posted": True,
                "items": doc_items,
                "total_items": len(doc_items)
            }
    finally:
        conn.close()

# 10. Get Price Document Details
def save_price_document(payload):
    doc_number = payload.get("number", "").strip()
    doc_date = payload.get("date", "").strip()
    comment = payload.get("comment", "").strip()
    responsible = payload.get("responsible", "Keleshov Nasib").strip()
    items = payload.get("items", [])
    price_types = payload.get("price_types", [])

    if not doc_date:
        doc_date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_connection()
    try:
        cur = conn.cursor()
        if not doc_number:
            cur.execute("SELECT MAX(doc_number) AS max_num FROM price_documents")
            max_r = cur.fetchone()
            try:
                next_val = int(max_r["max_num"]) + 1
                doc_number = f"{next_val:011d}"
            except Exception:
                doc_number = "00000000201"

        cur.execute("""
            INSERT OR REPLACE INTO price_documents (doc_number, doc_date, comment, responsible, status)
            VALUES (?, ?, ?, ?, ?)
        """, (doc_number, doc_date, comment, responsible, "Не проведен (Offline)"))

        cur.execute("DELETE FROM price_document_rows WHERE doc_number = ?", (doc_number,))

        for it in items:
            code = str(it.get("code") or "").strip()
            name = str(it.get("name") or "").strip()
            unit = str(it.get("unit") or "əd").strip()
            prices = it.get("prices") or {}

            for pt, pr in prices.items():
                pr_float = float(pr or 0.0)
                cur.execute("""
                    INSERT INTO price_document_rows (doc_number, item_code, item_name, unit, price_type, price)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (doc_number, code, name, unit, str(pt).strip(), pr_float))

                # Update active prices cache in SQLite
                cur.execute("""
                    INSERT OR REPLACE INTO active_prices (item_code, price_type, price)
                    VALUES (?, ?, ?)
                """, (code, str(pt).strip(), pr_float))

        conn.commit()
        return {
            "status": "success",
            "number": doc_number,
            "date": doc_date,
            "message": f"Sənəd №{doc_number} yerli SQLite bazasında uğurla yadda saxlanıldı."
        }
    finally:
        conn.close()

# 11. Resolve Nomenclature Batch
def resolve_nomenclature_batch(payload):
    items_to_resolve = payload.get("items", [])
    conn = get_connection()
    try:
        cur = conn.cursor()
        results = []
        for raw_item in items_to_resolve:
            code = str(raw_item.get("code") or "").strip()
            artikul = str(raw_item.get("artikul") or "").strip()
            barcode = str(raw_item.get("barcode") or "").strip()

            cur.execute("""
                SELECT code, name, artikul, barcode, unit FROM nomenklatura 
                WHERE (code = ? AND code != '') OR (artikul = ? AND artikul != '') OR (barcode = ? AND barcode != '')
                LIMIT 1
            """, (code, artikul, barcode))
            row = cur.fetchone()
            if row:
                results.append({
                    "code": row["code"].strip(),
                    "name": row["name"].strip(),
                    "artikul": row["artikul"] or "",
                    "barcode": row["barcode"] or "",
                    "unit": row["unit"] or "əd",
                    "found": True
                })
            else:
                results.append({
                    "code": code,
                    "name": raw_item.get("name") or "",
                    "artikul": artikul,
                    "barcode": barcode,
                    "unit": raw_item.get("unit") or "əd",
                    "found": False
                })
        return {"items": results}
    finally:
        conn.close()

# 12. Get Batch Item Prices
def get_batch_item_prices(payload):
    codes = payload.get("codes", [])
    pt_filter = payload.get("price_types", [])
    if not codes:
        return {"prices": {}}

    conn = get_connection()
    try:
        cur = conn.cursor()
        placeholders = ",".join("?" * len(codes))
        sql = f"SELECT item_code, price_type, price FROM active_prices WHERE item_code IN ({placeholders})"
        cur.execute(sql, [str(c).strip() for c in codes])
        rows = cur.fetchall()

        prices_map = {}
        for r in rows:
            c = r["item_code"].strip()
            pt = r["price_type"].strip()
            if pt_filter and pt not in pt_filter:
                continue
            if c not in prices_map:
                prices_map[c] = {}
            prices_map[c][pt] = float(r["price"] or 0.0)

        return {"prices": prices_map}
    finally:
        conn.close()

# 12b. Get Nomenclature Stock
def get_nomenclature_stock(payload):
    code = str(payload.get("code") or "").strip()
    name = str(payload.get("name") or "").strip()
    return {
        "code": code,
        "name": name,
        "unit": "əd",
        "warehouses": [
            {
                "warehouse": "1.Anbar - AZTRADE (Offline)",
                "warehouse_code": "WH1",
                "characteristic": "",
                "total_stock": 100.0,
                "reserve_stock": 0.0,
                "free_stock": 100.0
            }
        ],
        "prices": [
            {
                "price_type": "80 (Əsas Satış Qiyməti)",
                "price_type_code": "PT1",
                "price": 4.50,
                "currency": "AZN"
            }
        ]
    }

# 13. Get Nomenclature Card
def get_nomenclature_card(payload):
    code = str(payload.get("code") or "").strip()
    name = str(payload.get("name") or "").strip()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT code, name, artikul, barcode, unit, parent 
            FROM nomenklatura 
            WHERE (code = ? AND code != '') OR (name = ? AND name != '') OR (barcode = ? AND barcode != '')
            LIMIT 1
        """, (code, name, code))
        nom = cur.fetchone()
        if not nom:
            return {"card": None}

        c_code = nom["code"].strip()

        # Barcodes
        cur.execute("SELECT barcode FROM barcodes WHERE item_code = ?", (c_code,))
        b_rows = cur.fetchall()
        b_list = [r["barcode"] for r in b_rows]
        if nom["barcode"] and nom["barcode"] not in b_list:
            b_list.insert(0, nom["barcode"])

        # Active prices
        cur.execute("SELECT price_type, price FROM active_prices WHERE item_code = ? ORDER BY price_type", (c_code,))
        p_rows = cur.fetchall()
        prices = [{"type": r["price_type"], "price": float(r["price"] or 0.0)} for r in p_rows]

        # Stock balances
        cur.execute("SELECT sklad, quantity FROM stock_balances WHERE item_code = ?", (c_code,))
        s_rows = cur.fetchall()
        balances = [{"warehouse": r["sklad"], "quantity": float(r["quantity"] or 0.0)} for r in s_rows]

        card = {
            "code": c_code,
            "name": nom["name"].strip(),
            "artikul": nom["artikul"] or "",
            "unit": nom["unit"] or "əd",
            "parent": nom["parent"] or "",
            "barcodes": b_list,
            "prices": prices,
            "balances": balances,
            "units": [{"unit": nom["unit"] or "əd", "ratio": 1.0}]
        }
        return {"card": card}
    finally:
        conn.close()

# 14. Universal Catalog Data
def catalog_data(payload):
    conn = get_connection()
    try:
        cur = conn.cursor()
        cat = payload.get("catalog", "Номенклатура")
        folder = payload.get("folder", "").strip()
        search_q = payload.get("search", "").strip()

        cat_l = cat.lower()
        if "контрагент" in cat_l:
            cur.execute("""
                SELECT code, name, inn, is_group, parent FROM kontragenty 
                WHERE (parent = ? OR ? = '') AND is_group = 0
                ORDER BY name LIMIT 100
            """, (folder, folder))
            items = [{"code": r["code"], "name": r["name"], "inn": r["inn"] or "", "is_folder": False} for r in cur.fetchall()]
            cur.execute("SELECT DISTINCT parent FROM kontragenty WHERE parent IS NOT NULL AND parent != '' ORDER BY parent")
            folders = [{"name": r["parent"], "code": ""} for r in cur.fetchall()]
            return {"catalog": "Контрагенты", "folders": folders, "items": items}

        elif "склад" in cat_l:
            cur.execute("SELECT code, name FROM sklady ORDER BY name")
            items = [{"code": r["code"], "name": r["name"], "is_folder": False} for r in cur.fetchall()]
            return {"catalog": "Склады", "folders": [], "items": items}

        elif any(w in cat_l for w in ["тип цен", "типы цен", "price_type", "типыценноменклатуры"]):
            cur.execute("SELECT code, name FROM price_types ORDER BY name")
            items = [{"code": r["code"], "name": r["name"], "is_folder": False} for r in cur.fetchall()]
            return {"catalog": "Типы цен", "folders": [], "items": items}

        elif any(w in cat_l for w in ["договор", "contract"]):
            cur.execute("SELECT DISTINCT contract FROM documents WHERE contract IS NOT NULL AND contract != '' ORDER BY contract")
            items = [{"code": "", "name": r["contract"], "is_folder": False} for r in cur.fetchall()]
            return {"catalog": "Договоры", "folders": [], "items": items}

        elif any(w in cat_l for w in ["пользовател", "ответственн", "responsible", "user"]):
            cur.execute("SELECT DISTINCT responsible FROM documents WHERE responsible IS NOT NULL AND responsible != '' ORDER BY responsible")
            items = [{"code": "", "name": r["responsible"], "is_folder": False} for r in cur.fetchall()]
            return {"catalog": "Пользователи", "folders": [], "items": items}

        elif any(w in cat_l for w in ["водитель", "водители", "voditel"]):
            cur.execute("SELECT DISTINCT pogruzka_voditel FROM documents WHERE pogruzka_voditel IS NOT NULL AND pogruzka_voditel != '' ORDER BY pogruzka_voditel")
            items = [{"code": "", "name": r["pogruzka_voditel"], "is_folder": False} for r in cur.fetchall()]
            return {"catalog": "Водители", "folders": [], "items": items}

        else: # Номенклатура
            cur.execute("""
                SELECT code, name, artikul, barcode, unit, is_group, parent FROM nomenklatura 
                WHERE (parent = ? OR ? = '') AND is_group = 0
                ORDER BY name LIMIT 100
            """, (folder, folder))
            items = [{
                "code": r["code"].strip(),
                "name": r["name"].strip(),
                "artikul": r["artikul"] or "",
                "barcode": r["barcode"] or "",
                "unit": r["unit"] or "əd",
                "is_folder": False
            } for r in cur.fetchall()]

            cur.execute("""
                SELECT DISTINCT parent FROM nomenklatura 
                WHERE parent IS NOT NULL AND parent != '' AND parent NOT LIKE '!%' 
                ORDER BY parent
            """)
            folders = [{"name": r["parent"].strip(), "code": ""} for r in cur.fetchall()]
            return {"catalog": "Номенклатура", "folders": folders, "items": items}
    finally:
        conn.close()

# 15. Portfolio Catalog Filters
def get_portfolio_catalog_filters():
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT parent FROM nomenklatura 
            WHERE parent IS NOT NULL AND parent != '' AND parent NOT LIKE '!%' 
            ORDER BY parent LIMIT 60
        """)
        portfolios = [r["parent"].strip() for r in cur.fetchall()]

        cur.execute("SELECT name FROM price_types ORDER BY name")
        price_types = [r["name"].strip() for r in cur.fetchall()]

        cur.execute("SELECT name FROM sklady ORDER BY name")
        warehouses = [r["name"].strip() for r in cur.fetchall()]

        return {
            "portfolios": portfolios,
            "groups": portfolios[:30],
            "price_types": price_types if price_types else ["20", "10", "30", "50", "60", "100", "cost"],
            "warehouses": warehouses
        }
    finally:
        conn.close()

# 16. Portfolio Catalog Items
def get_portfolio_catalog_items(payload):
    conn = get_connection()
    try:
        cur = conn.cursor()
        raw_ports = payload.get("portfolios") or []
        if isinstance(raw_ports, str):
            raw_ports = [raw_ports] if raw_ports and raw_ports != "(Все портфели)" else []

        raw_pts = payload.get("price_types") or ["20"]
        if isinstance(raw_pts, str):
            raw_pts = [raw_pts]
        selected_price_types = [str(pt).strip() for pt in raw_pts if str(pt).strip() and str(pt) != "(Без цен)"]

        search_txt = str(payload.get("search") or "").strip().lower()

        sql = "SELECT code, name, artikul, barcode, unit, parent FROM nomenklatura WHERE is_group = 0"
        params = []

        if raw_ports:
            placeholders = ",".join("?" * len(raw_ports))
            sql += f" AND parent IN ({placeholders})"
            params.extend(raw_ports)

        if search_txt:
            sql += " AND (name LIKE ? OR artikul LIKE ? OR code LIKE ? OR barcode LIKE ?)"
            s_param = f"%{search_txt}%"
            params.extend([s_param, s_param, s_param, s_param])

        sql += " ORDER BY name LIMIT 200"
        cur.execute(sql, params)
        nom_rows = cur.fetchall()

        items = []
        for r in nom_rows:
            c = r["code"].strip()
            cur.execute("SELECT price_type, price FROM active_prices WHERE item_code = ?", (c,))
            p_map = {pr["price_type"].strip(): float(pr["price"] or 0.0) for pr in cur.fetchall()}

            items.append({
                "code": c,
                "artikul": r["artikul"] or "",
                "barcode": r["barcode"] or "",
                "name": r["name"].strip(),
                "folder": r["parent"] or "",
                "group": r["parent"] or "",
                "portfolio": r["parent"] or "",
                "unit": r["unit"] or "əd",
                "price": p_map.get(selected_price_types[0], 0.0) if selected_price_types else 0.0,
                "prices": {pt: p_map.get(pt, 0.0) for pt in selected_price_types},
                "manufacturer": "",
                "comment": ""
            })

        return {
            "items": items,
            "price_types": selected_price_types,
            "total": len(items)
        }
    finally:
        conn.close()

# 17. Universal Sales Turnover Query
def universal_sales(payload):
    conn = get_connection()
    try:
        cur = conn.cursor()
        date_start = payload.get("date_start", "2024-01-01")
        date_end = payload.get("date_end", "2026-12-31")
        kontragent = payload.get("kontragent", "").strip().lower()
        nomenklatura = payload.get("nomenklatura", "").strip().lower()
        limit = int(payload.get("limit", 300))

        sql = "SELECT period, item_code, item_name, kontragent, podrazdelenie, quantity, sum, vat FROM sales_turnover WHERE 1=1"
        params = []

        if date_start:
            sql += " AND period >= ?"
            params.append(date_start)
        if date_end:
            sql += " AND period <= ?"
            params.append(date_end)

        if kontragent:
            sql += " AND LOWER(kontragent) LIKE ?"
            params.append(f"%{kontragent}%")

        if nomenklatura:
            sql += " AND (LOWER(item_name) LIKE ? OR LOWER(item_code) LIKE ?)"
            params.extend([f"%{nomenklatura}%", f"%{nomenklatura}%"])

        sql += " ORDER BY period DESC LIMIT ?"
        params.append(limit)

        cur.execute(sql, params)
        rows = cur.fetchall()

        items = []
        for r in rows:
            items.append({
                "period": r["period"],
                "item_code": r["item_code"],
                "item_name": r["item_name"],
                "kontragent": r["kontragent"],
                "department": r["podrazdelenie"],
                "quantity": float(r["quantity"] or 0.0),
                "sum": float(r["sum"] or 0.0),
                "vat": float(r["vat"] or 0.0)
            })

        return {
            "items": items,
            "total": len(items)
        }
    finally:
        conn.close()

# 18. Universal Report (Товары на складах - Offline Real SQLite Data Engine)
def universal_report(payload):
    start_date = payload.get("start_date", "01.09.2026")
    end_date = payload.get("end_date", "30.09.2026")
    filters = payload.get("filters", [])
    raw_pts = payload.get("price_types") or ["20"]
    if isinstance(raw_pts, str):
        raw_pts = [raw_pts]
    selected_price_types = [str(pt).strip() for pt in raw_pts if str(pt).strip() and str(pt) != "(Без цен)"]
    if not selected_price_types:
        selected_price_types = ["20"]

    conn = get_connection()
    try:
        cur = conn.cursor()
        sql = """
            SELECT 
                b.sklad, 
                b.item_code, 
                b.item_name, 
                b.quantity AS end_bal,
                n.artikul, 
                n.barcode, 
                n.unit, 
                n.parent AS folder
            FROM stock_balances b
            LEFT JOIN nomenklatura n ON b.item_code = n.code
            WHERE b.quantity <> 0
        """
        params = []

        # Filter interpretation
        for f in filters:
            if not f.get("active"):
                continue
            field = f.get("field", "")
            comp = f.get("comparison", "equal")
            val = str(f.get("value", "")).strip()

            if "Склад" in field and val:
                sql += " AND b.sklad LIKE ?"
                params.append(f"%{val}%")
            elif "Номенклатура" in field and val:
                sql += " AND (b.item_name LIKE ? OR b.item_code LIKE ? OR n.artikul LIKE ?)"
                params.extend([f"%{val}%", f"%{val}%", f"%{val}%"])
            elif "КоличествоКонечныйОстаток" in field and val:
                try:
                    num_val = float(val.replace(" ", "").replace(",", "."))
                    if comp == "greater":
                        sql += " AND b.quantity > ?"
                    elif comp == "greater_or_equal":
                        sql += " AND b.quantity >= ?"
                    elif comp == "less":
                        sql += " AND b.quantity < ?"
                    elif comp == "less_or_equal":
                        sql += " AND b.quantity <= ?"
                    elif comp == "not_equal":
                        sql += " AND b.quantity <> ?"
                    else:
                        sql += " AND b.quantity = ?"
                    params.append(num_val)
                except Exception:
                    pass

        sql += " ORDER BY b.sklad ASC, b.item_name ASC LIMIT 2500"
        cur.execute(sql, params)
        rows = cur.fetchall()

        # Group by Warehouse
        wh_groups = {}
        for r in rows:
            sk = r["sklad"].strip()
            if sk not in wh_groups:
                wh_groups[sk] = []
            wh_groups[sk].append(r)

        flat_items = []
        global_id = 0
        tot_end_bal = 0.0
        tot_sum = 0.0
        tot_sums = {pt: 0.0 for pt in selected_price_types}

        primary_pt = selected_price_types[0]

        for sk, items_in_sk in wh_groups.items():
            wh_parent_id = global_id
            global_id += 1

            wh_item = {
                "id": wh_parent_id,
                "parent_id": None,
                "level": 0,
                "has_children": True,
                "is_doc": False,
                "title": sk,
                "code": "",
                "artikul": "",
                "barcode_unit": "",
                "barcode_box": "",
                "barcode_block": "",
                "custom_field": "",
                "doc_number": "",
                "doc_date": "",
                "unit_price": 0.0,
                "prices": {pt: 0.0 for pt in selected_price_types},
                "start_bal": 0.0,
                "in_qty": 0.0,
                "out_qty": 0.0,
                "end_bal": 0.0,
                "turnover": 0.0,
                "end_sum": 0.0,
                "sums": {pt: 0.0 for pt in selected_price_types}
            }
            flat_items.append(wh_item)

            wh_qty = 0.0
            wh_sum = 0.0
            wh_sums = {pt: 0.0 for pt in selected_price_types}

            for it in items_in_sk:
                c_id = global_id
                global_id += 1

                c_code = it["item_code"].strip()
                qty = float(it["end_bal"] or 0.0)

                # Fetch active prices
                cur.execute("SELECT price_type, price FROM active_prices WHERE item_code = ?", (c_code,))
                p_rows = cur.fetchall()
                p_map = {pr["price_type"].strip(): float(pr["price"] or 0.0) for pr in p_rows}

                u_price = p_map.get(primary_pt, 0.0)
                item_sum = round(qty * u_price, 2)
                item_sums = {pt: round(qty * p_map.get(pt, 0.0), 2) for pt in selected_price_types}

                wh_qty += qty
                wh_sum += item_sum
                for pt in selected_price_types:
                    wh_sums[pt] += item_sums[pt]

                flat_items.append({
                    "id": c_id,
                    "parent_id": wh_parent_id,
                    "level": 1,
                    "has_children": False,
                    "is_doc": False,
                    "title": it["item_name"].strip(),
                    "code": c_code,
                    "artikul": it["artikul"] or "",
                    "barcode_unit": it["barcode"] or "",
                    "barcode_box": "",
                    "barcode_block": "",
                    "custom_field": "",
                    "doc_number": "",
                    "doc_date": "",
                    "unit_price": u_price,
                    "prices": p_map,
                    "start_bal": 0.0,
                    "in_qty": 0.0,
                    "out_qty": 0.0,
                    "end_bal": qty,
                    "turnover": qty,
                    "end_sum": item_sum,
                    "sums": item_sums
                })

            wh_item["end_bal"] = wh_qty
            wh_item["turnover"] = wh_qty
            wh_item["end_sum"] = wh_sum
            wh_item["sums"] = wh_sums

            tot_end_bal += wh_qty
            tot_sum += wh_sum
            for pt in selected_price_types:
                tot_sums[pt] += wh_sums[pt]

        totals = {
            "start_bal": 0.0,
            "in_qty": 0.0,
            "out_qty": 0.0,
            "end_bal": tot_end_bal,
            "turnover": tot_end_bal,
            "total_sum": tot_sum,
            "total_sums": tot_sums
        }

        return {
            "report_title": "Товары на складах",
            "period": f"{start_date} - {end_date}",
            "items": flat_items,
            "totals": totals,
            "total_count": len(flat_items),
            "total_rows": len(flat_items),
            "price_types": selected_price_types,
            "excel_available": True
        }
    finally:
        conn.close()


# ==============================================================================
# 11. AUDIT & VERSION HISTORY SERVICES (OFFLINE MODE)
# ==============================================================================

def get_audit_list(payload):
    doc_type_filter = payload.get("doc_type", "").strip()
    author_filter = payload.get("author", "").strip()
    search_str = payload.get("search", "").strip().lower()
    date_from = payload.get("date_from")
    date_to = payload.get("date_to")
    limit_count = int(payload.get("limit") or 250)

    norm_from = normalize_iso_datetime(date_from, is_end=False)
    norm_to = normalize_iso_datetime(date_to, is_end=True)

    conn = get_connection()
    try:
        cur = conn.cursor()

        # Ensure audit log table exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS document_audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_type TEXT NOT NULL,
                doc_number TEXT NOT NULL,
                version_num INTEGER NOT NULL DEFAULT 1,
                action_date TEXT NOT NULL,
                author TEXT NOT NULL,
                operation TEXT NOT NULL,
                amount REAL DEFAULT 0.0,
                posted INTEGER DEFAULT 0,
                deleted INTEGER DEFAULT 0,
                comment TEXT DEFAULT '',
                kontragent TEXT DEFAULT '',
                warehouse TEXT DEFAULT '',
                details_json TEXT DEFAULT '{}'
            )
        """)
        conn.commit()

        type_meta = {
            "РеализацияТоваровУслуг": {"table": "documents_realization", "title": "Реализация товаров и услуг", "icon": "🚚"},
            "ВозвратТоваровОтПокупателя": {"table": "documents_vozvrat", "title": "Возврат товаров от покупателя", "icon": "↩️"},
            "ПогрузкиМашин": {"table": "documents_pogruzka", "title": "Погрузка машин", "icon": "📦"},
            "УстановкаЦенНоменклатуры": {"table": "price_documents", "title": "Установка цен номенклатуры", "icon": "🏷️"}
        }

        if doc_type_filter and doc_type_filter in type_meta:
            doc_types_to_query = [doc_type_filter]
        else:
            doc_types_to_query = ["РеализацияТоваровУслуг", "ВозвратТоваровОтПокупателя", "ПогрузкиМашин", "УстановкаЦенНоменклатуры"]

        items = []

        for dtype in doc_types_to_query:
            meta = type_meta[dtype]
            tbl = meta["table"]
            date_col = "doc_date" if tbl == "price_documents" else "date"
            num_col = "doc_number" if tbl == "price_documents" else "number"

            conditions = []
            params = []

            if norm_from:
                conditions.append(f"{date_col} >= ?")
                params.append(norm_from)
            if norm_to:
                conditions.append(f"{date_col} <= ?")
                params.append(norm_to)
            if author_filter:
                conditions.append("responsible LIKE ?")
                params.append(f"%{author_filter}%")
            if search_str:
                if tbl == "price_documents":
                    conditions.append(f"({num_col} LIKE ? OR responsible LIKE ? OR comment LIKE ?)")
                    params.extend([f"%{search_str}%"] * 3)
                elif tbl == "documents_pogruzka":
                    conditions.append(f"({num_col} LIKE ? OR driver LIKE ? OR route LIKE ?)")
                    params.extend([f"%{search_str}%"] * 3)
                else:
                    conditions.append(f"({num_col} LIKE ? OR kontragent LIKE ? OR responsible LIKE ?)")
                    params.extend([f"%{search_str}%"] * 3)

            where_sql = (" WHERE " + " AND ".join(conditions)) if conditions else ""
            query_limit = max(limit_count, 100)
            sql = f"SELECT * FROM {tbl}{where_sql} ORDER BY {date_col} DESC LIMIT {query_limit}"

            cur.execute(sql, params)
            rows = cur.fetchall()

            for r in rows:
                r_dict = dict(r)
                num = str(r_dict.get(num_col) or "").strip()
                if not num:
                    continue
                d_date = format_1c_datetime(r_dict.get(date_col))
                posted = bool(r_dict.get("posted")) if "posted" in r_dict else ("проведен" in str(r_dict.get("status", "")).lower() and "не проведен" not in str(r_dict.get("status", "")).lower())
                deleted = bool(r_dict.get("deleted", 0))
                amt = float(r_dict.get("amount", 0) or 0.0)
                author = (r_dict.get("responsible") or "Keleshov Nasib").strip()
                kontr = ""
                wh = r_dict.get("warehouse", "") or ""
                if tbl == "price_documents":
                    kontr = "Bütün müştərilər (Qiymət təyini)"
                elif tbl == "documents_pogruzka":
                    kontr = f"Sürücü: {r_dict.get('driver', '')} (Marşrut: {r_dict.get('route', '')})"
                else:
                    kontr = r_dict.get("kontragent") or ""

                # Query extra audit logs for this document
                cur.execute("SELECT COUNT(*), MAX(action_date), MAX(author) FROM document_audit_logs WHERE doc_type = ? AND doc_number = ?", (dtype, num))
                audit_stat = cur.fetchone()
                extra_ver_count = audit_stat[0] if audit_stat else 0
                last_action_date = audit_stat[1] if (audit_stat and audit_stat[1]) else d_date
                last_action_author = audit_stat[2] if (audit_stat and audit_stat[2]) else author

                version_count = 1 + extra_ver_count
                if extra_ver_count > 0:
                    last_op = "Redaktə / Dəyişiklik"
                elif posted:
                    last_op = "Təsdiqlənmə (Provodka)"
                else:
                    last_op = "Yaradılma (Qaralama)"

                items.append({
                    "doc_ref_str": f"off_{dtype}_{num}",
                    "doc_type": dtype,
                    "doc_type_title": meta["title"],
                    "icon": meta["icon"],
                    "number": num,
                    "date": d_date,
                    "kontragent": kontr,
                    "warehouse": wh,
                    "amount": amt,
                    "posted": posted,
                    "deleted": deleted,
                    "status": "deleted" if deleted else ("posted" if posted else "draft"),
                    "last_version": version_count,
                    "version_count": version_count,
                    "last_date": last_action_date,
                    "last_author": last_action_author,
                    "last_operation": last_op,
                    "comment": r_dict.get("comment", "") or ""
                })

        # Sort all items by last_date DESC
        items.sort(key=lambda x: x.get("last_date") or x.get("date") or "", reverse=True)
        if limit_count > 0:
            items = items[:limit_count]

        return {
            "items": items,
            "total_count": len(items),
            "period": {
                "date_from": date_from or "",
                "date_to": date_to or ""
            }
        }
    finally:
        conn.close()


def get_audit_diff(payload):
    doc_type = payload.get("doc_type") or "РеализацияТоваровУслуг"
    doc_number = payload.get("number", "").strip()

    conn = get_connection()
    try:
        cur = conn.cursor()

        # Check existing audit logs
        cur.execute("""
            CREATE TABLE IF NOT EXISTS document_audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                doc_type TEXT NOT NULL,
                doc_number TEXT NOT NULL,
                version_num INTEGER NOT NULL DEFAULT 1,
                action_date TEXT NOT NULL,
                author TEXT NOT NULL,
                operation TEXT NOT NULL,
                amount REAL DEFAULT 0.0,
                posted INTEGER DEFAULT 0,
                deleted INTEGER DEFAULT 0,
                comment TEXT DEFAULT '',
                kontragent TEXT DEFAULT '',
                warehouse TEXT DEFAULT '',
                details_json TEXT DEFAULT '{}'
            )
        """)
        conn.commit()

        cur.execute("""
            SELECT * FROM document_audit_logs 
            WHERE doc_type = ? AND doc_number = ? 
            ORDER BY version_num ASC
        """, (doc_type, doc_number))
        audit_rows = cur.fetchall()

        # Fetch current document details from database
        doc_details = None
        try:
            doc_details = get_document_details({"doc_type": doc_type, "number": doc_number})
        except Exception as e:
            pass

        if not doc_details and not audit_rows:
            return {
                "doc_type": doc_type,
                "number": doc_number,
                "date": "",
                "total_versions": 0,
                "versions": [],
                "raw_versions": [],
                "event_timeline": []
            }

        parsed_versions = []
        event_timeline = []

        # Version 1 (Baseline / Initial creation)
        doc_header = (doc_details.get("header") or doc_details) if doc_details else {}
        base_date = doc_header.get("date", "") if doc_header else (audit_rows[0]["action_date"] if audit_rows else "")
        base_author = doc_header.get("responsible", "Keleshov Nasib") if doc_header else (audit_rows[0]["author"] if audit_rows else "Keleshov Nasib")
        base_amount = float(doc_header.get("amount", 0) or 0.0) if doc_header else (audit_rows[0]["amount"] if audit_rows else 0.0)
        base_posted = bool(doc_header.get("posted", False)) if doc_header else bool(audit_rows[0]["posted"] if audit_rows else False)
        base_deleted = bool(doc_header.get("deleted", False)) if doc_header else bool(audit_rows[0]["deleted"] if audit_rows else False)
        base_comment = str(doc_header.get("comment", "") or "") if doc_header else (audit_rows[0]["comment"] if audit_rows else "")
        base_kontr = str(doc_header.get("kontragent", "") or "") if doc_header else (audit_rows[0]["kontragent"] if audit_rows else "")
        base_wh = str(doc_header.get("warehouse", "") or "") if doc_header else (audit_rows[0]["warehouse"] if audit_rows else "")
        base_contract = str(doc_header.get("contract", "") or "") if doc_header else ""
        base_driver = str(doc_header.get("driver", "") or doc_header.get("voditel", "") or "")
        base_route = str(doc_header.get("route", "") or doc_header.get("marshrut", "") or "")
        base_items = []

        if doc_details and "items" in doc_details:
            for it in doc_details["items"]:
                qty = float(it.get("quantity") or it.get("qty") or 0.0)
                pr = float(it.get("price") or 0.0)
                sm = float(it.get("amount") or it.get("sum") or it.get("total") or (qty * pr))
                base_items.append({
                    "code": it.get("code") or "",
                    "article": it.get("artikul") or "",
                    "name": it.get("name") or "",
                    "unit": it.get("unit") or "əd",
                    "qty": qty,
                    "price": pr,
                    "total": sm
                })

        parsed_versions.append({
            "version": 1,
            "author": base_author,
            "change_date": audit_rows[0]["action_date"] if audit_rows else base_date,
            "action_date": audit_rows[0]["action_date"] if audit_rows else base_date,
            "doc_date": base_date,
            "date": base_date,
            "amount": base_amount,
            "posted": base_posted,
            "deleted": base_deleted,
            "comment": base_comment,
            "kontragent": base_kontr,
            "warehouse": base_wh,
            "contract": base_contract,
            "driver": base_driver,
            "route": base_route,
            "items_count": len(base_items),
            "items": base_items
        })

        order_idx = 1
        event_timeline.append({
            "order": order_idx,
            "date": base_date,
            "datetime": base_date,
            "user": base_author,
            "action": "Yaradıldı",
            "action_type": "Yaradılma",
            "badge_class": "blue",
            "doc_status": "Qaralama" if not base_posted else "Təsdiqləndi",
            "result": "Sənəd açıldı və yadda saxlanıldı.",
            "comment": base_comment
        })

        if base_posted:
            order_idx += 1
            event_timeline.append({
                "order": order_idx,
                "date": base_date,
                "datetime": base_date,
                "user": base_author,
                "action": "Təsdiqləndi",
                "action_type": "Təsdiq",
                "badge_class": "green",
                "doc_status": "Təsdiqləndi",
                "result": "Sənəd 1C-də təsdiqləndi (Provodka edildi).",
                "comment": "1C dövriyyəsinə daxil edildi"
            })

        # Append historical modified versions if stored in audit_rows
        import json
        for a_row in audit_rows:
            v_idx = len(parsed_versions) + 1
            a_items = []
            try:
                dt_obj = json.loads(a_row["details_json"] or "{}")
                if "items" in dt_obj and isinstance(dt_obj["items"], list):
                    for it in dt_obj["items"]:
                        a_items.append({
                            "code": it.get("code") or "",
                            "article": it.get("article") or "",
                            "name": it.get("name") or "",
                            "unit": it.get("unit") or "əd",
                            "qty": float(it.get("qty") or 0.0),
                            "price": float(it.get("price") or 0.0),
                            "total": float(it.get("total") or 0.0)
                        })
            except Exception:
                a_items = base_items

            doc_d = dt_obj.get("doc_date") or dt_obj.get("date") or base_date
            if doc_d == a_row["action_date"] and base_date:
                doc_d = base_date

            parsed_versions.append({
                "version": v_idx,
                "author": a_row["author"] or "Nesib",
                "change_date": a_row["action_date"],
                "action_date": a_row["action_date"],
                "doc_date": doc_d,
                "date": doc_d,
                "amount": float(a_row["amount"] or 0.0),
                "posted": bool(a_row["posted"]),
                "deleted": bool(a_row["deleted"]),
                "comment": a_row["comment"] or "",
                "kontragent": a_row["kontragent"] or base_kontr,
                "warehouse": a_row["warehouse"] or base_wh,
                "driver": "",
                "route": "",
                "items_count": len(a_items),
                "items": a_items
            })

            order_idx += 1
            op_raw = (a_row["operation"] or "").lower()
            is_del = bool(a_row["deleted"]) or "sil" in op_raw or "пометк" in op_raw
            is_post = bool(a_row["posted"]) or "провед" in op_raw or "təsdiq" in op_raw
            if is_del:
                act = "Silindi"
                act_type = "Silinmə"
                b_class = "red"
                d_st = "Silindi"
                res_txt = "Sənəd 1C-dən silindi."
            elif is_post and not is_del:
                act = "Təsdiqləndi"
                act_type = "Təsdiq"
                b_class = "green"
                d_st = "Təsdiqləndi"
                res_txt = "Sənəd 1C-də təsdiqləndi."
            elif not is_post and not is_del and "ləğv" in op_raw:
                act = "Təsdiq ləğv edildi"
                act_type = "Təsdiq ləğvi"
                b_class = "orange"
                d_st = "Qaralama"
                res_txt = "Təsdiq ləğv edildi, sənəd qaralamaya qaytarıldı."
            else:
                act = "Dəyişdirildi"
                act_type = "Redaktə"
                b_class = "orange"
                d_st = "Təsdiqləndi" if a_row["posted"] else "Qaralama"
                res_txt = a_row["comment"] or "Sənəd rekvizitləri və ya mallar dəyişdirildi."

            event_timeline.append({
                "order": order_idx,
                "date": a_row["action_date"],
                "datetime": a_row["action_date"],
                "user": a_row["author"] or "Nesib",
                "action": act,
                "action_type": act_type,
                "badge_class": b_class,
                "doc_status": d_st,
                "result": res_txt,
                "comment": a_row["comment"] or ""
            })

        # Calculate Diffs between each consecutive version (v1 -> v2 ...)
        version_diffs = []
        for i in range(len(parsed_versions)):
            cur_v = parsed_versions[i]
            prev_v = parsed_versions[i - 1] if i > 0 else None

            field_diffs = []
            item_diffs = {"added": [], "removed": [], "modified": []}

            if prev_v is None:
                # First version
                operation = "İlkin yaradılma (Baza versiyası)"
                field_diffs.append({"field": "СуммаДокумента", "label": "Məbləğ", "old_val": "—", "new_val": f"{cur_v['amount']:.2f} AZN"})
                field_diffs.append({"field": "Проведен", "label": "Status", "old_val": "—", "new_val": "✔ Təsdiqlənib (Provodka)" if cur_v["posted"] else "📄 Qaralama"})
                if cur_v.get("kontragent"):
                    field_diffs.append({"field": "Контрагент", "label": "Müştəri / Tərəf-müqabili", "old_val": "—", "new_val": cur_v["kontragent"]})
                if cur_v.get("warehouse"):
                    field_diffs.append({"field": "Склад", "label": "Anbar", "old_val": "—", "new_val": cur_v["warehouse"]})
                if cur_v.get("comment"):
                    field_diffs.append({"field": "Комментарий", "label": "Qeyd / Şərh", "old_val": "—", "new_val": cur_v["comment"]})

                # Initial version: all rows are newly added
                item_diffs["added"] = cur_v["items"]
            else:
                # Modification
                operation = "Sənəd redaktəsi və dəyişikliklər"
                if abs(cur_v["amount"] - prev_v["amount"]) > 0.001:
                    field_diffs.append({
                        "field": "СуммаДокумента",
                        "label": "Məbləğ",
                        "old_val": f"{prev_v['amount']:.2f} AZN",
                        "new_val": f"{cur_v['amount']:.2f} AZN",
                        "diff": cur_v["amount"] - prev_v["amount"]
                    })
                if cur_v["posted"] != prev_v["posted"]:
                    operation = "Təsdiqlənmə (Provodka)" if cur_v["posted"] else "Təsdiqin ləğvi (Qaralamaya keçid)"
                    field_diffs.append({
                        "field": "Проведен",
                        "label": "Status",
                        "old_val": "✔ Təsdiqlənib" if prev_v["posted"] else "📄 Qaralama",
                        "new_val": "✔ Təsdiqlənib" if cur_v["posted"] else "📄 Qaralama"
                    })
                if cur_v["deleted"] != prev_v["deleted"]:
                    operation = "Pozulma nişanı qoyuldu" if cur_v["deleted"] else "Pozulma nişanı götürüldü"
                    field_diffs.append({
                        "field": "ПометкаУдаления",
                        "label": "Pozulma nişanı",
                        "old_val": "Bəli" if prev_v["deleted"] else "Xeyr",
                        "new_val": "Bəli" if cur_v["deleted"] else "Xeyr"
                    })
                if cur_v.get("warehouse") != prev_v.get("warehouse") and (cur_v.get("warehouse") or prev_v.get("warehouse")):
                    field_diffs.append({
                        "field": "Склад",
                        "label": "Anbar",
                        "old_val": prev_v.get("warehouse") or "—",
                        "new_val": cur_v.get("warehouse") or "—"
                    })
                if cur_v.get("comment") != prev_v.get("comment") and (cur_v.get("comment") or prev_v.get("comment")):
                    field_diffs.append({
                        "field": "Комментарий",
                        "label": "Qeyd / Şərh",
                        "old_val": prev_v.get("comment") or "—",
                        "new_val": cur_v.get("comment") or "—"
                    })

                # Diff table lines
                old_map = {it["code"] or it["name"]: it for it in prev_v["items"]}
                new_map = {it["code"] or it["name"]: it for it in cur_v["items"]}

                for key, n_it in new_map.items():
                    if key not in old_map:
                        item_diffs["added"].append(n_it)
                    else:
                        o_it = old_map[key]
                        qty_diff = abs(n_it["qty"] - o_it["qty"]) > 0.0001
                        pr_diff = abs(n_it["price"] - o_it["price"]) > 0.001
                        tot_diff = abs(n_it["total"] - o_it["total"]) > 0.001
                        if qty_diff or pr_diff or tot_diff:
                            item_diffs["modified"].append({
                                "name": n_it["name"],
                                "code": n_it["code"],
                                "old_qty": o_it["qty"],
                                "new_qty": n_it["qty"],
                                "old_price": o_it["price"],
                                "new_price": n_it["price"],
                                "old_total": o_it["total"],
                                "new_total": n_it["total"]
                            })

                for key, o_it in old_map.items():
                    if key not in new_map:
                        item_diffs["removed"].append(o_it)

                if not field_diffs and not item_diffs["added"] and not item_diffs["removed"] and not item_diffs["modified"]:
                    operation = "Dəyişikliksiz təkrar saxlanılma"
                    field_diffs.append({
                        "field": "Məlumat",
                        "label": "Məlumat",
                        "old_val": "Mallar və rekvizitlər dəyişməyib",
                        "new_val": "Sənəd yenidən saxlanılıb"
                    })

            version_diffs.append({
                "version": cur_v["version"],
                "author": cur_v["author"],
                "date": cur_v["date"],
                "operation": operation,
                "amount": cur_v["amount"],
                "posted": cur_v["posted"],
                "deleted": cur_v["deleted"],
                "field_diffs": field_diffs,
                "item_diffs": item_diffs,
                "total_items": cur_v["items_count"]
            })

        return {
            "doc_type": doc_type,
            "number": doc_number,
            "date": base_date,
            "kontragent": base_kontr,
            "warehouse": base_wh,
            "contract": base_contract,
            "amount": base_amount,
            "posted": base_posted,
            "deleted": base_deleted,
            "total_versions": len(parsed_versions),
            "versions": version_diffs,
            "raw_versions": parsed_versions,
            "event_timeline": event_timeline
        }
    finally:
        conn.close()


