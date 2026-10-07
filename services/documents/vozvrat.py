# -*- coding: utf-8 -*-
"""
services/documents/vozvrat.py
Dedicated handler for 'ВозвратТоваровОтПокупателя' (Customer Returns) documents.
"""
from services.documents.base import format_1c_datetime, parse_query_datetime, build_filter_conditions, narrow_search_to_column

def get_vozvrat_list(conn, payload):
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
        {"key": "kontragent", "label": "Контрагент", "width": 240, "align": "left"},
        {"key": "amount", "label": "Сумма", "width": 110, "align": "right"},
        {"key": "warehouse", "label": "Склад", "width": 160, "align": "left"},
        {"key": "deal", "label": "Сделка / Заказ", "width": 130, "align": "left"},
        {"key": "contract", "label": "Договор", "width": 160, "align": "left"},
        {"key": "responsible", "label": "Ответственный", "width": 160, "align": "left"},
        {"key": "comment", "label": "Комментарий", "width": 200, "align": "left"}
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

    try:
        attr_names = set(str(a.Имя) for a in conn.Метаданные.Документы.ВозвратТоваровОтПокупателя.Реквизиты)
        wh_attr = "Т.Склад" if "Склад" in attr_names else ("Т.СкладОрдер" if "СкладОрдер" in attr_names else "")
    except Exception:
        wh_attr = "Т.Склад"

    wh_sql_field = f"ПРЕДСТАВЛЕНИЕ({wh_attr}) КАК Warehouse," if wh_attr else '"" КАК Warehouse,'

    if search_str:
        q_doc.SetParameter("SearchVal", f"%{search_str}%")
        debug_params["SearchVal"] = f"%{search_str}%"
        s_cond = (
            "(Т.Номер ПОДОБНО &SearchVal "
            "ИЛИ Т.Контрагент.Наименование ПОДОБНО &SearchVal "
            "ИЛИ Т.Комментарий ПОДОБНО &SearchVal "
            "ИЛИ Т.ДоговорКонтрагента.Наименование ПОДОБНО &SearchVal"
            + (f" ИЛИ ПРЕДСТАВЛЕНИЕ({wh_attr}) ПОДОБНО &SearchVal)" if wh_attr else ")")
        )
        where_parts.append(s_cond)

    field_map = {
        "__doc_table": "Документ.ВозвратТоваровОтПокупателя",
        "comment": "Т.Комментарий",
        "kontragent": "Т.Контрагент.Наименование",
        "warehouse": f"ПРЕДСТАВЛЕНИЕ({wh_attr})" if wh_attr else "",
        "deal": "Т.Сделка.Номер",
        "contract": "Т.ДоговорКонтрагента.Наименование",
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
        Т.Контрагент.Наименование КАК Kontragent,
        Т.СуммаДокумента КАК Amount,
        {wh_sql_field}
        Т.Сделка.Номер КАК Deal,
        Т.ДоговорКонтрагента.Наименование КАК Contract,
        ПРЕДСТАВЛЕНИЕ(Т.Ответственный) КАК Responsible,
        Т.Комментарий КАК Comment
    ИЗ
        Документ.ВозвратТоваровОтПокупателя КАК Т
    {where_sql}
    УПОРЯДОЧИТЬ ПО
        Т.Дата УБЫВ,
        Т.Номер УБЫВ
    """

    res_doc = q_doc.Execute().Choose()
    items = []
    skipped = 0

    while res_doc.Next():
        if offset > 0 and skipped < offset:
            skipped += 1
            continue

        d_num = str(res_doc.Number or "").strip()
        row_data = {
            "ref_key": d_num,
            "number": d_num,
            "date": format_1c_datetime(res_doc.Date),
            "posted": bool(res_doc.Posted),
            "deleted": bool(res_doc.DeletionMark),
            "kontragent": str(res_doc.Kontragent or "").strip(),
            "amount": float(res_doc.Amount or 0),
            "warehouse": str(res_doc.Warehouse or "").strip(),
            "deal": str(res_doc.Deal or "").strip(),
            "contract": str(res_doc.Contract or "").strip(),
            "responsible": str(res_doc.Responsible or "").strip(),
            "comment": str(res_doc.Comment or "").strip()
        }
        items.append(row_data)

        if limit_count and limit_count > 0 and len(items) >= limit_count:
            break

    return {
        "items": items,
        "columns": columns,
        "total_count": len(items),
        "doc_title": "Возврат товаров от покупателя",
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


def get_vozvrat_details(conn, payload):
    doc_number = payload.get("number", "").strip()

    q_det = conn.NewObject("Запрос")
    q_det.Text = """
    ВЫБРАТЬ ПЕРВЫЕ 1
        Т.Ссылка КАК Ref
    ИЗ
        Документ.ВозвратТоваровОтПокупателя КАК Т
    ГДЕ
        Т.Номер = &DocNum
        ИЛИ Т.Номер ПОДОБНО &DocNumLike
    """
    q_det.SetParameter("DocNum", doc_number)
    q_det.SetParameter("DocNumLike", f"%{doc_number}%")
    res_det = q_det.Execute().Choose()
    if not res_det.Next():
        raise ValueError(f"Возврат товаров №{doc_number} tapılmadı")

    v_ref = res_det.Ref
    doc_obj = v_ref.ПолучитьОбъект()

    header_data = {
        "number": str(doc_obj.Номер).strip(),
        "date": format_1c_datetime(doc_obj.Дата),
        "posted": bool(doc_obj.Проведен),
        "deleted": bool(doc_obj.ПометкаУдаления),
        "organization": str(getattr(doc_obj.Организация, "Наименование", "") or "").strip() if getattr(doc_obj, "Организация", None) else "",
        "kontragent": str(getattr(doc_obj.Контрагент, "Наименование", "") or "").strip() if getattr(doc_obj, "Контрагент", None) else "",
        "contract": str(getattr(doc_obj.ДоговорКонтрагента, "Наименование", "") or "").strip() if getattr(doc_obj, "ДоговорКонтрагента", None) else "",
        "warehouse": str(getattr(doc_obj.СкладОрдер, "Наименование", "") or "").strip() if getattr(doc_obj, "СкладОрдер", None) else "",
        "amount": float(getattr(doc_obj, "СуммаДокумента", 0) or 0),
        "currency": str(getattr(doc_obj.ВалютаДокумента, "Наименование", "") or "").strip() if getattr(doc_obj, "ВалютаДокумента", None) else "AZN",
        "responsible": str(getattr(doc_obj.Ответственный, "Наименование", "") or "").strip() if getattr(doc_obj, "Ответственный", None) else "",
        "comment": str(getattr(doc_obj, "Комментарий", "") or "").strip(),
        "deal": str(getattr(getattr(doc_obj, "Сделка", None), "Номер", "") or "").strip() if getattr(doc_obj, "Сделка", None) else ""
    }

    tovary = []
    if hasattr(doc_obj, "Товары"):
        for idx, row in enumerate(doc_obj.Товары):
            nom_obj = row.Номенклатура if hasattr(row, "Номенклатура") else None
            ed_obj = row.ЕдиницаИзмерения if hasattr(row, "ЕдиницаИзмерения") else None
            tovary.append({
                "line_number": int(getattr(row, "НомерСтроки", idx + 1)),
                "nomenklatura": str(getattr(nom_obj, "Наименование", "") or "").strip() if nom_obj else "",
                "code": str(getattr(nom_obj, "Код", "") or "").strip() if nom_obj else "",
                "article": str(getattr(nom_obj, "Артикул", "") or "").strip() if nom_obj else "",
                "quantity": float(getattr(row, "Количество", 0) or 0),
                "unit": str(getattr(ed_obj, "Наименование", "") or "").strip() if ed_obj else "",
                "coefficient": float(getattr(row, "Коэффициент", 1) or 1),
                "price": float(getattr(row, "Цена", 0) or 0),
                "amount": float(getattr(row, "Сумма", 0) or 0),
                "discount_percent": float(getattr(row, "ПроцентСкидкиНаценки", 0) or 0),
                "vat_rate": str(getattr(getattr(row, "СтавкаНДС", None), "Наименование", "") or ""),
                "vat_amount": float(getattr(row, "СуммаНДС", 0) or 0),
                "total_amount": float(getattr(row, "Сумма", 0) or 0)
            })

    lines = []
    for t in tovary:
        lines.append({
            "line_num": t["line_number"],
            "name": t["nomenklatura"],
            "code": t["code"],
            "artikul": t["article"],
            "quantity": t["quantity"],
            "unit": t["unit"],
            "coefficient": t["coefficient"],
            "price": t["price"],
            "sum": t["amount"],
            "vat_rate": t["vat_rate"],
            "vat_sum": t["vat_amount"],
            "total": t["total_amount"],
            "discount_percent": t["discount_percent"]
        })

    return {
        "doc_type": "ВозвратТоваровОтПокупателя",
        "header": header_data,
        "lines": lines,
        "total_lines": len(lines),
        "tovary": tovary
    }
