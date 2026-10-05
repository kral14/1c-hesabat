# -*- coding: utf-8 -*-
from services.common import CACHE_DIR
import os
import re
import datetime
import json
from services.common import (
    get_folders_map,
    resolve_root_portfolio,
    is_vehicle_group,
    get_barcodes_map,
    get_all_price_types,
    print_server_error,
    SCRATCH_DIR,
    EXCEL_OUTPUT,
    UNIVERSAL_EXCEL,
    UNIVERSAL_REPORT_EXCEL
)
import excel_generator

def handle_universal_sales(conn, payload, key, resp_q):
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



def handle_universal_report(conn, payload, key, resp_q):
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
            match_all = False
            clean_val = f_val
            if clean_val.startswith("[И]"):
                match_all = True
                clean_val = clean_val[3:].strip()

            n_parts = [w.strip() for w in re.split(r'[;,]', clean_val) if w.strip()]
            if len(n_parts) > 1 or f_comp in ["in_list", "in_group", "in_group_list"]:
                sub_p = []
                for part in n_parts:
                    is_contains = False
                    if part.lower().startswith("содержит:"):
                        is_contains = True
                        part = part[9:].strip()

                    if is_contains:
                        p_name = f"NomParam_{p_idx}"
                        p_idx += 1
                        sub_p.append(f"(Т.Номенклатура.Наименование ПОДОБНО &{p_name} ИЛИ Т.Номенклатура.Код ПОДОБНО &{p_name} ИЛИ Т.Номенклатура.Артикул ПОДОБНО &{p_name})")
                        q.SetParameter(p_name, f"%{part}%")
                        continue

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
                    join_operator = " И " if match_all else " ИЛИ "
                    if f_comp == "not_equal":
                        where_clauses.append("НЕ (" + join_operator.join(sub_p) + ")")
                    else:
                        where_clauses.append("(" + join_operator.join(sub_p) + ")")
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



def handle_direct_calculate(conn, payload, key, resp_q):
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



def handle_generate(conn, payload, key, resp_q, req_q=None):
    setting_name = payload.get("setting_name", "gunay gundelik")
    date_start_str = payload.get("date_start", "2026-09-01")
    date_end_str = payload.get("date_end", "2026-09-28")

    if "Müstəqil Hesablama" in setting_name or "DirectEngine" in setting_name:
        req_q.put(("direct_calculate", payload, resp_q))
        return

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
            return

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


REPORT_HANDLERS = {
    "universal_sales": handle_universal_sales,
    "universal_report": handle_universal_report,
    "direct_calculate": handle_direct_calculate,
    "generate": handle_generate,
}
