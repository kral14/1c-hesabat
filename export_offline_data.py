# -*- coding: utf-8 -*-
"""
Export 1C Test Database (Aztrade_test3) to local SQLite for offline development and reporting.
Filters: All catalogs + All transaction data & documents from the beginning of the year (2026-01-01).
Destination: data/offline_1c_data.db
"""
import sys
import os
import time
import sqlite3

# Force utf-8 output to avoid Windows console cp1251/cp1252 encoding crashes
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "offline_1c_data.db")

def init_sqlite_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
        except Exception as e:
            print(f"Warning: could not delete existing DB: {e}", flush=True)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Performance optimizations for bulk loading
    cur.execute("PRAGMA synchronous = OFF;")
    cur.execute("PRAGMA journal_mode = MEMORY;")
    cur.execute("PRAGMA cache_size = 100000;")
    cur.execute("PRAGMA temp_store = MEMORY;")

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

    # 2. Kontragenty
    cur.execute("""
        CREATE TABLE IF NOT EXISTS kontragenty (
            code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            inn TEXT,
            parent TEXT,
            golovnoy TEXT,
            is_group INTEGER DEFAULT 0
        )
    """)

    # 3. Sklady (Warehouses)
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

    # 5. Barcodes
    cur.execute("""
        CREATE TABLE IF NOT EXISTS barcodes (
            item_code TEXT,
            barcode TEXT PRIMARY KEY
        )
    """)

    # 6. Active Prices (СрезПоследних)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS active_prices (
            item_code TEXT,
            price_type TEXT,
            price REAL,
            PRIMARY KEY (item_code, price_type)
        )
    """)

    # 7. Stock Balances (ТоварыНаСкладах)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS stock_balances (
            sklad TEXT,
            item_code TEXT,
            item_name TEXT,
            quantity REAL,
            PRIMARY KEY (sklad, item_code)
        )
    """)

    # 8. Sales Turnover (ПродажиОбороты from 2026-01-01)
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

    # 9. Agents
    cur.execute("""
        CREATE TABLE IF NOT EXISTS agents (
            code TEXT,
            name TEXT PRIMARY KEY
        )
    """)

    # 10. Documents: РеализацияТоваровУслуг (Sales Invoices)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents_realization (
            number TEXT PRIMARY KEY,
            date TEXT,
            posted INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            kontragent TEXT,
            kontragent_code TEXT,
            golovnoy_kontragent TEXT,
            agent TEXT,
            amount REAL DEFAULT 0,
            warehouse TEXT,
            deal TEXT,
            obrabotka_number TEXT,
            vms_status TEXT,
            contract TEXT,
            portfolio TEXT,
            contract_price_type TEXT,
            pogruzka_marshrut TEXT,
            pogruzka_voditel TEXT,
            responsible TEXT,
            comment TEXT,
            data_version TEXT
        )
    """)

    # 11. Documents: РеализацияТоваровУслуг Rows
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents_realization_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_number TEXT,
            line_no INTEGER,
            item_code TEXT,
            item_name TEXT,
            unit TEXT,
            quantity REAL,
            price REAL,
            sum REAL,
            vat REAL
        )
    """)

    # 12. Documents: ВозвратТоваровОтПокупателя (Returns)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents_vozvrat (
            number TEXT PRIMARY KEY,
            date TEXT,
            posted INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            kontragent TEXT,
            kontragent_code TEXT,
            golovnoy_kontragent TEXT,
            agent TEXT,
            amount REAL DEFAULT 0,
            warehouse TEXT,
            deal TEXT,
            contract TEXT,
            responsible TEXT,
            comment TEXT,
            data_version TEXT
        )
    """)

    # 13. Documents: ВозвратТоваровОтПокупателя Rows
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents_vozvrat_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_number TEXT,
            line_no INTEGER,
            item_code TEXT,
            item_name TEXT,
            unit TEXT,
            quantity REAL,
            price REAL,
            sum REAL
        )
    """)

    # 14. Documents: ПогрузкиМашин
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents_pogruzka (
            number TEXT PRIMARY KEY,
            date TEXT,
            posted INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            marshrut TEXT,
            voditel TEXT,
            warehouse TEXT,
            realization_count INTEGER DEFAULT 0,
            amount REAL DEFAULT 0,
            responsible TEXT,
            comment TEXT
        )
    """)

    # 15. Documents: ПогрузкиМашин Rows (Composition linking to Realizatsiya)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents_pogruzka_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_number TEXT,
            line_no INTEGER,
            realization_number TEXT
        )
    """)

    # 16. Documents: ПоступлениеТоваровУслуг (Purchases)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents_postuplenie (
            number TEXT PRIMARY KEY,
            date TEXT,
            posted INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            kontragent TEXT,
            warehouse TEXT,
            amount REAL DEFAULT 0,
            responsible TEXT,
            comment TEXT
        )
    """)

    # 17. Documents: ПоступлениеТоваровУслуг Rows
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents_postuplenie_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_number TEXT,
            line_no INTEGER,
            item_code TEXT,
            item_name TEXT,
            unit TEXT,
            quantity REAL,
            price REAL,
            sum REAL
        )
    """)

    # 18. Documents: ЗаказПокупателя (Orders)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents_zakaz (
            number TEXT PRIMARY KEY,
            date TEXT,
            posted INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            kontragent TEXT,
            kontragent_code TEXT,
            warehouse TEXT,
            amount REAL DEFAULT 0,
            responsible TEXT,
            comment TEXT
        )
    """)

    # 19. Documents: ЗаказПокупателя Rows
    cur.execute("""
        CREATE TABLE IF NOT EXISTS documents_zakaz_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_number TEXT,
            line_no INTEGER,
            item_code TEXT,
            item_name TEXT,
            unit TEXT,
            quantity REAL,
            price REAL,
            sum REAL
        )
    """)

    # 20. Documents: УстановкаЦенНоменклатуры Headers
    cur.execute("""
        CREATE TABLE IF NOT EXISTS price_documents (
            doc_number TEXT PRIMARY KEY,
            doc_date TEXT,
            comment TEXT,
            responsible TEXT,
            status TEXT
        )
    """)

    # 21. Documents: УстановкаЦенНоменклатуры Rows
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

    conn.commit()
    return conn


def create_indexes(conn):
    print("\nIndekslər yaradılır (sürətli axtarış və filtrləmə üçün)...", flush=True)
    t0 = time.time()
    cur = conn.cursor()
    indexes = [
        # Nomenklatura
        "CREATE INDEX IF NOT EXISTS idx_nom_name ON nomenklatura(name)",
        "CREATE INDEX IF NOT EXISTS idx_nom_artikul ON nomenklatura(artikul)",
        "CREATE INDEX IF NOT EXISTS idx_nom_barcode ON nomenklatura(barcode)",
        "CREATE INDEX IF NOT EXISTS idx_nom_parent ON nomenklatura(parent)",
        # Kontragenty
        "CREATE INDEX IF NOT EXISTS idx_kontr_name ON kontragenty(name)",
        "CREATE INDEX IF NOT EXISTS idx_kontr_inn ON kontragenty(inn)",
        # Barcodes & Prices
        "CREATE INDEX IF NOT EXISTS idx_bc_item ON barcodes(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_act_price_item ON active_prices(item_code)",
        # Sales turnover
        "CREATE INDEX IF NOT EXISTS idx_sales_period ON sales_turnover(period)",
        "CREATE INDEX IF NOT EXISTS idx_sales_kontr ON sales_turnover(kontragent)",
        "CREATE INDEX IF NOT EXISTS idx_sales_item ON sales_turnover(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_sales_pod ON sales_turnover(podrazdelenie)",
        # Realization
        "CREATE INDEX IF NOT EXISTS idx_dr_date ON documents_realization(date)",
        "CREATE INDEX IF NOT EXISTS idx_dr_kontr ON documents_realization(kontragent)",
        "CREATE INDEX IF NOT EXISTS idx_dr_agent ON documents_realization(agent)",
        "CREATE INDEX IF NOT EXISTS idx_dr_wh ON documents_realization(warehouse)",
        "CREATE INDEX IF NOT EXISTS idx_dr_deal ON documents_realization(deal)",
        "CREATE INDEX IF NOT EXISTS idx_dr_port ON documents_realization(portfolio)",
        "CREATE INDEX IF NOT EXISTS idx_dr_marshrut ON documents_realization(pogruzka_marshrut)",
        "CREATE INDEX IF NOT EXISTS idx_dr_voditel ON documents_realization(pogruzka_voditel)",
        # Realization rows
        "CREATE INDEX IF NOT EXISTS idx_drr_doc ON documents_realization_rows(doc_number)",
        "CREATE INDEX IF NOT EXISTS idx_drr_item ON documents_realization_rows(item_code)",
        "CREATE INDEX IF NOT EXISTS idx_drr_item_name ON documents_realization_rows(item_name)",
        # Vozvrat
        "CREATE INDEX IF NOT EXISTS idx_dv_date ON documents_vozvrat(date)",
        "CREATE INDEX IF NOT EXISTS idx_dv_kontr ON documents_vozvrat(kontragent)",
        "CREATE INDEX IF NOT EXISTS idx_dvr_doc ON documents_vozvrat_rows(doc_number)",
        # Pogruzka
        "CREATE INDEX IF NOT EXISTS idx_dp_date ON documents_pogruzka(date)",
        "CREATE INDEX IF NOT EXISTS idx_dp_marsh ON documents_pogruzka(marshrut)",
        "CREATE INDEX IF NOT EXISTS idx_dp_vod ON documents_pogruzka(voditel)",
        "CREATE INDEX IF NOT EXISTS idx_dpr_doc ON documents_pogruzka_rows(doc_number)",
        "CREATE INDEX IF NOT EXISTS idx_dpr_real ON documents_pogruzka_rows(realization_number)",
        # Zakaz & Postuplenie
        "CREATE INDEX IF NOT EXISTS idx_dz_date ON documents_zakaz(date)",
        "CREATE INDEX IF NOT EXISTS idx_dz_kontr ON documents_zakaz(kontragent)",
        "CREATE INDEX IF NOT EXISTS idx_dzr_doc ON documents_zakaz_rows(doc_number)",
        "CREATE INDEX IF NOT EXISTS idx_dpost_date ON documents_postuplenie(date)",
        "CREATE INDEX IF NOT EXISTS idx_dpostr_doc ON documents_postuplenie_rows(doc_number)",
        # Price docs
        "CREATE INDEX IF NOT EXISTS idx_pd_date ON price_documents(doc_date)",
        "CREATE INDEX IF NOT EXISTS idx_pdr_doc ON price_document_rows(doc_number)"
    ]
    for idx_sql in indexes:
        try:
            cur.execute(idx_sql)
        except Exception as e:
            print(f"Index error: {e}", flush=True)

    conn.commit()
    print(f"Indekslər tamamlandı ({time.time() - t0:.2f}s)", flush=True)


def link_pogruzka_to_realization(conn):
    print("\nRealizasiyalara maşın yükləmə məlumatları (Marşrut və Sürücü) bağlanır...", flush=True)
    t0 = time.time()
    cur = conn.cursor()
    try:
        # Create a temp mapping
        cur.execute("""
            UPDATE documents_realization
            SET 
                pogruzka_marshrut = (
                    SELECT p.marshrut FROM documents_pogruzka_rows pr 
                    JOIN documents_pogruzka p ON p.number = pr.doc_number 
                    WHERE pr.realization_number = documents_realization.number
                    LIMIT 1
                ),
                pogruzka_voditel = (
                    SELECT p.voditel FROM documents_pogruzka_rows pr 
                    JOIN documents_pogruzka p ON p.number = pr.doc_number 
                    WHERE pr.realization_number = documents_realization.number
                    LIMIT 1
                )
            WHERE EXISTS (
                SELECT 1 FROM documents_pogruzka_rows pr 
                WHERE pr.realization_number = documents_realization.number
            )
        """)
        conn.commit()
        print(f"Bağlantı tamamlandı ({time.time() - t0:.2f}s)", flush=True)
    except Exception as e:
        print(f"Pogruzka linking error: {e}", flush=True)


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

    print("=" * 70, flush=True)
    print("1C TEST BAZASINDAN 2026-CI İLİN ƏVVƏLİNDƏN BÜTÜN DATA EXPORT EDİLİR", flush=True)
    print(f"Server: {server} | Baza: {base} | İstifadəçi: {user}", flush=True)
    print("=" * 70, flush=True)

    t0_global = time.time()
    print(f"1C bazasına qoşulur [{server} / {base}]...", flush=True)
    try:
        conn_1c = connector.Connect(conn_str)
        print(f"1C Qoşulma uğurla yaradıldı ({time.time() - t0_global:.2f}s)!\n", flush=True)
    except Exception as e:
        print(f"Xəta: 1C bazasına qoşulmaq mümkün olmadı: {e}", flush=True)
        return

    sqlite_conn = init_sqlite_db()
    cur = sqlite_conn.cursor()

    def exec_1c_query(query_text):
        q = conn_1c.NewObject("Запрос")
        q.Text = query_text
        return q.Выполнить().Выбрать()

    def batch_insert(table_name, insert_sql, rows, batch_size=5000):
        total = len(rows)
        for i in range(0, total, batch_size):
            chunk = rows[i:i + batch_size]
            cur.executemany(insert_sql, chunk)
            sqlite_conn.commit()

    # -------------------------------------------------------------
    # 1. Price Types
    # -------------------------------------------------------------
    print("[1/18] Qiymət növləri (ТипыЦенНоменклатуры) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel = exec_1c_query("ВЫБРАТЬ Код, Наименование ИЗ Справочник.ТипыЦенНоменклатуры ГДЕ НЕ ПометкаУдаления")
        rows = []
        while sel.Следующий():
            c = str(sel.Код or "").strip()
            n = str(sel.Наименование or "").strip()
            if n:
                rows.append((c, n))
        cur.executemany("INSERT OR REPLACE INTO price_types (code, name) VALUES (?, ?)", rows)
        sqlite_conn.commit()
        print(f"  -> {len(rows)} qiymət növü yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Price Types error: {e}", flush=True)

    # -------------------------------------------------------------
    # 2. Warehouses (Склады)
    # -------------------------------------------------------------
    print("[2/18] Anbarlar (Склады) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel = exec_1c_query("ВЫБРАТЬ Код, Наименование ИЗ Справочник.Склады ГДЕ НЕ ПометкаУдаления")
        rows = []
        while sel.Следующий():
            c = str(sel.Код or "").strip()
            n = str(sel.Наименование or "").strip()
            if n:
                rows.append((c, n))
        cur.executemany("INSERT OR REPLACE INTO sklady (code, name) VALUES (?, ?)", rows)
        sqlite_conn.commit()
        print(f"  -> {len(rows)} anbar yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Sklady error: {e}", flush=True)

    # -------------------------------------------------------------
    # 3. Barcodes (Штрихкоды)
    # -------------------------------------------------------------
    print("[3/18] Ştrixkodlar (Штрихкоды) export edilir...", flush=True)
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
        rows = []
        while sel.Следующий():
            ic = str(sel.item_code or "").strip()
            bc = str(sel.barcode or "").strip()
            if ic and bc:
                rows.append((ic, bc))
                if ic not in barcode_map:
                    barcode_map[ic] = bc
        batch_insert("barcodes", "INSERT OR REPLACE INTO barcodes (item_code, barcode) VALUES (?, ?)", rows)
        print(f"  -> {len(rows):,} ştrixkod yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Barcodes error: {e}", flush=True)

    # -------------------------------------------------------------
    # 4. Nomenclature (Номенклатура)
    # -------------------------------------------------------------
    print("[4/18] Mallar və Qovluqlar (Номенклатура) export edilir...", flush=True)
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
        batch_insert("nomenklatura", "INSERT OR REPLACE INTO nomenklatura (code, name, artikul, barcode, unit, parent, is_group) VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
        print(f"  -> {len(rows):,} mal/qovluq yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Nomenclature error: {e}", flush=True)

    # -------------------------------------------------------------
    # 5. Kontragenty (Müştərilər və Təchizatçılar)
    # -------------------------------------------------------------
    print("[5/18] Müştərilər və Kontragentlər (Контрагенты) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel = exec_1c_query("""
            ВЫБРАТЬ
                К.Код КАК code,
                К.Наименование КАК name,
                ЕСТЬNULL(К.ИНН, "") КАК inn,
                ЕСТЬNULL(К.Родитель.Наименование, "") КАК parent,
                ЕСТЬNULL(К.ГоловнойКонтрагент.Наименование, "") КАК golovnoy,
                К.ЭтоГруппа КАК is_group
            ИЗ
                Справочник.Контрагенты КАК К
            ГДЕ
                НЕ К.ПометкаУдаления
        """)
        rows = []
        while sel.Следующий():
            c = str(sel.code or "").strip()
            n = str(sel.name or "").strip()
            inn = str(sel.inn or "").strip()
            p = str(sel.parent or "").strip()
            g = str(sel.golovnoy or "").strip()
            ig = 1 if sel.is_group else 0
            if c:
                rows.append((c, n, inn, p, g, ig))
        batch_insert("kontragenty", "INSERT OR REPLACE INTO kontragenty (code, name, inn, parent, golovnoy, is_group) VALUES (?, ?, ?, ?, ?, ?)", rows)
        print(f"  -> {len(rows):,} kontragent yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Kontragenty error: {e}", flush=True)

    # -------------------------------------------------------------
    # 6. Active Prices (ЦеныНоменклатуры.СрезПоследних)
    # -------------------------------------------------------------
    print("[6/18] Cari qiymətlər (ЦеныНоменклатуры.СрезПоследних) export edilir...", flush=True)
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
        rows = []
        while sel.Следующий():
            c = str(sel.code or "").strip()
            pt = str(sel.price_type or "").strip()
            pr = float(sel.price or 0.0)
            if c and pt and pr > 0:
                rows.append((c, pt, pr))
        batch_insert("active_prices", "INSERT OR REPLACE INTO active_prices (item_code, price_type, price) VALUES (?, ?, ?)", rows)
        print(f"  -> {len(rows):,} aktiv qiymət yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Active Prices error: {e}", flush=True)

    # -------------------------------------------------------------
    # 7. Stock Balances (ТоварыНаСкладах.Остатки)
    # -------------------------------------------------------------
    print("[7/18] Anbar qalıqları (ТоварыНаСкладах.Остатки) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel = exec_1c_query("""
            ВЫБРАТЬ
                Т.Склад.Наименование КАК sklad,
                Т.Номенклатура.Код КАК item_code,
                Т.Номенклатура.Наименование КАК item_name,
                Т.КоличествоОстаток КАК quantity
            ИЗ
                РегистрНакопления.ТоварыНаСкладах.Остатки КАК Т
        """)
        rows = []
        while sel.Следующий():
            sk = str(sel.sklad or "").strip()
            ic = str(sel.item_code or "").strip()
            ina = str(sel.item_name or "").strip()
            q = float(sel.quantity or 0.0)
            if sk and ic and q != 0:
                rows.append((sk, ic, ina, q))
        batch_insert("stock_balances", "INSERT OR REPLACE INTO stock_balances (sklad, item_code, item_name, quantity) VALUES (?, ?, ?, ?)", rows)
        print(f"  -> {len(rows):,} anbar qalığı yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Stock Balances error: {e}", flush=True)

    # -------------------------------------------------------------
    # 8. Sales Turnover (Продажи.Обороты from 2026-01-01)
    # -------------------------------------------------------------
    print("[8/18] 2026 Satış dövriyyəsi (Продажи.Обороты) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel = exec_1c_query("""
            ВЫБРАТЬ
                П.Период КАК period,
                П.Номенклатура.Код КАК item_code,
                П.Номенклатура.Наименование КАК item_name,
                П.Контрагент.Наименование КАК kontragent,
                П.Подразделение.Наименование КАК podrazdelenie,
                П.КоличествоОборот КАК quantity,
                П.СтоимостьОборот КАК sum,
                П.НДСОборот КАК vat
            ИЗ
                РегистрНакопления.Продажи.Обороты(ДАТАВРЕМЯ(2026, 1, 1), , День, ) КАК П
        """)
        rows = []
        agents_set = set()
        while sel.Следующий():
            p_raw = sel.period
            p_str = str(p_raw)[:10] if p_raw else ""
            ic = str(sel.item_code or "").strip()
            ina = str(sel.item_name or "").strip()
            k = str(sel.kontragent or "").strip()
            pod = str(sel.podrazdelenie or "").strip()
            q = float(sel.quantity or 0.0)
            s = float(sel.sum or 0.0)
            v = float(sel.vat or 0.0)
            rows.append((p_str, ic, ina, k, pod, q, s, v))
            if pod:
                agents_set.add(pod)
        batch_insert("sales_turnover", "INSERT INTO sales_turnover (period, item_code, item_name, kontragent, podrazdelenie, quantity, sum, vat) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
        print(f"  -> {len(rows):,} satış əməliyyatı yükləndi ({time.time() - t_start:.2f}s)", flush=True)

        if agents_set:
            ag_rows = [(f"{i+1:03d}", ag) for i, ag in enumerate(sorted(agents_set))]
            cur.executemany("INSERT OR REPLACE INTO agents (code, name) VALUES (?, ?)", ag_rows)
            sqlite_conn.commit()
    except Exception as e:
        print(f"  Sales Turnover error: {e}", flush=True)

    # -------------------------------------------------------------
    # 9. Price Setting Documents (УстановкаЦенНоменклатуры)
    # -------------------------------------------------------------
    print("[9/18] 2026 Qiymət Təyini Sənədləri (УстановкаЦенНоменклатуры) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel_docs = exec_1c_query("""
            ВЫБРАТЬ
                Д.Номер КАК doc_num,
                Д.Дата КАК doc_date,
                ЕСТЬNULL(Д.Комментарий, "") КАК comment,
                ЕСТЬNULL(Д.Ответственный.Наименование, "") КАК responsible,
                Д.Проведен КАК posted
            ИЗ
                Документ.УстановкаЦенНоменклатуры КАК Д
            ГДЕ
                Д.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
            УПОРЯДОЧИТЬ ПО
                Д.Дата УБЫВ
        """)
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
        cur.executemany("INSERT OR REPLACE INTO price_documents (doc_number, doc_date, comment, responsible, status) VALUES (?, ?, ?, ?, ?)", doc_headers)
        sqlite_conn.commit()

        # Rows
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
                Т.Ссылка.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
        """)
        doc_rows = []
        while sel_rows.Следующий():
            num = str(sel_rows.doc_num or "").strip()
            ic = str(sel_rows.item_code or "").strip()
            ina = str(sel_rows.item_name or "").strip()
            u = str(sel_rows.unit or "əd").strip()
            pt = str(sel_rows.price_type or "").strip()
            pr = float(sel_rows.price or 0.0)
            doc_rows.append((num, ic, ina, u, pt, pr))
        batch_insert("price_document_rows", "INSERT INTO price_document_rows (doc_number, item_code, item_name, unit, price_type, price) VALUES (?, ?, ?, ?, ?, ?)", doc_rows)
        print(f"  -> {len(doc_headers)} sənəd başlığı, {len(doc_rows):,} sətir yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  Price Documents error: {e}", flush=True)

    # -------------------------------------------------------------
    # 10. ПогрузкиМашин (Loading Machine documents from 2026-01-01)
    # -------------------------------------------------------------
    print("[10/18] 2026 Maşın Yükləmələri (ПогрузкиМашин) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel_pog = exec_1c_query("""
            ВЫБРАТЬ
                П.Номер КАК Number,
                П.Дата КАК Date,
                П.Проведен КАК Posted,
                П.ПометкаУдаления КАК DeletionMark,
                П.Маршрут КАК Marshrut,
                ПРЕДСТАВЛЕНИЕ(П.Водитель) КАК Voditel,
                ПРЕДСТАВЛЕНИЕ(П.Склад) КАК Warehouse,
                ПРЕДСТАВЛЕНИЕ(П.Ответственный) КАК Responsible
            ИЗ
                Документ.ПогрузкиМашин КАК П
            ГДЕ
                П.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
        """)
        pog_headers = []
        while sel_pog.Следующий():
            num = str(sel_pog.Number or "").strip()
            dt = str(sel_pog.Date)[:19] if sel_pog.Date else ""
            pst = 1 if sel_pog.Posted else 0
            del_mark = 1 if sel_pog.DeletionMark else 0
            msh = str(sel_pog.Marshrut or "").strip()
            vod = str(sel_pog.Voditel or "").strip()
            wh = str(sel_pog.Warehouse or "").strip()
            resp = str(sel_pog.Responsible or "").strip()
            if num:
                pog_headers.append((num, dt, pst, del_mark, msh, vod, wh, 0, 0.0, resp, ""))
        batch_insert("documents_pogruzka", "INSERT OR REPLACE INTO documents_pogruzka (number, date, posted, deleted, marshrut, voditel, warehouse, realization_count, amount, responsible, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", pog_headers)

        # Tabular section: СписокРеализаций
        sel_pogr = exec_1c_query("""
            ВЫБРАТЬ
                СР.Ссылка.Номер КАК PogNum,
                СР.НомерСтроки КАК LineNo,
                СР.Накладная.Номер КАК RealizNum
            ИЗ
                Документ.ПогрузкиМашин.СписокРеализаций КАК СР
            ГДЕ
                СР.Ссылка.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
        """)
        pogr_rows = []
        while sel_pogr.Следующий():
            pn = str(sel_pogr.PogNum or "").strip()
            ln = int(sel_pogr.LineNo or 1)
            rn = str(sel_pogr.RealizNum or "").strip()
            if pn and rn:
                pogr_rows.append((pn, ln, rn))
        batch_insert("documents_pogruzka_rows", "INSERT INTO documents_pogruzka_rows (doc_number, line_no, realization_number) VALUES (?, ?, ?)", pogr_rows)
        print(f"  -> {len(pog_headers):,} yükləmə sənədi, {len(pogr_rows):,} əlaqəli qaimə yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  ПогрузкиМашин error: {e}", flush=True)

    # -------------------------------------------------------------
    # 11. РеализацияТоваровУслуг Headers (Sales Documents from 2026-01-01)
    # -------------------------------------------------------------
    print("[11/18] 2026 Satış Qaimələri Başlıqları (РеализацияТоваровУслуг) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel_real = exec_1c_query("""
            ВЫБРАТЬ
                Т.Номер КАК Number,
                Т.Дата КАК Date,
                Т.Проведен КАК Posted,
                Т.ПометкаУдаления КАК DeletionMark,
                Т.Контрагент.Наименование КАК Kontragent,
                Т.Контрагент.Код КАК KontragentCode,
                Т.Контрагент.ГоловнойКонтрагент.Наименование КАК GolovnoyKontragent,
                Т.ДоговорКонтрагента.Агент.Наименование КАК Agent,
                Т.СуммаДокумента КАК Amount,
                Т.Склад.Наименование КАК Warehouse,
                Т.Сделка.Номер КАК Deal,
                Т.ДоговорКонтрагента.Наименование КАК Contract,
                Т.ДоговорКонтрагента.ТипЦен.Наименование КАК ContractPriceType,
                Т.ДоговорКонтрагента.Портфель.Наименование КАК Portfolio,
                Т.Ответственный.Наименование КАК Responsible,
                Т.Комментарий КАК Comment
            ИЗ
                Документ.РеализацияТоваровУслуг КАК Т
            ГДЕ
                Т.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
        """)
        real_headers = []
        c = 0
        while sel_real.Следующий():
            num = str(sel_real.Number or "").strip()
            dt = str(sel_real.Date)[:19] if sel_real.Date else ""
            pst = 1 if sel_real.Posted else 0
            del_m = 1 if sel_real.DeletionMark else 0
            k = str(sel_real.Kontragent or "").strip()
            kc = str(sel_real.KontragentCode or "").strip()
            gk = str(sel_real.GolovnoyKontragent or "").strip()
            ag = str(sel_real.Agent or "").strip()
            amt = float(sel_real.Amount or 0.0)
            wh = str(sel_real.Warehouse or "").strip()
            dl = str(sel_real.Deal or "").strip()
            ctr = str(sel_real.Contract or "").strip()
            pt = str(sel_real.ContractPriceType or "").strip()
            port = str(sel_real.Portfolio or "").strip()
            resp = str(sel_real.Responsible or "").strip()
            com = str(sel_real.Comment or "").strip()
            if num:
                real_headers.append((num, dt, pst, del_m, k, kc, gk, ag, amt, wh, dl, "", "", ctr, port, pt, "", "", resp, com, f"off_{num}"))
                c += 1
                if c % 20000 == 0:
                    print(f"    ... {c:,} qaimə oxundu ({time.time() - t_start:.1f}s)", flush=True)

        batch_insert("documents_realization", """
            INSERT OR REPLACE INTO documents_realization 
            (number, date, posted, deleted, kontragent, kontragent_code, golovnoy_kontragent, agent, amount, warehouse, deal, obrabotka_number, vms_status, contract, portfolio, contract_price_type, pogruzka_marshrut, pogruzka_voditel, responsible, comment, data_version) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, real_headers)
        print(f"  -> {len(real_headers):,} Satış Qaiməsi başlığı yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  РеализацияТоваровУслуг headers error: {e}", flush=True)

    # -------------------------------------------------------------
    # 12. РеализацияТоваровУслуг Rows (Line items from 2026-01-01)
    # -------------------------------------------------------------
    print("[12/18] 2026 Satış Qaimələri Malları (Реализация.Товары) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel_real_rows = exec_1c_query("""
            ВЫБРАТЬ
                Т.Ссылка.Номер КАК DocNumber,
                Т.НомерСтроки КАК LineNo,
                Т.Номенклатура.Код КАК ItemCode,
                Т.Номенклатура.Наименование КАК ItemName,
                ЕСТЬNULL(Т.ЕдиницаИзмерения.Наименование, "əd") КАК Unit,
                Т.Количество КАК Quantity,
                Т.Цена КАК Price,
                Т.Сумма КАК Sum,
                ЕСТЬNULL(Т.СуммаНДС, 0) КАК Vat
            ИЗ
                Документ.РеализацияТоваровУслуг.Товары КАК Т
            ГДЕ
                Т.Ссылка.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
        """)
        real_rows = []
        rc = 0
        while sel_real_rows.Следующий():
            dnum = str(sel_real_rows.DocNumber or "").strip()
            lno = int(sel_real_rows.LineNo or 1)
            ic = str(sel_real_rows.ItemCode or "").strip()
            ina = str(sel_real_rows.ItemName or "").strip()
            u = str(sel_real_rows.Unit or "əd").strip()
            q = float(sel_real_rows.Quantity or 0.0)
            pr = float(sel_real_rows.Price or 0.0)
            sm = float(sel_real_rows.Sum or 0.0)
            vt = float(sel_real_rows.Vat or 0.0)
            if dnum:
                real_rows.append((dnum, lno, ic, ina, u, q, pr, sm, vt))
                rc += 1
                if rc % 50000 == 0:
                    print(f"    ... {rc:,} mal sətri oxundu ({time.time() - t_start:.1f}s)", flush=True)

        batch_insert("documents_realization_rows", "INSERT INTO documents_realization_rows (doc_number, line_no, item_code, item_name, unit, quantity, price, sum, vat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", real_rows)
        print(f"  -> {len(real_rows):,} Satış mal sətri yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  РеализацияТоваровУслуг rows error: {e}", flush=True)

    # -------------------------------------------------------------
    # 13. ВозвратТоваровОтПокупателя Headers (Customer Returns from 2026-01-01)
    # -------------------------------------------------------------
    print("[13/18] 2026 Qaytarma Sənədləri Başlıqları (ВозвратТоваровОтПокупателя) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel_vozvrat = exec_1c_query("""
            ВЫБРАТЬ
                Т.Номер КАК Number,
                Т.Дата КАК Date,
                Т.Проведен КАК Posted,
                Т.ПометкаУдаления КАК DeletionMark,
                Т.Контрагент.Наименование КАК Kontragent,
                Т.Контрагент.Код КАК KontragentCode,
                Т.Контрагент.ГоловнойКонтрагент.Наименование КАК GolovnoyKontragent,
                Т.ДоговорКонтрагента.Агент.Наименование КАК Agent,
                Т.СуммаДокумента КАК Amount,
                Т.СкладОрдер.Наименование КАК Warehouse,
                Т.Сделка.Номер КАК Deal,
                Т.ДоговорКонтрагента.Наименование КАК Contract,
                Т.Ответственный.Наименование КАК Responsible,
                Т.Комментарий КАК Comment
            ИЗ
                Документ.ВозвратТоваровОтПокупателя КАК Т
            ГДЕ
                Т.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
        """)
        vozvrat_headers = []
        while sel_vozvrat.Следующий():
            num = str(sel_vozvrat.Number or "").strip()
            dt = str(sel_vozvrat.Date)[:19] if sel_vozvrat.Date else ""
            pst = 1 if sel_vozvrat.Posted else 0
            del_m = 1 if sel_vozvrat.DeletionMark else 0
            k = str(sel_vozvrat.Kontragent or "").strip()
            kc = str(sel_vozvrat.KontragentCode or "").strip()
            gk = str(sel_vozvrat.GolovnoyKontragent or "").strip()
            ag = str(sel_vozvrat.Agent or "").strip()
            amt = float(sel_vozvrat.Amount or 0.0)
            wh = str(sel_vozvrat.Warehouse or "").strip()
            dl = str(sel_vozvrat.Deal or "").strip()
            ctr = str(sel_vozvrat.Contract or "").strip()
            resp = str(sel_vozvrat.Responsible or "").strip()
            com = str(sel_vozvrat.Comment or "").strip()
            if num:
                vozvrat_headers.append((num, dt, pst, del_m, k, kc, gk, ag, amt, wh, dl, ctr, resp, com, f"off_vozv_{num}"))
        batch_insert("documents_vozvrat", """
            INSERT OR REPLACE INTO documents_vozvrat 
            (number, date, posted, deleted, kontragent, kontragent_code, golovnoy_kontragent, agent, amount, warehouse, deal, contract, responsible, comment, data_version) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, vozvrat_headers)
        print(f"  -> {len(vozvrat_headers):,} Qaytarma sənədi başlığı yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  ВозвратТоваровОтПокупателя headers error: {e}", flush=True)

    # -------------------------------------------------------------
    # 14. ВозвратТоваровОтПокупателя Rows (Line items from 2026-01-01)
    # -------------------------------------------------------------
    print("[14/18] 2026 Qaytarma Sənədləri Malları (Возврат.Товары) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel_voz_rows = exec_1c_query("""
            ВЫБРАТЬ
                Т.Ссылка.Номер КАК DocNumber,
                Т.НомерСтроки КАК LineNo,
                Т.Номенклатура.Код КАК ItemCode,
                Т.Номенклатура.Наименование КАК ItemName,
                ЕСТЬNULL(Т.ЕдиницаИзмерения.Наименование, "əd") КАК Unit,
                Т.Количество КАК Quantity,
                Т.Цена КАК Price,
                Т.Сумма КАК Sum
            ИЗ
                Документ.ВозвратТоваровОтПокупателя.Товары КАК Т
            ГДЕ
                Т.Ссылка.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
        """)
        voz_rows = []
        while sel_voz_rows.Следующий():
            dnum = str(sel_voz_rows.DocNumber or "").strip()
            lno = int(sel_voz_rows.LineNo or 1)
            ic = str(sel_voz_rows.ItemCode or "").strip()
            ina = str(sel_voz_rows.ItemName or "").strip()
            u = str(sel_voz_rows.Unit or "əd").strip()
            q = float(sel_voz_rows.Quantity or 0.0)
            pr = float(sel_voz_rows.Price or 0.0)
            sm = float(sel_voz_rows.Sum or 0.0)
            if dnum:
                voz_rows.append((dnum, lno, ic, ina, u, q, pr, sm))
        batch_insert("documents_vozvrat_rows", "INSERT INTO documents_vozvrat_rows (doc_number, line_no, item_code, item_name, unit, quantity, price, sum) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", voz_rows)
        print(f"  -> {len(voz_rows):,} Qaytarma mal sətri yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  ВозвратТоваровОтПокупателя rows error: {e}", flush=True)

    # -------------------------------------------------------------
    # 15. ПоступлениеТоваровУслуг (Purchases from 2026-01-01)
    # -------------------------------------------------------------
    print("[15/18] 2026 Mədaxil Sənədləri (ПоступлениеТоваровУслуг) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel_post = exec_1c_query("""
            ВЫБРАТЬ
                Т.Номер КАК Number,
                Т.Дата КАК Date,
                Т.Проведен КАК Posted,
                Т.ПометкаУдаления КАК DeletionMark,
                Т.Контрагент.Наименование КАК Kontragent,
                Т.СкладОрдер.Наименование КАК Warehouse,
                Т.СуммаДокумента КАК Amount,
                Т.Ответственный.Наименование КАК Responsible,
                Т.Комментарий КАК Comment
            ИЗ
                Документ.ПоступлениеТоваровУслуг КАК Т
            ГДЕ
                Т.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
        """)
        post_headers = []
        while sel_post.Следующий():
            num = str(sel_post.Number or "").strip()
            dt = str(sel_post.Date)[:19] if sel_post.Date else ""
            pst = 1 if sel_post.Posted else 0
            del_m = 1 if sel_post.DeletionMark else 0
            k = str(sel_post.Kontragent or "").strip()
            wh = str(sel_post.Warehouse or "").strip()
            amt = float(sel_post.Amount or 0.0)
            resp = str(sel_post.Responsible or "").strip()
            com = str(sel_post.Comment or "").strip()
            if num:
                post_headers.append((num, dt, pst, del_m, k, wh, amt, resp, com))
        batch_insert("documents_postuplenie", "INSERT OR REPLACE INTO documents_postuplenie (number, date, posted, deleted, kontragent, warehouse, amount, responsible, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", post_headers)

        # Tabular section: Товары
        sel_post_rows = exec_1c_query("""
            ВЫБРАТЬ
                Т.Ссылка.Номер КАК DocNumber,
                Т.НомерСтроки КАК LineNo,
                Т.Номенклатура.Код КАК ItemCode,
                Т.Номенклатура.Наименование КАК ItemName,
                ЕСТЬNULL(Т.ЕдиницаИзмерения.Наименование, "əd") КАК Unit,
                Т.Количество КАК Quantity,
                Т.Цена КАК Price,
                Т.Сумма КАК Sum
            ИЗ
                Документ.ПоступлениеТоваровУслуг.Товары КАК Т
            ГДЕ
                Т.Ссылка.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
        """)
        post_rows = []
        while sel_post_rows.Следующий():
            dnum = str(sel_post_rows.DocNumber or "").strip()
            lno = int(sel_post_rows.LineNo or 1)
            ic = str(sel_post_rows.ItemCode or "").strip()
            ina = str(sel_post_rows.ItemName or "").strip()
            u = str(sel_post_rows.Unit or "əd").strip()
            q = float(sel_post_rows.Quantity or 0.0)
            pr = float(sel_post_rows.Price or 0.0)
            sm = float(sel_post_rows.Sum or 0.0)
            if dnum:
                post_rows.append((dnum, lno, ic, ina, u, q, pr, sm))
        batch_insert("documents_postuplenie_rows", "INSERT INTO documents_postuplenie_rows (doc_number, line_no, item_code, item_name, unit, quantity, price, sum) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", post_rows)
        print(f"  -> {len(post_headers):,} Mədaxil sənədi, {len(post_rows):,} sətir yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  ПоступлениеТоваровУслуг error: {e}", flush=True)

    # -------------------------------------------------------------
    # 16. ЗаказПокупателя (Customer Orders from 2026-01-01)
    # -------------------------------------------------------------
    print("[16/18] 2026 Müştəri Sifarişləri (ЗаказПокупателя) export edilir...", flush=True)
    t_start = time.time()
    try:
        sel_zk = exec_1c_query("""
            ВЫБРАТЬ
                Т.Номер КАК Number,
                Т.Дата КАК Date,
                Т.Проведен КАК Posted,
                Т.ПометкаУдаления КАК DeletionMark,
                Т.Контрагент.Наименование КАК Kontragent,
                Т.Контрагент.Код КАК KontragentCode,
                Т.СкладГруппа.Наименование КАК Warehouse,
                Т.СуммаДокумента КАК Amount,
                Т.Ответственный.Наименование КАК Responsible,
                Т.Комментарий КАК Comment
            ИЗ
                Документ.ЗаказПокупателя КАК Т
            ГДЕ
                Т.Дата >= ДАТАВРЕМЯ(2026, 1, 1)
        """)
        zk_headers = []
        zk_c = 0
        while sel_zk.Следующий():
            num = str(sel_zk.Number or "").strip()
            dt = str(sel_zk.Date)[:19] if sel_zk.Date else ""
            pst = 1 if sel_zk.Posted else 0
            del_m = 1 if sel_zk.DeletionMark else 0
            k = str(sel_zk.Kontragent or "").strip()
            kc = str(sel_zk.KontragentCode or "").strip()
            wh = str(sel_zk.Warehouse or "").strip()
            amt = float(sel_zk.Amount or 0.0)
            resp = str(sel_zk.Responsible or "").strip()
            com = str(sel_zk.Comment or "").strip()
            if num:
                zk_headers.append((num, dt, pst, del_m, k, kc, wh, amt, resp, com))
                zk_c += 1
                if zk_c % 30000 == 0:
                    print(f"    ... {zk_c:,} sifariş oxundu ({time.time() - t_start:.1f}s)", flush=True)

        batch_insert("documents_zakaz", "INSERT OR REPLACE INTO documents_zakaz (number, date, posted, deleted, kontragent, kontragent_code, warehouse, amount, responsible, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", zk_headers)
        print(f"  -> {len(zk_headers):,} Müştəri sifarişi yükləndi ({time.time() - t_start:.2f}s)", flush=True)
    except Exception as e:
        print(f"  ЗаказПокупателя error: {e}", flush=True)

    # -------------------------------------------------------------
    # 17. Link Pogruzki to Realization
    # -------------------------------------------------------------
    print("[17/18] Əlaqələndirmə və optimizasiya...", flush=True)
    link_pogruzka_to_realization(sqlite_conn)

    # -------------------------------------------------------------
    # 18. Create Indexes and VACUUM
    # -------------------------------------------------------------
    print("[18/18] İndekslərin qurulması və faylın sıxılması...", flush=True)
    create_indexes(sqlite_conn)

    cur.execute("PRAGMA optimize;")
    cur.execute("VACUUM;")
    sqlite_conn.close()

    # Get final size and statistics
    f_size = os.path.getsize(DB_PATH)
    f_size_mb = f_size / (1024 * 1024)
    total_time = time.time() - t0_global

    # Connect read-only to get exact counts
    chk_conn = sqlite3.connect(DB_PATH)
    chk_cur = chk_conn.cursor()

    stats = {}
    tables = [
        ("Mallar (Nomenklatura)", "nomenklatura"),
        ("Ştrixkodlar", "barcodes"),
        ("Müştərilər (Kontragentlər)", "kontragenty"),
        ("Anbarlar", "sklady"),
        ("Qiymət Növləri", "price_types"),
        ("Aktiv Qiymətlər", "active_prices"),
        ("Anbar Qalıqları", "stock_balances"),
        ("2026 Satış Dövriyyəsi", "sales_turnover"),
        ("2026 Qiymət Təyini Sənədləri", "price_documents"),
        ("2026 Qiymət Sənədi Sətirləri", "price_document_rows"),
        ("2026 Maşın Yükləmələri", "documents_pogruzka"),
        ("2026 Yükləmə-Qaimə Əlaqələri", "documents_pogruzka_rows"),
        ("2026 Satış Qaimələri (Başlıqlar)", "documents_realization"),
        ("2026 Satış Qaiməsi Sətirləri", "documents_realization_rows"),
        ("2026 Qaytarma Qaimələri (Başlıqlar)", "documents_vozvrat"),
        ("2026 Qaytarma Sətirləri", "documents_vozvrat_rows"),
        ("2026 Mədaxil Sənədləri", "documents_postuplenie"),
        ("2026 Müştəri Sifarişləri", "documents_zakaz"),
    ]

    print("\n" + "=" * 70, flush=True)
    print("TAM EXPORT MƏLUMAT CƏDVƏLİ (2026-01-01 TARİXİNDƏN BU GÜNƏDƏK):", flush=True)
    print("=" * 70, flush=True)
    for title, tbl in tables:
        try:
            chk_cur.execute(f"SELECT COUNT(*) FROM {tbl}")
            cnt = chk_cur.fetchone()[0]
            print(f" - {title:<36}: {cnt:>10,}", flush=True)
        except Exception:
            pass
    chk_conn.close()

    print("=" * 70, flush=True)
    print(f"Ümumi vaxt: {int(total_time // 60)} dəqiqə {int(total_time % 60)} saniyə", flush=True)
    print(f"Offline DB faylı: {DB_PATH}", flush=True)
    print(f"Fayl həcmi: {f_size_mb:.2f} MB ({f_size:,} bayt)", flush=True)
    print("STATUS: 1C TEST BAZASININ BÜTÜN 2026 DATASI UĞURLA YÜKLƏNDİ!", flush=True)
    print("=" * 70, flush=True)

if __name__ == "__main__":
    run_export()
