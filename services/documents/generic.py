# -*- coding: utf-8 -*-
"""
services/documents/generic.py
Generic fallback handler for standard 1C document types:
- ПоступлениеТоваровУслуг
- ЗаказПокупателя
- ИнвентаризацияТоваровНаСкладе
- СписаниеТоваров
- ОприходованиеТоваров
"""
from services.filter_policy_loader import normalize_filters, BASE_FIELDS, validate_supported_fields
from services.document_filter_metadata import reference_filter_fields
from services.onec_dates import as_1c_date
from services.documents.base import format_1c_datetime, parse_query_datetime, build_filter_conditions, narrow_search_to_column

def get_generic_documents_list(conn, payload):
    doc_type = payload.get("doc_type") or "ПоступлениеТоваровУслуг"
    date_from = payload.get("date_from", "").strip()
    date_to = payload.get("date_to", "").strip()
    search_str = payload.get("search", "").strip()
    offset = int(payload.get("offset", 0))
    limit_count = int(payload.get("limit", 0))
    filters = normalize_filters(payload.get("filters", []))
    last_date = payload.get("last_date", "").strip()
    last_number = payload.get("last_number", "").strip()

    doc_meta = conn.Метаданные.Документы.Найти(doc_type)
    if not doc_meta:
        raise ValueError(f"1C sənədi '{doc_type}' konfiqurasiyada tapılmadı")

    doc_synonym = str(doc_meta.Синоним or doc_type)
    req_names = set(str(r.Имя) for r in doc_meta.Реквизиты)
    has_goods = doc_meta.ТабличныеЧасти.Найти("Товары") is not None
    has_kontr = "Контрагент" in req_names
    has_sum = "СуммаДокумента" in req_names
    sklad_field = next((name for name in ("СкладОрдер", "Склад", "СкладГруппа") if name in req_names), None)
    has_sklad = sklad_field is not None
    has_resp = "Ответственный" in req_names
    has_comm = "Комментарий" in req_names
    has_deal = "Сделка" in req_names
    has_contract = "ДоговорКонтрагента" in req_names
    has_portfolio = has_contract and doc_type == "ЗаказПокупателя"

    sel_parts = [
        "Т.Ссылка КАК Ref",
        "Т.Номер КАК Number",
        "Т.Дата КАК Date",
        "Т.Проведен КАК Posted",
        "Т.ПометкаУдаления КАК DeletionMark",
        "Т.ВерсияДанных КАК DataVersion"
    ]

    columns = [
        {"key": "status", "label": "", "width": 30, "align": "center"},
        {"key": "date", "label": "Дата", "width": 145, "align": "left"},
        {"key": "number", "label": "Номер", "width": 115, "align": "left"}
    ]

    if has_kontr:
        sel_parts.append("Т.Контрагент.Наименование КАК Kontragent")
        sel_parts.append("Т.Контрагент.ГоловнойКонтрагент.Наименование КАК GolovnoyKontragent")
        columns.append({"key": "kontragent", "label": "Контрагент", "width": 240, "align": "left"})
        columns.append({"key": "golovnoy_kontragent", "label": "Головной контрагент", "width": 180, "align": "left"})

    if has_contract:
        sel_parts.append("Т.ДоговорКонтрагента.Агент.Наименование КАК Agent")
        columns.append({"key": "agent", "label": "Агент", "width": 140, "align": "left"})
    if has_portfolio:
        sel_parts.append("Т.ДоговорКонтрагента.Портфель.Наименование КАК Portfolio")
        columns.append({"key": "portfolio", "label": "Портфель", "width": 130, "align": "left"})

    if has_sum:
        sel_parts.append("Т.СуммаДокумента КАК Amount")
        columns.append({"key": "amount", "label": "Сумма", "width": 110, "align": "right"})

    if has_sklad:
        sel_parts.append(f"ПРЕДСТАВЛЕНИЕ(Т.{sklad_field}) КАК Warehouse")
        columns.append({"key": "warehouse", "label": "Склад", "width": 160, "align": "left"})

    if has_deal:
        sel_parts.append("Т.Сделка.Номер КАК Deal")
        columns.append({"key": "deal", "label": "Номер заказа", "width": 130, "align": "left"})

    if has_contract:
        sel_parts.append("Т.ДоговорКонтрагента.Наименование КАК Contract")
        columns.append({"key": "contract", "label": "Договор", "width": 160, "align": "left"})

    if has_resp:
        sel_parts.append("ПРЕДСТАВЛЕНИЕ(Т.Ответственный) КАК Responsible")
        columns.append({"key": "responsible", "label": "Ответственный", "width": 160, "align": "left"})

    if has_comm:
        sel_parts.append("Т.Комментарий КАК Comment")
        columns.append({"key": "comment", "label": "Комментарий", "width": 200, "align": "left"})

    optional_fields = {key: attr for key, attr in {
        'organization': 'Организация', 'division': 'Подразделение', 'currency': 'ВалютаДокумента'
    }.items() if attr in req_names}
    for key, attr in optional_fields.items():
        sel_parts.append(f'Т.{attr}.Наименование КАК {key}')
        columns.append({'key': key, 'label': {'organization': 'Организация', 'division': 'Подразделение', 'currency': 'Валюта'}[key], 'width': 160, 'align': 'left'})
    if has_kontr:
        sel_parts.extend(['Т.Контрагент.Код КАК KontragentCode', 'Т.Контрагент.ГоловнойКонтрагент.Код КАК GolovnoyKontragentCode'])

    q_doc = conn.NewObject("Запрос")
    where_parts = []
    debug_params = {}

    dt_from = parse_query_datetime(date_from, is_end=False)
    if dt_from:
        q_doc.SetParameter("DateFrom", as_1c_date(dt_from))
        debug_params["DateFrom"] = str(dt_from)
        where_parts.append("Т.Дата >= &DateFrom")

    dt_to = parse_query_datetime(date_to, is_end=True)
    if dt_to:
        q_doc.SetParameter("DateTo", as_1c_date(dt_to))
        debug_params["DateTo"] = str(dt_to)
        where_parts.append("Т.Дата <= &DateTo")

    if search_str:
        q_doc.SetParameter("SearchVal", f"%{search_str}%")
        s_parts = ["Т.Номер ПОДОБНО &SearchVal"]
        if has_kontr: s_parts.append("Т.Контрагент.Наименование ПОДОБНО &SearchVal")
        if has_comm: s_parts.append("Т.Комментарий ПОДОБНО &SearchVal")
        where_parts.append(f"({' ИЛИ '.join(s_parts)})")

    field_map = {
        "__doc_table": f"Документ.{doc_type}"
    }
    if has_kontr:
        field_map["kontragent_code"] = "Т.Контрагент.Код"
        field_map["golovnoy_kontragent_code"] = "Т.Контрагент.ГоловнойКонтрагент.Код"
        field_map["kontragent"] = "Т.Контрагент.Наименование"
        field_map["golovnoy_kontragent"] = "Т.Контрагент.ГоловнойКонтрагент.Наименование"
    if has_sum: field_map["amount"] = "Т.СуммаДокумента"
    field_map["warehouse"] = f"Т.{sklad_field}.Наименование" if has_sklad else None
    if has_portfolio: field_map["portfolio"] = "Т.ДоговорКонтрагента.Портфель.Наименование"
    if has_deal: field_map["deal"] = "Т.Сделка.Номер"
    if has_contract:
        field_map["contract"] = "Т.ДоговорКонтрагента.Наименование"
        field_map["agent"] = "Т.ДоговорКонтрагента.Агент.Наименование"
    if has_resp: field_map["responsible"] = "Т.Ответственный.Наименование"
    if has_comm: field_map["comment"] = "Т.Комментарий"

    field_map.update({key: f'Т.{attr}.Наименование' for key, attr in optional_fields.items()})
    field_map.update(reference_filter_fields(conn, doc_type))
    supported_fields = BASE_FIELDS | {key for key, expression in field_map.items() if not key.startswith('__') and expression}
    if has_goods: supported_fields.update(('nomenclature', 'artikul', 'barcode'))
    if has_contract: supported_fields.update(('agent_sales_type', 'agent_sales_group'))
    field_map['__supported_fields'] = supported_fields
    validate_supported_fields(filters, supported_fields)
    narrow_search_to_column(payload, where_parts, field_map, q_doc)
    build_filter_conditions(filters, q_doc, where_parts, debug_params, field_map, conn=conn)

    if last_date and not search_str and not filters:
        try:
            dt_last = parse_query_datetime(last_date, is_end=False)
            if dt_last:
                q_doc.SetParameter("LastDate", as_1c_date(dt_last))
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
        {", ".join(sel_parts)}
    ИЗ
        Документ.{doc_type} КАК Т
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
        }
        if has_kontr:
            row_data["kontragent"] = str(res_doc.Kontragent or "").strip()
            row_data["golovnoy_kontragent"] = str(res_doc.GolovnoyKontragent or "").strip()
        if has_kontr:
            row_data['kontragent_code'] = str(res_doc.KontragentCode or '').strip()
            row_data['golovnoy_kontragent_code'] = str(res_doc.GolovnoyKontragentCode or '').strip()
        for key in optional_fields:
            row_data[key] = str(getattr(res_doc, key) or '').strip()
        if has_sum: row_data["amount"] = float(res_doc.Amount or 0)
        if has_portfolio: row_data["portfolio"] = str(res_doc.Portfolio or "").strip()
        if has_sklad: row_data["warehouse"] = str(res_doc.Warehouse or "").strip()
        if has_deal: row_data["deal"] = str(res_doc.Deal or "").strip()
        if has_contract:
            row_data["contract"] = str(res_doc.Contract or "").strip()
            row_data["agent"] = str(res_doc.Agent or "").strip()
        if has_resp: row_data["responsible"] = str(res_doc.Responsible or "").strip()
        if has_comm: row_data["comment"] = str(res_doc.Comment or "").strip()

        items.append(row_data)

        if limit_count and limit_count > 0 and len(items) >= limit_count:
            break

    return {
        "items": items,
        "columns": columns,
        "supported_filter_fields": sorted(supported_fields),
        "total_count": len(items),
        "doc_title": doc_synonym,
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


def get_generic_document_details(conn, payload):
    doc_type = payload.get("doc_type") or "ПоступлениеТоваровУслуг"
    doc_number = payload.get("number", "").strip()

    q_det = conn.NewObject("Запрос")
    q_det.Text = f"""
    ВЫБРАТЬ ПЕРВЫЕ 1
        Т.Ссылка КАК Ref
    ИЗ
        Документ.{doc_type} КАК Т
    ГДЕ
        Т.Номер = &DocNum
        ИЛИ Т.Номер ПОДОБНО &DocNumLike
    """
    q_det.SetParameter("DocNum", doc_number)
    q_det.SetParameter("DocNumLike", f"%{doc_number}%")
    res_det = q_det.Execute().Choose()
    if not res_det.Next():
        raise ValueError(f"Sənəd №{doc_number} tapılmadı")

    doc_ref = res_det.Ref
    doc_obj = doc_ref.ПолучитьОбъект()

    header = {
        "number": str(doc_obj.Номер).strip(),
        "date": format_1c_datetime(doc_obj.Дата),
        "posted": bool(doc_obj.Проведен),
        "deleted": bool(doc_obj.ПометкаУдаления),
        "organization": str(getattr(doc_obj.Организация, "Наименование", "") or "").strip() if getattr(doc_obj, "Организация", None) else "",
        "kontragent": str(getattr(doc_obj.Контрагент, "Наименование", "") or "").strip() if getattr(doc_obj, "Контрагент", None) else "",
        "contract": str(getattr(doc_obj.ДоговорКонтрагента, "Наименование", "") or "").strip() if getattr(doc_obj, "ДоговорКонтрагента", None) else "",
        "warehouse": str(getattr(doc_obj.Склад, "Наименование", "") or "").strip() if getattr(doc_obj, "Склад", None) else "",
        "amount": float(getattr(doc_obj, "СуммаДокумента", 0) or 0),
        "currency": str(getattr(doc_obj.ВалютаДокумента, "Наименование", "") or "").strip() if getattr(doc_obj, "ВалютаДокумента", None) else "AZN",
        "responsible": str(getattr(doc_obj.Ответственный, "Наименование", "") or "").strip() if getattr(doc_obj, "Ответственный", None) else "",
        "comment": str(getattr(doc_obj, "Комментарий", "") or "").strip()
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
                "quantity": float(getattr(row, "Количество", 0) or 0),
                "unit": str(getattr(ed_obj, "Наименование", "") or "").strip() if ed_obj else "",
                "price": float(getattr(row, "Цена", 0) or 0),
                "amount": float(getattr(row, "Сумма", 0) or 0),
            })

    header["tovary"] = tovary
    return header
