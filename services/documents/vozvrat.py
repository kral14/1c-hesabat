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
        {"key": "golovnoy_kontragent", "label": "Головной контрагент", "width": 180, "align": "left"},
        {"key": "agent", "label": "Агент", "width": 140, "align": "left"},
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
        wh_search = f" ИЛИ {wh_attr}.Наименование ПОДОБНО &SearchVal" if wh_attr else ""
        s_cond = (
            "(Т.Номер ПОДОБНО &SearchVal "
            "ИЛИ Т.Контрагент.Наименование ПОДОБНО &SearchVal "
            "ИЛИ Т.Комментарий ПОДОБНО &SearchVal "
            "ИЛИ Т.ДоговорКонтрагента.Наименование ПОДОБНО &SearchVal"
            + wh_search +
            " ИЛИ Т.Ссылка В ("
            "     ВЫБРАТЬ РАЗЛИЧНЫЕ ТТ_Поиск.Ссылка "
            "     ИЗ Документ.ВозвратТоваровОтПокупателя.Товары КАК ТТ_Поиск "
            "     ГДЕ ТТ_Поиск.Номенклатура.Наименование ПОДОБНО &SearchVal "
            "        ИЛИ ТТ_Поиск.Номенклатура.Код ПОДОБНО &SearchVal "
            "        ИЛИ ТТ_Поиск.Номенклатура.Артикул ПОДОБНО &SearchVal"
            " ))"
        )
        where_parts.append(s_cond)

    field_map = {
        "__doc_table": "Документ.ВозвратТоваровОтПокупателя",
        "comment": "Т.Комментарий",
        "kontragent": "Т.Контрагент.Наименование",
        "golovnoy_kontragent": "Т.Контрагент.ГоловнойКонтрагент.Наименование",
        "golovnoy_kontragent_code": "Т.Контрагент.ГоловнойКонтрагент.Код",
        "agent": "Т.ДоговорКонтрагента.Агент.Наименование",
        "warehouse": f"{wh_attr}.Наименование" if wh_attr else "",
        "deal": "Т.Сделка.Номер",
        "contract": "Т.ДоговорКонтрагента.Наименование",
        "responsible": "Т.Ответственный.Наименование"
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
        Т.Контрагент.ГоловнойКонтрагент.Наименование КАК GolovnoyKontragent,
        Т.ДоговорКонтрагента.Агент.Наименование КАК Agent,
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

        row_data = {
            "ref_key": d_num,
            "number": d_num,
            "date": format_1c_datetime(res_doc.Date),
            "posted": bool(res_doc.Posted),
            "deleted": bool(res_doc.DeletionMark),
            "kontragent": str(res_doc.Kontragent or "").strip(),
            "golovnoy_kontragent": str(res_doc.GolovnoyKontragent or "").strip(),
            "agent": str(res_doc.Agent or "").strip(),
            "amount": float(res_doc.Amount or 0),
            "warehouse": str(res_doc.Warehouse or "").strip(),
            "deal": str(res_doc.Deal or "").strip(),
            "contract": str(res_doc.Contract or "").strip(),
            "responsible": str(res_doc.Responsible or "").strip(),
            "comment": str(res_doc.Comment or "").strip(),
            "nomenclatures": [],
            "nom_keys": [],
            "nomenclature": ""
        }
        items.append(row_data)
        doc_ref_map[d_num] = row_data

        if limit_count and limit_count > 0 and len(items) >= limit_count:
            break

    if doc_refs:
        try:
            arr_refs = conn.NewObject("Массив")
            for r in doc_refs:
                arr_refs.Add(r)
            qp = conn.NewObject("Запрос")
            qp.SetParameter("DocRefs", arr_refs)
            qp.Text = """
            ВЫБРАТЬ
                ТТ.Ссылка.Номер КАК DocNumber,
                ТТ.Номенклатура.Наименование КАК NomName,
                ТТ.Номенклатура.Код КАК NomCode,
                ТТ.Номенклатура.Артикул КАК NomArtikul
            ИЗ
                Документ.ВозвратТоваровОтПокупателя.Товары КАК ТТ
            ГДЕ
                ТТ.Ссылка В (&DocRefs)
            """
            rp = qp.Execute().Choose()
            while rp.Next():
                d_num = str(rp.DocNumber or "").strip()
                target_row = doc_ref_map.get(d_num)
                if not target_row:
                    alt_num = d_num.replace("C", "С") if "C" in d_num else d_num.replace("С", "C")
                    target_row = doc_ref_map.get(alt_num)
                if target_row:
                    nom_name = str(rp.NomName or "").strip()
                    nom_code = str(rp.NomCode or "").strip()
                    nom_art = str(rp.NomArtikul or "").strip()
                    if nom_name and nom_name not in target_row["nomenclatures"]:
                        target_row["nomenclatures"].append(nom_name)
                    code_clean = nom_code.lstrip("0")
                    key_str = f"{nom_code}|{code_clean}|{nom_art}|{nom_name}".lower()
                    if key_str not in target_row["nom_keys"]:
                        target_row["nom_keys"].append(key_str)

            for item in items:
                if item["nomenclatures"]:
                    item["nomenclature"] = ", ".join(item["nomenclatures"][:5])
        except Exception as e:
            print(f"[VOZVRAT NOMENCLATURE BATCH ERROR] {e}")

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
    clean_num = doc_number.replace("С", "C").replace("с", "c")
    alt_num = clean_num.replace("C", "С")

    q_det = conn.NewObject("Запрос")
    q_det.SetParameter("DocNum", clean_num)
    q_det.SetParameter("AltDocNum", alt_num)
    q_det.SetParameter("DocNumLike", f"%{clean_num}%")
    q_det.SetParameter("AltDocNumLike", f"%{alt_num}%")

    q_det.Text = """
    ВЫБРАТЬ ПЕРВЫЕ 1
        Т.Ссылка КАК Ref
    ИЗ
        Документ.ВозвратТоваровОтПокупателя КАК Т
    ГДЕ
        Т.Номер = &DocNum
        ИЛИ Т.Номер = &AltDocNum
        ИЛИ Т.Номер ПОДОБНО &DocNumLike
        ИЛИ Т.Номер ПОДОБНО &AltDocNumLike
    """
    res_det = q_det.Execute().Choose()
    if not res_det.Next():
        raise ValueError(f"Возврат товаров №{doc_number} tapılmadı")

    v_ref = res_det.Ref
    doc_obj = v_ref.ПолучитьОбъект()

    wh_obj = getattr(doc_obj, "СкладОрдер", None) or getattr(doc_obj, "Склад", None)
    wh_name = str(getattr(wh_obj, "Наименование", "") or "").strip() if wh_obj else ""

    pt_obj = getattr(doc_obj, "ТипЦен", None)
    pt_name = str(getattr(pt_obj, "Наименование", "") or "").strip() if pt_obj else ""

    header_data = {
        "number": str(doc_obj.Номер).strip(),
        "date": format_1c_datetime(doc_obj.Дата),
        "posted": bool(doc_obj.Проведен),
        "deleted": bool(doc_obj.ПометкаУдаления),
        "organization": str(getattr(doc_obj.Организация, "Наименование", "") or "").strip() if getattr(doc_obj, "Организация", None) else "",
        "kontragent": str(getattr(doc_obj.Контрагент, "Наименование", "") or "").strip() if getattr(doc_obj, "Контрагент", None) else "",
        "contract": str(getattr(doc_obj.ДоговорКонтрагента, "Наименование", "") or "").strip() if getattr(doc_obj, "ДоговорКонтрагента", None) else "",
        "warehouse": wh_name,
        "price_type": pt_name,
        "amount": float(getattr(doc_obj, "СуммаДокумента", 0) or 0),
        "currency": str(getattr(doc_obj.ВалютаДокумента, "Наименование", "") or "").strip() if getattr(doc_obj, "ВалютаДокумента", None) else "AZN",
        "responsible": str(getattr(doc_obj.Ответственный, "Наименование", "") or "").strip() if getattr(doc_obj, "Ответственный", None) else "",
        "comment": str(getattr(doc_obj, "Комментарий", "") or "").strip(),
        "deal": str(getattr(getattr(doc_obj, "Сделка", None), "Номер", "") or "").strip() if getattr(doc_obj, "Сделка", None) else "",
        "bu_record": bool(getattr(doc_obj, "ОтражатьВБухгалтерскомУчете", False)),
        "nu_record": bool(getattr(doc_obj, "ОтражатьВНалоговомУчете", False)),
        "account_settlement": str(getattr(getattr(doc_obj, "СчетУчетаРасчетовСКонтрагентом", None), "Код", "") or "").strip(),
        "account_advance": str(getattr(getattr(doc_obj, "СчетУчетаРасчетовПоАвансам", None), "Код", "") or "").strip()
    }

    tovary = []
    if hasattr(doc_obj, "Товары"):
        for idx, row in enumerate(doc_obj.Товары):
            nom_obj = row.Номенклатура if hasattr(row, "Номенклатура") else None
            ed_obj = row.ЕдиницаИзмерения if hasattr(row, "ЕдиницаИзмерения") else None
            d_auto = float(getattr(row, "ПроцентАвтоматическихСкидок", 0) or 0)
            d_manual = float(getattr(row, "ПроцентСкидкиНаценки", 0) or 0)
            raw_vat = getattr(row, "СтавкаНДС", None)
            vat_rate_str = ""
            if raw_vat is not None:
                try:
                    vat_rate_str = str(conn.String(raw_vat)).strip()
                except Exception:
                    vat_rate_str = str(getattr(raw_vat, "Наименование", "") or "").strip()
            if "18_118" in vat_rate_str or "18/118" in vat_rate_str: vat_rate_str = "18/118"
            elif "18" in vat_rate_str: vat_rate_str = "18%"
            elif "Без" in vat_rate_str: vat_rate_str = "ƏDV-siz"
            elif not vat_rate_str: vat_rate_str = "0%"

            acc_bu = str(getattr(getattr(row, "СчетУчетаБУ", None), "Код", "") or "").strip()
            acc_inc = str(getattr(getattr(row, "СчетДоходовБУ", None), "Код", "") or "").strip()
            acc_exp = str(getattr(getattr(row, "СчетРасходовБУ", None), "Код", "") or "").strip()
            row_wh = str(getattr(getattr(row, "Склад", None), "Наименование", "") or "").strip()
            row_series = str(getattr(getattr(row, "СерияНоменклатуры", None), "Наименование", "") or "").strip()

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
                "discount_auto": d_auto,
                "discount_manual": d_manual,
                "discount_percent": d_auto + d_manual,
                "vat_rate": vat_rate_str,
                "vat_amount": float(getattr(row, "СуммаНДС", 0) or 0),
                "total_amount": float(getattr(row, "Сумма", 0) or 0),
                "account_bu": acc_bu,
                "income_account_bu": acc_inc,
                "expense_account_bu": acc_exp,
                "warehouse": row_wh,
                "series": row_series
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
            "discount_auto": t["discount_auto"],
            "discount_manual": t["discount_manual"],
            "discount_percent": t["discount_percent"],
            "account_bu": t["account_bu"],
            "income_account_bu": t["income_account_bu"],
            "expense_account_bu": t["expense_account_bu"],
            "warehouse": t["warehouse"],
            "series": t["series"]
        })

    return {
        "doc_type": "ВозвратТоваровОтПокупателя",
        "header": header_data,
        "lines": lines,
        "total_lines": len(lines),
        "tovary": tovary
    }
