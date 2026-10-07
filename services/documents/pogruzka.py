# -*- coding: utf-8 -*-
"""
services/documents/pogruzka.py
Dedicated handler for 'ПогрузкиМашин' (Loading Machine) documents.
"""
from services.documents.base import format_1c_datetime, parse_query_datetime, build_filter_conditions, narrow_search_to_column

def get_pogruzka_list(conn, payload):
    date_from = payload.get("date_from", "").strip()
    date_to = payload.get("date_to", "").strip()
    search_str = payload.get("search", "").strip()
    offset = int(payload.get("offset", 0))
    limit_count = int(payload.get("limit", 0))
    filters = payload.get("filters", [])
    last_date = payload.get("last_date", "").strip()
    last_number = payload.get("last_number", "").strip()

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

    q_doc = conn.NewObject("Запрос")
    where_parts = []
    debug_params = {}

    dt_from = parse_query_datetime(date_from, is_end=False)
    if dt_from:
        q_doc.SetParameter("DateFrom", dt_from)
        debug_params["DateFrom"] = str(dt_from)
        where_parts.append("Т.Дата >= &DateFrom")

    dt_to = parse_query_datetime(date_to, is_end=True)
    if dt_to:
        q_doc.SetParameter("DateTo", dt_to)
        debug_params["DateTo"] = str(dt_to)
        where_parts.append("Т.Дата <= &DateTo")

    if search_str:
        q_doc.SetParameter("SearchVal", f"%{search_str}%")
        debug_params["SearchVal"] = f"%{search_str}%"
        s_cond = (
            "(Т.Номер ПОДОБНО &SearchVal "
            "ИЛИ Т.Маршрут ПОДОБНО &SearchVal "
            "ИЛИ ПРЕДСТАВЛЕНИЕ(Т.Водитель) ПОДОБНО &SearchVal "
            "ИЛИ ПРЕДСТАВЛЕНИЕ(Т.Склад) ПОДОБНО &SearchVal "
            "ИЛИ ПРЕДСТАВЛЕНИЕ(Т.Ответственный) ПОДОБНО &SearchVal)"
        )
        where_parts.append(s_cond)

    field_map = {
        "marshrut": "Т.Маршрут",
        "voditel": "ПРЕДСТАВЛЕНИЕ(Т.Водитель)",
        "warehouse": "ПРЕДСТАВЛЕНИЕ(Т.Склад)",
        "responsible": "ПРЕДСТАВЛЕНИЕ(Т.Ответственный)"
    }
    narrow_search_to_column(payload, where_parts, field_map, q_doc)
    build_filter_conditions(filters, q_doc, where_parts, debug_params, field_map)

    if last_date and not search_str and not filters:
        try:
            dt_last = parse_query_datetime(last_date, is_end=False)
            if dt_last:
                q_doc.SetParameter("LastDate", dt_last)
                q_doc.SetParameter("LastNumber", last_number or "")
                where_parts.append("(Т.Дата < &LastDate ИЛИ (Т.Дата = &LastDate И Т.Номер < &LastNumber))")
                offset = 0
        except Exception:
            pass

    where_sql = ("ГДЕ " + " И ".join(where_parts)) if where_parts else ""
    fetch_total = (offset + limit_count + 1) if (limit_count and limit_count > 0) else 0
    first_clause = f"ПЕРВЫЕ {fetch_total}" if fetch_total > 0 else ""

    q_doc.Text = f"""
    ВЫБРАТЬ {first_clause}
        Т.Ссылка КАК Ref,
        Т.Номер КАК Number,
        Т.Дата КАК Date,
        Т.Проведен КАК Posted,
        Т.ПометкаУдаления КАК DeletionMark,
        Т.Маршрут КАК Marshrut,
        ПРЕДСТАВЛЕНИЕ(Т.Водитель) КАК Voditel,
        ПРЕДСТАВЛЕНИЕ(Т.Склад) КАК Warehouse,
        ПРЕДСТАВЛЕНИЕ(Т.Ответственный) КАК Responsible
    ИЗ
        Документ.ПогрузкиМашин КАК Т
    {where_sql}
    УПОРЯДОЧИТЬ ПО
        Т.Дата УБЫВ,
        Т.Номер УБЫВ
    """

    res_doc = q_doc.Execute().Choose()
    items = []
    pog_refs = []
    pog_map = {}
    skipped = 0

    while res_doc.Next():
        if offset > 0 and skipped < offset:
            skipped += 1
            continue

        p_ref = res_doc.Ref
        p_num = str(res_doc.Number or "").strip()
        pog_refs.append(p_ref)

        row_data = {
            "ref_key": p_num,
            "number": p_num,
            "date": format_1c_datetime(res_doc.Date),
            "posted": bool(res_doc.Posted),
            "deleted": bool(res_doc.DeletionMark),
            "marshrut": str(res_doc.Marshrut or "").strip(),
            "voditel": str(res_doc.Voditel or "").strip(),
            "warehouse": str(res_doc.Warehouse or "").strip(),
            "responsible": str(res_doc.Responsible or "").strip(),
            "realization_count": 0,
            "amount": 0.0
        }
        items.append(row_data)
        pog_map[p_num] = row_data

        if limit_count and limit_count > 0 and len(items) >= limit_count:
            break

    # Fast batch aggregation of realizations for the page
    if pog_refs:
        try:
            arr_refs = conn.NewObject("Массив")
            for r in pog_refs:
                arr_refs.Add(r)
            q_agg = conn.NewObject("Запрос")
            q_agg.SetParameter("PogRefs", arr_refs)
            q_agg.Text = """
            ВЫБРАТЬ
                СР.Ссылка.Номер КАК PogNum,
                КОЛИЧЕСТВО(РАЗЛИЧНЫЕ СР.Накладная) КАК RealizCount,
                СУММА(СР.Накладная.СуммаДокумента) КАК TotalAmount
            ИЗ
                Документ.ПогрузкиМашин.СписокРеализаций КАК СР
            ГДЕ
                СР.Ссылка В (&PogRefs)
            СГРУППИРОВАТЬ ПО
                СР.Ссылка.Номер
            """
            r_agg = q_agg.Execute().Choose()
            while r_agg.Next():
                p_k = str(r_agg.PogNum or "").strip()
                if p_k in pog_map:
                    pog_map[p_k]["realization_count"] = int(r_agg.RealizCount or 0)
                    pog_map[p_k]["amount"] = float(r_agg.TotalAmount or 0)
        except Exception as e_agg:
            print("Pogruzka aggregate calculation error:", e_agg)

    return {
        "items": items,
        "columns": columns,
        "total_count": len(items),
        "doc_title": "Погрузки машин",
        "has_more": (len(items) >= limit_count) if limit_count else False,
        "last_date": items[-1]["date"] if items else "",
        "last_number": items[-1]["number"] if items else "",
        "debug_info": {
            "parameters": debug_params,
            "filters_count": len([c for c in filters if isinstance(c, dict) and c.get("enabled") is not False]),
            "search": search_str,
            "total_fetched": len(items)
        }
    }


def get_pogruzka_details(conn, payload):
    doc_number = payload.get("number", "").strip()

    q_det = conn.NewObject("Запрос")
    q_det.Text = """
    ВЫБРАТЬ ПЕРВЫЕ 1
        Т.Ссылка КАК Ref,
        Т.Номер КАК Number,
        Т.Дата КАК Date,
        Т.Проведен КАК Posted,
        Т.ПометкаУдаления КАК DeletionMark,
        Т.Маршрут КАК Marshrut,
        ПРЕДСТАВЛЕНИЕ(Т.Водитель) КАК Voditel,
        ПРЕДСТАВЛЕНИЕ(Т.Склад) КАК Warehouse,
        ПРЕДСТАВЛЕНИЕ(Т.Ответственный) КАК Responsible,
        "" КАК Comment
    ИЗ
        Документ.ПогрузкиМашин КАК Т
    ГДЕ
        Т.Номер = &DocNum
        ИЛИ Т.Номер ПОДОБНО &DocNumLike
    """
    q_det.SetParameter("DocNum", doc_number)
    q_det.SetParameter("DocNumLike", f"%{doc_number}%")
    res_det = q_det.Execute().Choose()
    if not res_det.Next():
        raise ValueError(f"Погрузка машины №{doc_number} tapılmadı")

    p_ref = res_det.Ref

    doc_num_val = str(getattr(p_ref, "Номер", "") or getattr(res_det, "Number", "") or doc_number).strip()
    doc_date_raw = getattr(p_ref, "Дата", None) or getattr(res_det, "Date", None)
    doc_date_val = format_1c_datetime(doc_date_raw)

    resp_name = str(getattr(res_det, "Responsible", "") or "").strip()
    if not resp_name:
        try:
            resp_obj = getattr(p_ref, "Ответственный", None)
            if resp_obj:
                resp_name = str(getattr(resp_obj, "Наименование", "") or "").strip()
        except Exception:
            pass

    header_data = {
        "number": doc_num_val,
        "date": doc_date_val,
        "posted": bool(res_det.Posted),
        "deleted": bool(res_det.DeletionMark),
        "marshrut": str(res_det.Marshrut or "").strip(),
        "voditel": str(res_det.Voditel or "").strip(),
        "warehouse": str(res_det.Warehouse or "").strip(),
        "responsible": resp_name,
        "comment": str(res_det.Comment or "").strip(),
        "organization": "Aztrade MMC",
    }

    # Query tabular section: СписокРеализаций
    q_rows = conn.NewObject("Запрос")
    q_rows.SetParameter("PogRef", p_ref)
    q_rows.Text = """
    ВЫБРАТЬ
        СР.НомерСтроки КАК LineNum,
        СР.Накладная.Номер КАК RealizNum,
        СР.Накладная.Дата КАК RealizDate,
        СР.Накладная.Проведен КАК Posted,
        СР.Накладная.ПометкаУдаления КАК DeletionMark,
        СР.Накладная.Контрагент.Наименование КАК Kontragent,
        СР.Накладная.СуммаДокумента КАК Amount,
        СР.Накладная.Склад.Наименование КАК Warehouse,
        СР.Накладная.Сделка.Номер КАК Deal,
        СР.Накладная.ДоговорКонтрагента.Наименование КАК Contract,
        СР.Накладная.ДоговорКонтрагента.Портфель.Наименование КАК Portfolio,
        СР.Накладная.ДоговорКонтрагента.Агент.Наименование КАК Agent,
        ПРЕДСТАВЛЕНИЕ(СР.Накладная.Ответственный) КАК RealizResponsible,
        СР.Накладная.Комментарий КАК Comment
    ИЗ
        Документ.ПогрузкиМашин.СписокРеализаций КАК СР
    ГДЕ
        СР.Ссылка = &PogRef
    УПОРЯДОЧИТЬ ПО
        СР.НомерСтроки
    """
    res_rows = q_rows.Execute().Choose()

    realiz_list = []
    lines = []
    total_amount = 0.0

    while res_rows.Next():
        amt = float(res_rows.Amount or 0)
        total_amount += amt
        line_no = int(res_rows.LineNum or len(realiz_list) + 1)
        r_num = str(res_rows.RealizNum or "").strip()
        r_date = format_1c_datetime(res_rows.RealizDate)
        k_name = str(res_rows.Kontragent or "").strip()
        wh_name = str(res_rows.Warehouse or "").strip()
        deal_num = str(res_rows.Deal or "").strip()
        contract_name = str(res_rows.Contract or "").strip()
        portfolio_name = str(res_rows.Portfolio or "").strip()
        agent_name = str(res_rows.Agent or "").strip()
        if not agent_name:
            agent_name = str(res_rows.RealizResponsible or "").strip()

        if not portfolio_name and contract_name:
            if "(" in contract_name:
                portfolio_name = contract_name.split("(")[0].strip()
            else:
                portfolio_name = contract_name

        nakl_comm = str(res_rows.Comment or "").strip()

        row_item = {
            "line_number": line_no,
            "realiz_number": r_num,
            "realiz_date": r_date,
            "kontragent": k_name,
            "amount": amt,
            "posted": bool(res_rows.Posted),
            "deleted": bool(res_rows.DeletionMark),
            "warehouse": wh_name,
            "deal": deal_num,
            "contract": contract_name,
            "portfolio": portfolio_name,
            "agent": agent_name,
            "comment": nakl_comm
        }
        realiz_list.append(row_item)

        lines.append({
            "line_num": line_no,
            "name": f"Реализация №{r_num} ({k_name})",
            "code": r_num,
            "artikul": r_date,
            "quantity": 1,
            "unit": "документ",
            "price": amt,
            "price_type": "Реализация",
            "sum": amt,
            "total": amt
        })

    return {
        "doc_type": "ПогрузкиМашин",
        "header": header_data,
        "lines": lines,
        "total_lines": len(lines),
        "realizations": realiz_list,
        "realization_count": len(realiz_list),
        "amount": total_amount
    }
