# -*- coding: utf-8 -*-
import os
import re
import sys
import datetime
import threading
import queue
import time
import json
from flask import Flask, render_template, request, jsonify, send_file
import win32com.client
import pythoncom

sys.stdout.reconfigure(encoding='utf-8')

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


SCRATCH_DIR = os.path.dirname(os.path.abspath(__file__))
EXCEL_OUTPUT = os.path.join(SCRATCH_DIR, "report_export.xlsx")
UNIVERSAL_EXCEL = os.path.join(SCRATCH_DIR, "universal_export.xlsx")
UNIVERSAL_REPORT_EXCEL = os.path.join(SCRATCH_DIR, "universal_report_export.xlsx")
PORTFOLIO_EXCEL = os.path.join(SCRATCH_DIR, "portfolio_catalog_export.xlsx")
CACHE_DIR = os.path.join(SCRATCH_DIR, "epf_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

import traceback

def print_server_error(source, err, payload=None):
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print("\n" + "=" * 70, flush=True)
    print(f"❌ [1C SERVER XƏTASI] Tarix: {now_str} | Mənbə: {source}", flush=True)
    if payload:
        safe_p = dict(payload) if isinstance(payload, dict) else {"payload": str(payload)}
        if "password" in safe_p:
            safe_p["password"] = "***"
        print(f"📦 Parametrlər: {safe_p}", flush=True)
    print(f"⚠️ Xəta Təsviri: {err}", flush=True)
    print("-" * 70, flush=True)
    traceback.print_exc()
    print("=" * 70 + "\n", flush=True)

# -------------------------------------------------------------
# DEDICATED 1C STA WORKER THREAD WITH DIRECT ENGINE
# -------------------------------------------------------------
_folders_cache = {}

def is_vehicle_group(name):
    """
    Returns True if the nomenclature group name corresponds to a company vehicle,
    truck, fleet maintenance, or internal logistics asset, rather than commercial merchandise.
    """
    if not name:
        return True
    n_lower = name.lower().strip()
    v_keywords = [
        "yük", "yuk", "avto", "maşın", "masin", "qaraj", "garaj", "texnika",
        "hyundai", "isuzu", "mercedes", "mersedes", "kamaz", "gazel", "qazel",
        "sprinter", "vito", "transit", "tranzit", "volvo", "scania", "iveco",
        "shacman", "howo", "toyota", "nissan", "mitsubishi", "atego", "actros",
        "canter", "sonata", "elantra", "accent", "porter", "h-100", "hd-65", "hd-72", "hd-78", "bmw"
    ]
    if any(kw in n_lower for kw in v_keywords):
        return True
    # License plate regex e.g. 90JS920, 99JP045, 10 PD 421, 77JP142, etc.
    if re.search(r'\b\d{2}\s*[-\s]?[A-Za-z]{2}\s*[-\s]?\d{3}\b', name):
        return True
    return False

def get_folders_map(conn, base_key):
    global _folders_cache
    if base_key in _folders_cache:
        return _folders_cache[base_key]
    try:
        q_f = conn.NewObject("Запрос")
        q_f.Text = """
        ВЫБРАТЬ
            Т.Ссылка КАК Ref,
            Т.Код КАК Code,
            Т.Наименование КАК Name,
            Т.Родитель КАК Parent,
            Т.Родитель.Код КАК ParentCode
        ИЗ
            Справочник.Номенклатура КАК Т
        ГДЕ
            Т.ЭтоГруппа
        """
        res_f = q_f.Execute().Choose()
        fmap = {}
        while res_f.Next():
            r_id = conn.String(res_f.Ref)
            p_id = conn.String(res_f.Parent) if res_f.Parent else ""
            c_code = str(res_f.Code or "").strip()
            p_code = str(res_f.ParentCode or "").strip()
            nm = str(res_f.Name or "").strip()
            fmap[r_id] = (nm, p_id)
            if c_code:
                fmap[c_code] = (nm, p_code)
        _folders_cache[base_key] = fmap
        return fmap
    except Exception as ex_f:
        print("Error caching folders map:", ex_f)
        return {}

def resolve_root_portfolio(p_id, fmap):
    if not p_id or not fmap:
        return "Digər"
    curr = str(p_id).strip()
    last_name = "Digər"
    visited = set()
    while curr and curr in fmap and curr not in visited:
        visited.add(curr)
        name = fmap[curr][0]
        parent_ref = fmap[curr][1]
        last_name = name
        curr = parent_ref
    return last_name

_barcodes_cache = {}

def get_barcodes_map(conn, base_key):
    global _barcodes_cache
    if base_key in _barcodes_cache:
        return _barcodes_cache[base_key]
    try:
        q_b = conn.NewObject("Запрос")
        q_b.Text = """
        ВЫБРАТЬ
            Т.Владелец.Наименование КАК ItemName,
            Т.Штрихкод КАК Barcode,
            Т.ЕдиницаИзмерения.Наименование КАК UnitName,
            Т.ЕдиницаИзмерения.Коэффициент КАК Ratio
        ИЗ
            РегистрСведений.Штрихкоды КАК Т
        ГДЕ
            НЕ Т.Штрихкод ЕСТЬ NULL И Т.Штрихкод <> ""
        """
        res_b = q_b.Execute().Choose()
        b_map = {}
        while res_b.Next():
            iname = str(res_b.ItemName or "").strip()
            bc = str(res_b.Barcode or "").strip()
            uname = str(res_b.UnitName or "").strip().lower()
            ratio = float(res_b.Ratio or 1)
            if not iname or not bc:
                continue
            if iname not in b_map:
                b_map[iname] = {"unit": "", "box": "", "block": ""}

            if "blok" in uname or "блок" in uname or "упак" in uname:
                if not b_map[iname]["block"]:
                    b_map[iname]["block"] = bc
            elif "qutu" in uname or "кор" in uname or "ящ" in uname or ratio > 1:
                if not b_map[iname]["box"]:
                    b_map[iname]["box"] = bc
            else: # "əd", "ədəd", "шт", ratio == 1
                if not b_map[iname]["unit"]:
                    b_map[iname]["unit"] = bc

        _barcodes_cache[base_key] = b_map
        return b_map
    except Exception as e:
        print("get_barcodes_map error:", e)
        return {}

_price_types_cache = {}

def get_all_price_types(conn, base_key):
    global _price_types_cache
    if base_key in _price_types_cache:
        return _price_types_cache[base_key]
    try:
        qp = conn.NewObject("Запрос")
        qp.Text = """
        ВЫБРАТЬ
            Т.Код КАК Code,
            Т.Наименование КАК Name,
            Т.ВалютаЦены.Наименование КАК Currency
        ИЗ
            Справочник.ТипыЦенНоменклатуры КАК Т
        УПОРЯДОЧИТЬ ПО
            Т.Наименование
        """
        resp = qp.Execute().Choose()
        pts = [
            {"code": "20", "name": "20", "desc": "20"},
            {"code": "cost", "name": "Себестоимость", "desc": "Себестоимость"}
        ]
        seen_names = {"20", "себестоимость"}
        while resp.Next():
            p_name = str(resp.Name or "").strip()
            p_code = str(resp.Code or "").strip()
            if not p_name:
                continue
            if p_name.lower() not in seen_names:
                seen_names.add(p_name.lower())
                pts.append({
                    "code": p_code or p_name,
                    "name": p_name,
                    "desc": p_name
                })
        _price_types_cache[base_key] = pts
        return pts
    except Exception as e:
        print("get_all_price_types error:", e)
        return [
            {"code": "20", "name": "20", "desc": "20"},
            {"code": "cost", "name": "Себестоимость", "desc": "Себестоимость"},
            {"code": "60", "name": "60", "desc": "60"},
            {"code": "30", "name": "30", "desc": "30"},
            {"code": "10", "name": "10", "desc": "10"},
            {"code": "100", "name": "100", "desc": "100"},
            {"code": "50", "name": "50", "desc": "50"}
        ]

class OneCService(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.req_q = queue.Queue()
        self.connections = {}
        self.start()

    def run(self):
        pythoncom.CoInitialize()
        connector = win32com.client.Dispatch("V83.COMConnector")
        print("1C Dedicated STA Worker Thread Ready.")

        while True:
            action, payload, resp_q = self.req_q.get()
            if action == "shutdown":
                print("1C Worker shutting down: releasing COM sessions...", flush=True)
                for k in list(self.connections.keys()):
                    self.connections[k] = None
                self.connections.clear()
                connector = None
                try:
                    pythoncom.CoUninitialize()
                except Exception:
                    pass
                resp_q.put((True, "Closed"))
                break
            try:
                active_base = database.get_active_base() or {}
                server = payload.get("server") or active_base.get("server") or "Test1C"
                base = payload.get("ref") or active_base.get("ref") or "Aztrade_test3"
                user = payload.get("user") or active_base.get("user") or "Nesib"
                pwd = payload.get("password") or active_base.get("password") or "15963"
                if str(user).strip().lower() in ["nesib admin", "nesibadmin", "nəsib"]:
                    user = "Nesib"
                key = f"{server.lower()}_{base.lower()}_{user.lower()}_{pwd}"

                conn = self.connections.get(key)
                if conn is not None:
                    # Check connection liveness using valid COMConnector method String(1)
                    try:
                        _ = conn.String(1)
                    except Exception as e_hb:
                        print(f"🔄 [1C SESSIYA BƏRPASI] COM sessiyası qırılıb ({e_hb}), yenidən qoşulur...", flush=True)
                        self.connections.pop(key, None)
                        conn = None

                if conn is None:
                    # Release previous connection to prevent 1C license exhaustion (1 concurrent license limit)
                    for old_key in list(self.connections.keys()):
                        if old_key != key:
                            print(f"🔄 [1C BAZA DƏYİŞDİ] Köhnə COM sessiya azad edilir: {old_key} -> Yeni: {key}", flush=True)
                            self.connections[old_key] = None
                            self.connections.pop(old_key, None)

                    t0 = time.time()
                    conn_str = f'Srvr="{server}";Ref="{base}";Usr="{user}";Pwd="{pwd}";'
                    conn = connector.Connect(conn_str)
                    self.connections[key] = conn
                    print(f"1C Session connected to [{server} / {base} / {user}] in {time.time() - t0:.2f} s", flush=True)

                # 0. Action: Ping connection
                if action == "ping":
                    _ = conn.String(1)
                    resp_q.put((True, "pong"))

                # 1. Action: Get Users
                elif action == "get_users":
                    q = conn.NewObject("Запрос")
                    q.Text = "ВЫБРАТЬ Т.Наименование КАК Name, Т.Код КАК Code ИЗ Справочник.Пользователи КАК Т ГДЕ НЕ Т.ПометкаУдаления УПОРЯДОЧИТЬ ПО Name"
                    res = q.Execute().Choose()
                    users_list = []
                    while res.Next():
                        name = str(res.Name).strip()
                        code = str(res.Code).strip()
                        if name: users_list.append({"name": name, "code": code})
                    resp_q.put((True, users_list))

                # 2. Action: Get Portfolios list
                elif action == "get_portfolios":
                    q = conn.NewObject("Запрос")
                    q.Text = """
                    ВЫБРАТЬ РАЗЛИЧНЫЕ
                        Т.Наименование КАК Portfolio
                    ИЗ
                        Справочник.Портфели КАК Т
                    ГДЕ
                        НЕ Т.ПометкаУдаления
                    УПОРЯДОЧИТЬ ПО
                        Portfolio
                    """
                    res = q.Execute().Choose()
                    plist = []
                    while res.Next():
                        p_str = str(res.Portfolio or "").strip()
                        if p_str and p_str not in plist:
                            plist.append(p_str)
                    resp_q.put((True, sorted(plist)))

                # 3. Action: Get Agents list
                elif action == "get_agents":
                    q = conn.NewObject("Запрос")
                    q.Text = """
                    ВЫБРАТЬ РАЗЛИЧНЫЕ
                        Договоры.Агент.Наименование КАК AgentName
                    ИЗ
                        Справочник.ДоговорыКонтрагентов КАК Договоры
                    ГДЕ
                        НЕ Договоры.Агент ЕСТЬ NULL 
                        И Договоры.Агент <> ЗНАЧЕНИЕ(Справочник.ФизическиеЛица.ПустаяСсылка)
                    УПОРЯДОЧИТЬ ПО
                        AgentName
                    """
                    res = q.Execute().Choose()
                    ag_list = []
                    while res.Next():
                        ag_name = str(res.AgentName or "").strip()
                        if ag_name and ag_name not in ["-", "None"] and ag_name not in ag_list:
                            ag_list.append(ag_name)
                    resp_q.put((True, sorted(ag_list)))

                # 4. Action: Search Kontragents
                elif action == "search_kontragents":
                    pat = payload.get("query", "").strip()
                    q = conn.NewObject("Запрос")
                    q.Text = """
                    ВЫБРАТЬ ПЕРВЫЕ 25
                        Т.Наименование КАК Name,
                        Т.Код КАК Code
                    ИЗ
                        Справочник.Контрагенты КАК Т
                    ГДЕ
                        НЕ Т.ЭтоГруппа
                        И (Т.Наименование ПОДОБНО &Pattern ИЛИ Т.Код ПОДОБНО &Pattern)
                    УПОРЯДОЧИТЬ ПО
                        Т.Наименование
                    """
                    q.SetParameter("Pattern", f"%{pat}%")
                    res = q.Execute().Choose()
                    k_list = []
                    while res.Next():
                        k_list.append({"name": str(res.Name).strip(), "code": str(res.Code).strip()})
                    resp_q.put((True, k_list))

                # 5. Action: Search Nomenklatura
                elif action == "search_nomenklatura":
                    pat = payload.get("query", "").strip()
                    q = conn.NewObject("Запрос")
                    q.Text = """
                    ВЫБРАТЬ ПЕРВЫЕ 25
                        Т.Наименование КАК Name,
                        Т.Артикул КАК Artikul,
                        Т.Код КАК Code
                    ИЗ
                        Справочник.Номенклатура КАК Т
                    ГДЕ
                        НЕ Т.ЭтоГруппа
                        И (Т.Наименование ПОДОБНО &Pattern ИЛИ Т.Артикул ПОДОБНО &Pattern ИЛИ Т.Код ПОДОБНО &Pattern)
                    УПОРЯДОЧИТЬ ПО
                        Т.Наименование
                    """
                    q.SetParameter("Pattern", f"%{pat}%")
                    res = q.Execute().Choose()
                    n_list = []
                    while res.Next():
                        n_list.append({
                            "name": str(res.Name).strip(),
                            "artikul": str(res.Artikul or "").strip(),
                            "code": str(res.Code).strip()
                        })
                    resp_q.put((True, n_list))

                # 6. Action: Universal Sales Constructor Query
                elif action == "universal_sales":
                    date_start_str = payload.get("date_start", "2026-09-01")
                    date_end_str = payload.get("date_end", "2026-09-28")
                    kontragent = payload.get("kontragent", "").strip()
                    agent = payload.get("agent", "").strip()
                    nomenklatura = payload.get("nomenklatura", "").strip()
                    portfolio = payload.get("portfolio", "").strip()
                    limit = int(payload.get("limit", 300))

                    try:
                        y1, m1, d1 = map(int, date_start_str.split("-"))
                        dt_start = datetime.datetime(y1, m1, d1, 4, 0, 0)
                        y2, m2, d2 = map(int, date_end_str.split("-"))
                        dt_end = datetime.datetime(y2, m2, d2, 23, 59, 59)
                    except Exception:
                        dt_start = datetime.datetime(2026, 9, 1, 4, 0, 0)
                        dt_end = datetime.datetime(2026, 9, 28, 23, 59, 59)

                    query = conn.NewObject("Запрос")
                    where_clauses = ["ПродажиОбороты.КоличествоОборот <> 0"]

                    if kontragent:
                        clean_k = re.sub(r'["“»«”\',]', ' ', kontragent).strip()
                        k_words = [w for w in clean_k.split() if len(w) >= 2]
                        if k_words:
                            sub_clauses = [f"(ПродажиОбороты.Контрагент.Наименование ПОДОБНО &KWord_{i} ИЛИ ПродажиОбороты.Контрагент.Код ПОДОБНО &KWord_{i})" for i in range(len(k_words))]
                            where_clauses.append("(" + " AND ".join(sub_clauses) + ")")
                            for i, w in enumerate(k_words):
                                query.SetParameter(f"KWord_{i}", f"%{w}%")
                        else:
                            where_clauses.append('(ПродажиОбороты.Контрагент.Наименование ПОДОБНО &KontragentPattern ИЛИ ПродажиОбороты.Контрагент.Код ПОДОБНО &KontragentPattern)')
                            query.SetParameter("KontragentPattern", f"%{kontragent}%")

                    if agent:
                        where_clauses.append('ПродажиОбороты.ДоговорКонтрагента.Агент.Наименование ПОДОБНО &AgentPattern')
                        query.SetParameter("AgentPattern", f"%{agent}%")

                    if nomenklatura:
                        clean_n = re.sub(r'["“»«”\',]', ' ', nomenklatura).strip()
                        n_words = [w for w in clean_n.split() if len(w) >= 2]
                        if n_words:
                            sub_clauses = [f"(ПродажиОбороты.Номенклатура.Наименование ПОДОБНО &NWord_{i} ИЛИ ПродажиОбороты.Номенклатура.Артикул ПОДОБНО &NWord_{i})" for i in range(len(n_words))]
                            where_clauses.append("(" + " AND ".join(sub_clauses) + ")")
                            for i, w in enumerate(n_words):
                                query.SetParameter(f"NWord_{i}", f"%{w}%")
                        else:
                            where_clauses.append('(ПродажиОбороты.Номенклатура.Наименование ПОДОБНО &NomPattern ИЛИ ПродажиОбороты.Номенклатура.Артикул ПОДОБНО &NomPattern)')
                            query.SetParameter("NomPattern", f"%{nomenklatura}%")

                    if portfolio:
                        where_clauses.append('ПродажиОбороты.ДоговорКонтрагента.Портфель.Наименование ПОДОБНО &PortPattern')
                        query.SetParameter("PortPattern", f"%{portfolio}%")

                    where_sql = " AND ".join(where_clauses)
                    limit_sql = f"ПЕРВЫЕ {limit}" if limit > 0 else ""

                    sql = f"""
                    ВЫБРАТЬ {limit_sql}
                        ПродажиОбороты.Контрагент.Наименование КАК Kontragent,
                        ПродажиОбороты.Контрагент.Код КАК KontragentCode,
                        ПродажиОбороты.ДоговорКонтрагента.Агент.Наименование КАК Agent,
                        ПродажиОбороты.ДоговорКонтрагента.Портфель.Наименование КАК Portfolio,
                        ПродажиОбороты.Номенклатура.Наименование КАК Nomenklatura,
                        ПродажиОбороты.Номенклатура.Артикул КАК Artikul,
                        СУММА(ПродажиОбороты.КоличествоОборот) КАК Qty,
                        ВЫБОР 
                            КОГДА СУММА(ПродажиОбороты.КоличествоОборот) <> 0 
                                ТОГДА СУММА(ПродажиОбороты.СтоимостьБезСкидокОборот) / СУММА(ПродажиОбороты.КоличествоОборот) 
                            ИНАЧЕ 0 
                        КОНЕЦ КАК UnitPrice,
                        СУММА(ПродажиОбороты.СтоимостьБезСкидокОборот) КАК SumGross,
                        СУММА(ПродажиОбороты.СтоимостьБезСкидокОборот) - СУММА(ПродажиОбороты.СтоимостьОборот) КАК SumDiscount,
                        ВЫБОР 
                            КОГДА СУММА(ПродажиОбороты.СтоимостьБезСкидокОборот) <> 0 
                                ТОГДА (СУММА(ПродажиОбороты.СтоимостьБезСкидокОборот) - СУММА(ПродажиОбороты.СтоимостьОборот)) / СУММА(ПродажиОбороты.СтоимостьБезСкидокОборот) * 100 
                            ИНАЧЕ 0 
                        КОНЕЦ КАК PctDiscount,
                        СУММА(ПродажиОбороты.СтоимостьОборот) КАК SumNet
                    ИЗ
                        РегистрНакопления.Продажи.Обороты(&НачалоПериода, &КонецПериода, Авто, ) КАК ПродажиОбороты
                    ГДЕ
                        {where_sql}
                    СГРУППИРОВАТЬ ПО
                        ПродажиОбороты.Контрагент.Наименование,
                        ПродажиОбороты.Контрагент.Код,
                        ПродажиОбороты.ДоговорКонтрагента.Агент.Наименование,
                        ПродажиОбороты.ДоговорКонтрагента.Портфель.Наименование,
                        ПродажиОбороты.Номенклатура.Наименование,
                        ПродажиОбороты.Номенклатура.Артикул
                    УПОРЯДОЧИТЬ ПО
                        Kontragent,
                        Nomenklatura
                    """
                    query.Text = sql
                    query.SetParameter("НачалоПериода", dt_start)
                    query.SetParameter("КонецПериода", dt_end)

                    res = query.Execute().Choose()

                    headers = [
                        "№",
                        "Müştəri (Dükan)",
                        "Agent",
                        "Portfel",
                        "Məhsul (Nomenklatura)",
                        "Artikul",
                        "Say (Ədəd)",
                        "1 Vahidin Qiyməti",
                        "Toplam Məbləğ (Gross)",
                        "Endirim Məbləği",
                        "Endirim %",
                        "Yekun Satış (Net)"
                    ]

                    rows = []
                    tot_qty = 0.0
                    tot_gross = 0.0
                    tot_disc = 0.0
                    tot_net = 0.0
                    idx = 1

                    while res.Next():
                        k_name = str(res.Kontragent or "").strip()
                        ag_name = str(res.Agent or "-").strip()
                        p_name = str(res.Portfolio or "-").strip()
                        n_name = str(res.Nomenklatura or "").strip()
                        art = str(res.Artikul or "-").strip()
                        qty = float(res.Qty or 0)
                        u_price = float(res.UnitPrice or 0)
                        s_gross = float(res.SumGross or 0)
                        s_disc = float(res.SumDiscount or 0)
                        p_disc = float(res.PctDiscount or 0)
                        s_net = float(res.SumNet or 0)

                        tot_qty += qty
                        tot_gross += s_gross
                        tot_disc += s_disc
                        tot_net += s_net

                        rows.append({
                            "index": idx,
                            "kontragent": k_name,
                            "agent": ag_name,
                            "portfolio": p_name,
                            "nomenklatura": n_name,
                            "artikul": art,
                            "qty": qty,
                            "unit_price": u_price,
                            "sum_gross": s_gross,
                            "sum_discount": s_disc,
                            "pct_discount": p_disc,
                            "sum_net": s_net,
                            "cells": [
                                str(idx),
                                k_name,
                                ag_name,
                                p_name,
                                n_name,
                                art,
                                f"{qty:,.2f}".replace(",", " "),
                                f"{u_price:,.2f}".replace(",", " "),
                                f"{s_gross:,.2f}".replace(",", " "),
                                f"{s_disc:,.2f}".replace(",", " "),
                                f"{p_disc:.1f}%",
                                f"{s_net:,.2f}".replace(",", " ")
                            ]
                        })
                        idx += 1

                    avg_pct = (tot_disc / tot_gross * 100) if tot_gross > 0 else 0.0
                    totals = {
                        "tot_qty": tot_qty,
                        "tot_gross": tot_gross,
                        "tot_discount": tot_disc,
                        "avg_discount_pct": avg_pct,
                        "tot_net": tot_net,
                        "cells": [
                            "YEKUN",
                            f"{len(rows)} məhsul sətiri",
                            "-",
                            "-",
                            "-",
                            "-",
                            f"{tot_qty:,.2f}".replace(",", " "),
                            "-",
                            f"{tot_gross:,.2f}".replace(",", " "),
                            f"{tot_disc:,.2f}".replace(",", " "),
                            f"{avg_pct:.1f}%",
                            f"{tot_net:,.2f}".replace(",", " ")
                        ]
                    }

                    # Write to Excel
                    try:
                        tab_doc = conn.NewObject("ТабличныйДокумент")
                        for c_idx, h in enumerate(headers, 1):
                            tab_doc.Область(1, c_idx).Текст = h
                        for r_idx, r in enumerate(rows, 2):
                            for c_idx, val in enumerate(r["cells"], 1):
                                tab_doc.Область(r_idx, c_idx).Текст = str(val)
                        t_row_idx = len(rows) + 2
                        for c_idx, val in enumerate(totals["cells"], 1):
                            tab_doc.Область(t_row_idx, c_idx).Текст = str(val)
                        tab_doc.Записать(UNIVERSAL_EXCEL, conn.ТипФайлаТабличногоДокумента.XLSX)
                    except Exception as ex_err:
                        print("Error creating universal excel:", ex_err)

                    resp_q.put((True, {
                        "period": f"{date_start_str} - {date_end_str}",
                        "headers": headers,
                        "rows": rows,
                        "totals": totals,
                        "total_rows": len(rows),
                        "excel_available": True
                    }))

                # 6b. Action: Universal Report (Товары на складах)
                elif action == "universal_report":
                    start_date_str = payload.get("start_date", "01.09.2026")
                    end_date_str = payload.get("end_date", "30.09.2026")
                    params = payload.get("parameters", {})
                    indicators = payload.get("indicators", {})
                    row_groupings = payload.get("row_groupings", [])
                    filters = payload.get("filters", [])

                    try:
                        d1, m1, y1 = map(int, start_date_str.split("."))
                        dt_start = datetime.datetime(y1, m1, d1, 0, 0, 0)
                        d2, m2, y2 = map(int, end_date_str.split("."))
                        dt_end = datetime.datetime(y2, m2, d2, 23, 59, 59)
                    except Exception:
                        dt_start = datetime.datetime(2026, 9, 1, 0, 0, 0)
                        dt_end = datetime.datetime(2026, 9, 30, 23, 59, 59)

                    q = conn.NewObject("Запрос")
                    where_clauses = []
                    p_idx = 0

                    for f in filters:
                        if not f.get("active"):
                            continue
                        f_field = f.get("field", "")
                        f_comp = f.get("comparison", "equal")
                        f_val = str(f.get("value", "")).strip()

                        if f_field == "КоличествоКонечныйОстаток":
                            try:
                                val_num = float(f_val.replace(" ", "").replace(",", "."))
                            except Exception:
                                val_num = 0.0
                            if f_comp == "less":
                                where_clauses.append(f"Т.КоличествоКонечныйОстаток < {val_num}")
                            elif f_comp == "less_or_equal":
                                where_clauses.append(f"Т.КоличествоКонечныйОстаток <= {val_num}")
                            elif f_comp == "greater":
                                where_clauses.append(f"Т.КоличествоКонечныйОстаток > {val_num}")
                            elif f_comp == "greater_or_equal":
                                where_clauses.append(f"Т.КоличествоКонечныйОстаток >= {val_num}")
                            elif f_comp == "not_equal":
                                where_clauses.append(f"Т.КоличествоКонечныйОстаток <> {val_num}")
                            else:
                                where_clauses.append(f"Т.КоличествоКонечныйОстаток = {val_num}")

                        elif f_field == "КоличествоРасход":
                            try:
                                val_num = float(f_val.replace(" ", "").replace(",", "."))
                            except Exception:
                                val_num = 0.0
                            if f_comp == "greater":
                                where_clauses.append(f"Т.КоличествоРасход > {val_num}")
                            elif f_comp == "less":
                                where_clauses.append(f"Т.КоличествоРасход < {val_num}")
                            else:
                                where_clauses.append(f"Т.КоличествоРасход = {val_num}")

                        elif f_field == "Склад":
                            if not f_val:
                                continue
                            w_parts = [w.strip() for w in re.split(r'[;,]', f_val) if w.strip()]
                            if len(w_parts) > 1 or f_comp in ["in_list", "in_group", "in_group_list"]:
                                sub_p = []
                                for part in w_parts:
                                    try:
                                        q_chk_w = conn.NewObject("Запрос")
                                        q_chk_w.Text = "ВЫБРАТЬ ПЕРВЫЕ 1 Т.Ссылка КАК Ref, Т.ЭтоГруппа КАК IsFolder ИЗ Справочник.Склады КАК Т ГДЕ Т.Наименование = &WName ИЛИ Т.Код = &WName"
                                        q_chk_w.SetParameter("WName", part)
                                        r_chk_w = q_chk_w.Execute().Choose()
                                        if r_chk_w.Next() and r_chk_w.IsFolder:
                                            p_name = f"WhHier_{p_idx}"
                                            p_idx += 1
                                            sub_p.append(f"Т.Склад В ИЕРАРХИИ (&{p_name})")
                                            q.SetParameter(p_name, r_chk_w.Ref)
                                        else:
                                            p_name = f"WhParam_{p_idx}"
                                            p_idx += 1
                                            sub_p.append(f"(Т.Склад.Наименование = &{p_name} ИЛИ Т.Склад.Код = &{p_name})")
                                            q.SetParameter(p_name, part)
                                    except Exception:
                                        p_name = f"WhParam_{p_idx}"
                                        p_idx += 1
                                        sub_p.append(f"(Т.Склад.Наименование = &{p_name} ИЛИ Т.Склад.Код = &{p_name})")
                                        q.SetParameter(p_name, part)
                                if sub_p:
                                    if f_comp == "not_equal":
                                        where_clauses.append("НЕ (" + " ИЛИ ".join(sub_p) + ")")
                                    else:
                                        where_clauses.append("(" + " ИЛИ ".join(sub_p) + ")")
                            elif f_comp == "not_equal":
                                p_name = f"WhParam_{p_idx}"
                                p_idx += 1
                                where_clauses.append(f"(Т.Склад.Наименование <> &{p_name} И Т.Склад.Код <> &{p_name})")
                                q.SetParameter(p_name, f_val)
                            elif f_comp == "contains":
                                p_name = f"WhParam_{p_idx}"
                                p_idx += 1
                                where_clauses.append(f"(Т.Склад.Наименование ПОДОБНО &{p_name} ИЛИ Т.Склад.Код ПОДОБНО &{p_name})")
                                q.SetParameter(p_name, f"%{f_val}%")
                            else: # "equal" / "Равно" - strictly exact match on warehouse, NO hierarchy!
                                p_name = f"WhParam_{p_idx}"
                                p_idx += 1
                                where_clauses.append(f"(Т.Склад.Наименование = &{p_name} ИЛИ Т.Склад.Код = &{p_name})")
                                q.SetParameter(p_name, f_val)

                        elif f_field == "Номенклатура":
                            if not f_val:
                                continue
                            n_parts = [w.strip() for w in re.split(r'[;,]', f_val) if w.strip()]
                            if len(n_parts) > 1 or f_comp in ["in_list", "in_group", "in_group_list"]:
                                sub_p = []
                                for part in n_parts:
                                    try:
                                        q_chk = conn.NewObject("Запрос")
                                        q_chk.Text = 'ВЫБРАТЬ ПЕРВЫЕ 1 Т.Ссылка КАК Ref, Т.ЭтоГруппа КАК IsFolder ИЗ Справочник.Номенклатура КАК Т ГДЕ Т.ЭтоГруппа И (Т.Наименование ПОДОБНО &PName ИЛИ Т.Код ПОДОБНО &PName)'
                                        q_chk.SetParameter("PName", f"%{part}%")
                                        r_chk = q_chk.Execute().Choose()
                                        if r_chk.Next():
                                            p_name = f"NomHier_{p_idx}"
                                            p_idx += 1
                                            sub_p.append(f"Т.Номенклатура В ИЕРАРХИИ (&{p_name})")
                                            q.SetParameter(p_name, r_chk.Ref)
                                        else:
                                            p_name = f"NomParam_{p_idx}"
                                            p_idx += 1
                                            sub_p.append(f"(Т.Номенклатура.Наименование = &{p_name} ИЛИ Т.Номенклатура.Код = &{p_name} ИЛИ Т.Номенклатура.Артикул = &{p_name})")
                                            q.SetParameter(p_name, part)
                                    except Exception:
                                        p_name = f"NomParam_{p_idx}"
                                        p_idx += 1
                                        sub_p.append(f"(Т.Номенклатура.Наименование = &{p_name} ИЛИ Т.Номенклатура.Код = &{p_name} ИЛИ Т.Номенклатура.Артикул = &{p_name})")
                                        q.SetParameter(p_name, part)

                                if sub_p:
                                    if f_comp == "not_equal":
                                        where_clauses.append("НЕ (" + " ИЛИ ".join(sub_p) + ")")
                                    else:
                                        where_clauses.append("(" + " ИЛИ ".join(sub_p) + ")")
                            elif f_comp == "equal": # "Равно" - strictly exact item, NO hierarchy!
                                p_name = f"NomParam_{p_idx}"
                                p_idx += 1
                                where_clauses.append(f"(Т.Номенклатура.Наименование = &{p_name} ИЛИ Т.Номенклатура.Код = &{p_name} ИЛИ Т.Номенклатура.Артикул = &{p_name})")
                                q.SetParameter(p_name, f_val)
                            elif f_comp == "not_equal":
                                p_name = f"NomParam_{p_idx}"
                                p_idx += 1
                                where_clauses.append(f"(Т.Номенклатура.Наименование <> &{p_name} И Т.Номенклатура.Код <> &{p_name} И Т.Номенклатура.Артикул <> &{p_name})")
                                q.SetParameter(p_name, f_val)
                            else: # contains
                                p_name = f"NomParam_{p_idx}"
                                p_idx += 1
                                where_clauses.append(f"(Т.Номенклатура.Наименование ПОДОБНО &{p_name} ИЛИ Т.Номенклатура.Код ПОДОБНО &{p_name} ИЛИ Т.Номенклатура.Артикул ПОДОБНО &{p_name})")
                                q.SetParameter(p_name, f"%{f_val}%")

                        elif f_field == "Портфель" or "портфел" in f_field.lower() or "номенклатурная группа" in f_field.lower():
                            if not f_val:
                                continue
                            port_parts = [p.strip() for p in re.split(r'[;,]', f_val) if p.strip()]
                            sub_p = []
                            for part in port_parts:
                                try:
                                    q_chk = conn.NewObject("Запрос")
                                    q_chk.Text = "ВЫБРАТЬ ПЕРВЫЕ 5 Т.Ссылка КАК Ref ИЗ Справочник.Номенклатура КАК Т ГДЕ Т.ЭтоГруппа И (Т.Наименование ПОДОБНО &PName ИЛИ Т.Код ПОДОБНО &PName)"
                                    q_chk.SetParameter("PName", f"%{part}%")
                                    r_chk = q_chk.Execute().Choose()
                                    folder_matched = False
                                    while r_chk.Next():
                                        p_name = f"PortHier_{p_idx}"
                                        p_idx += 1
                                        sub_p.append(f"Т.Номенклатура В ИЕРАРХИИ (&{p_name})")
                                        q.SetParameter(p_name, r_chk.Ref)
                                        folder_matched = True
                                    if not folder_matched:
                                        p_name = f"PortNG_{p_idx}"
                                        p_idx += 1
                                        sub_p.append(f"Т.Номенклатура.НоменклатурнаяГруппа.Наименование ПОДОБНО &{p_name}")
                                        q.SetParameter(p_name, f"%{part}%")
                                except Exception as ex_p:
                                    p_name = f"PortNG_{p_idx}"
                                    p_idx += 1
                                    sub_p.append(f"Т.Номенклатура.НоменклатурнаяГруппа.Наименование ПОДОБНО &{p_name}")
                                    q.SetParameter(p_name, f"%{part}%")
                            if sub_p:
                                if f_comp == "not_equal":
                                    where_clauses.append("НЕ (" + " ИЛИ ".join(sub_p) + ")")
                                else:
                                    where_clauses.append("(" + " ИЛИ ".join(sub_p) + ")")

                        elif f_field == "Качество":
                            if not f_val:
                                continue
                            p_name = f"QParam_{p_idx}"
                            p_idx += 1
                            if f_comp == "not_equal":
                                where_clauses.append(f"НЕ Т.Качество.Наименование ПОДОБНО &{p_name}")
                            else:
                                where_clauses.append(f"Т.Качество.Наименование ПОДОБНО &{p_name}")
                            q.SetParameter(p_name, f"%{f_val}%")

                        elif "вид операции" in f_field.lower() or "видоперации" in f_field.lower():
                            if not f_val:
                                continue
                            has_registrar = True
                            op_parts = [p.strip() for p in re.split(r'[;,]', f_val) if p.strip()]
                            sub_ops = []
                            for part in op_parts:
                                p_name = f"OpParam_{p_idx}"
                                p_idx += 1
                                sub_ops.append(f"(ПРЕДСТАВЛЕНИЕ(Т.Регистратор.ВидОперации) ПОДОБНО &{p_name} ИЛИ ПРЕДСТАВЛЕНИЕ(Т.Регистратор) ПОДОБНО &{p_name} ИЛИ ТИПЗНАЧЕНИЯ(Т.Регистратор) ПОДОБНО &{p_name})")
                                q.SetParameter(p_name, f"%{part}%")
                            if sub_ops:
                                if f_comp == "not_equal":
                                    where_clauses.append("НЕ (" + " ИЛИ ".join(sub_ops) + ")")
                                else:
                                    where_clauses.append("(" + " ИЛИ ".join(sub_ops) + ")")

                        elif "регистратор" in f_field.lower() or "документ" in f_field.lower():
                            if not f_val:
                                continue
                            has_registrar = True
                            doc_parts = [p.strip() for p in re.split(r'[;,]', f_val) if p.strip()]
                            sub_docs = []
                            for part in doc_parts:
                                p_name = f"DocParam_{p_idx}"
                                p_idx += 1
                                sub_docs.append(f"(ПРЕДСТАВЛЕНИЕ(Т.Регистратор) ПОДОБНО &{p_name} ИЛИ Т.Регистратор.Номер ПОДОБНО &{p_name})")
                                q.SetParameter(p_name, f"%{part}%")
                            if sub_docs:
                                if f_comp == "not_equal":
                                    where_clauses.append("НЕ (" + " ИЛИ ".join(sub_docs) + ")")
                                else:
                                    where_clauses.append("(" + " ИЛИ ".join(sub_docs) + ")")

                    where_sql = ("ГДЕ " + " И ".join(where_clauses)) if where_clauses else ""

                    # Dynamic Multi-Level Grouping Engine (Portfolio, Warehouse, Item, Doc/Movement)
                    active_groupings = [g.get("field", "").strip() for g in row_groupings if g.get("field", "").strip()]
                    if not active_groupings:
                        active_groupings = ["Склад", "Номенклатура"]

                    group_keys = []
                    has_registrar = False
                    show_doc_as_grouping = False  # True = doc is explicit grouping level
                    # If any registrar or operation filter active, ensure registrar data is retrieved
                    if any("регистратор" in f.get("field", "").lower() or "вид операции" in f.get("field", "").lower() or "документ" in f.get("field", "").lower() for f in filters if f.get("active")):
                        has_registrar = True

                    for f_name in active_groupings:
                        fn_l = f_name.lower()
                        if "портфел" in fn_l or "номенклатурная группа" in fn_l:
                            if "portfolio" not in group_keys:
                                group_keys.append("portfolio")
                        elif "склад" in fn_l:
                            if "warehouse" not in group_keys:
                                group_keys.append("warehouse")
                        elif "номенклатура" in fn_l:
                            if "item" not in group_keys:
                                group_keys.append("item")
                        elif "регистратор" in fn_l or "документ движения" in fn_l or "документ" in fn_l or "вид операции" in fn_l:
                            has_registrar = True
                            show_doc_as_grouping = True
                            if "registrar" not in group_keys:
                                group_keys.append("registrar")

                    if "item" not in group_keys:
                        # Insert item before registrar if present
                        if "registrar" in group_keys:
                            idx_reg = group_keys.index("registrar")
                            group_keys.insert(idx_reg, "item")
                        else:
                            group_keys.append("item")

                    # If registrar present but not as grouping (auto), still fetch it for docs sub-list
                    if has_registrar and "registrar" not in group_keys:
                        pass  # docs will be collected under item node

                    periodicity_sql = "Авто" if has_registrar else ""
                    if has_registrar:
                        doc_select_sql = (
                            "Т.Регистратор.Номер КАК DocNumber, "
                            "ПРЕДСТАВЛЕНИЕ(Т.Регистратор) КАК DocPres, "
                            "Т.Регистратор.Дата КАК DocDate, "
                            "ТИПЗНАЧЕНИЯ(Т.Регистратор) КАК DocType,"
                        )
                    else:
                        doc_select_sql = "NULL КАК DocNumber, NULL КАК DocPres, NULL КАК DocDate, NULL КАК DocType,"

                    # Barcode Indicators
                    ind_bc_unit = bool(indicators.get("barcode_unit") or indicators.get("barcodeUnit"))
                    ind_bc_box = bool(indicators.get("barcode_box") or indicators.get("barcodeBox"))
                    ind_bc_block = bool(indicators.get("barcode_block") or indicators.get("barcodeBlock"))
                    if not (ind_bc_unit or ind_bc_box or ind_bc_block):
                        if indicators.get("barcode", True):
                            ind_bc_unit = True
                            ind_bc_box = True

                    has_any_bc = ind_bc_unit or ind_bc_box or ind_bc_block
                    bmap = get_barcodes_map(conn, key) if has_any_bc else {}

                    # Multi-Price Types Selection
                    raw_pts = payload.get("price_types")
                    if not raw_pts or not isinstance(raw_pts, list):
                        single_pt = str(payload.get("price_type") or "20").strip()
                        raw_pts = [single_pt] if single_pt else ["20"]

                    clean_pts = []
                    for pt in raw_pts:
                        if isinstance(pt, dict):
                            pt_s = str(pt.get("name") or pt.get("code") or "").strip()
                        else:
                            pt_s = str(pt).strip()
                        if pt_s and pt_s not in clean_pts and pt_s != "[object Object]":
                            clean_pts.append(pt_s)
                    if not clean_pts:
                        clean_pts = ["20"]
                    selected_price_types = clean_pts

                    # Multi-Price SQL Construction
                    price_select_parts = []
                    price_join_parts = []
                    price_params = {}
                    has_cost_join = False

                    for p_i, pt in enumerate(selected_price_types):
                        col_name = f"UnitPrice_{p_i}"
                        if pt.lower() in ("cost", "себестоимость"):
                            price_select_parts.append(f"ЕСТЬNULL(Партии.CostPrice, 0) КАК {col_name}")
                            has_cost_join = True
                        else:
                            price_select_parts.append(f"ЕСТЬNULL(Цены_{p_i}.Цена, 0) КАК {col_name}")
                            price_join_parts.append(f"""
                            ЛЕВОЕ СОЕДИНЕНИЕ РегистрСведений.ЦеныНоменклатуры.СрезПоследних(&КонецПериода, ТипЦен В (ВЫБРАТЬ Ссылка ИЗ Справочник.ТипыЦенНоменклатуры ГДЕ Наименование = &PriceType_{p_i})) КАК Цены_{p_i}
                            ПО Т.Номенклатура = Цены_{p_i}.Номенклатура
                            """)
                            price_params[f"PriceType_{p_i}"] = pt

                    if has_cost_join:
                        price_join_parts.append("""
                        ЛЕВОЕ СОЕДИНЕНИЕ (
                            ВЫБРАТЬ
                                П.Номенклатура КАК Номенклатура,
                                П.Склад КАК Склад,
                                ВЫБОР КОГДА СУММА(П.КоличествоОстаток) <> 0 
                                     ТОГДА СУММА(П.СтоимостьОстаток) / СУММА(П.КоличествоОстаток) 
                                     ИНАЧЕ 0 
                                КОНЕЦ КАК CostPrice
                            ИЗ
                                РегистрНакопления.ПартииТоваровНаСкладах.Остатки(&КонецПериода, ) КАК П
                            СГРУППИРОВАТЬ ПО
                                П.Номенклатура,
                                П.Склад
                        ) КАК Партии
                        ПО Т.Номенклатура = Партии.Номенклатура И Т.Склад = Партии.Склад
                        """)

                    price_select_sql = ", ".join(price_select_parts) + "," if price_select_parts else ""
                    price_join_sql = "\n".join(price_join_parts)

                    q.Text = f"""
                    ВЫБРАТЬ
                        Т.Склад.Наименование КАК Warehouse,
                        Т.Номенклатура.Наименование КАК Item,
                        Т.Номенклатура.Код КАК Code,
                        Т.Номенклатура.Артикул КАК Artikul,
                        Т.Номенклатура.Родитель КАК ParentRef,
                        {doc_select_sql}
                        {price_select_sql}
                        Т.КоличествоНачальныйОстаток КАК StartBal,
                        Т.КоличествоПриход КАК InQty,
                        Т.КоличествоРасход КАК OutQty,
                        Т.КоличествоКонечныйОстаток КАК EndBal,
                        Т.КоличествоОборот КАК Turnover
                    ИЗ
                        РегистрНакопления.ТоварыНаСкладах.ОстаткиИОбороты(&НачалоПериода, &КонецПериода, {periodicity_sql}, , ) КАК Т
                        {price_join_sql}
                    {where_sql}
                    УПОРЯДОЧИТЬ ПО
                        Warehouse,
                        Item
                    """
                    q.SetParameter("НачалоПериода", dt_start)
                    q.SetParameter("КонецПериода", dt_end)
                    for k_p, v_p in price_params.items():
                        q.SetParameter(k_p, v_p)

                    res = q.Execute().Choose()

                    fmap = get_folders_map(conn, key)
                    data_tree = {}
                    tot_start = 0.0
                    tot_in = 0.0
                    tot_out = 0.0
                    tot_end = 0.0
                    tot_to = 0.0
                    tot_sums = {pt: 0.0 for pt in selected_price_types}

                    while res.Next():
                        w_name = str(res.Warehouse or "Əsas Anbar").strip()
                        i_name = str(res.Item or "Məhsul").strip()
                        code = str(res.Code or "").strip()
                        art = str(res.Artikul or "").strip()
                        p_ref = conn.String(res.ParentRef) if res.ParentRef else ""
                        port_name = resolve_root_portfolio(p_ref, fmap)

                        # Document / Registrar fields
                        doc_no = str(res.DocNumber or "").strip() if has_registrar else ""
                        doc_p = str(res.DocPres or "").strip() if has_registrar else ""
                        if not doc_p or doc_p.lower() == "none":
                            doc_p = f"Документ №{doc_no}" if doc_no else ""

                        # Document date
                        try:
                            doc_date_raw = res.DocDate
                            if doc_date_raw and str(doc_date_raw) not in ("", "None"):
                                doc_date_str = doc_date_raw.strftime("%d.%m.%Y %H:%M") if hasattr(doc_date_raw, 'strftime') else str(doc_date_raw)[:16]
                            else:
                                doc_date_str = ""
                        except Exception:
                            doc_date_str = ""

                        s_bal = float(res.StartBal or 0)
                        in_q = float(res.InQty or 0)
                        out_q = float(res.OutQty or 0)
                        e_bal = float(res.EndBal or 0)
                        to_q = float(res.Turnover or 0)

                        # Prices per type
                        row_prices = {}
                        row_sums = {}
                        for p_i, pt in enumerate(selected_price_types):
                            col_name = f"UnitPrice_{p_i}"
                            p_val = float(getattr(res, col_name, 0.0) or 0.0)
                            row_prices[pt] = p_val
                            row_sums[pt] = e_bal * p_val

                        primary_price = row_prices.get(selected_price_types[0], 0.0)
                        primary_sum = row_sums.get(selected_price_types[0], 0.0)

                        # Barcode info for item
                        bc_info = bmap.get(i_name, {})
                        bc_unit = bc_info.get("unit", "")
                        bc_box = bc_info.get("box", "")
                        bc_block = bc_info.get("block", "")

                        tot_start += s_bal
                        tot_in += in_q
                        tot_out += out_q
                        tot_end += e_bal
                        tot_to += to_q
                        for pt in selected_price_types:
                            tot_sums[pt] += row_sums[pt]

                        # Navigate / build tree path
                        curr_dict = data_tree
                        for depth, gk in enumerate(group_keys):
                            if gk == "portfolio":
                                node_title = port_name
                                node_code = ""
                                node_art = ""
                                node_price = 0.0
                            elif gk == "warehouse":
                                node_title = w_name
                                node_code = ""
                                node_art = ""
                                node_price = 0.0
                            elif gk == "item":
                                node_title = i_name
                                node_code = code
                                node_art = art
                                node_price = primary_price
                            elif gk == "registrar":
                                # Document Movement node title
                                node_title = doc_p if doc_p else (f"Документ №{doc_no}" if doc_no else "(без документа)")
                                node_code = ""
                                node_art = ""
                                node_price = primary_price

                            if node_title not in curr_dict:
                                curr_dict[node_title] = {
                                    "title": node_title,
                                    "level": depth,
                                    "code": node_code,
                                    "artikul": node_art,
                                    "barcode_unit": bc_unit if gk == "item" else "",
                                    "barcode_box": bc_box if gk == "item" else "",
                                    "barcode_block": bc_block if gk == "item" else "",
                                    "unit_price": node_price,
                                    "prices": dict(row_prices) if gk == "item" else {pt: 0.0 for pt in selected_price_types},
                                    "start_bal": 0.0,
                                    "in_qty": 0.0,
                                    "out_qty": 0.0,
                                    "end_bal": 0.0,
                                    "turnover": 0.0,
                                    "end_sum": 0.0,
                                    "sums": {pt: 0.0 for pt in selected_price_types},
                                    "doc_number": doc_no if gk == "registrar" else "",
                                    "doc_date": doc_date_str if gk == "registrar" else "",
                                    "is_doc": gk == "registrar",
                                    "children": {},
                                    "docs": []
                                }
                            node = curr_dict[node_title]
                            node["start_bal"] += s_bal
                            node["in_qty"] += in_q
                            node["out_qty"] += out_q
                            node["end_bal"] += e_bal
                            node["turnover"] += to_q
                            node["end_sum"] += primary_sum
                            for pt in selected_price_types:
                                node["sums"][pt] = node["sums"].get(pt, 0.0) + row_sums.get(pt, 0.0)

                            if gk == "item":
                                node["barcode_unit"] = bc_unit
                                node["barcode_box"] = bc_box
                                node["barcode_block"] = bc_block
                                node["prices"] = dict(row_prices)
                                node["unit_price"] = primary_price
                            elif primary_price > 0 and not node.get("unit_price"):
                                node["unit_price"] = primary_price

                            # Legacy docs list (for backward compat — when registrar is NOT a grouping level)
                            if gk == "item" and has_registrar and not show_doc_as_grouping and doc_p:
                                node["docs"].append({
                                    "title": doc_p,
                                    "code": "",
                                    "artikul": "",
                                    "barcode_unit": "",
                                    "barcode_box": "",
                                    "barcode_block": "",
                                    "doc_number": doc_no,
                                    "doc_date": doc_date_str,
                                    "start_bal": s_bal,
                                    "in_qty": in_q,
                                    "out_qty": out_q,
                                    "end_bal": e_bal,
                                    "turnover": to_q,
                                    "unit_price": primary_price,
                                    "prices": dict(row_prices),
                                    "end_sum": primary_sum,
                                    "sums": dict(row_sums)
                                })

                            curr_dict = node["children"]

                    # Recursive function to calculate branch end sums
                    def calc_branch_sums(nodes_dict):
                        b_sums = {pt: 0.0 for pt in selected_price_types}
                        for k, n in nodes_dict.items():
                            if n["children"]:
                                child_sums = calc_branch_sums(n["children"])
                                n["sums"] = child_sums
                                n["end_sum"] = child_sums.get(selected_price_types[0], 0.0)
                            else:
                                n["sums"] = {pt: n["end_bal"] * n.get("prices", {}).get(pt, 0.0) for pt in selected_price_types}
                                n["end_sum"] = n["sums"].get(selected_price_types[0], 0.0)
                            for pt in selected_price_types:
                                b_sums[pt] += n["sums"][pt]
                        return b_sums

                    tot_sums = calc_branch_sums(data_tree)
                    tot_sum = tot_sums.get(selected_price_types[0], 0.0)

                    # Flatten hierarchical tree to flat_items for the spreadsheet grid
                    flat_items = []
                    global_row_idx = 0

                    def append_nodes(nodes_dict, parent_id=None, level=0):
                        nonlocal global_row_idx
                        for key_title, node in nodes_dict.items():
                            cur_id = global_row_idx
                            global_row_idx += 1
                            has_ch = bool(node["children"]) or bool(node["docs"])
                            is_doc_node = node.get("is_doc", False)
                            flat_items.append({
                                "id": cur_id,
                                "parent_id": parent_id,
                                "level": level,
                                "has_children": has_ch,
                                "is_doc": is_doc_node,
                                "title": node["title"],
                                "code": node.get("code", ""),
                                "artikul": node.get("artikul", ""),
                                "barcode_unit": node.get("barcode_unit", ""),
                                "barcode_box": node.get("barcode_box", ""),
                                "barcode_block": node.get("barcode_block", ""),
                                "custom_field": "",
                                "doc_number": node.get("doc_number", ""),
                                "doc_date": node.get("doc_date", ""),
                                "unit_price": node.get("unit_price", 0.0),
                                "prices": node.get("prices", {}),
                                "start_bal": node["start_bal"],
                                "in_qty": node["in_qty"],
                                "out_qty": node["out_qty"],
                                "end_bal": node["end_bal"],
                                "turnover": node["turnover"],
                                "end_sum": node.get("end_sum", 0.0),
                                "sums": node.get("sums", {})
                            })

                            if node["children"]:
                                append_nodes(node["children"], parent_id=cur_id, level=level + 1)

                            # Legacy docs sub-list (when registrar is not a grouping level key)
                            for doc_item in node.get("docs", []):
                                doc_id = global_row_idx
                                global_row_idx += 1
                                flat_items.append({
                                    "id": doc_id,
                                    "parent_id": cur_id,
                                    "level": level + 1,
                                    "has_children": False,
                                    "is_doc": True,
                                    "title": doc_item["title"],
                                    "code": "",
                                    "artikul": "",
                                    "barcode_unit": "",
                                    "barcode_box": "",
                                    "barcode_block": "",
                                    "custom_field": "",
                                    "doc_number": doc_item.get("doc_number", ""),
                                    "doc_date": doc_item.get("doc_date", ""),
                                    "unit_price": doc_item.get("unit_price", 0.0),
                                    "prices": doc_item.get("prices", {}),
                                    "start_bal": doc_item["start_bal"],
                                    "in_qty": doc_item["in_qty"],
                                    "out_qty": doc_item["out_qty"],
                                    "end_bal": doc_item["end_bal"],
                                    "turnover": doc_item["turnover"],
                                    "end_sum": doc_item.get("end_sum", 0.0),
                                    "sums": doc_item.get("sums", {})
                                })

                    append_nodes(data_tree)

                    totals = {
                        "start_bal": tot_start,
                        "in_qty": tot_in,
                        "out_qty": tot_out,
                        "end_bal": tot_end,
                        "turnover": tot_to,
                        "total_sum": tot_sum,
                        "total_sums": tot_sums
                    }

                    # Generate 1C-Authentic Excel with Grouping Levels (Urven)
                    try:
                        import excel_generator
                        excel_payload = dict(payload)
                        excel_payload["price_types"] = selected_price_types
                        excel_payload["indicators"] = {
                            **indicators,
                            "barcodeUnit": ind_bc_unit,
                            "barcodeBox": ind_bc_box,
                            "barcodeBlock": ind_bc_block
                        }
                        excel_generator.generate_1c_excel({
                            "report_title": "Товары на складах",
                            "period": f"{start_date_str} - {end_date_str}",
                            "items": flat_items,
                            "totals": totals
                        }, excel_payload, UNIVERSAL_REPORT_EXCEL)
                    except Exception as ex_err:
                        print("Universal report excel generation error:", ex_err, flush=True)

                    resp_q.put((True, {
                        "report_title": "Товары на складах",
                        "period": f"{start_date_str} - {end_date_str}",
                        "items": flat_items,
                        "totals": totals,
                        "total_count": len(flat_items),
                        "price_types": selected_price_types,
                        "active_barcode_cols": {
                            "unit": ind_bc_unit,
                            "box": ind_bc_box,
                            "block": ind_bc_block
                        }
                    }))

                # 6c. Action: Universal Catalog Data (Номенклатура, Контрагенты, Склады, Портфели)
                elif action == "catalog_data":
                    cat_name = payload.get("catalog", "Номенклатура")
                    folder_name = payload.get("folder", "").strip()
                    search_q = payload.get("search", "").strip()

                    if "портфел" in cat_name.lower():
                        q_port = conn.NewObject("Запрос")
                        q_port.Text = """
                        ВЫБРАТЬ
                            Т.Код КАК Code,
                            Т.Наименование КАК Name
                        ИЗ
                            Справочник.Портфели КАК Т
                        ГДЕ
                            НЕ Т.ПометкаУдаления
                        УПОРЯДОЧИТЬ ПО
                            Name
                        """
                        items = []
                        try:
                            res_port = q_port.Execute().Choose()
                            while res_port.Next():
                                items.append({
                                    "code": str(res_port.Code).strip(),
                                    "name": str(res_port.Name).strip(),
                                    "artikul": "",
                                    "vid_nom": "",
                                    "unit": "",
                                    "is_folder": False
                                })
                        except Exception as ep:
                            print("Error loading portfolios in catalog_data:", ep)
                        resp_q.put((True, {
                            "catalog": "Портфели",
                            "folders": [],
                            "items": items
                        }))
                        continue

                    ref_cat = "Номенклатура"
                    if "контрагент" in cat_name.lower():
                        ref_cat = "Контрагенты"
                    elif "склад" in cat_name.lower():
                        ref_cat = "Склады"
                    elif "группа" in cat_name.lower():
                        ref_cat = "НоменклатурныеГруппы"

                    folders = []
                    items = []

                    # 1. Fetch folders
                    q_f = conn.NewObject("Запрос")
                    if search_q:
                        q_f.Text = f"""
                        ВЫБРАТЬ ПЕРВЫЕ 30
                            Т.Код КАК Code,
                            Т.Наименование КАК Name
                        ИЗ
                            Справочник.{ref_cat} КАК Т
                        ГДЕ
                            Т.ЭтоГруппа
                            И НЕ Т.ПометкаУдаления
                            И (Т.Наименование ПОДОБНО &Search ИЛИ Т.Код ПОДОБНО &Search)
                        УПОРЯДОЧИТЬ ПО
                            Name
                        """
                        q_f.SetParameter("Search", f"%{search_q}%")
                    elif folder_name:
                        q_f.Text = f"""
                        ВЫБРАТЬ ПЕРВЫЕ 50
                            Т.Код КАК Code,
                            Т.Наименование КАК Name
                        ИЗ
                            Справочник.{ref_cat} КАК Т
                        ГДЕ
                            Т.ЭтоГруппа
                            И НЕ Т.ПометкаУдаления
                            И Т.Родитель.Наименование = &Parent
                        УПОРЯДОЧИТЬ ПО
                            Name
                        """
                        q_f.SetParameter("Parent", folder_name)
                    else:
                        q_f.Text = f"""
                        ВЫБРАТЬ ПЕРВЫЕ 50
                            Т.Код КАК Code,
                            Т.Наименование КАК Name
                        ИЗ
                            Справочник.{ref_cat} КАК Т
                        ГДЕ
                            Т.ЭтоГруппа
                            И НЕ Т.ПометкаУдаления
                            И (Т.Родитель ЕСТЬ NULL ИЛИ Т.Родитель = ЗНАЧЕНИЕ(Справочник.{ref_cat}.ПустаяСсылка))
                        УПОРЯДОЧИТЬ ПО
                            Name
                        """

                    try:
                        res_f = q_f.Execute().Choose()
                        while res_f.Next():
                            folders.append({
                                "code": str(res_f.Code).strip(),
                                "name": str(res_f.Name).strip(),
                                "is_folder": True
                            })
                    except Exception as ef:
                        print("Error fetching folders:", ef)

                    # 2. Fetch items (elements)
                    artikul_sql = "Т.Артикул КАК Artikul," if ref_cat == "Номенклатура" else '"" КАК Artikul,'
                    vid_sql = "Т.ВидНоменклатуры.Наименование КАК VidNom," if ref_cat == "Номенклатура" else '"" КАК VidNom,'
                    unit_sql = "Т.БазоваяЕдиницаИзмерения.Наименование КАК Unit" if ref_cat == "Номенклатура" else '"" КАК Unit'

                    q_items = conn.NewObject("Запрос")
                    if search_q:
                        artikul_cond = "ИЛИ Т.Артикул ПОДОБНО &Search" if ref_cat == "Номенклатура" else ""
                        q_items.Text = f"""
                        ВЫБРАТЬ ПЕРВЫЕ 100
                            Т.Код КАК Code,
                            Т.Наименование КАК Name,
                            {artikul_sql}
                            {vid_sql}
                            {unit_sql},
                            Т.ЭтоГруппа КАК IsFolder
                        ИЗ
                            Справочник.{ref_cat} КАК Т
                        ГДЕ
                            НЕ Т.ПометкаУдаления
                            И НЕ Т.ЭтоГруппа
                            И (Т.Наименование ПОДОБНО &Search ИЛИ Т.Код ПОДОБНО &Search {artikul_cond})
                        УПОРЯДОЧИТЬ ПО
                            Т.ЭтоГруппа УБЫВ,
                            Name
                        """
                        q_items.SetParameter("Search", f"%{search_q}%")
                    elif folder_name:
                        q_items.Text = f"""
                        ВЫБРАТЬ ПЕРВЫЕ 150
                            Т.Код КАК Code,
                            Т.Наименование КАК Name,
                            {artikul_sql}
                            {vid_sql}
                            {unit_sql},
                            Т.ЭтоГруппа КАК IsFolder
                        ИЗ
                            Справочник.{ref_cat} КАК Т
                        ГДЕ
                            НЕ Т.ПометкаУдаления
                            И Т.Родитель.Наименование = &Parent
                        УПОРЯДОЧИТЬ ПО
                            Т.ЭтоГруппа УБЫВ,
                            Name
                        """
                        q_items.SetParameter("Parent", folder_name)
                    else:
                        q_items.Text = f"""
                        ВЫБРАТЬ ПЕРВЫЕ 100
                            Т.Код КАК Code,
                            Т.Наименование КАК Name,
                            {artikul_sql}
                            {vid_sql}
                            {unit_sql},
                            Т.ЭтоГруппа КАК IsFolder
                        ИЗ
                            Справочник.{ref_cat} КАК Т
                        ГДЕ
                            НЕ Т.ПометкаУдаления
                            И (Т.Родитель ЕСТЬ NULL ИЛИ Т.Родитель = ЗНАЧЕНИЕ(Справочник.{ref_cat}.ПустаяСсылка))
                        УПОРЯДОЧИТЬ ПО
                            Т.ЭтоГруппа УБЫВ,
                            Name
                        """

                    try:
                        res_i = q_items.Execute().Choose()
                        while res_i.Next():
                            items.append({
                                "code": str(res_i.Code).strip(),
                                "name": str(res_i.Name).strip(),
                                "artikul": str(res_i.Artikul).strip() if ref_cat == "Номенклатура" else "",
                                "vid_nom": str(res_i.VidNom).strip() if ref_cat == "Номенклатура" else "",
                                "unit": str(res_i.Unit).strip() if ref_cat == "Номенклатура" else "",
                                "is_folder": bool(res_i.IsFolder)
                            })
                    except Exception as ei:
                        print("Error fetching items:", ei)

                    resp_q.put((True, {
                        "catalog": cat_name,
                        "folder": folder_name,
                        "folders": folders,
                        "items": items
                    }))

                # 7. Action: Get Saved Reports list
                elif action == "get_reports":
                    q = conn.NewObject("Запрос")
                    q.Text = """
                    ВЫБРАТЬ РАЗЛИЧНЫЕ
                        Т.Ссылка.Наименование КАК SettingName,
                        Т.Ссылка.НастраиваемыйОбъект КАК ObjectName,
                        Т.Ссылка.Описание КАК Description
                    ИЗ
                        Справочник.СохраненныеНастройки.Пользователи КАК Т
                    ГДЕ
                        (Т.Пользователь.Наименование ПОДОБНО &UserPattern
                         ИЛИ Т.Пользователь.Код ПОДОБНО &UserPattern)
                        И НЕ Т.Ссылка.Наименование ПОДОБНО "Настройки формы%"
                    УПОРЯДОЧИТЬ ПО
                        SettingName
                    """
                    q.SetParameter("UserPattern", f"%{user}%")
                    res = q.Execute().Choose()

                    rep_list = []
                    while res.Next():
                        s_name = str(res.SettingName).strip()
                        o_name = str(res.ObjectName).strip()
                        d_name = str(res.Description or "").strip()
                        if s_name:
                            rep_list.append({
                                "setting_name": s_name,
                                "object_name": o_name,
                                "description": d_name
                            })

                    # Also fetch warehouse reports
                    q_wh = conn.NewObject("Запрос")
                    q_wh.Text = """
                    ВЫБРАТЬ РАЗЛИЧНЫЕ
                        Т.Ссылка.Наименование КАК SettingName,
                        Т.Ссылка.НастраиваемыйОбъект КАК ObjectName,
                        Т.Ссылка.Описание КАК Description
                    ИЗ
                        Справочник.СохраненныеНастройки КАК Т
                    ГДЕ
                        (Т.Ссылка.Наименование ПОДОБНО "%склад%" 
                         ИЛИ Т.Ссылка.Наименование ПОДОБНО "%товар%"
                         ИЛИ Т.Ссылка.Наименование ПОДОБНО "%остат%"
                         ИЛИ Т.Ссылка.Наименование ПОДОБНО "%anbar%")
                        И НЕ Т.Ссылка.Наименование ПОДОБНО "Настройки формы%"
                    УПОРЯДОЧИТЬ ПО
                        SettingName
                    """
                    res_wh = q_wh.Execute().Choose()
                    wh_list = []
                    while res_wh.Next():
                        s_name = str(res_wh.SettingName).strip()
                        o_name = str(res_wh.ObjectName).strip()
                        d_name = str(res_wh.Description or "").strip()
                        if s_name and not any(r["setting_name"] == s_name for r in rep_list):
                            wh_list.append({
                                "setting_name": s_name,
                                "object_name": o_name,
                                "description": d_name
                            })

                    direct_calc_rep = {
                        "setting_name": "⚡ Canlı Realizator Hesabatı (Müstəqil Hesablama)",
                        "object_name": "Müstəqil Birbaşa Reyestr Hesablaması",
                        "description": "Reyestrlərdən (Взаиморасчеты və Продажи) birbaşa canlı çıxarış. 0.05 saniyə icra!",
                        "is_direct": True
                    }

                    resp_q.put((True, {
                        "user_reports": [direct_calc_rep] + rep_list,
                        "warehouse_reports": wh_list
                    }))

                # 8. Action: Direct Realizator Register Calculation
                elif action == "direct_calculate":
                    date_start_str = payload.get("date_start", "2026-09-01")
                    date_end_str = payload.get("date_end", "2026-09-28")

                    try:
                        y1, m1, d1 = map(int, date_start_str.split("-"))
                        dt_start = datetime.datetime(y1, m1, d1, 4, 0, 0)
                        y2, m2, d2 = map(int, date_end_str.split("-"))
                        dt_end = datetime.datetime(y2, m2, d2, 23, 59, 59)
                    except Exception:
                        dt_start = datetime.datetime(2026, 9, 1, 4, 0, 0)
                        dt_end = datetime.datetime(2026, 9, 28, 23, 59, 59)

                    q_calc = conn.NewObject("Запрос")
                    q_calc.Text = """
                    ВЫБРАТЬ
                        Договоры.Портфель.Наименование КАК Portfolio,
                        СУММА(Взаиморасчеты.СуммаВзаиморасчетовНачальныйОстаток) КАК НачОстаток,
                        СУММА(ВЫБОР
                                КОГДА Взаиморасчеты.Регистратор ССЫЛКА Документ.КорректировкаДолга
                                    ТОГДА 0
                                ИНАЧЕ Взаиморасчеты.СуммаВзаиморасчетовПриход
                            КОНЕЦ) КАК Продажа,
                        СУММА(ВЫБОР
                                КОГДА Взаиморасчеты.Регистратор ССЫЛКА Документ.КорректировкаДолга
                                    ТОГДА 0
                                ИНАЧЕ Взаиморасчеты.СуммаВзаиморасчетовРасход
                            КОНЕЦ) КАК Оплата,
                        СУММА(ВЫБОР
                                КОГДА Взаиморасчеты.Регистратор ССЫЛКА Документ.КорректировкаДолга
                                    ТОГДА Взаиморасчеты.СуммаВзаиморасчетовОборот
                                ИНАЧЕ 0
                            КОНЕЦ) КАК Корректировка,
                        СУММА(Взаиморасчеты.СуммаВзаиморасчетовКонечныйОстаток) КАК КонОстаток
                    ПОМЕСТИТЬ ВТ_Взаиморасчеты
                    ИЗ
                        РегистрНакопления.ВзаиморасчетыСКонтрагентами.ОстаткиИОбороты(
                            &НачалоПериода,
                            &КонецПериода,
                            Авто,
                            ,
                            ДоговорКонтрагента.ВидДоговора = ЗНАЧЕНИЕ(Перечисление.ВидыДоговоровКонтрагентов.СПокупателем)
                        ) КАК Взаиморасчеты
                        ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.ДоговорыКонтрагентов КАК Договоры
                            ПО Взаиморасчеты.ДоговорКонтрагента = Договоры.Ссылка
                    ГДЕ
                        НЕ Договоры.Портфель ЕСТЬ NULL
                        И НЕ Взаиморасчеты.Контрагент.Родитель.Наименование ПОДОБНО "7777 OPT%"
                    СГРУППИРОВАТЬ ПО
                        Договоры.Портфель.Наименование
                    ;

                    ВЫБРАТЬ
                        Договоры.Портфель.Наименование КАК Portfolio,
                        СУММА(Продажи.СтоимостьБезСкидокОборот) КАК ПродажаGross
                    ПОМЕСТИТЬ ВТ_Продажи
                    ИЗ
                        РегистрНакопления.Продажи.Обороты(&НачалоПериода, &КонецПериода, Авто, ) КАК Продажи
                        ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.ДоговорыКонтрагентов КАК Договоры
                            ПО Продажи.ДоговорКонтрагента = Договоры.Ссылка
                    ГДЕ
                        НЕ Договоры.Портфель ЕСТЬ NULL
                        И НЕ Продажи.Контрагент.Родитель.Наименование ПОДОБНО "7777 OPT%"
                    СГРУППИРОВАТЬ ПО
                        Договоры.Портфель.Наименование
                    ;

                    ВЫБРАТЬ
                        ЕСТЬNULL(ВТ_Взаиморасчеты.Portfolio, ВТ_Продажи.Portfolio) КАК Portfolio,
                        ЕСТЬNULL(ВТ_Взаиморасчеты.НачОстаток, 0) КАК НачОстаток,
                        ЕСТЬNULL(ВТ_Взаиморасчеты.Продажа, 0) КАК Продажа,
                        ЕСТЬNULL(ВТ_Продажи.ПродажаGross, 0) КАК ПродажаGross,
                        ЕСТЬNULL(ВТ_Взаиморасчеты.Оплата, 0) КАК Оплата,
                        ЕСТЬNULL(ВТ_Взаиморасчеты.Корректировка, 0) КАК Корректировка,
                        ЕСТЬNULL(ВТ_Взаиморасчеты.КонОстаток, 0) КАК КонОстаток
                    ИЗ
                        ВТ_Взаиморасчеты КАК ВТ_Взаиморасчеты
                        ПОЛНОЕ СОЕДИНЕНИЕ ВТ_Продажи КАК ВТ_Продажи
                            ПО ВТ_Взаиморасчеты.Portfolio = ВТ_Продажи.Portfolio
                    УПОРЯДОЧИТЬ ПО
                        Portfolio
                    """
                    q_calc.SetParameter("НачалоПериода", dt_start)
                    q_calc.SetParameter("КонецПериода", dt_end)

                    res = q_calc.Execute().Choose()
                    headers = [
                        "Портфель",
                        "Нач. остаток",
                        "Продажа",
                        "Продажи gross",
                        "Оплата",
                        "Корректировка",
                        "Кон. остаток"
                    ]

                    rows = []
                    tot_nach = 0.0; tot_prod = 0.0; tot_gross = 0.0; tot_opl = 0.0; tot_korr = 0.0; tot_kon = 0.0

                    while res.Next():
                        p_name = str(res.Portfolio or "").strip()
                        if not p_name: continue
                        nach = float(res.НачОстаток or 0)
                        prod = float(res.Продажа or 0)
                        gross = float(res.ПродажаGross or 0)
                        opl = float(res.Оплата or 0)
                        korr = float(res.Корректировка or 0)
                        kon = float(res.КонОстаток or 0)

                        tot_nach += nach; tot_prod += prod; tot_gross += gross; tot_opl += opl; tot_korr += korr; tot_kon += kon

                        rows.append({
                            "name": p_name,
                            "cells": [
                                p_name,
                                f"{nach:,.2f}".replace(",", " "),
                                f"{prod:,.2f}".replace(",", " "),
                                f"{gross:,.2f}".replace(",", " "),
                                f"{opl:,.2f}".replace(",", " "),
                                f"{korr:,.2f}".replace(",", " "),
                                f"{kon:,.2f}".replace(",", " ")
                            ],
                            "is_total": False
                        })

                    totals = {
                        "name": "İtogo",
                        "cells": [
                            "İtogo",
                            f"{tot_nach:,.2f}".replace(",", " "),
                            f"{tot_prod:,.2f}".replace(",", " "),
                            f"{tot_gross:,.2f}".replace(",", " "),
                            f"{tot_opl:,.2f}".replace(",", " "),
                            f"{tot_korr:,.2f}".replace(",", " "),
                            f"{tot_kon:,.2f}".replace(",", " ")
                        ],
                        "is_total": True
                    }

                    # Create clean XLSX with TabularDocument
                    tab_doc = conn.NewObject("ТабличныйДокумент")
                    for c_idx, h in enumerate(headers, 1):
                        tab_doc.Область(1, c_idx).Текст = h
                    for r_idx, r in enumerate(rows, 2):
                        for c_idx, val in enumerate(r["cells"], 1):
                            tab_doc.Область(r_idx, c_idx).Текст = val
                    total_row_idx = len(rows) + 2
                    for c_idx, val in enumerate(totals["cells"], 1):
                        tab_doc.Область(total_row_idx, c_idx).Текст = val

                    tab_doc.Записать(EXCEL_OUTPUT, conn.ТипФайлаТабличногоДокумента.XLSX)

                    resp_q.put((True, {
                        "report_name": "Canlı Realizator Hesabatı",
                        "period": f"{date_start_str} - {date_end_str}",
                        "headers": headers,
                        "rows": rows,
                        "totals": totals,
                        "total_rows": len(rows),
                        "excel_available": True
                    }))

                # 9. Action: Standard Report Generation
                elif action == "generate":
                    setting_name = payload.get("setting_name", "gunay gundelik")
                    date_start_str = payload.get("date_start", "2026-09-01")
                    date_end_str = payload.get("date_end", "2026-09-28")

                    if "Müstəqil Hesablama" in setting_name or "DirectEngine" in setting_name:
                        self.req_q.put(("direct_calculate", payload, resp_q))
                        continue

                    q = conn.NewObject("Запрос")
                    q.Text = "ВЫБРАТЬ Т.Ссылка КАК Ref, Т.НастраиваемыйОбъект КАК ObjectName ИЗ Справочник.СохраненныеНастройки КАК Т ГДЕ Т.Наименование = &SettingName"
                    q.SetParameter("SettingName", setting_name)
                    res = q.Execute().Choose()
                    setting_ref = None
                    target_obj = "ОтчетОбъект.ОтчетПоРеализаторам"

                    if res.Next():
                        setting_ref = res.Ref
                        target_obj = str(res.ObjectName)
                    else:
                        q.Text = 'ВЫБРАТЬ ПЕРВЫЕ 1 Т.Ссылка КАК Ref, Т.НастраиваемыйОбъект КАК ObjectName ИЗ Справочник.СохраненныеНастройки КАК Т ГДЕ Т.Наименование ПОДОБНО "%gunay gundelik%"'
                        res = q.Execute().Choose()
                        if res.Next():
                            setting_ref = res.Ref
                            target_obj = str(res.ObjectName)
                        else:
                            resp_q.put((False, Exception(f"'{setting_name}' tənzimləməsi tapılmadı.")))
                            continue

                    rep = None
                    if "ОтчетПоРеализаторам" in target_obj:
                        epf_path = os.path.join(CACHE_DIR, "sales_report.epf")
                        if not os.path.exists(epf_path):
                            q_epf = conn.NewObject("Запрос")
                            q_epf.Text = 'ВЫБРАТЬ ПЕРВЫЕ 1 Т.ХранилищеВнешнейОбработки КАК BinaryData ИЗ Справочник.ВнешниеОбработки КАК Т ГДЕ Т.Наименование ПОДОБНО "%реализатор%"'
                            res_epf = q_epf.Execute().Choose()
                            if res_epf.Next():
                                bin_data = res_epf.BinaryData.Получить()
                                bin_data.Записать(epf_path)
                        if os.path.exists(epf_path):
                            rep = conn.ВнешниеОтчеты.Создать(epf_path)

                    elif any(w in target_obj.lower() or w in setting_name.lower() for w in ["склад", "остат", "товар", "anbar"]):
                        epf_path = os.path.join(CACHE_DIR, "warehouse_report.epf")
                        if not os.path.exists(epf_path):
                            q_epf = conn.NewObject("Запрос")
                            q_epf.Text = 'ВЫБРАТЬ ПЕРВЫЕ 1 Т.ХранилищеВнешнейОбработки КАК BinaryData ИЗ Справочник.ВнешниеОбработки КАК Т ГДЕ Т.Наименование ПОДОБНО "%склад%" ИЛИ Т.Наименование ПОДОБНО "%остат%"'
                            res_epf = q_epf.Execute().Choose()
                            if res_epf.Next():
                                bin_data = res_epf.BinaryData.Получить()
                                bin_data.Записать(epf_path)
                        if os.path.exists(epf_path):
                            rep = conn.ВнешниеОтчеты.Создать(epf_path)

                    if rep is None:
                        clean_obj = target_obj.replace("ОтчетОбъект.", "").replace("ВнешнийОтчетОбъект.", "")
                        try:
                            rep = getattr(conn.Отчеты, clean_obj).Создать()
                        except Exception:
                            epf_path = os.path.join(CACHE_DIR, "sales_report.epf")
                            if os.path.exists(epf_path):
                                rep = conn.ВнешниеОтчеты.Создать(epf_path)

                    if hasattr(rep, "СхемаКомпоновкиДанных"):
                        schema = rep.СхемаКомпоновкиДанных
                    else:
                        schema = conn.ВнешниеОтчеты.Создать(os.path.join(CACHE_DIR, "sales_report.epf")).СхемаКомпоновкиДанных

                    builder = conn.NewObject("КомпоновщикНастроекКомпоновкиДанных")
                    builder.Инициализировать(conn.NewObject("ИсточникДоступныхНастроекКомпоновкиДанных", schema))

                    storage = conn.ХранилищеНастроекКомпоновкиДанных
                    loaded_settings = storage.Загрузить(setting_ref)
                    if loaded_settings:
                        builder.ЗагрузитьНастройки(loaded_settings)
                    else:
                        builder.ЗагрузитьНастройки(schema.НастройкиПоУмолчанию)

                    settings = builder.ПолучитьНастройки()

                    y1, m1, d1 = map(int, date_start_str.split("-"))
                    dt_start = datetime.datetime(y1, m1, d1, 4, 0, 0)
                    y2, m2, d2 = map(int, date_end_str.split("-"))
                    dt_end = datetime.datetime(y2, m2, d2, 23, 59, 59)

                    for p_name in ["НачалоПериода", "Период", "ДатаНач", "StartDate"]:
                        try:
                            p_param = settings.ПараметрыДанных.Элементы.Найти(p_name)
                            if p_param:
                                p_param.Значение = dt_start
                                p_param.Использование = True
                        except Exception: pass

                    for p_name in ["КонецПериода", "ДатаКон", "EndDate"]:
                        try:
                            p_param = settings.ПараметрыДанных.Элементы.Найти(p_name)
                            if p_param:
                                p_param.Значение = dt_end
                                p_param.Использование = True
                        except Exception: pass

                    tab_doc = conn.NewObject("ТабличныйДокумент")
                    composer = conn.NewObject("КомпоновщикМакетаКомпоновкиДанных")
                    layout = composer.Выполнить(schema, settings)

                    processor = conn.NewObject("ПроцессорКомпоновкиДанных")
                    processor.Инициализировать(layout)

                    output_processor = conn.NewObject("ПроцессорВыводаРезультатаКомпоновкиДанныхВТабличныйДокумент")
                    output_processor.УстановитьДокумент(tab_doc)
                    output_processor.Вывести(processor)

                    tab_doc.Записать(EXCEL_OUTPUT, conn.ТипФайлаТабличногоДокумента.XLSX)

                    header_row = 1
                    for r in range(1, min(15, tab_doc.ВысотаТаблицы + 1)):
                        for c in range(1, min(15, tab_doc.ШиринаТаблицы + 1)):
                            txt = tab_doc.Область(r, c).Текст.strip().lower()
                            if any(k in txt for k in ["портфель", "контрагент", "агент", "номенклатура", "склад"]):
                                header_row = r
                                break
                        if header_row > 1: break

                    headers = []
                    for c in range(1, tab_doc.ШиринаТаблицы + 1):
                        h = tab_doc.Область(header_row, c).Текст.strip()
                        if not h and header_row > 1:
                            h = tab_doc.Область(header_row - 1, c).Текст.strip()
                        if h: headers.append(h)
                        elif len(headers) > 0 and len(headers) < 10:
                            headers.append(f"Göstərici {c}")

                    if not headers:
                        headers = ["Kontragent / Portfel", "İlkin qalıq", "Satış", "Satış gross", "Ödəniş", "Korrektirovka", "Son qalıq"]

                    rows = []
                    totals = None
                    for r in range(header_row + 1, tab_doc.ВысотаТаблицы + 1):
                        title = tab_doc.Область(r, 1).Текст.strip()
                        if not title: continue
                        if any(title.lower() == k for k in ["контрагент", "агент", "портфель"]):
                            continue

                        cells = [tab_doc.Область(r, c).Текст.strip() or "-" for c in range(1, len(headers) + 1)]
                        is_tot = "итого" in title.lower() or "yekun" in title.lower()
                        r_data = {"name": title, "cells": cells, "is_total": is_tot}
                        if is_tot: totals = r_data
                        else: rows.append(r_data)

                    resp_q.put((True, {
                        "report_name": setting_name,
                        "period": f"{date_start_str} - {date_end_str}",
                        "headers": headers,
                        "rows": rows,
                        "totals": totals,
                        "total_rows": len(rows),
                        "excel_available": True
                    }))

                elif action == "get_price_types":
                    pts = get_all_price_types(conn, key)
                    resp_q.put((True, {"price_types": pts}))

                elif action == "get_portfolio_catalog_filters":
                    root_portfolios = set()
                    try:
                        q_rf = conn.NewObject("Запрос")
                        q_rf.Text = """
                        ВЫБРАТЬ
                            Т.Наименование КАК Name
                        ИЗ
                            Справочник.Номенклатура КАК Т
                        ГДЕ
                            Т.ЭтоГруппа
                            И НЕ Т.ПометкаУдаления
                            И (Т.Родитель ЕСТЬ NULL ИЛИ Т.Родитель = ЗНАЧЕНИЕ(Справочник.Номенклатура.ПустаяСсылка))
                        УПОРЯДОЧИТЬ ПО
                            Name
                        """
                        r_rf = q_rf.Execute().Choose()
                        while r_rf.Next():
                            nm = str(r_rf.Name or "").strip()
                            if nm and not nm.startswith("!"):
                                root_portfolios.add(nm)
                    except Exception as e_rf:
                        print("Error fetching root portfolio folders:", e_rf)

                    try:
                        q_p = conn.NewObject("Запрос")
                        q_p.Text = """
                        ВЫБРАТЬ
                            Т.Наименование КАК Name
                        ИЗ
                            Справочник.Портфели КАК Т
                        ГДЕ
                            НЕ Т.ПометкаУдаления
                        УПОРЯДОЧИТЬ ПО
                            Name
                        """
                        r_p = q_p.Execute().Choose()
                        while r_p.Next():
                            nm = str(r_p.Name or "").strip()
                            if nm and not nm.startswith("!"):
                                root_portfolios.add(nm)
                    except Exception:
                        pass

                    # Query groups assigned to actual commercial goods with parent folder code
                    q_ng = conn.NewObject("Запрос")
                    q_ng.Text = """
                    ВЫБРАТЬ РАЗЛИЧНЫЕ
                        Т.Родитель.Код КАК ParentCode,
                        Т.НоменклатурнаяГруппа.Наименование КАК Name
                    ИЗ
                        Справочник.Номенклатура КАК Т
                    ГДЕ
                        НЕ Т.ЭтоГруппа
                        И НЕ Т.ПометкаУдаления
                        И Т.НоменклатурнаяГруппа ЕСТЬ НЕ NULL
                        И Т.НоменклатурнаяГруппа <> ЗНАЧЕНИЕ(Справочник.НоменклатурныеГруппы.ПустаяСсылка)
                    УПОРЯДОЧИТЬ ПО
                        Name
                    """
                    r_ng = q_ng.Execute().Choose()
                    fmap = get_folders_map(conn, key)
                    nom_groups = set()
                    portfolio_groups_map = {}
                    while r_ng.Next():
                        g_name = str(r_ng.Name or "").strip()
                        if not g_name or is_vehicle_group(g_name):
                            continue
                        nom_groups.add(g_name)
                        p_code = str(r_ng.ParentCode or "").strip()
                        port = resolve_root_portfolio(p_code, fmap)
                        if port and not port.startswith("!"):
                            if port not in portfolio_groups_map:
                                portfolio_groups_map[port] = set()
                            portfolio_groups_map[port].add(g_name)

                    portfolio_groups = {p: sorted(list(grps)) for p, grps in sorted(portfolio_groups_map.items())}
                    pts = get_all_price_types(conn, key)

                    resp_q.put((True, {
                        "portfolios": sorted(list(root_portfolios)),
                        "nom_groups": sorted(list(nom_groups)),
                        "portfolio_groups": portfolio_groups,
                        "price_types": pts
                    }))

                elif action == "get_portfolio_catalog_items":
                    fmap = get_folders_map(conn, key)

                    # Multiple or single portfolios
                    raw_ports = payload.get("portfolios")
                    if isinstance(raw_ports, list):
                        selected_portfolios = [str(p).strip() for p in raw_ports if str(p).strip() and str(p) != "(Все портфели)"]
                    elif payload.get("portfolio"):
                        single_p = str(payload.get("portfolio")).strip()
                        selected_portfolios = [single_p] if single_p and single_p != "(Все портфели)" else []
                    else:
                        selected_portfolios = []

                    # Multiple or single nom groups
                    raw_groups = payload.get("nom_groups")
                    if isinstance(raw_groups, list):
                        selected_nom_groups = [str(g).strip() for g in raw_groups if str(g).strip() and str(g) != "(Все группы)"]
                    elif payload.get("nom_group"):
                        single_g = str(payload.get("nom_group")).strip()
                        selected_nom_groups = [single_g] if single_g and single_g != "(Все группы)" else []
                    else:
                        selected_nom_groups = []

                    search_txt = str(payload.get("search") or "").strip().lower()

                    # Handle 1 or more price types
                    raw_pts = payload.get("price_types")
                    if not raw_pts or not isinstance(raw_pts, list):
                        single_pt = str(payload.get("price_type") or "20").strip()
                        raw_pts = [single_pt] if single_pt else []

                    selected_price_types = []
                    for pt in raw_pts:
                        pt_s = str(pt).strip()
                        if pt_s and pt_s not in selected_price_types and pt_s.lower() != "none" and pt_s != "(Без цен)":
                            selected_price_types.append(pt_s)

                    where_clauses = ["НЕ Т.ЭтоГруппа", "НЕ Т.ПометкаУдаления"]
                    port_folders_obj = None

                    if len(selected_portfolios) == 1:
                        try:
                            p_find = conn.Справочники.Номенклатура.НайтиПоНаименованию(selected_portfolios[0], True)
                            if p_find and not p_find.Пустая():
                                port_folders_obj = p_find
                                where_clauses.append("Т.Ссылка В ИЕРАРХИИ (&PortFolder)")
                        except Exception as e_fnd:
                            print(f"⚠️ [PortFolder lookup fallback]: {e_fnd}", flush=True)
                            port_folders_obj = None
                    elif len(selected_portfolios) > 1:
                        try:
                            p_list = conn.NewObject("СписокЗначений")
                            for p_name in selected_portfolios:
                                p_find = conn.Справочники.Номенклатура.НайтиПоНаименованию(p_name, True)
                                if p_find and not p_find.Пустая():
                                    p_list.Добавить(p_find)
                            if p_list.Количество() > 0:
                                port_folders_obj = p_list
                                where_clauses.append("Т.Ссылка В ИЕРАРХИИ (&PortFolder)")
                        except Exception as e_fnd:
                            print(f"⚠️ [Multi PortFolder lookup fallback]: {e_fnd}", flush=True)
                            port_folders_obj = None

                    if len(selected_nom_groups) == 1:
                        where_clauses.append("Т.НоменклатурнаяГруппа.Наименование = &NomGroupName")
                    elif len(selected_nom_groups) > 1:
                        where_clauses.append("Т.НоменклатурнаяГруппа.Наименование В (&NomGroupNames)")

                    # Multi-Price SQL Construction
                    price_select_parts = []
                    price_join_parts = []
                    price_params = {}
                    for p_i, pt in enumerate(selected_price_types):
                        price_select_parts.append(f"ЕСТЬNULL(Цены_{p_i}.Цена, 0) КАК Price_{p_i}")
                        price_join_parts.append(f"""
                        ЛЕВОЕ СОЕДИНЕНИЕ РегистрСведений.ЦеныНоменклатуры.СрезПоследних(
                            &CurrentDate, 
                            ТипЦен.Код = &PriceType_{p_i} ИЛИ ТипЦен.Наименование = &PriceType_{p_i}
                        ) КАК Цены_{p_i}
                            ПО Т.Ссылка = Цены_{p_i}.Номенклатура
                        """)
                        price_params[f"PriceType_{p_i}"] = pt

                    price_select_sql = (", " + ", ".join(price_select_parts)) if price_select_parts else ""
                    price_join_sql = "\n".join(price_join_parts)

                    # Barcode join with single barcode per item to prevent row explosion
                    barcode_join = """
                    ЛЕВОЕ СОЕДИНЕНИЕ (
                        ВЫБРАТЬ
                            Ш.Владелец КАК ItemRef,
                            МИНИМУМ(Ш.Штрихкод) КАК Barcode
                        ИЗ
                            РегистрСведений.Штрихкоды КАК Ш
                        СГРУППИРОВАТЬ ПО
                            Ш.Владелец
                    ) КАК Ш
                        ПО Т.Ссылка = Ш.ItemRef
                    """

                    q = conn.NewObject("Запрос")
                    q.Text = f"""
                    ВЫБРАТЬ
                        Т.Код КАК Code,
                        Т.Артикул КАК Artikul,
                        Т.СВкод КАК CVCode,
                        Т.Наименование КАК Name,
                        Т.НаименованиеПолное КАК FullName,
                        Т.Родитель.Код КАК ParentCode,
                        Т.Родитель.Наименование КАК FolderName,
                        Т.НоменклатурнаяГруппа.Наименование КАК NomGroup,
                        Т.ВидНоменклатуры.Наименование КАК ItemType,
                        Т.БазоваяЕдиницаИзмерения.Наименование КАК BaseUnit,
                        Т.Производитель.Наименование КАК Manufacturer,
                        ЕСТЬNULL(Ш.Barcode, "") КАК Barcode
                        {price_select_sql}
                    ИЗ
                        Справочник.Номенклатура КАК Т
                        {barcode_join}
                        {price_join_sql}
                    ГДЕ
                        {" И ".join(where_clauses)}
                    УПОРЯДОЧИТЬ ПО
                        Т.НоменклатурнаяГруппа.Наименование,
                        Т.Наименование
                    """

                    if port_folders_obj:
                        q.SetParameter("PortFolder", port_folders_obj)
                    if selected_price_types:
                        q.SetParameter("CurrentDate", datetime.datetime.now())
                        for p_k, p_v in price_params.items():
                            q.SetParameter(p_k, p_v)
                    if len(selected_nom_groups) == 1:
                        q.SetParameter("NomGroupName", selected_nom_groups[0])
                    elif len(selected_nom_groups) > 1:
                        g_list = conn.NewObject("СписокЗначений")
                        for g in selected_nom_groups:
                            g_list.Добавить(g)
                        q.SetParameter("NomGroupNames", g_list)

                    try:
                        res = q.Execute().Choose()
                    except Exception as eq:
                        if port_folders_obj and "PortFolder" in str(eq):
                            print("⚠️ [1C QUERY RETRY] Hierarchy parameter error, retrying without SQL hierarchy filter...", flush=True)
                            clean_clauses = [c for c in where_clauses if "PortFolder" not in c]
                            q.Text = f"""
                            ВЫБРАТЬ
                                Т.Код КАК Code,
                                Т.Артикул КАК Artikul,
                                Т.СВкод КАК CVCode,
                                Т.Наименование КАК Name,
                                Т.НаименованиеПолное КАК FullName,
                                Т.Родитель.Код КАК ParentCode,
                                Т.Родитель.Наименование КАК FolderName,
                                Т.НоменклатурнаяГруппа.Наименование КАК NomGroup,
                                Т.ВидНоменклатуры.Наименование КАК ItemType,
                                Т.БазоваяЕдиницаИзмерения.Наименование КАК BaseUnit,
                                Т.Производитель.Наименование КАК Manufacturer,
                                ЕСТЬNULL(Ш.Barcode, "") КАК Barcode
                                {price_select_sql}
                            ИЗ
                                Справочник.Номенклатура КАК Т
                                {barcode_join}
                                {price_join_sql}
                            ГДЕ
                                {" И ".join(clean_clauses)}
                            УПОРЯДОЧИТЬ ПО
                                Т.НоменклатурнаяГруппа.Наименование,
                                Т.Наименование
                            """
                            port_folders_obj = None
                            res = q.Execute().Choose()
                        else:
                            raise eq

                    items = []
                    while res.Next():
                        p_code = str(res.ParentCode or "").strip()
                        root_port = resolve_root_portfolio(p_code, fmap)

                        if selected_portfolios and not any(root_port.lower() == sp.lower() for sp in selected_portfolios):
                            continue

                        group = str(res.NomGroup or "").strip()
                        if selected_nom_groups and group not in selected_nom_groups:
                            continue

                        name = str(res.Name or "").strip()
                        code = str(res.Code or "").strip()
                        artikul = str(res.Artikul or "").strip()
                        cv_code = str(res.CVCode or "").strip()
                        folder = str(res.FolderName or "").strip()
                        group = str(res.NomGroup or "").strip()
                        item_type = str(res.ItemType or "").strip()
                        unit = str(res.BaseUnit or "").strip()
                        manuf = str(res.Manufacturer or "").strip()
                        bc = str(res.Barcode or "").strip()

                        if search_txt:
                            match_src = f"{name} {code} {artikul} {cv_code} {bc} {folder} {group} {root_port} {manuf}".lower()
                            if search_txt not in match_src:
                                continue

                        row_prices = {}
                        for p_i, pt in enumerate(selected_price_types):
                            row_prices[pt] = float(getattr(res, f"Price_{p_i}", 0) or 0)

                        items.append({
                            "code": code,
                            "artikul": artikul,
                            "cv": cv_code,
                            "barcode": bc,
                            "name": name,
                            "folder": folder,
                            "group": group,
                            "portfolio": root_port or sel_portfolio,
                            "type": item_type,
                            "unit": unit,
                            "price": row_prices.get(selected_price_types[0], 0.0) if selected_price_types else 0.0,
                            "prices": row_prices,
                            "manufacturer": manuf
                        })

                    resp_q.put((True, {
                        "items": items,
                        "price_types": selected_price_types,
                        "total": len(items)
                    }))

                # Action: Get Universal Documents List
                elif action == "get_documents_list":
                    doc_type = payload.get("doc_type") or "УстановкаЦенНоменклатуры"
                    date_from = payload.get("date_from", "").strip()
                    date_to = payload.get("date_to", "").strip()
                    search_str = payload.get("search", "").strip()
                    limit_count = int(payload.get("limit", 300))

                    doc_meta = conn.Метаданные.Документы.Найти(doc_type)
                    if not doc_meta:
                        raise ValueError(f"1C sənədi '{doc_type}' konfiqurasiyada tapılmadı")

                    doc_synonym = str(doc_meta.Синоним or doc_type)
                    req_names = set(str(r.Имя) for r in doc_meta.Реквизиты)
                    has_kontr = "Контрагент" in req_names
                    has_sum = "СуммаДокумента" in req_names
                    has_sklad = "Склад" in req_names
                    has_resp = "Ответственный" in req_names
                    has_comm = "Комментарий" in req_names
                    has_deal = "Сделка" in req_names
                    has_contract = "ДоговорКонтрагента" in req_names
                    has_agent = "Агент" in req_names
                    has_info = "Информация" in req_names

                    sel_parts = [
                        "Т.Ссылка КАК Ref",
                        "Т.Номер КАК Number",
                        "Т.Дата КАК Date",
                        "Т.Проведен КАК Posted",
                        "Т.ПометкаУдаления КАК DeletionMark"
                    ]

                    columns = [
                        {"key": "status", "label": "", "width": 30, "align": "center"},
                        {"key": "date", "label": "Дата", "width": 125, "align": "left"},
                        {"key": "number", "label": "Номер", "width": 115, "align": "left"}
                    ]

                    if has_kontr:
                        sel_parts.append("Т.Контрагент.Наименование КАК Kontragent")
                        columns.append({"key": "kontragent", "label": "Контрагент", "width": 240, "align": "left"})

                    if has_agent:
                        sel_parts.append("Т.Агент.Наименование КАК Agent")
                        columns.append({"key": "agent", "label": "Агент", "width": 160, "align": "left"})

                    if has_sum:
                        sel_parts.append("Т.СуммаДокумента КАК Amount")
                        columns.append({"key": "amount", "label": "Сумма", "width": 100, "align": "right"})

                    if has_sklad:
                        sel_parts.append("Т.Склад.Наименование КАК Warehouse")
                        columns.append({"key": "warehouse", "label": "Склад", "width": 160, "align": "left"})

                    if has_deal:
                        sel_parts.append("Т.Сделка.Номер КАК Deal")
                        columns.append({"key": "deal", "label": "Сделка", "width": 120, "align": "left"})

                    if has_contract:
                        sel_parts.append("Т.ДоговорКонтрагента.Наименование КАК Contract")
                        columns.append({"key": "contract", "label": "Договор", "width": 150, "align": "left"})

                    if has_info:
                        sel_parts.append("Т.Информация КАК Info")
                        columns.append({"key": "info", "label": "Информация", "width": 180, "align": "left"})

                    if has_resp:
                        sel_parts.append("Т.Ответственный.Наименование КАК Responsible")
                        columns.append({"key": "responsible", "label": "Ответственный", "width": 130, "align": "left"})

                    if has_comm:
                        sel_parts.append("Т.Комментарий КАК Comment")
                        columns.append({"key": "comment", "label": "Комментарий", "width": 200, "align": "left"})

                    where_parts = []
                    q_doc = conn.NewObject("Запрос")

                    if date_from:
                        try:
                            yf, mf, df = map(int, date_from.split("-"))
                            dt_f = datetime.datetime(yf, mf, df, 0, 0, 0)
                            q_doc.SetParameter("DateFrom", dt_f)
                            where_parts.append("Т.Дата >= &DateFrom")
                        except Exception: pass

                    if date_to:
                        try:
                            yt, mt, dt = map(int, date_to.split("-"))
                            dt_t = datetime.datetime(yt, mt, dt, 23, 59, 59)
                            q_doc.SetParameter("DateTo", dt_t)
                            where_parts.append("Т.Дата <= &DateTo")
                        except Exception: pass

                    where_sql = ("ГДЕ " + " И ".join(where_parts)) if where_parts else ""

                    q_doc.Text = f"""
                    ВЫБРАТЬ ПЕРВЫЕ {limit_count}
                        {", ".join(sel_parts)}
                    ИЗ
                        Документ.{doc_type} КАК Т
                    {where_sql}
                    УПОРЯДОЧИТЬ ПО
                        Т.Дата УБЫВ
                    """

                    res_doc = q_doc.Execute().Choose()
                    items = []
                    while res_doc.Next():
                        raw_date = res_doc.Date
                        date_str = ""
                        if raw_date:
                            try:
                                date_str = raw_date.strftime("%d.%m.%Y %H:%M:%S")
                            except Exception:
                                date_str = str(raw_date)[:19]

                        row_data = {
                            "number": str(res_doc.Number or "").strip(),
                            "date": date_str,
                            "posted": bool(res_doc.Posted),
                            "deleted": bool(res_doc.DeletionMark),
                        }

                        if has_kontr:
                            row_data["kontragent"] = str(res_doc.Kontragent or "").strip()
                        if has_agent:
                            row_data["agent"] = str(res_doc.Agent or "").strip()
                        if has_sum:
                            row_data["amount"] = float(res_doc.Amount or 0)
                        if has_sklad:
                            row_data["warehouse"] = str(res_doc.Warehouse or "").strip()
                        if has_deal:
                            row_data["deal"] = str(res_doc.Deal or "").strip()
                        if has_contract:
                            row_data["contract"] = str(res_doc.Contract or "").strip()
                        if has_info:
                            row_data["info"] = str(res_doc.Info or "").strip()
                        if has_resp:
                            row_data["responsible"] = str(res_doc.Responsible or "").strip()
                        if has_comm:
                            row_data["comment"] = str(res_doc.Comment or "").strip()

                        # Client side quick filter if search_str
                        if search_str:
                            search_target = " ".join(str(v) for v in row_data.values()).lower()
                            if search_str.lower() not in search_target:
                                continue

                        items.append(row_data)

                    resp_q.put((True, {
                        "doc_type": doc_type,
                        "doc_title": doc_synonym,
                        "columns": columns,
                        "items": items,
                        "total": len(items)
                    }))

                # Action: Get Document Details (Header and Table Rows)
                elif action == "get_document_details":
                    doc_type = payload.get("doc_type") or "УстановкаЦенНоменклатуры"
                    doc_number = payload.get("number", "").strip()

                    q_det = conn.NewObject("Запрос")
                    q_det.Text = f"""
                    ВЫБРАТЬ ПЕРВЫЕ 1
                        Т.Ссылка КАК Ref
                    ИЗ
                        Документ.{doc_type} КАК Т
                    ГДЕ
                        Т.Номер = &DocNum
                    """
                    q_det.SetParameter("DocNum", doc_number)
                    res_det = q_det.Execute().Choose()
                    if not res_det.Next():
                        raise ValueError(f"Sənəd №{doc_number} tapılmadı")

                    doc_obj = res_det.Ref.ПолучитьОбъект()
                    raw_date = doc_obj.Дата
                    date_str = ""
                    if raw_date:
                        try:
                            date_str = raw_date.strftime("%d.%m.%Y %H:%M:%S")
                        except Exception:
                            date_str = str(raw_date)[:19]

                    header = {
                        "number": str(doc_obj.Номер),
                        "date": date_str,
                        "posted": bool(doc_obj.Проведен),
                        "comment": str(getattr(doc_obj, "Комментарий", "") or ""),
                        "responsible": str(getattr(doc_obj.Ответственный, "Наименование", "") if hasattr(doc_obj, "Ответственный") else "")
                    }

                    lines = []
                    if hasattr(doc_obj, "Товары"):
                        tab = doc_obj.Товары
                        for i in range(tab.Количество()):
                            row = tab.Получить(i)
                            nom = row.Номенклатура
                            lines.append({
                                "line_num": i + 1,
                                "code": str(getattr(nom, "Код", "") or "").strip(),
                                "name": str(getattr(nom, "Наименование", "") or "").strip(),
                                "artikul": str(getattr(nom, "Артикул", "") or "").strip(),
                                "price": float(getattr(row, "Цена", 0) or 0),
                                "price_type": str(getattr(row.ТипЦен, "Наименование", "") if hasattr(row, "ТипЦен") and row.ТипЦен else ""),
                                "unit": str(getattr(row.ЕдиницаИзмерения, "Наименование", "") if hasattr(row, "ЕдиницаИзмерения") and row.ЕдиницаИзмерения else "")
                            })

                    resp_q.put((True, {
                        "doc_type": doc_type,
                        "header": header,
                        "lines": lines,
                        "total_lines": len(lines)
                    }))

            except Exception as e:
                err_str = str(e)
                if any(k in err_str for k in ["Сеанс отсутствует", "ClusterDistribImpl", "Соединение разорвано"]):
                    print(f"⚠️ [1C BİLDİRİŞ] 1C sessiyası server tərəfindən bağlanıb, avtomatik bərpa edilir...", flush=True)
                    try:
                        self.connections.pop(key, None)
                    except Exception:
                        pass
                else:
                    print_server_error(f"OneCService.run [Action: {action}]", e, payload)
                resp_q.put((False, e))

    def execute(self, action, payload, retry=1):
        for attempt in range(retry + 1):
            resp_q = queue.Queue()
            self.req_q.put((action, payload, resp_q))
            ok, result = resp_q.get()
            if ok:
                return result
            err_str = str(result)
            if "Не обнаружено свободной лицензии" in err_str:
                # Do not retry license exhaustion errors; fail fast to allow instant cached response
                print("⚠️ [1C LİSENZİYA MƏŞĞUL] Lisenziya limiti tam doludur, təkrar gözlənilmir.", flush=True)
                raise result
            if attempt < retry and any(k in err_str for k in ["Сеанс отсутствует", "ClusterDistribImpl", "Соединение разорвано"]):
                print(f"⚠️ [1C BİLDİRİŞ] 1C sessiyası qırıldı, avtomatik yenidən qoşulur və '{action}' təkrar icra edilir (cəhd {attempt + 1})...", flush=True)
                time.sleep(0.5)
                continue
            print_server_error(f"OneCService.execute [Action: {action}]", result, payload)
            raise result

    def close_all(self):
        try:
            resp_q = queue.Queue()
            self.req_q.put(("shutdown", {}, resp_q))
            resp_q.get(timeout=2.0)
        except Exception:
            pass

# Start 1C Service
one_c = OneCService()
import atexit
atexit.register(one_c.close_all)

import database
database.init_db()

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

    return bases


@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/bases", methods=["GET"])
def get_bases():
    try:
        active_b = database.get_active_base()
        return jsonify({
            "success": True, 
            "bases": parse_ibases(),
            "active_base": active_b
        })
    except Exception as e:
        print_server_error("/api/bases", e)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/bases/set_active", methods=["POST"])
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

@app.route("/api/bases/add", methods=["POST"])
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

@app.route("/api/bases/delete", methods=["POST"])
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

@app.route("/api/users", methods=["POST"])
def get_users():
    data = request.json or {}
    try:
        users = one_c.execute("get_users", data)
        return jsonify({"success": True, "users": users})
    except Exception as e:
        print(f"⚠️ [/api/users fallback due to license/com error]: {e}")
        return jsonify({"success": True, "users": ["Nesib", "Administrator"]})

@app.route("/api/portfolios", methods=["POST"])
def get_portfolios():
    data = request.json or {}
    try:
        portfolios = one_c.execute("get_portfolios", data)
        return jsonify({"success": True, "portfolios": portfolios})
    except Exception as e:
        print_server_error("/api/portfolios", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/agents", methods=["POST"])
def get_agents():
    data = request.json or {}
    try:
        agents = one_c.execute("get_agents", data)
        return jsonify({"success": True, "agents": agents})
    except Exception as e:
        print_server_error("/api/agents", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/search_kontragents", methods=["POST"])
def search_kontragents():
    data = request.json or {}
    try:
        items = one_c.execute("search_kontragents", data)
        return jsonify({"success": True, "items": items})
    except Exception as e:
        print_server_error("/api/search_kontragents", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/search_nomenklatura", methods=["POST"])
def search_nomenklatura():
    data = request.json or {}
    try:
        items = one_c.execute("search_nomenklatura", data)
        return jsonify({"success": True, "items": items})
    except Exception as e:
        print_server_error("/api/search_nomenklatura", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/ping_connection", methods=["GET", "POST"])
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

@app.route("/api/login", methods=["POST"])
def user_login():
    data = request.json or {}
    try:
        print(f"🔑 [1C GİRİŞ CƏHDİ] Server: {data.get('server')} | Baza: {data.get('ref')} | İstifadəçi: {data.get('user')}", flush=True)
        res = one_c.execute("get_reports", data)
        print(f"✅ [1C GİRİŞ UĞURLU] İstifadəçi: {data.get('user')} uğurla bağlandı!", flush=True)
        # Persist selected database in SQLite as active database
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

@app.route("/api/generate_report", methods=["POST"])
def generate_report():
    data = request.json or {}
    try:
        res = one_c.execute("generate", data)
        return jsonify({"success": True, **res})
    except Exception as e:
        print_server_error("/api/generate_report", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/universal_sales", methods=["POST"])
def universal_sales():
    data = request.json or {}
    try:
        res = one_c.execute("universal_sales", data)
        return jsonify({"success": True, **res})
    except Exception as e:
        print_server_error("/api/universal_sales", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/download_excel", methods=["GET"])
def download_excel():
    if os.path.exists(EXCEL_OUTPUT):
        filename = f"Hesabat_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(EXCEL_OUTPUT, as_attachment=True, download_name=filename)
    return "Excel faylı tapılmadı.", 404

@app.route("/api/download_universal_excel", methods=["GET"])
def download_universal_excel():
    if os.path.exists(UNIVERSAL_EXCEL):
        filename = f"Universal_Satis_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(UNIVERSAL_EXCEL, as_attachment=True, download_name=filename)
    return "Excel faylı tapılmadı.", 404

@app.route("/api/universal_report", methods=["POST"])
def universal_report_endpoint():
    data = request.json or {}
    cache_path = os.path.join(SCRATCH_DIR, "last_successful_report.json")
    try:
        filters_cnt = len(data.get("filters", []))
        print(f"📊 [1C HESABAT SORĞUSU] /api/universal_report | Dövr: {data.get('start_date')} - {data.get('end_date')} | Süzgəclər: {filters_cnt} ədəd", flush=True)
        res = one_c.execute("universal_report", data)
        total_rows = res.get("total_count", len(res.get("items", [])))
        print(f"✅ [1C HESABAT HAZIR] Cəmi sətir sayı: {total_rows} sətir yükləndi.", flush=True)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(res, f, ensure_ascii=False)
        except Exception:
            pass
        return jsonify({"success": True, **res})
    except Exception as e:
        print_server_error("/api/universal_report", e, data)
        # Fallback to cached report if COM connector hits license limit or fails
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    cached_res = json.load(f)
                print("⚡ [1C KEŞDƏN YÜKLƏNDİ] Lisenziya məşğul olduğundan sonuncu hesabat keşdən verildi.", flush=True)
                return jsonify({
                    "success": True,
                    "is_cached": True,
                    "warning_message": "1C lisenziya limiti məşğuldur. Sonuncu formalaşdırılmış hesabat keşdən göstərilir.",
                    **cached_res
                })
            except Exception:
                pass
        return jsonify({"success": False, "error": str(e)})

_cached_price_types = [
    {"code": "20", "name": "20", "desc": "20"},
    {"code": "01", "name": "01", "desc": "01"},
    {"code": "02", "name": "02", "desc": "02"}
]

@app.route("/api/price_types", methods=["GET", "POST"])
def get_price_types_endpoint():
    global _cached_price_types
    return jsonify({"success": True, "price_types": _cached_price_types})

@app.route("/api/download_universal_report_excel", methods=["GET"])
def download_universal_report_excel():
    if os.path.exists(UNIVERSAL_REPORT_EXCEL):
        filename = f"Tovari_na_skladakh_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(UNIVERSAL_REPORT_EXCEL, as_attachment=True, download_name=filename)
    return "Excel faylı tapılmadı.", 404

@app.route("/api/export_universal_report_excel", methods=["POST"])
def export_universal_report_excel_endpoint():
    data = request.json or {}
    try:
        report_data = data.get("report_data", {})
        config = data.get("config", {})
        import excel_generator
        excel_generator.generate_1c_excel(report_data, config, UNIVERSAL_REPORT_EXCEL)
        return jsonify({"success": True})
    except Exception as e:
        print_server_error("/api/export_universal_report_excel", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/catalog_data", methods=["POST"])
def catalog_data_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("catalog_data", data)
        return jsonify({"success": True, **res})
    except Exception as e:
        print_server_error("/api/catalog_data", e, data)
        return jsonify({"success": False, "error": str(e)})


@app.route("/api/presets", methods=["GET"])
def get_presets_endpoint():
    try:
        presets = database.get_all_presets()
        return jsonify(presets)
    except Exception as e:
        print(f"Error fetching presets: {e}", flush=True)
        return jsonify([])

@app.route("/api/presets/save", methods=["POST"])
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

@app.route("/api/presets/delete", methods=["POST"])
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

@app.route("/api/presets/rename", methods=["POST"])
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

@app.route("/api/presets/duplicate", methods=["POST"])
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

@app.route("/api/presets/set_startup", methods=["POST"])
def set_startup_endpoint():
    try:
        data = request.json or {}
        name = data.get("name", "").strip()
        is_startup = bool(data.get("is_startup", False))
        success = database.set_startup_preset(name, is_startup)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/presets/set_save_on_close", methods=["POST"])
def set_save_on_close_endpoint():
    try:
        data = request.json or {}
        name = data.get("name", "").strip()
        is_save = bool(data.get("is_save", False))
        success = database.set_save_on_close(name, is_save)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/current_settings", methods=["GET", "POST"])
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

@app.route("/api/app/minimize", methods=["POST", "GET"])
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

@app.route("/api/app/close", methods=["POST", "GET"])
def app_close_endpoint():
    def shutdown_later():
        time.sleep(0.5)
        # Terminate electron processes
        os.system("taskkill /F /IM electron.exe >nul 2>&1")
# -------------------------------------------------------------
# PORTFOLIO CATALOG ENDPOINTS
# -------------------------------------------------------------
@app.route("/api/portfolio_catalog/filters", methods=["GET", "POST"])
def portfolio_catalog_filters_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_portfolio_catalog_filters", data)
        return jsonify({"success": True, **res})
    except Exception as e:
        print_server_error("/api/portfolio_catalog/filters", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/portfolio_catalog/items", methods=["POST"])
def portfolio_catalog_items_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_portfolio_catalog_items", data)
        if isinstance(res, dict):
            return jsonify({
                "success": True,
                "items": res.get("items", []),
                "price_types": res.get("price_types", []),
                "total": res.get("total", len(res.get("items", [])))
            })
        return jsonify({"success": True, "items": res, "total": len(res)})
    except Exception as e:
        print_server_error("/api/portfolio_catalog/items", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/portfolio_catalog/export_excel", methods=["POST"])
def portfolio_catalog_export_excel_endpoint():
    data = request.json or {}
    try:
        items = data.get("items", [])
        filters = data.get("filters", {})
        import excel_generator
        excel_generator.generate_portfolio_catalog_excel(items, filters, PORTFOLIO_EXCEL)
        return jsonify({"success": True, "download_url": "/api/portfolio_catalog/download_excel"})
    except Exception as e:
        print_server_error("/api/portfolio_catalog/export_excel", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/documents/list", methods=["POST"])
def documents_list_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_documents_list", data)
        return jsonify({
            "success": True,
            "doc_type": res.get("doc_type"),
            "doc_title": res.get("doc_title"),
            "columns": res.get("columns", []),
            "items": res.get("items", []),
            "total": res.get("total", 0)
        })
    except Exception as e:
        print_server_error("/api/documents/list", e, data)
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/documents/details", methods=["POST"])
def document_details_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_document_details", data)
        return jsonify({
            "success": True,
            "doc_type": res.get("doc_type"),
            "header": res.get("header", {}),
            "lines": res.get("lines", []),
            "total_lines": res.get("total_lines", 0)
        })
    except Exception as e:
        print_server_error("/api/documents/details", e, data)
        return jsonify({"success": False, "error": str(e)})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=False)


