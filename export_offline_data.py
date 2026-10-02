# -*- coding: utf-8 -*-
"""
Export 1C Test Database to local SQLite for offline development and reporting.
Destination: data/offline_1c_data.db
"""
import sys
import os
import time
import sqlite3

# Set utf-8 output
sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "offline_1c_data.db")

def init_sqlite_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
        except Exception:
            pass
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # 1. Nomenklatura
    cur.execute("""
        CREATE TABLE IF NOT EXISTS nomenklatura (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            artikul TEXT,
            barcode TEXT,
            unit TEXT,
            parent TEXT,
            is_group INTEGER DEFAULT 0
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_nom_name ON nomenklatura(name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_nom_artikul ON nomenklatura(artikul)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_nom_barcode ON nomenklatura(barcode)")

    # 2. Kontragenty
    cur.execute("""
        CREATE TABLE IF NOT EXISTS kontragenty (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            inn TEXT,
            parent TEXT,
            is_group INTEGER DEFAULT 0
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_kontr_name ON kontragenty(name)")

    # 3. Sklady
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sklady (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL
        )
    """)

    # 4. Price Types
    cur.execute("""
        CREATE TABLE IF NOT EXISTS price_types (
            code TEXT,
            name TEXT PRIMARY KEY
        )
    """)

    # 5. Active Prices (СрезПоследних)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS active_prices (
            item_code TEXT,
            price_type TEXT,
            price REAL,
            PRIMARY KEY (item_code, price_type)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_act_price_item ON active_prices(item_code)")

    # 6. Barcodes
    cur.execute("""
        CREATE TABLE IF NOT EXISTS barcodes (
            item_code TEXT,
            barcode TEXT PRIMARY KEY
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_bc_item ON barcodes(item_code)")

    # 7. Price Documents Headers
    cur.execute("""
        CREATE TABLE IF NOT EXISTS price_documents (
            doc_number TEXT PRIMARY KEY,
            doc_date TEXT,
            comment TEXT,
            responsible TEXT,
            status TEXT
        )
    """)

    # 8. Price Documents Rows
    cur.execute("""
        CREATE TABLE IF NOT EXISTS price_document_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_number TEXT,
            item_code TEXT,
            item_name TEXT,
            unit TEXT,
            price_type TEXT,
            price REAL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_pdr_doc ON price_document_rows(doc_number)")

    # 9. Sales Turnover (ПродажиОбороты)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS sales_turnover (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period TEXT,
            item_code TEXT,
            item_name TEXT,
            kontragent TEXT,
            podrazdelenie TEXT,
            quantity REAL,
            sum REAL,
            vat REAL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_period ON sales_turnover(period)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_kontr ON sales_turnover(kontragent)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sales_item ON sales_turnover(item_code)")

    # 10. Stock Balances (ТоварыНаСкладах)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS stock_balances (
            sklad TEXT,
            item_code TEXT,
            item_name TEXT,
            quantity REAL,
            PRIMARY KEY (sklad, item_code)
        )
    """)

    conn.commit()
    return conn

def run_export():
    import win32com.client
    import pythoncom

    pythoncom.CoInitialize()
    connector = win32com.client.Dispatch("V83.COMConnector")
    
    server = "Test1C"
    base = "Aztrade_test3"
    user = "Nesib"
    pwd = "15963"
    conn_str = f'Srvr="{server}";Ref="{base}";Usr="{user}";Pwd="{pwd}";'
    
    print(f"Connecting to 1C [{server} / {base}] as {user}...", flush=True)
    t0 = time.time()
    try:
        conn_1c = connector.Connect(conn_str)
        print(f"1C Connection established in {time.time() - t0:.2f}s!", flush=True)
    except Exception as e:
        print(f"Connection failed: {e}", flush=True)
        return

    sqlite_conn = init_sqlite_db()
    cur = sqlite_conn.cursor()

    # Helper function to execute 1C query
    def exec_1c_query(query_text):
        q = conn_1c.NewObject("Запрос")
        q.Text = query_text
        return q.Выполнить().Выбрать()

    # -------------------------------------------------------------
    # 1. Export Price Types
    # -------------------------------------------------------------
    print("\n[1/8] Exporting Price Types (ТипыЦен)...", flush=True)
    t_start = time.time()
    try:
        sel = exec_1c_query("ВЫБРАТЬ Код, Наименование ИЗ Справочник.ТипыЦенНоменклатуры ГДЕ НЕ ПометкаУдаления")
        count = 0
        rows = []
        while sel.Следующий():
            code = str(sel.Код or "").strip()
            name = str(sel.Наименование or "").strip()
            if name:
                rows.append((code, name))
                count += 1
        cur.executemany("INSERT OR REPLACE INTO price_types (code, name) VALUES (?, ?)", rows)
        sqlite_conn.commit()
        print(f"  -> {count} qiymet novu export edildi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Price Types error: {e}", flush=True)

    # -------------------------------------------------------------
    # 2. Export Sklady (Warehouses)
    # -------------------------------------------------------------
    print("\n[2/8] Exporting Warehouses (Склады)...", flush=True)
    t_start = time.time()
    try:
        sel = exec_1c_query("ВЫБРАТЬ Код, Наименование ИЗ Справочник.Склады ГДЕ НЕ ПометкаУдаления")
        count = 0
        rows = []
        while sel.Следующий():
            code = str(sel.Код or "").strip()
            name = str(sel.Наименование or "").strip()
            if name:
                rows.append((code, name))
                count += 1
        cur.executemany("INSERT OR REPLACE INTO sklady (code, name) VALUES (?, ?)", rows)
        sqlite_conn.commit()
        print(f"  -> {count} anbar export edildi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Sklady error: {e}", flush=True)

    # -------------------------------------------------------------
    # 3. Export Barcodes (Штрихкоды)
    # -------------------------------------------------------------
    print("\n[3/8] Exporting Barcodes (Штрихкоды)...", flush=True)
    t_start = time.time()
    barcode_map = {}
    try:
        sel = exec_1c_query("""
            ВЫБРАТЬ
                Ш.Владелец.Код КАК item_code,
                Ш.Штрихкод КАК barcode
            ИЗ
                РегистрСведений.Штрихкоды КАК Ш
        """)
        count = 0
        rows = []
        while sel.Следующий():
            ic = str(sel.item_code or "").strip()
            bc = str(sel.barcode or "").strip()
            if ic and bc:
                rows.append((ic, bc))
                if ic not in barcode_map:
                    barcode_map[ic] = bc
                count += 1
        cur.executemany("INSERT OR REPLACE INTO barcodes (item_code, barcode) VALUES (?, ?)", rows)
        sqlite_conn.commit()
        print(f"  -> {count:,} strixkod export edildi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Barcodes error: {e}", flush=True)

    # -------------------------------------------------------------
    # 4. Export Nomenclature (Номенклатура)
    # -------------------------------------------------------------
    print("\n[4/8] Exporting Nomenclature (Номенклатура)...", flush=True)
    t_start = time.time()
    try:
        sel = exec_1c_query("""
            ВЫБРАТЬ
                Ном.Код КАК code,
                Ном.Наименование КАК name,
                Ном.Артикул КАК artikul,
                ЕСТЬNULL(Ном.БазоваяЕдиницаИзмерения.Наименование, "əd") КАК unit,
                ЕСТЬNULL(Ном.Родитель.Наименование, "") КАК parent,
                Ном.ЭтоГруппа КАК is_group
            ИЗ
                Справочник.Номенклатура КАК Ном
            ГДЕ
                НЕ Ном.ПометкаУдаления
        """)
        count = 0
        rows = []
        while sel.Следующий():
            c = str(sel.code or "").strip()
            n = str(sel.name or "").strip()
            a = str(sel.artikul or "").strip()
            u = str(sel.unit or "əd").strip()
            p = str(sel.parent or "").strip()
            ig = 1 if sel.is_group else 0
            bc = barcode_map.get(c, "")
            if c:
                rows.append((c, n, a, bc, u, p, ig))
                count += 1
        cur.executemany("INSERT OR REPLACE INTO nomenklatura (code, name, artikul, barcode, unit, parent, is_group) VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
        sqlite_conn.commit()
        print(f"  -> {count:,} mal export edildi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Nomenclature error: {e}", flush=True)

    # -------------------------------------------------------------
    # 5. Export Kontragenty (Customers / Clients)
    # -------------------------------------------------------------
    print("\n[5/8] Exporting Customers (Контрагенты)...", flush=True)
    t_start = time.time()
    try:
        sel = exec_1c_query("""
            ВЫБРАТЬ
                К.Код КАК code,
                К.Наименование КАК name,
                ЕСТЬNULL(К.ИНН, "") КАК inn,
                ЕСТЬNULL(К.Родитель.Наименование, "") КАК parent,
                К.ЭтоГруппа КАК is_group
            ИЗ
                Справочник.Контрагенты КАК К
            ГДЕ
                НЕ К.ПометкаУдаления
        """)
        count = 0
        rows = []
        while sel.Следующий():
            c = str(sel.code or "").strip()
            n = str(sel.name or "").strip()
            inn = str(sel.inn or "").strip()
            p = str(sel.parent or "").strip()
            ig = 1 if sel.is_group else 0
            if c:
                rows.append((c, n, inn, p, ig))
                count += 1
        cur.executemany("INSERT OR REPLACE INTO kontragenty (code, name, inn, parent, is_group) VALUES (?, ?, ?, ?, ?)", rows)
        sqlite_conn.commit()
        print(f"  -> {count:,} musteri/kontragent export edildi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Kontragenty error: {e}", flush=True)

    # -------------------------------------------------------------
    # 6. Export Active Prices (СрезПоследних)
    # -------------------------------------------------------------
    print("\n[6/8] Exporting Active Prices (ЦеныНоменклатуры.СрезПоследних)...", flush=True)
    t_start = time.time()
    try:
        sel = exec_1c_query("""
            ВЫБРАТЬ
                Ц.Номенклатура.Код КАК code,
                Ц.ТипЦен.Наименование КАК price_type,
                Ц.Цена КАК price
            ИЗ
                РегистрСведений.ЦеныНоменклатуры.СрезПоследних КАК Ц
        """)
        count = 0
        rows = []
        while sel.Следующий():
            c = str(sel.code or "").strip()
            pt = str(sel.price_type or "").strip()
            pr = float(sel.price or 0.0)
            if c and pt and pr > 0:
                rows.append((c, pt, pr))
                count += 1
        cur.executemany("INSERT OR REPLACE INTO active_prices (item_code, price_type, price) VALUES (?, ?, ?)", rows)
        sqlite_conn.commit()
        print(f"  -> {count:,} aktiv qiymet export edildi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Active Prices error: {e}", flush=True)

    # -------------------------------------------------------------
    # 7. Export Recent Price Documents
    # -------------------------------------------------------------
    print("\n[7/8] Exporting Price Documents (УстановкаЦенНоменклатуры)...", flush=True)
    t_start = time.time()
    try:
        sel_docs = exec_1c_query("""
            ВЫБРАТЬ ПЕРВЫЕ 200
                Д.Номер КАК doc_num,
                Д.Дата КАК doc_date,
                ЕСТЬNULL(Д.Комментарий, "") КАК comment,
                ЕСТЬNULL(Д.Ответственный.Наименование, "") КАК responsible,
                Д.Проведен КАК posted
            ИЗ
                Документ.УстановкаЦенНоменклатуры КАК Д
            УПОРЯДОЧИТЬ ПО
                Д.Дата УБЫВ
        """)
        doc_count = 0
        doc_headers = []
        while sel_docs.Следующий():
            num = str(sel_docs.doc_num or "").strip()
            dt_raw = sel_docs.doc_date
            dt_str = str(dt_raw)[:19] if dt_raw else ""
            com = str(sel_docs.comment or "").strip()
            resp = str(sel_docs.responsible or "").strip()
            st = "Проведен" if sel_docs.posted else "Не проведен"
            if num:
                doc_headers.append((num, dt_str, com, resp, st))
                doc_count += 1

        cur.executemany("INSERT OR REPLACE INTO price_documents (doc_number, doc_date, comment, responsible, status) VALUES (?, ?, ?, ?, ?)", doc_headers)
        sqlite_conn.commit()
        print(f"  -> {doc_count} qiymet senedi basligi export edildi", flush=True)

        # Export rows for these documents
        sel_rows = exec_1c_query("""
            ВЫБРАТЬ
                Т.Ссылка.Номер КАК doc_num,
                Т.Номенклатура.Код КАК item_code,
                Т.Номенклатура.Наименование КАК item_name,
                ЕСТЬNULL(Т.Номенклатура.БазоваяЕдиницаИзмерения.Наименование, "əd") КАК unit,
                Т.ТипЦен.Наименование КАК price_type,
                Т.Цена КАК price
            ИЗ
                Документ.УстановкаЦенНоменклатуры.Товары КАК Т
            ГДЕ
                Т.Ссылка В (
                    ВЫБРАТЬ ПЕРВЫЕ 200 Д2.Ссылка
                    ИЗ Документ.УстановкаЦенНоменклатуры КАК Д2
                    УПОРЯДОЧИТЬ ПО Д2.Дата УБЫВ
                )
        """)
        row_count = 0
        items_rows = []
        while sel_rows.Следующий():
            num = str(sel_rows.doc_num or "").strip()
            ic = str(sel_rows.item_code or "").strip()
            ina = str(sel_rows.item_name or "").strip()
            u = str(sel_rows.unit or "əd").strip()
            pt = str(sel_rows.price_type or "").strip()
            pr = float(sel_rows.price or 0.0)
            items_rows.append((num, ic, ina, u, pt, pr))
            row_count += 1

        cur.executemany("INSERT INTO price_document_rows (doc_number, item_code, item_name, unit, price_type, price) VALUES (?, ?, ?, ?, ?, ?)", items_rows)
        sqlite_conn.commit()
        print(f"  -> {row_count:,} sened setri export edildi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Price Documents error: {e}", flush=True)

    # -------------------------------------------------------------
    # 8. Export Sales Turnover (ПродажиОбороты) & Stock Balances
    # -------------------------------------------------------------
    print("\n[8/8] Exporting Sales Turnover & Stock Balances...", flush=True)
    t_start = time.time()
    try:
        # Sales turnover for the last 1 year (or 2025-2026)
        sel_sales = exec_1c_query("""
            ВЫБРАТЬ ПЕРВЫЕ 50000
                П.Период КАК period,
                П.Номенклатура.Код КАК item_code,
                П.Номенклатура.Наименование КАК item_name,
                П.Контрагент.Наименование КАК kontragent,
                П.Подразделение.Наименование КАК podrazdelenie,
                П.КоличествоОборот КАК quantity,
                П.СтоимостьОборот КАК sum,
                П.НДСОборот КАК vat
            ИЗ
                РегистрНакопления.Продажи.Обороты(ДАТАВРЕМЯ(2025, 1, 1), , День, ) КАК П
        """)
        sales_count = 0
        sales_rows = []
        while sel_sales.Следующий():
            p_raw = sel_sales.period
            p_str = str(p_raw)[:10] if p_raw else ""
            ic = str(sel_sales.item_code or "").strip()
            ina = str(sel_sales.item_name or "").strip()
            k = str(sel_sales.kontragent or "").strip()
            pod = str(sel_sales.podrazdelenie or "").strip()
            q = float(sel_sales.quantity or 0.0)
            s = float(sel_sales.sum or 0.0)
            v = float(sel_sales.vat or 0.0)
            sales_rows.append((p_str, ic, ina, k, pod, q, s, v))
            sales_count += 1
        
        cur.executemany("INSERT INTO sales_turnover (period, item_code, item_name, kontragent, podrazdelenie, quantity, sum, vat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", sales_rows)
        sqlite_conn.commit()
        print(f"  -> {sales_count:,} satis emeliyyati export edildi", flush=True)
    except Exception as e:
        print(f"  Sales Turnover error: {e}", flush=True)

    try:
        # Stock balances
        sel_stock = exec_1c_query("""
            ВЫБРАТЬ
                Т.Склад.Наименование КАК sklad,
                Т.Номенклатура.Код КАК item_code,
                Т.Номенклатура.Наименование КАК item_name,
                Т.КоличествоОстаток КАК quantity
            ИЗ
                РегистрНакопления.ТоварыНаСкладах.Остатки КАК Т
        """)
        stock_count = 0
        stock_rows = []
        while sel_stock.Следующий():
            sk = str(sel_stock.sklad or "").strip()
            ic = str(sel_stock.item_code or "").strip()
            ina = str(sel_stock.item_name or "").strip()
            q = float(sel_stock.quantity or 0.0)
            if sk and ic and q != 0:
                stock_rows.append((sk, ic, ina, q))
                stock_count += 1
        
        cur.executemany("INSERT OR REPLACE INTO stock_balances (sklad, item_code, item_name, quantity) VALUES (?, ?, ?, ?)", stock_rows)
        sqlite_conn.commit()
        print(f"  -> {stock_count:,} anbar qaligi export edildi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Stock Balances error: {e}", flush=True)

    # VACUUM and close SQLite
    cur.execute("VACUUM")
    sqlite_conn.close()

    # Get file size
    f_size = os.path.getsize(DB_PATH)
    f_size_mb = f_size / (1024 * 1024)
    print("\n" + "=" * 60, flush=True)
    print("SUCCESS: 1C TEST BAZASI TAM OFFLINE BAZAYA YUKLENDI!", flush=True)
    print(f"Fayl yeri: {DB_PATH}", flush=True)
    print(f"Yaddas hecmi: {f_size_mb:.2f} MB ({f_size:,} bayt)", flush=True)
    print("=" * 60, flush=True)

if __name__ == "__main__":
    run_export()
