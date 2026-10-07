# -*- coding: utf-8 -*-
"""
services/documents/realization.py
Handler for 'РеализацияТоваровУслуг' (Sales Invoice) documents.
High-performance batch querying without full-table scans.
"""
from services.documents.base import format_1c_datetime, parse_query_datetime, build_filter_conditions, narrow_search_to_column

def get_realization_list(conn, payload):
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
            "ИЛИ Т.Контрагент.Наименование ПОДОБНО &SearchVal "
            "ИЛИ Т.Контрагент.Код ПОДОБНО &SearchVal "
            "ИЛИ Т.Комментарий ПОДОБНО &SearchVal "
            "ИЛИ Т.Сделка.Номер ПОДОБНО &SearchVal "
            "ИЛИ Т.ДоговорКонтрагента.Наименование ПОДОБНО &SearchVal)"
        )
        where_parts.append(s_cond)

    field_map = {
        "__doc_table": "Документ.РеализацияТоваровУслуг",
        "comment": "Т.Комментарий",
        "number": "Т.Номер",
        "kontragent": "Т.Контрагент.Наименование",
        "kontragent_code": "Т.Контрагент.Код",
        "deal": "Т.Сделка.Номер",
        "contract": "Т.ДоговорКонтрагента.Наименование",
        "contract_price_type": "Т.ДоговорКонтрагента.ТипЦен.Наименование",
        "portfolio": "Т.ДоговорКонтрагента.Портфель.Наименование",
        "vms_status": "ПРЕДСТАВЛЕНИЕ(ВМС.СтатусВМС)",
        "warehouse": "Т.Склад.Наименование",
        "responsible": "Т.Ответственный.Наименование"
    }
    narrow_search_to_column(payload, where_parts, field_map, q_doc)
    build_filter_conditions(filters, q_doc, where_parts, debug_params, field_map)

    # Keyset pagination when no filters
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
        Т.ВерсияДанных КАК DataVersion,
        Т.Контрагент.Наименование КАК Kontragent,
        Т.Контрагент.Код КАК KontragentCode,
        Т.СуммаДокумента КАК Amount,
        Т.Склад.Наименование КАК Warehouse,
        Т.Сделка.Номер КАК Deal,
        Т.ДоговорКонтрагента.Наименование КАК Contract,
        Т.ДоговорКонтрагента.ТипЦен.Наименование КАК ContractPriceType,
        Т.ДоговорКонтрагента.Портфель.Наименование КАК Portfolio,
        Т.Ответственный.Наименование КАК Responsible,
        Т.Комментарий КАК Comment,
        ПРЕДСТАВЛЕНИЕ(ВМС.СтатусВМС) КАК StatusVMS,
        ОбрВложенный.Номер КАК ObrabotkaNumber
    ИЗ
        Документ.РеализацияТоваровУслуг КАК Т
        ЛЕВОЕ СОЕДИНЕНИЕ (
            ВЫБРАТЬ
                Обр.Заказ КАК Заказ,
                МАКСИМУМ(Обр.Ссылка.Номер) КАК Номер
            ИЗ
                Документ.ОбработкаЗаказов.ДанныеДляАнализа КАК Обр
            СГРУППИРОВАТЬ ПО
                Обр.Заказ
        ) КАК ОбрВложенный
        ПО Т.Сделка = ОбрВложенный.Заказ
        ЛЕВОЕ СОЕДИНЕНИЕ РегистрСведений.СтатусВМС.СрезПоследних КАК ВМС
        ПО Т.Ссылка = ВМС.Документ1С
    {where_sql}
    УПОРЯДОЧИТЬ ПО
        Т.Дата УБЫВ,
        Т.Номер УБЫВ
    """

    res_doc = q_doc.Execute().Choose()
    items = []
    doc_refs = []
    doc_ref_map = {}
    skipped = 0
    while res_doc.Next():
        if offset > 0 and skipped < offset:
            skipped += 1
            continue

        d_ref = res_doc.Ref
        d_num = str(res_doc.Number or "").strip()
        doc_refs.append(d_ref)

        dv_str = ""
        try:
            dv = res_doc.DataVersion
            if dv is not None:
                dv_str = str(conn.Base64Строка(dv)).strip()
        except Exception:
            pass

        row_data = {
            "ref_key": str(d_num),
            "number": d_num,
            "date": format_1c_datetime(res_doc.Date),
            "posted": bool(res_doc.Posted),
            "deleted": bool(res_doc.DeletionMark),
            "data_version": dv_str,
            "kontragent": str(res_doc.Kontragent or "").strip(),
            "kontragent_code": str(res_doc.KontragentCode or "").strip(),
            "amount": float(res_doc.Amount or 0),
            "warehouse": str(res_doc.Warehouse or "").strip(),
            "deal": str(res_doc.Deal or "").strip(),
            "contract": str(res_doc.Contract or "").strip(),
            "contract_price_type": str(res_doc.ContractPriceType or "").strip(),
            "portfolio": str(res_doc.Portfolio or "").strip(),
            "responsible": str(res_doc.Responsible or "").strip(),
            "comment": str(res_doc.Comment or "").strip(),
            "vms_status": str(res_doc.StatusVMS or "").strip(),
            "obrabotka_number": str(res_doc.ObrabotkaNumber or "").strip(),
            "pogruzka_marshrut": "",
            "pogruzka_voditel": "",
            "pogruzka_count": 0,
            "pogruzka_duplicate": False
        }
        items.append(row_data)
        doc_ref_map[d_num] = row_data

        if limit_count and limit_count > 0 and len(items) >= limit_count:
            break

    # LIGHTNING-FAST BATCH POGRUZKA LOOKUP ONLY FOR THE FETCHED PAGE
    if doc_refs:
        try:
            arr_refs = conn.NewObject("Массив")
            for r in doc_refs:
                arr_refs.Add(r)
            qp = conn.NewObject("Запрос")
            qp.SetParameter("DocRefs", arr_refs)
            qp.Text = """
            ВЫБРАТЬ
                П.Накладная.Номер КАК RealizNum,
                КОЛИЧЕСТВО(РАЗЛИЧНЫЕ П.Ссылка) КАК PogCount,
                МАКСИМУМ(П.Ссылка.Маршрут) КАК Marshrut,
                ПРЕДСТАВЛЕНИЕ(МАКСИМУМ(П.Ссылка.Водитель)) КАК Voditel
            ИЗ
                Документ.ПогрузкиМашин.СписокРеализаций КАК П
            ГДЕ
                П.Накладная В (&DocRefs)
            СГРУППИРОВАТЬ ПО
                П.Накладная.Номер
            """
            rp = qp.Execute().Choose()
            while rp.Next():
                r_num = str(rp.RealizNum or "").strip()
                target_row = doc_ref_map.get(r_num)
                if not target_row:
                    alt_num = r_num.replace("C", "С") if "C" in r_num else r_num.replace("С", "C")
                    target_row = doc_ref_map.get(alt_num)
                if target_row:
                    cnt = int(rp.PogCount or 0)
                    target_row["pogruzka_count"] = cnt
                    target_row["pogruzka_duplicate"] = (cnt > 1)
                    target_row["pogruzka_marshrut"] = str(rp.Marshrut or "").strip()
                    target_row["pogruzka_voditel"] = str(rp.Voditel or "").strip()
        except Exception as e_pog:
            print("Pogruzka batch lookup error:", e_pog)

    return {
        "items": items,
        "columns": columns,
        "total_count": len(items),
        "doc_title": "Реализация товаров и услуг",
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


def get_realization_details(conn, payload):
    doc_number = payload.get("number", "").strip()
    clean_doc_num = doc_number.replace("С", "C").replace("с", "c")
    alt_doc_num = clean_doc_num.replace("C", "С")

    q_det = conn.NewObject("Запрос")
    q_det.Text = """
    ВЫБРАТЬ ПЕРВЫЕ 1
        Т.Ссылка КАК Ref
    ИЗ
        Документ.РеализацияТоваровУслуг КАК Т
    ГДЕ
        Т.Номер = &DocNum
        ИЛИ Т.Номер = &AltDocNum
        ИЛИ Т.Номер ПОДОБНО &DocNumLike
    """
    q_det.SetParameter("DocNum", clean_doc_num)
    q_det.SetParameter("AltDocNum", alt_doc_num)
    q_det.SetParameter("DocNumLike", f"%{clean_doc_num}%")
    res_det = q_det.Execute().Choose()
    if not res_det.Next():
        raise ValueError(f"Sənəd №{doc_number} tapılmadı")

    doc_ref = res_det.Ref
    doc_obj = doc_ref.ПолучитьОбъект()

    header_data = {
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
        "comment": str(getattr(doc_obj, "Комментарий", "") or "").strip(),
        "deal": str(getattr(getattr(doc_obj, "Сделка", None), "Номер", "") or "").strip() if getattr(doc_obj, "Сделка", None) else ""
    }

    # Tabular section: Товары
    tovary = []
    if hasattr(doc_obj, "Товары"):
        for row in doc_obj.Товары:
            nom_obj = row.Номенклатура if hasattr(row, "Номенклатура") else None
            ed_obj = row.ЕдиницаИзмерения if hasattr(row, "ЕдиницаИзмерения") else None
            tovary.append({
                "line_number": int(getattr(row, "НомерСтроки", len(tovary) + 1)),
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

    # Query ПогрузкиМашин for this realization
    pogruzki = []
    try:
        qp = conn.NewObject("Запрос")
        qp.SetParameter("DocRef", doc_ref)
        qp.SetParameter("DocNum", header_data["number"])
        qp.SetParameter("AltDocNum", header_data["number"].replace("C", "С").replace("c", "с"))
        qp.Text = """
        ВЫБРАТЬ
            П.Ссылка.Номер КАК PogruzkaNumber,
            П.Ссылка.Дата КАК PogruzkaDate,
            П.Ссылка.Маршрут КАК Marshrut,
            ПРЕДСТАВЛЕНИЕ(П.Ссылка.Водитель) КАК Voditel,
            ПРЕДСТАВЛЕНИЕ(П.Ссылка.Склад) КАК Sklad,
            ПРЕДСТАВЛЕНИЕ(П.Ссылка.Ответственный) КАК Responsible,
            П.Ссылка.Проведен КАК Posted,
            П.Ссылка.ПометкаУдаления КАК DeletionMark
        ИЗ
            Документ.ПогрузкиМашин.СписокРеализаций КАК П
        ГДЕ
            П.Накладная = &DocRef
            ИЛИ П.Накладная.Номер = &DocNum
            ИЛИ П.Накладная.Номер = &AltDocNum
        УПОРЯДОЧИТЬ ПО
            П.Ссылка.Дата УБЫВ
        """
        rp = qp.Execute().Choose()
        while rp.Next():
            pogruzki.append({
                "pogruzka_number": str(rp.PogruzkaNumber or "").strip(),
                "pogruzka_date": format_1c_datetime(rp.PogruzkaDate),
                "marshrut": str(rp.Marshrut or "").strip(),
                "voditel": str(rp.Voditel or "").strip(),
                "warehouse": str(rp.Sklad or "").strip(),
                "responsible": str(rp.Responsible or "").strip(),
                "posted": bool(rp.Posted),
                "deleted": bool(rp.DeletionMark)
            })
    except Exception as e_p:
        print("Error fetching pogruzka for realization details:", e_p)

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
        "doc_type": "РеализацияТоваровУслуг",
        "header": header_data,
        "lines": lines,
        "total_lines": len(lines),
        "tovary": tovary,
        "pogruzki": pogruzki,
        "pogruzka_count": len(pogruzki),
        "pogruzka_duplicate": (len(pogruzki) > 1)
    }
