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

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "offline_1c_data.db")

def is_offline_db_ready():
    return os.path.exists(DB_PATH) and os.path.getsize(DB_PATH) > 1024

def get_connection():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

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
    search_str = payload.get("search", "").strip().lower()
    date_from = payload.get("date_from", "").strip()
    date_to = payload.get("date_to", "").strip()

    conn = get_connection()
    try:
        cur = conn.cursor()

        # 1. Установка цен номенклатуры
        if doc_type == "УстановкаЦенНоменклатуры":
            sql = "SELECT doc_number, doc_date, comment, responsible, status FROM price_documents"
            conditions = []
            params = []
            if date_from:
                conditions.append("doc_date >= ?")
                params.append(date_from)
            if date_to:
                conditions.append("doc_date <= ?")
                params.append(date_to + " 23:59:59")
            if conditions:
                sql += " WHERE " + " AND ".join(conditions)
            if limit_count and limit_count > 0:
                sql += " ORDER BY doc_date DESC LIMIT ?"
                params.append(limit_count)
            else:
                sql += " ORDER BY doc_date DESC"
            cur.execute(sql, params)
            rows = cur.fetchall()

            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 135, "align": "left"},
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
                    "date": r["doc_date"],
                    "responsible": r["responsible"] or "Keleshov Nasib",
                    "comment": r["comment"] or "",
                    "posted": posted,
                    "deleted": False,
                    "status": "posted" if posted else "draft"
                }
                if search_str:
                    target = f"{item['number']} {item['date']} {item['responsible']} {item['comment']}".lower()
                    if search_str not in target:
                        continue
                items.append(item)

            return {
                "doc_type": "УстановкаЦенНоменклатуры",
                "doc_title": "Установка цен номенклатуры",
                "columns": columns,
                "items": items,
                "total": len(items)
            }

        # 2. Реализация товаров и услуг (Sales Documents)
        elif doc_type == "РеализацияТоваровУслуг":
            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 125, "align": "left"},
                {"key": "number", "label": "Номер", "width": 115, "align": "left"},
                {"key": "kontragent", "label": "Контрагент", "width": 240, "align": "left"},
                {"key": "kontragent_code", "label": "Код контрагента", "width": 115, "align": "left"},
                {"key": "amount", "label": "Сумма", "width": 100, "align": "right"},
                {"key": "warehouse", "label": "Склад", "width": 160, "align": "left"},
                {"key": "deal", "label": "Номер заказа", "width": 120, "align": "left"},
                {"key": "obrabotka_number", "label": "Номер обработки", "width": 125, "align": "left"},
                {"key": "vms_status", "label": "Статус ВМС", "width": 135, "align": "left"},
                {"key": "contract", "label": "Договор", "width": 150, "align": "left"},
                {"key": "portfolio", "label": "Портфель", "width": 140, "align": "left"},
                {"key": "contract_price_type", "label": "Тип цен договора", "width": 130, "align": "left"},
                {"key": "pogruzka_marshrut", "label": "Пагрузка маршрут", "width": 130, "align": "left"},
                {"key": "pogruzka_voditel", "label": "Пагрузка водитель", "width": 150, "align": "left"},
                {"key": "responsible", "label": "Ответственный", "width": 130, "align": "left"},
                {"key": "comment", "label": "Комментарий", "width": 200, "align": "left"}
            ]

            sql = """
                SELECT 
                    MIN(id) AS min_id,
                    period,
                    kontragent,
                    podrazdelenie,
                    COUNT(*) AS item_cnt,
                    ROUND(SUM(sum), 2) AS tot_sum
                FROM sales_turnover
                WHERE kontragent IS NOT NULL AND kontragent != ''
            """
            conditions = []
            params = []
            if date_from:
                conditions.append("period >= ?")
                params.append(date_from)
            if date_to:
                conditions.append("period <= ?")
                params.append(date_to)

            if conditions:
                sql += " AND " + " AND ".join(conditions)

            sql += " GROUP BY period, kontragent ORDER BY period DESC, min_id DESC"
            if limit_count and limit_count > 0:
                sql += " LIMIT ?"
                params.append(limit_count)

            cur.execute(sql, params)
            rows = cur.fetchall()

            items = []
            for r in rows:
                doc_num = f"C00004{r['min_id']:05d}"
                dt_str = f"{r['period']} 12:00:00"
                amount_val = float(r["tot_sum"] or 0.0)
                port_val = "01 MONDELEZ" if (r['min_id'] % 2 == 0) else "04 FERRERO"
                noms_arr = ["Шоколад Milka", "Печенье Oreo"] if (r['min_id'] % 2 == 0) else ["Raffaello", "Nutella"]
                nom_keys_arr = [
                    "00000008530|8530|art8530|шоколад milka",
                    "00000008531|8531|art8531|печенье oreo"
                ] if (r['min_id'] % 2 == 0) else [
                    "00000009101|9101|art9101|raffaello",
                    "00000009102|9102|art9102|nutella"
                ]
                item = {
                    "number": doc_num,
                    "date": dt_str,
                    "kontragent": r["kontragent"],
                    "kontragent_code": f"C{r['min_id']:08d}",
                    "amount": amount_val,
                    "warehouse": "1.Anbar - AZTRADE",
                    "deal": f"C00044{r['min_id']:04d}",
                    "obrabotka_number": f"00001{r['min_id']:04d}",
                    "vms_status": "Подтвержден WMS",
                    "contract": "Основной договор",
                    "portfolio": port_val,
                    "contract_price_type": "60",
                    "pogruzka_marshrut": "5329",
                    "pogruzka_voditel": "99JP085",
                    "agent": r["podrazdelenie"] or "Основное подразделение",
                    "responsible": "Ali",
                    "comment": f"Продажа товаров ({r['item_cnt']} поз.)",
                    "nomenclatures": noms_arr,
                    "nomenclature": ", ".join(noms_arr),
                    "nom_keys": nom_keys_arr,
                    "posted": True,
                    "deleted": False,
                    "status": "posted"
                }
                if search_str:
                    target = f"{item['number']} {item['date']} {item['kontragent']} {item['kontragent_code']} {item['deal']} {item['obrabotka_number']} {item['vms_status']} {item['pogruzka_marshrut']} {item['pogruzka_voditel']}".lower()
                    if search_str not in target:
                        continue
                items.append(item)

            return {
                "doc_type": "РеализацияТоваровУслуг",
                "doc_title": "Реализация товаров и услуг",
                "columns": columns,
                "items": items,
                "total": len(items)
            }

        # 3. Поступление товаров и услуг (Purchase Documents)
        elif doc_type == "ПоступлениеТоваровУслуг":
            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 135, "align": "left"},
                {"key": "number", "label": "Номер", "width": 125, "align": "left"},
                {"key": "kontragent", "label": "Контрагент", "width": 260, "align": "left"},
                {"key": "warehouse", "label": "Склад", "width": 160, "align": "left"},
                {"key": "amount", "label": "Сумма", "width": 110, "align": "right"},
                {"key": "responsible", "label": "Ответственный", "width": 140, "align": "left"},
                {"key": "comment", "label": "Комментарий", "width": 220, "align": "left"}
            ]

            k_sql = "SELECT code, name FROM kontragenty WHERE is_group = 0 AND name NOT LIKE '%физ%' ORDER BY code ASC"
            k_params = ()
            if limit_count and limit_count > 0:
                k_sql += " LIMIT ?"
                k_params = (limit_count,)
            cur.execute(k_sql, k_params)
            k_rows = cur.fetchall()

            cur.execute("SELECT name FROM sklady LIMIT 10")
            wh_rows = [r["name"] for r in cur.fetchall()]
            if not wh_rows:
                wh_rows = ["1.Anbar - AZTRADE"]

            items = []
            base_date = datetime.date(2026, 9, 1)
            for i, kr in enumerate(k_rows):
                cur_date = base_date + datetime.timedelta(days=(i % 28))
                doc_num = f"ПТ-{i+1:08d}"
                dt_str = cur_date.strftime("%Y-%m-%d 10:30:00")
                wh_name = wh_rows[i % len(wh_rows)]
                amt = round(1500.0 + (i * 342.5 % 8500), 2)
                item = {
                    "number": doc_num,
                    "date": dt_str,
                    "kontragent": kr["name"],
                    "warehouse": wh_name,
                    "amount": amt,
                    "responsible": "Keleshov Nasib",
                    "comment": "Поступление товаров от поставщика",
                    "posted": True,
                    "deleted": False,
                    "status": "posted"
                }
                if search_str:
                    target = f"{item['number']} {item['date']} {item['kontragent']} {item['warehouse']}".lower()
                    if search_str not in target:
                        continue
                items.append(item)

            return {
                "doc_type": "ПоступлениеТоваровУслуг",
                "doc_title": "Поступление товаров и услуг",
                "columns": columns,
                "items": items,
                "total": len(items)
            }

        # 4. Заказ покупателя (Customer Orders)
        elif doc_type == "ЗаказПокупателя":
            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 135, "align": "left"},
                {"key": "number", "label": "Номер", "width": 125, "align": "left"},
                {"key": "kontragent", "label": "Контрагент", "width": 260, "align": "left"},
                {"key": "amount", "label": "Сумма", "width": 110, "align": "right"},
                {"key": "responsible", "label": "Ответственный", "width": 140, "align": "left"},
                {"key": "comment", "label": "Комментарий", "width": 220, "align": "left"}
            ]

            cur.execute("""
                SELECT MIN(id) AS min_id, period, kontragent, ROUND(SUM(sum), 2) AS tot_sum 
                FROM sales_turnover 
                WHERE kontragent != '' 
                GROUP BY period, kontragent 
                ORDER BY period ASC LIMIT ?
            """, (min(limit_count, 120),))
            rows = cur.fetchall()

            items = []
            for r in rows:
                doc_num = f"ЗК-{r['min_id']:08d}"
                dt_str = f"{r['period']} 09:15:00"
                item = {
                    "number": doc_num,
                    "date": dt_str,
                    "kontragent": r["kontragent"],
                    "amount": float(r["tot_sum"] or 0.0),
                    "responsible": "Keleshov Nasib",
                    "comment": "Заказ клиента на поставку",
                    "posted": True,
                    "deleted": False,
                    "status": "posted"
                }
                if search_str:
                    target = f"{item['number']} {item['date']} {item['kontragent']}".lower()
                    if search_str not in target:
                        continue
                items.append(item)

            return {
                "doc_type": "ЗаказПокупателя",
                "doc_title": "Заказ покупателя",
                "columns": columns,
                "items": items,
                "total": len(items)
            }

        # 5. Инвентаризация товаров на складе (Warehouse Inventory)
        elif doc_type == "ИнвентаризацияТоваровНаСкладе":
            columns = [
                {"key": "status", "label": "", "width": 30, "align": "center"},
                {"key": "date", "label": "Дата", "width": 135, "align": "left"},
                {"key": "number", "label": "Номер", "width": 125, "align": "left"},
                {"key": "warehouse", "label": "Склад", "width": 240, "align": "left"},
                {"key": "responsible", "label": "Ответственный", "width": 150, "align": "left"},
                {"key": "comment", "label": "Комментарий", "width": 260, "align": "left"}
            ]

            cur.execute("SELECT name FROM sklady ORDER BY name LIMIT ?", (min(limit_count, 80),))
            sk_rows = cur.fetchall()

            items = []
            base_date = datetime.date(2026, 9, 30)
            for i, sr in enumerate(sk_rows):
                doc_num = f"ИН-{i+1:08d}"
                dt_str = (base_date - datetime.timedelta(days=(i * 3 % 25))).strftime("%Y-%m-%d 18:00:00")
                item = {
                    "number": doc_num,
                    "date": dt_str,
                    "warehouse": sr["name"],
                    "responsible": "Keleshov Nasib",
                    "comment": "Плановая инвентаризация остатков",
                    "posted": True,
                    "deleted": False,
                    "status": "posted"
                }
                if search_str:
                    target = f"{item['number']} {item['date']} {item['warehouse']}".lower()
                    if search_str not in target:
                        continue
                items.append(item)

            return {
                "doc_type": "ИнвентаризацияТоваровНаСкладе",
                "doc_title": "Инвентаризация товаров на складе",
                "columns": columns,
                "items": items,
                "total": len(items)
            }

        # 6. Default Fallback for other documents (Списание, Оприходование və s.)
        else:
            title_map = {
                "СписаниеТоваров": "Списание товаров",
                "ОприходованиеТоваров": "Оприходование товаров"
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

            cur.execute("SELECT name FROM sklady LIMIT 20")
            sk_rows = [r["name"] for r in cur.fetchall()] or ["1.Anbar - AZTRADE"]

            items = []
            for i in range(1, 21):
                doc_num = f"{doc_type[:2].upper()}-{i:08d}"
                dt_str = f"2026-09-{i:02d} 14:00:00"
                item = {
                    "number": doc_num,
                    "date": dt_str,
                    "warehouse": sk_rows[i % len(sk_rows)],
                    "amount": round(120.0 + (i * 85.5), 2),
                    "responsible": "Keleshov Nasib",
                    "comment": f"Документ {doc_title}",
                    "posted": True,
                    "deleted": False,
                    "status": "posted"
                }
                items.append(item)

            return {
                "doc_type": doc_type,
                "doc_title": doc_title,
                "columns": columns,
                "items": items,
                "total": len(items)
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

        # Handle Sales Document details from sales_turnover
        if doc_type == "РеализацияТоваровУслуг":
            # Extract id or find by number pattern
            m = re.search(r'\d+', doc_number)
            min_id = int(m.group(0)) if m else 1

            cur.execute("SELECT period, kontragent, podrazdelenie FROM sales_turnover WHERE id = ?", (min_id,))
            target_row = cur.fetchone()
            if not target_row:
                cur.execute("SELECT period, kontragent, podrazdelenie FROM sales_turnover LIMIT 1")
                target_row = cur.fetchone()

            if not target_row:
                raise ValueError(f"Sənəd №{doc_number} tapılmadı")

            period = target_row["period"]
            kontr = target_row["kontragent"]

            cur.execute("""
                SELECT item_code, item_name, quantity, sum, vat 
                FROM sales_turnover 
                WHERE period = ? AND kontragent = ?
                ORDER BY id ASC
            """, (period, kontr))
            rows = cur.fetchall()

            doc_items = []
            tot_sum = 0.0
            tot_vat = 0.0
            for idx, r in enumerate(rows, 1):
                qty = float(r["quantity"] or 1)
                sm = float(r["sum"] or 0)
                pr = round(sm / qty, 2) if qty != 0 else sm
                vt = float(r["vat"] or 0)
                tot_sum += sm
                tot_vat += vt
                doc_items.append({
                    "line_num": idx,
                    "code": r["item_code"],
                    "artikul": "",
                    "name": r["item_name"],
                    "unit": "əd",
                    "coefficient": 1.0,
                    "quantity": qty,
                    "price": pr,
                    "sum": sm,
                    "vat_rate": "18%" if vt > 0 else "Без НДС",
                    "vat_sum": vt,
                    "total": round(sm + vt, 2)
                })

            return {
                "doc_type": "РеализацияТоваровУслуг",
                "doc_title": "Реализация товаров и услуг",
                "header": {
                    "number": doc_number,
                    "date": f"{period} 12:00:00",
                    "posted": True,
                    "organization": "Aztrade MMC",
                    "kontragent": kontr,
                    "contract": f"Договор поставки ({kontr[:25]})",
                    "warehouse": "Основной склад",
                    "price_type": "Оптовая",
                    "currency": "AZN",
                    "amount": round(tot_sum + tot_vat, 2),
                    "total_vat": round(tot_vat, 2),
                    "responsible": "Emin",
                    "comment": f"Продажа товаров ({len(doc_items)} поз.)"
                },
                "lines": doc_items,
                "total_lines": len(doc_items)
            }

        else:
            # Generic document details from stock_balances or items
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
                "manufacturer": ""
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

