# -*- coding: utf-8 -*-
"""
services/audit_service.py
1C:Enterprise Document Versioning & Change Audit Service.
Extracts document versions from РегистрСведений.ВерсииОбъектов and event log
to provide a complete audit trail of modifications, amounts, users, and line item diffs.
"""
import base64
import datetime
import xml.etree.ElementTree as ET
from services.documents.base import format_1c_datetime, parse_query_datetime


def get_audit_list(conn, payload):
    """
    Returns list of modified documents with version counts, last modified date, and last author.
    """
    doc_type_filter = payload.get("doc_type", "").strip()
    author_filter = payload.get("author", "").strip()
    search_str = payload.get("search", "").strip()
    date_from = payload.get("date_from")
    date_to = payload.get("date_to")
    limit_count = int(payload.get("limit") or 200)

    where_parts = []
    q = conn.NewObject("Запрос")

    # Document type restrictions
    if doc_type_filter == "РеализацияТоваровУслуг":
        where_parts.append("Т.Объект ССЫЛКА Документ.РеализацияТоваровУслуг")
    elif doc_type_filter in ["ПогрузкиМашин", "ПогрузкаМашин"]:
        where_parts.append("Т.Объект ССЫЛКА Документ.ПогрузкиМашин")
    elif doc_type_filter == "ВозвратТоваровОтПокупателя":
        where_parts.append("Т.Объект ССЫЛКА Документ.ВозвратТоваровОтПокупателя")
    else:
        where_parts.append(
            "(Т.Объект ССЫЛКА Документ.РеализацияТоваровУслуг "
            "ИЛИ Т.Объект ССЫЛКА Документ.ПогрузкиМашин "
            "ИЛИ Т.Объект ССЫЛКА Документ.ВозвратТоваровОтПокупателя)"
        )

    # Date range filters on ДатаВерсии
    if date_from:
        dt_f = parse_query_datetime(date_from, is_end=False)
        if dt_f:
            q.SetParameter("DateFrom", dt_f)
            where_parts.append("Т.ДатаВерсии >= &DateFrom")

    if date_to:
        dt_t = parse_query_datetime(date_to, is_end=True)
        if dt_t:
            q.SetParameter("DateTo", dt_t)
            where_parts.append("Т.ДатаВерсии <= &DateTo")

    if author_filter:
        q.SetParameter("AuthorLike", f"%{author_filter}%")
        where_parts.append("Т.АвторВерсии.Наименование ПОДОБНО &AuthorLike")

    where_sql = ("ГДЕ " + " И ".join(where_parts)) if where_parts else ""

    q.Text = f"""
    ВЫБРАТЬ
        Т.Объект КАК DocRef,
        МАКСИМУМ(Т.НомерВерсии) КАК MaxVersion,
        МАКСИМУМ(Т.ДатаВерсии) КАК LastDate,
        ПРЕДСТАВЛЕНИЕ(МАКСИМУМ(Т.АвторВерсии)) КАК LastAuthor,
        КОЛИЧЕСТВО(РАЗЛИЧНЫЕ Т.НомерВерсии) КАК VersionCount
    ИЗ
        РегистрСведений.ВерсииОбъектов КАК Т
    {where_sql}
    СГРУППИРОВАТЬ ПО
        Т.Объект
    УПОРЯДОЧИТЬ ПО
        LastDate УБЫВ
    """

    res = q.Execute().Choose()
    items = []
    
    while res.Next():
        doc_ref = res.DocRef
        if not doc_ref:
            continue

        ref_str = conn.String(doc_ref)
        last_date_str = format_1c_datetime(res.LastDate)
        last_author = str(res.LastAuthor or "").strip()
        version_count = int(res.VersionCount or res.MaxVersion or 1)

        # Inspect document header from reference
        doc_num = ""
        doc_date = ""
        kontr_name = ""
        amount = 0.0
        posted = False
        deleted = False
        doc_type_name = "Документ"

        try:
            meta = doc_ref.Метаданные()
            doc_type_name = str(meta.Имя)
            doc_num = str(getattr(doc_ref, "Номер", "") or "").strip()
            doc_date = format_1c_datetime(getattr(doc_ref, "Дата", None))
            posted = bool(getattr(doc_ref, "Проведен", False))
            deleted = bool(getattr(doc_ref, "ПометкаУдаления", False))

            if hasattr(doc_ref, "Контрагент"):
                k_obj = doc_ref.Контрагент
                if k_obj:
                    kontr_name = str(getattr(k_obj, "Наименование", "") or "").strip()
            elif hasattr(doc_ref, "Водитель"):
                v_obj = doc_ref.Водитель
                if v_obj:
                    kontr_name = f"Водитель: {str(getattr(v_obj, 'Наименование', '') or '').strip()}"

            wh_name = ""
            for w_attr in ["Склад", "СкладОрдер", "СкладКомпании"]:
                if hasattr(doc_ref, w_attr):
                    w_obj = getattr(doc_ref, w_attr)
                    if w_obj:
                        wh_name = str(getattr(w_obj, "Наименование", "") or "").strip()
                        if wh_name:
                            break

            contract_name = ""
            for c_attr in ["ДоговорКонтрагента", "Договор"]:
                if hasattr(doc_ref, c_attr):
                    c_obj = getattr(doc_ref, c_attr)
                    if c_obj:
                        contract_name = str(getattr(c_obj, "Наименование", "") or "").strip()
                        if contract_name:
                            break

            if hasattr(doc_ref, "СуммаДокумента"):
                amount = float(getattr(doc_ref, "СуммаДокумента", 0) or 0)
        except Exception:
            pass

        # Text search matching
        if search_str:
            s_low = search_str.lower()
            combined = f"{doc_num} {doc_type_name} {kontr_name} {wh_name} {contract_name} {last_author} {ref_str}".lower()
            if s_low not in combined:
                continue

        # Human friendly doc type title
        type_title_map = {
            "РеализацияТоваровУслуг": "Реализация товаров и услуг",
            "ПогрузкиМашин": "Погрузка машин",
            "ВозвратТоваровОтПокупателя": "Возврат товаров от покупателя"
        }
        friendly_title = type_title_map.get(doc_type_name, doc_type_name)

        items.append({
            "doc_ref_str": ref_str,
            "doc_type": doc_type_name,
            "doc_type_title": friendly_title,
            "number": doc_num,
            "date": doc_date,
            "kontragent": kontr_name,
            "warehouse": wh_name,
            "contract": contract_name,
            "amount": amount,
            "posted": posted,
            "deleted": deleted,
            "last_version": int(res.MaxVersion or version_count),
            "version_count": version_count,
            "last_date": last_date_str,
            "last_author": last_author or "Не указан",
            "last_operation": "Изменение" if version_count > 1 else "Создание"
        })

        if limit_count > 0 and len(items) >= limit_count:
            break

    # If no versions found in РегистрСведений.ВерсииОбъектов, fallback to querying documents directly
    if not items:
        try:
            q_fallback = conn.NewObject("Запрос")
            where_doc = []
            if date_from:
                dt_f = parse_query_datetime(date_from, is_end=False)
                if dt_f:
                    q_fallback.SetParameter("DateFrom", dt_f)
                    where_doc.append("Т.Дата >= &DateFrom")
            if date_to:
                dt_t = parse_query_datetime(date_to, is_end=True)
                if dt_t:
                    q_fallback.SetParameter("DateTo", dt_t)
                    where_doc.append("Т.Дата <= &DateTo")

            where_clause = ("ГДЕ " + " И ".join(where_doc)) if where_doc else ""

            target_tables = []
            if doc_type_filter == "РеализацияТоваровУслуг":
                target_tables.append(("Документ.РеализацияТоваровУслуг", "РеализацияТоваровУслуг", "Реализация товаров и услуг"))
            elif doc_type_filter in ["ПогрузкиМашин", "ПогрузкаМашин"]:
                target_tables.append(("Документ.ПогрузкиМашин", "ПогрузкиМашин", "Погрузка машин"))
            elif doc_type_filter == "ВозвратТоваровОтПокупателя":
                target_tables.append(("Документ.ВозвратТоваровОтПокупателя", "ВозвратТоваровОтПокупателя", "Возврат товаров от покупателя"))
            else:
                target_tables = [
                    ("Документ.РеализацияТоваровУслуг", "РеализацияТоваровУслуг", "Реализация товаров и услуг"),
                    ("Документ.ВозвратТоваровОтПокупателя", "ВозвратТоваровОтПокупателя", "Возврат товаров от покупателя"),
                    ("Документ.ПогрузкиМашин", "ПогрузкиМашин", "Погрузка машин")
                ]

            for table_name, dtype_name, d_title in target_tables:
                q_fallback.Text = f"""
                ВЫБРАТЬ ПЕРВЫЕ {limit_count}
                    Т.Ссылка КАК DocRef,
                    Т.Номер КАК Number,
                    Т.Дата КАК Date,
                    Т.Проведен КАК Posted,
                    Т.ПометкаУдаления КАК DeletionMark
                ИЗ
                    {table_name} КАК Т
                {where_clause}
                УПОРЯДОЧИТЬ ПО
                    Т.Дата УБЫВ
                """
                res_fb = q_fallback.Execute().Choose()
                while res_fb.Next():
                    dref = res_fb.DocRef
                    r_str = conn.String(dref)
                    d_num = str(res_fb.Number or "").strip()
                    d_dt = format_1c_datetime(res_fb.Date)
                    p_val = bool(res_fb.Posted)
                    del_val = bool(res_fb.DeletionMark)
                    amt = 0.0
                    kontr_n = ""
                    resp_n = "Пользователь 1С"
                    try:
                        if hasattr(dref, "СуммаДокумента"):
                            amt = float(getattr(dref, "СуммаДокумента", 0) or 0)
                        if hasattr(dref, "Контрагент") and dref.Контрагент:
                            kontr_n = str(getattr(dref.Контрагент, "Наименование", "") or "").strip()
                        elif hasattr(dref, "Водитель") and dref.Водитель:
                            kontr_n = f"Водитель: {str(getattr(dref.Водитель, 'Наименование', '') or '').strip()}"
                        if hasattr(dref, "Ответственный") and dref.Ответственный:
                            resp_n = str(getattr(dref.Ответственный, "Наименование", "") or "").strip()
                    except Exception:
                        pass

                    items.append({
                        "doc_ref_str": r_str,
                        "doc_type": dtype_name,
                        "doc_type_title": d_title,
                        "number": d_num,
                        "date": d_dt,
                        "kontragent": kontr_n,
                        "amount": amt,
                        "posted": p_val,
                        "deleted": del_val,
                        "last_version": 1,
                        "version_count": 1,
                        "last_date": d_dt,
                        "last_author": resp_n,
                        "last_operation": "Проведение" if p_val else "Создание"
                    })
                    if limit_count > 0 and len(items) >= limit_count:
                        break
        except Exception as e_fb:
            print("Fallback audit list query error:", e_fb)

    # Sort final items by last_date DESC
    items.sort(key=lambda x: x.get("last_date") or x.get("date") or "", reverse=True)
    if limit_count > 0:
        items = items[:limit_count]

    return {
        "items": items,
        "total_count": len(items),
        "period": {
            "date_from": date_from or "",
            "date_to": date_to or ""
        }
    }


def resolve_ref_info(conn, catalog_name, guid_str, cache):
    if not guid_str or guid_str == "00000000-0000-0000-0000-000000000000":
        return {"name": "", "code": "", "article": ""}
    if guid_str in cache:
        return cache[guid_str]
    try:
        g = conn.NewObject("УникальныйИдентификатор", guid_str)
        cat_mgr = getattr(conn.Справочники, catalog_name)
        ref_obj = cat_mgr.ПолучитьСсылку(g)
        info = {
            "name": str(getattr(ref_obj, "Наименование", "") or "").strip(),
            "code": str(getattr(ref_obj, "Код", "") or "").strip(),
            "article": str(getattr(ref_obj, "Артикул", "") or "").strip()
        }
    except Exception:
        info = {"name": guid_str, "code": "", "article": ""}
    cache[guid_str] = info
    return info


def resolve_ref_name(conn, catalog_name, guid_str, cache):
    if not guid_str or guid_str == "00000000-0000-0000-0000-000000000000":
        return ""
    if guid_str in cache:
        return cache[guid_str]
    try:
        g = conn.NewObject("УникальныйИдентификатор", guid_str)
        cat_mgr = getattr(conn.Справочники, catalog_name)
        ref_obj = cat_mgr.ПолучитьСсылку(g)
        val = str(getattr(ref_obj, "Наименование", "") or "").strip()
    except Exception:
        val = ""
    cache[guid_str] = val
    return val


def resolve_doc_info(conn, doc_type, guid_str, cache):
    if not guid_str or guid_str == "00000000-0000-0000-0000-000000000000":
        return {}
    if guid_str in cache:
        return cache[guid_str]
    info = {"number": guid_str, "date": "", "amount": 0.0, "kontragent": ""}
    try:
        g = conn.NewObject("УникальныйИдентификатор", guid_str)
        doc_mgr = getattr(conn.Документы, doc_type)
        ref_obj = doc_mgr.ПолучитьСсылку(g)
        info["number"] = str(getattr(ref_obj, "Номер", "") or guid_str).strip()
        info["date"] = format_1c_datetime(getattr(ref_obj, "Дата", None))
        info["amount"] = float(getattr(ref_obj, "СуммаДокумента", 0) or 0)
        if hasattr(ref_obj, "Контрагент") and ref_obj.Контрагент:
            info["kontragent"] = str(getattr(ref_obj.Контрагент, "Наименование", "") or "").strip()
    except Exception:
        pass
    cache[guid_str] = info
    return info


def resolve_account_info(conn, guid_str, cache):
    if not guid_str or guid_str == "00000000-0000-0000-0000-000000000000":
        return {"code": "", "name": ""}
    if guid_str in cache:
        return cache[guid_str]
    try:
        g = conn.NewObject("УникальныйИдентификатор", guid_str)
        ref_obj = conn.ПланыСчетов.Хозрасчетный.ПолучитьСсылку(g)
        code = str(getattr(ref_obj, "Код", "") or "").strip()
        name = str(getattr(ref_obj, "Наименование", "") or "").strip()
        info = {"code": code, "name": name}
    except Exception:
        info = {"code": guid_str, "name": ""}
    cache[guid_str] = info
    return info


def format_vat_rate(raw_vat):
    s = str(raw_vat or "").strip()
    if not s or s in ["00000000-0000-0000-0000-000000000000"]:
        return "0%"
    s_clean = s.replace("Перечисления.СтавкиНДС.", "").strip()
    mapping = {
        "НДС18_118": "18/118",
        "НДС18": "18%",
        "НДС20": "20%",
        "НДС10": "10%",
        "НДС0": "0%",
        "БезНДС": "ƏDV-siz (0%)",
        "18%": "18%",
        "18/118": "18/118",
        "0%": "0%",
        "Без НДС": "ƏDV-siz (0%)"
    }
    return mapping.get(s_clean, s_clean)


def unpack_version_snapshot(conn, storage_cell, nom_cache, kontr_cache, wh_cache, driver_cache, doc_cache, contract_cache=None, acc_cache=None):
    """
    Unpacks version object from 1C Storage.
    Supports both BinaryData (Base64 UTF-8 XML) and direct DocumentObject COM objects.
    Extracts line items with auto/manual discounts, VAT rates, and BU chart of accounts.
    """
    if contract_cache is None:
        contract_cache = {}
    if acc_cache is None:
        acc_cache = {}
    if not storage_cell:
        return None

    obj_snap = None
    try:
        obj_snap = storage_cell.Получить()
    except Exception as e_snap:
        print("Error calling storage.Получить():", e_snap)
        return None

    if not obj_snap:
        return None

    # Try XML decode first (1C standard BSP versioning)
    xml_text = None
    try:
        b64_str = conn.XMLСтрока(obj_snap)
        if b64_str:
            xml_bytes = base64.b64decode(b64_str)
            xml_text = xml_bytes.decode("utf-8-sig", errors="replace")
    except Exception:
        pass

    if xml_text and "<" in xml_text:
        try:
            root = ET.fromstring(xml_text)
            fields = {}
            items = []

            for child in root:
                tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                if tag == "Товары":
                    for r_idx, r in enumerate(child):
                        nom_guid = ""
                        qty = 0.0
                        price = 0.0
                        total = 0.0
                        disc_auto = 0.0
                        disc_manual = 0.0
                        vat_rate = ""
                        vat_sum = 0.0
                        acc_bu_guid = ""
                        acc_inc_guid = ""
                        acc_exp_guid = ""
                        row_wh_guid = ""
                        row_series_guid = ""

                        for col in r:
                            c_tag = col.tag.split("}")[-1] if "}" in col.tag else col.tag
                            val_txt = (col.text or "").strip()
                            if c_tag == "Номенклатура":
                                nom_guid = val_txt
                            elif c_tag == "Количество":
                                try: qty = float(val_txt or 0)
                                except Exception: qty = 0.0
                            elif c_tag == "Цена":
                                try: price = float(val_txt or 0)
                                except Exception: price = 0.0
                            elif c_tag == "Сумма":
                                try: total = float(val_txt or 0)
                                except Exception: total = 0.0
                            elif c_tag == "ПроцентАвтоматическихСкидок":
                                try: disc_auto = float(val_txt or 0)
                                except Exception: disc_auto = 0.0
                            elif c_tag == "ПроцентСкидкиНаценки":
                                try: disc_manual = float(val_txt or 0)
                                except Exception: disc_manual = 0.0
                            elif c_tag == "СтавкаНДС":
                                vat_rate = format_vat_rate(val_txt)
                            elif c_tag == "СуммаНДС":
                                try: vat_sum = float(val_txt or 0)
                                except Exception: vat_sum = 0.0
                            elif c_tag == "СчетУчетаБУ":
                                acc_bu_guid = val_txt
                            elif c_tag == "СчетДоходовБУ":
                                acc_inc_guid = val_txt
                            elif c_tag == "СчетРасходовБУ":
                                acc_exp_guid = val_txt
                            elif c_tag == "Склад":
                                row_wh_guid = val_txt
                            elif c_tag == "СерияНоменклатуры":
                                row_series_guid = val_txt

                        nom_info = resolve_ref_info(conn, "Номенклатура", nom_guid, nom_cache)
                        acc_bu_code = resolve_account_info(conn, acc_bu_guid, acc_cache)["code"] if acc_bu_guid else ""
                        acc_inc_code = resolve_account_info(conn, acc_inc_guid, acc_cache)["code"] if acc_inc_guid else ""
                        acc_exp_code = resolve_account_info(conn, acc_exp_guid, acc_cache)["code"] if acc_exp_guid else ""
                        row_wh_name = resolve_ref_name(conn, "Склады", row_wh_guid, wh_cache) if row_wh_guid else ""
                        row_series_name = resolve_ref_name(conn, "СерииНоменклатуры", row_series_guid, {}) if row_series_guid else ""

                        items.append({
                            "line_no": r_idx + 1,
                            "code": nom_info["code"],
                            "article": nom_info["article"],
                            "name": nom_info["name"] or nom_guid,
                            "qty": qty,
                            "price": price,
                            "total": total,
                            "discount_auto": disc_auto,
                            "discount_manual": disc_manual,
                            "discount_total": disc_auto + disc_manual,
                            "vat_rate": vat_rate or "0%",
                            "vat_amount": vat_sum,
                            "account_bu": acc_bu_code,
                            "income_account_bu": acc_inc_code,
                            "expense_account_bu": acc_exp_code,
                            "warehouse": row_wh_name,
                            "series": row_series_name
                        })
                elif tag == "СписокРеализаций":
                    for r_idx, r in enumerate(child):
                        nakl_guid = ""
                        for col in r:
                            c_tag = col.tag.split("}")[-1] if "}" in col.tag else col.tag
                            if c_tag == "Накладная":
                                nakl_guid = (col.text or "").strip()

                        nakl_info = resolve_doc_info(conn, "РеализацияТоваровУслуг", nakl_guid, doc_cache)
                        n_num = nakl_info.get("number") or nakl_guid
                        n_date = nakl_info.get("date") or ""
                        n_sum = nakl_info.get("amount") or 0.0
                        k_name = nakl_info.get("kontragent") or ""
                        items.append({
                            "line_no": r_idx + 1,
                            "code": n_num,
                            "article": n_date,
                            "name": f"Реализация №{n_num} ({k_name})" if k_name else f"Реализация №{n_num}",
                            "qty": 1,
                            "price": n_sum,
                            "total": n_sum,
                            "discount_auto": 0.0,
                            "discount_manual": 0.0,
                            "discount_total": 0.0,
                            "vat_rate": "0%",
                            "vat_amount": 0.0,
                            "account_bu": "",
                            "income_account_bu": "",
                            "expense_account_bu": "",
                            "warehouse": "",
                            "series": ""
                        })
                else:
                    fields[tag] = (child.text or "").strip()

            v_amt = float(fields.get("СуммаДокумента") or 0)
            v_posted = (fields.get("Posted") == "true")
            v_deleted = (fields.get("DeletionMark") == "true")
            v_comment = fields.get("Комментарий") or ""
            
            # Extract real operational document date from XML
            raw_xml_date = fields.get("Date") or fields.get("Дата") or fields.get("ДатаДокумента") or fields.get("DocDate") or ""
            v_doc_date = ""
            if raw_xml_date:
                if "T" in raw_xml_date:
                    p = raw_xml_date.split("T")
                    dp = p[0].split("-")
                    tp = p[1].split(".")[0] if len(p) > 1 else ""
                    if len(dp) == 3:
                        v_doc_date = f"{dp[2]}.{dp[1]}.{dp[0]} {tp}".strip()
                elif "-" in raw_xml_date and len(raw_xml_date) >= 10:
                    p = raw_xml_date.split(" ")
                    dp = p[0].split("-")
                    tp = p[1] if len(p) > 1 else ""
                    if len(dp) == 3:
                        v_doc_date = f"{dp[2]}.{dp[1]}.{dp[0]} {tp}".strip()
                else:
                    v_doc_date = raw_xml_date

            v_kontr = resolve_ref_name(conn, "Контрагенты", fields.get("Контрагент") or fields.get("Покупатель"), kontr_cache)
            wh_field_guid = (
                fields.get("Склад") or 
                fields.get("СкладОрдер") or 
                fields.get("СкладКомпании") or 
                fields.get("СкладПолучатель") or 
                fields.get("СкладОтправитель")
            )
            v_wh = resolve_ref_name(conn, "Склады", wh_field_guid, wh_cache)
            contract_field_guid = fields.get("ДоговорКонтрагента") or fields.get("Договор")
            v_contract = resolve_ref_name(conn, "ДоговорыКонтрагентов", contract_field_guid, contract_cache)
            v_driver = resolve_ref_name(conn, "Водители", fields.get("Водитель") or fields.get("Экспедитор"), driver_cache)
            v_route = fields.get("Маршрут") or fields.get("ПунктНазначения") or ""

            # Header accounting flags
            v_bu_record = (fields.get("ОтражатьВБухгалтерскомУчете") == "true")
            v_nu_record = (fields.get("ОтражатьВНалоговомУчете") == "true")
            v_acc_settle = resolve_account_info(conn, fields.get("СчетУчетаРасчетовСКонтрагентом"), acc_cache)["code"] if fields.get("СчетУчетаРасчетовСКонтрагентом") else ""
            v_acc_advance = resolve_account_info(conn, fields.get("СчетУчетаРасчетовПоАвансам"), acc_cache)["code"] if fields.get("СчетУчетаРасчетовПоАвансам") else ""

            return {
                "doc_date": v_doc_date,
                "amount": v_amt,
                "posted": v_posted,
                "deleted": v_deleted,
                "comment": v_comment,
                "kontragent": v_kontr,
                "warehouse": v_wh,
                "contract": v_contract,
                "driver": v_driver,
                "route": v_route,
                "bu_record": v_bu_record,
                "nu_record": v_nu_record,
                "account_settlement": v_acc_settle,
                "account_advance": v_acc_advance,
                "items": items
            }
        except Exception as e_xml_parse:
            print("XML parsing failed, fallback to direct attrs:", e_xml_parse)

    # Fallback to direct attribute extraction on COM object
    v_amt = float(getattr(obj_snap, "СуммаДокумента", 0) or 0)
    v_posted = bool(getattr(obj_snap, "Проведен", False))
    v_deleted = bool(getattr(obj_snap, "ПометкаУдаления", False))
    v_comment = str(getattr(obj_snap, "Комментарий", "") or "").strip()
    raw_com_date = getattr(obj_snap, "Дата", None) or getattr(obj_snap, "Date", None)
    v_doc_date = format_1c_datetime(raw_com_date) if raw_com_date else ""
    v_kontr = ""
    for k_attr in ["Контрагент", "Покупатель"]:
        if hasattr(obj_snap, k_attr) and getattr(obj_snap, k_attr):
            v_kontr = str(getattr(getattr(obj_snap, k_attr), "Наименование", "") or "").strip()
            if v_kontr:
                break
    v_wh = ""
    for w_attr in ["Склад", "СкладОрдер", "СкладКомпании", "СкладПолучатель", "СкладОтправитель"]:
        if hasattr(obj_snap, w_attr) and getattr(obj_snap, w_attr):
            v_wh = str(getattr(getattr(obj_snap, w_attr), "Наименование", "") or "").strip()
            if v_wh:
                break
    v_contract = ""
    for c_attr in ["ДоговорКонтрагента", "Договор"]:
        if hasattr(obj_snap, c_attr) and getattr(obj_snap, c_attr):
            v_contract = str(getattr(getattr(obj_snap, c_attr), "Наименование", "") or "").strip()
            if v_contract:
                break
    v_driver = ""
    if hasattr(obj_snap, "Водитель") and obj_snap.Водитель:
        v_driver = str(getattr(obj_snap.Водитель, "Наименование", "") or "").strip()
    v_route = str(getattr(obj_snap, "Маршрут", "") or "").strip()

    v_bu_record = bool(getattr(obj_snap, "ОтражатьВБухгалтерскомУчете", False))
    v_nu_record = bool(getattr(obj_snap, "ОтражатьВНалоговомУчете", False))
    v_acc_settle = str(getattr(getattr(obj_snap, "СчетУчетаРасчетовСКонтрагентом", None), "Код", "") or "").strip()
    v_acc_advance = str(getattr(getattr(obj_snap, "СчетУчетаРасчетовПоАвансам", None), "Код", "") or "").strip()

    items = []
    if hasattr(obj_snap, "Товары"):
        for r_idx, row in enumerate(obj_snap.Товары):
            nom = getattr(row, "Номенклатура", None)
            nom_name = str(getattr(nom, "Наименование", "") or "").strip() if nom else ""
            nom_code = str(getattr(nom, "Код", "") or "").strip() if nom else ""
            nom_art = str(getattr(nom, "Артикул", "") or "").strip() if nom else ""
            qty = float(getattr(row, "Количество", 0) or 0)
            price = float(getattr(row, "Цена", 0) or 0)
            total = float(getattr(row, "Сумма", 0) or 0)
            disc_auto = float(getattr(row, "ПроцентАвтоматическихСкидок", 0) or 0)
            disc_manual = float(getattr(row, "ПроцентСкидкиНаценки", 0) or 0)
            raw_vat = getattr(row, "СтавкаНДС", None)
            vat_rate = format_vat_rate(str(getattr(raw_vat, "Наименование", "") or raw_vat or "").strip())
            vat_amount = float(getattr(row, "СуммаНДС", 0) or 0)
            acc_bu_code = str(getattr(getattr(row, "СчетУчетаБУ", None), "Код", "") or "").strip()
            acc_inc_code = str(getattr(getattr(row, "СчетДоходовБУ", None), "Код", "") or "").strip()
            acc_exp_code = str(getattr(getattr(row, "СчетРасходовБУ", None), "Код", "") or "").strip()
            row_wh_name = str(getattr(getattr(row, "Склад", None), "Наименование", "") or "").strip()
            row_series_name = str(getattr(getattr(row, "СерияНоменклатуры", None), "Наименование", "") or "").strip()

            items.append({
                "line_no": r_idx + 1,
                "code": nom_code,
                "article": nom_art,
                "name": nom_name,
                "qty": qty,
                "price": price,
                "total": total,
                "discount_auto": disc_auto,
                "discount_manual": disc_manual,
                "discount_total": disc_auto + disc_manual,
                "vat_rate": vat_rate or "0%",
                "vat_amount": vat_amount,
                "account_bu": acc_bu_code,
                "income_account_bu": acc_inc_code,
                "expense_account_bu": acc_exp_code,
                "warehouse": row_wh_name,
                "series": row_series_name
            })
    elif hasattr(obj_snap, "СписокРеализаций"):
        for r_idx, row in enumerate(obj_snap.СписокРеализаций):
            nakl = getattr(row, "Накладная", None)
            n_num = str(getattr(nakl, "Номер", "") or "").strip() if nakl else ""
            n_date = format_1c_datetime(getattr(nakl, "Дата", None)) if nakl else ""
            n_sum = float(getattr(nakl, "СуммаДокумента", 0) or 0) if nakl else 0.0
            k_name = ""
            if nakl and hasattr(nakl, "Контрагент") and nakl.Контрагент:
                k_name = str(getattr(nakl.Контрагент, "Наименование", "") or "").strip()
            items.append({
                "line_no": r_idx + 1,
                "code": n_num,
                "article": n_date,
                "name": f"Реализация №{n_num} ({k_name})" if k_name else f"Реализация №{n_num}",
                "qty": 1,
                "price": n_sum,
                "total": n_sum,
                "discount_auto": 0.0,
                "discount_manual": 0.0,
                "discount_total": 0.0,
                "vat_rate": "0%",
                "vat_amount": 0.0,
                "account_bu": "",
                "income_account_bu": "",
                "expense_account_bu": "",
                "warehouse": "",
                "series": ""
            })

    return {
        "doc_date": v_doc_date,
        "amount": v_amt,
        "posted": v_posted,
        "deleted": v_deleted,
        "comment": v_comment,
        "kontragent": v_kontr,
        "warehouse": v_wh,
        "contract": v_contract,
        "driver": v_driver,
        "route": v_route,
        "bu_record": v_bu_record,
        "nu_record": v_nu_record,
        "account_settlement": v_acc_settle,
        "account_advance": v_acc_advance,
        "items": items
    }


def get_document_version_diff(conn, payload):
    """
    Returns full chronological version history and granular line-by-line diff
    for a specific document.
    """
    doc_type = payload.get("doc_type") or "РеализацияТоваровУслуг"
    doc_number = payload.get("number", "").strip()

    if not doc_number:
        raise ValueError("Номер документа не указан")

    clean_num = doc_number.replace("С", "C").replace("с", "c")
    alt_num = clean_num.replace("C", "С")

    # 1. Locate Document Reference
    q_find = conn.NewObject("Запрос")
    q_find.SetParameter("DocNum", clean_num)
    q_find.SetParameter("AltDocNum", alt_num)
    q_find.SetParameter("DocNumLike", f"%{clean_num}%")

    if doc_type == "ПогрузкиМашин":
        from_table = "Документ.ПогрузкиМашин"
    elif doc_type == "ВозвратТоваровОтПокупателя":
        from_table = "Документ.ВозвратТоваровОтПокупателя"
    else:
        from_table = "Документ.РеализацияТоваровУслуг"

    q_find.Text = f"""
    ВЫБРАТЬ ПЕРВЫЕ 1
        Т.Ссылка КАК Ref,
        Т.Номер КАК Number,
        Т.Дата КАК Date,
        Т.Проведен КАК Posted,
        Т.ПометкаУдаления КАК DeletionMark
    ИЗ
        {from_table} КАК Т
    ГДЕ
        Т.Номер = &DocNum
        ИЛИ Т.Номер = &AltDocNum
        ИЛИ Т.Номер ПОДОБНО &DocNumLike
    """
    res_find = q_find.Execute().Choose()
    if not res_find.Next():
        raise ValueError(f"Документ {doc_type} №{doc_number} не найден в 1С")

    doc_ref = res_find.Ref
    current_doc_num = str(res_find.Number or doc_number).strip()
    current_doc_date = format_1c_datetime(res_find.Date)

    # 2. Query all versions from РегистрСведений.ВерсииОбъектов
    q_ver = conn.NewObject("Запрос")
    q_ver.SetParameter("DocRef", doc_ref)
    q_ver.Text = """
    ВЫБРАТЬ
        Т.НомерВерсии КАК VersionNum,
        Т.ДатаВерсии КАК VersionDate,
        Т.АвторВерсии.Наименование КАК Author,
        Т.ВерсияОбъекта КАК Storage
    ИЗ
        РегистрСведений.ВерсииОбъектов КАК Т
    ГДЕ
        Т.Объект = &DocRef
    УПОРЯДОЧИТЬ ПО
        Т.НомерВерсии ВОЗР
    """
    res_ver = q_ver.Execute().Choose()

    nom_cache = {}
    kontr_cache = {}
    wh_cache = {}
    contract_cache = {}
    driver_cache = {}
    doc_cache = {}
    acc_cache = {}

    parsed_versions = []
    while res_ver.Next():
        v_num = int(res_ver.VersionNum or 0)
        v_author = str(res_ver.Author or "").strip() or "Пользователь 1С"
        v_change_date = format_1c_datetime(res_ver.VersionDate)

        v_data = unpack_version_snapshot(conn, res_ver.Storage, nom_cache, kontr_cache, wh_cache, driver_cache, doc_cache, contract_cache, acc_cache)
        if not v_data:
            continue

        real_doc_date = v_data.get("doc_date") or current_doc_date

        parsed_versions.append({
            "version": v_num,
            "author": v_author,
            "change_date": v_change_date,
            "action_date": v_change_date,
            "doc_date": real_doc_date,
            "date": real_doc_date,
            "amount": v_data["amount"],
            "posted": v_data["posted"],
            "deleted": v_data["deleted"],
            "comment": v_data["comment"],
            "kontragent": v_data["kontragent"],
            "warehouse": v_data["warehouse"],
            "contract": v_data.get("contract", ""),
            "driver": v_data["driver"],
            "route": v_data["route"],
            "bu_record": v_data.get("bu_record", False),
            "nu_record": v_data.get("nu_record", False),
            "account_settlement": v_data.get("account_settlement", ""),
            "account_advance": v_data.get("account_advance", ""),
            "items_count": len(v_data["items"]),
            "items": v_data["items"]
        })

    # If no versions found in РегистрСведений.ВерсииОбъектов, construct baseline Version 1 from document
    if not parsed_versions:
        doc_obj = doc_ref
        try:
            doc_obj = doc_ref.ПолучитьОбъект()
        except Exception:
            pass

        base_amt = float(getattr(doc_obj, "СуммаДокумента", 0) or 0)
        base_posted = bool(getattr(doc_obj, "Проведен", False))
        base_deleted = bool(getattr(doc_obj, "ПометкаУдаления", False))
        base_comm = str(getattr(doc_obj, "Комментарий", "") or "").strip()
        base_resp = "Пользователь 1С"
        try:
            if hasattr(doc_obj, "Ответственный") and doc_obj.Ответственный:
                base_resp = str(getattr(doc_obj.Ответственный, "Наименование", "") or "Пользователь 1С").strip()
        except Exception:
            pass

        base_kontr = ""
        try:
            if hasattr(doc_obj, "Контрагент") and doc_obj.Контрагент:
                base_kontr = str(getattr(doc_obj.Контрагент, "Наименование", "") or "").strip()
        except Exception:
            pass

        base_wh = ""
        try:
            for w_attr in ["Склад", "СкладОрдер", "СкладКомпании", "СкладПолучатель", "СкладОтправитель"]:
                if hasattr(doc_obj, w_attr) and getattr(doc_obj, w_attr):
                    base_wh = str(getattr(getattr(doc_obj, w_attr), "Наименование", "") or "").strip()
                    if base_wh:
                        break
        except Exception:
            pass

        base_driver = ""
        try:
            if hasattr(doc_obj, "Водитель") and doc_obj.Водитель:
                base_driver = str(getattr(doc_obj.Водитель, "Наименование", "") or "").strip()
        except Exception:
            pass

        base_route = ""
        try:
            if hasattr(doc_obj, "Маршрут") and doc_obj.Маршрут:
                base_route = str(getattr(doc_obj.Маршрут, "Наименование", "") or str(doc_obj.Маршрут)).strip()
        except Exception:
            pass

        base_contract = ""
        try:
            for c_attr in ["ДоговорКонтрагента", "Договор"]:
                if hasattr(doc_obj, c_attr) and getattr(doc_obj, c_attr):
                    base_contract = str(getattr(getattr(doc_obj, c_attr), "Наименование", "") or "").strip()
                    if base_contract:
                        break
        except Exception:
            pass

        base_bu_record = bool(getattr(doc_obj, "ОтражатьВБухгалтерскомУчете", False))
        base_nu_record = bool(getattr(doc_obj, "ОтражатьВНалоговомУчете", False))
        base_acc_settle = str(getattr(getattr(doc_obj, "СчетУчетаРасчетовСКонтрагентом", None), "Код", "") or "").strip()
        base_acc_advance = str(getattr(getattr(doc_obj, "СчетУчетаРасчетовПоАвансам", None), "Код", "") or "").strip()

        base_items = []
        try:
            if hasattr(doc_obj, "Товары"):
                t_tab = doc_obj.Товары
                for idx in range(t_tab.Количество()):
                    r = t_tab.Получить(idx)
                    nom_ref = getattr(r, "Номенклатура", None)
                    n_name = str(getattr(nom_ref, "Наименование", "") or "").strip() if nom_ref else ""
                    n_code = str(getattr(nom_ref, "Код", "") or "").strip() if nom_ref else ""
                    n_art = str(getattr(nom_ref, "Артикул", "") or "").strip() if nom_ref else ""
                    q_val = float(getattr(r, "Количество", 0) or 0)
                    p_val = float(getattr(r, "Цена", 0) or 0)
                    s_val = float(getattr(r, "Сумма", 0) or (q_val * p_val))
                    d_auto = float(getattr(r, "ПроцентАвтоматическихСкидок", 0) or 0)
                    d_manual = float(getattr(r, "ПроцентСкидкиНаценки", 0) or 0)
                    raw_v = getattr(r, "СтавкаНДС", None)
                    v_rate = format_vat_rate(str(getattr(raw_v, "Наименование", "") or raw_v or "").strip())
                    v_amount = float(getattr(r, "СуммаНДС", 0) or 0)
                    acc_bu = str(getattr(getattr(r, "СчетУчетаБУ", None), "Код", "") or "").strip()
                    acc_inc = str(getattr(getattr(r, "СчетДоходовБУ", None), "Код", "") or "").strip()
                    acc_exp = str(getattr(getattr(r, "СчетРасходовБУ", None), "Код", "") or "").strip()
                    row_w = str(getattr(getattr(r, "Склад", None), "Наименование", "") or "").strip()
                    row_s = str(getattr(getattr(r, "СерияНоменклатуры", None), "Наименование", "") or "").strip()

                    base_items.append({
                        "line_no": idx + 1,
                        "code": n_code,
                        "article": n_art,
                        "name": n_name or f"Товар {idx + 1}",
                        "qty": q_val,
                        "price": p_val,
                        "total": s_val,
                        "discount_auto": d_auto,
                        "discount_manual": d_manual,
                        "discount_total": d_auto + d_manual,
                        "vat_rate": v_rate or "0%",
                        "vat_amount": v_amount,
                        "account_bu": acc_bu,
                        "income_account_bu": acc_inc,
                        "expense_account_bu": acc_exp,
                        "warehouse": row_w,
                        "series": row_s
                    })
        except Exception as e_rows:
            print("Error extracting document fallback lines:", e_rows)

        parsed_versions.append({
            "version": 1,
            "author": base_resp,
            "change_date": current_doc_date,
            "action_date": current_doc_date,
            "doc_date": current_doc_date,
            "date": current_doc_date,
            "amount": base_amt,
            "posted": base_posted,
            "deleted": base_deleted,
            "comment": base_comm,
            "kontragent": base_kontr,
            "warehouse": base_wh,
            "contract": base_contract,
            "driver": base_driver,
            "route": base_route,
            "bu_record": base_bu_record,
            "nu_record": base_nu_record,
            "account_settlement": base_acc_settle,
            "account_advance": base_acc_advance,
            "items_count": len(base_items),
            "items": base_items
        })

    # 3. Calculate Diffs between each consecutive version (v1 -> v2, v2 -> v3...)
    version_diffs = []
    for i in range(len(parsed_versions)):
        cur_v = parsed_versions[i]
        prev_v = parsed_versions[i - 1] if i > 0 else None

        field_diffs = []
        item_diffs = {"added": [], "removed": [], "modified": []}

        if prev_v is None:
            # First Version (Creation)
            operation = "Создание документа"
            field_diffs.append({"field": "СуммаДокумента", "label": "Сумма", "old_val": "-", "new_val": f"{cur_v['amount']:.2f} AZN"})
            field_diffs.append({"field": "Проведен", "label": "Статус проведения", "old_val": "-", "new_val": "✔ Проведен" if cur_v["posted"] else "📄 Черновик"})
            if cur_v.get("kontragent"):
                field_diffs.append({"field": "Контрагент", "label": "Контрагент", "old_val": "-", "new_val": cur_v["kontragent"]})
            if cur_v.get("warehouse"):
                field_diffs.append({"field": "Склад", "label": "Склад", "old_val": "-", "new_val": cur_v["warehouse"]})
            if cur_v.get("driver"):
                field_diffs.append({"field": "Водитель", "label": "Водитель", "old_val": "-", "new_val": cur_v["driver"]})
            if cur_v.get("route"):
                field_diffs.append({"field": "Маршрут", "label": "Маршрут", "old_val": "-", "new_val": cur_v["route"]})
            if cur_v.get("comment"):
                field_diffs.append({"field": "Комментарий", "label": "Комментарий", "old_val": "-", "new_val": cur_v["comment"]})
            if cur_v.get("bu_record") is not None:
                field_diffs.append({"field": "ОтражатьВБухгалтерскомУчете", "label": "Mühasibat uçotu (БУ)", "old_val": "-", "new_val": "Bəli" if cur_v.get("bu_record") else "Xeyr"})

            # For the initial creation, all lines are added lines
            item_diffs["added"] = cur_v["items"]
        else:
            # Modification: Diff fields
            operation = "Изменение документа"
            if abs(cur_v["amount"] - prev_v["amount"]) > 0.001:
                field_diffs.append({
                    "field": "СуммаДокумента",
                    "label": "Сумма",
                    "old_val": f"{prev_v['amount']:.2f} AZN",
                    "new_val": f"{cur_v['amount']:.2f} AZN",
                    "diff": cur_v["amount"] - prev_v["amount"]
                })
            if cur_v["posted"] != prev_v["posted"]:
                operation = "Проведение" if cur_v["posted"] else "Отмена проведения"
                field_diffs.append({
                    "field": "Проведен",
                    "label": "Статус проведения",
                    "old_val": "✔ Проведен" if prev_v["posted"] else "📄 Черновик",
                    "new_val": "✔ Проведен" if cur_v["posted"] else "📄 Черновик"
                })
            if cur_v["deleted"] != prev_v["deleted"]:
                operation = "Пометка на удаление" if cur_v["deleted"] else "Снятие пометки на удаление"
                field_diffs.append({
                    "field": "ПометкаУдаления",
                    "label": "Пометка на удаление",
                    "old_val": "Да" if prev_v["deleted"] else "Нет",
                    "new_val": "Да" if cur_v["deleted"] else "Нет"
                })
            if cur_v["kontragent"] != prev_v["kontragent"] and (cur_v["kontragent"] or prev_v["kontragent"]):
                field_diffs.append({
                    "field": "Контрагент",
                    "label": "Контрагент",
                    "old_val": prev_v["kontragent"] or "—",
                    "new_val": cur_v["kontragent"] or "—"
                })
            if cur_v["warehouse"] != prev_v["warehouse"] and (cur_v["warehouse"] or prev_v["warehouse"]):
                field_diffs.append({
                    "field": "Склад",
                    "label": "Склад",
                    "old_val": prev_v["warehouse"] or "—",
                    "new_val": cur_v["warehouse"] or "—"
                })
            if cur_v.get("contract") != prev_v.get("contract") and (cur_v.get("contract") or prev_v.get("contract")):
                field_diffs.append({
                    "field": "ДоговорКонтрагента",
                    "label": "Договор",
                    "old_val": prev_v.get("contract") or "—",
                    "new_val": cur_v.get("contract") or "—"
                })
            if cur_v["driver"] != prev_v["driver"] and (cur_v["driver"] or prev_v["driver"]):
                field_diffs.append({
                    "field": "Водитель",
                    "label": "Водитель",
                    "old_val": prev_v["driver"] or "—",
                    "new_val": cur_v["driver"] or "—"
                })
            if cur_v["route"] != prev_v["route"] and (cur_v["route"] or prev_v["route"]):
                field_diffs.append({
                    "field": "Маршрут",
                    "label": "Маршрут",
                    "old_val": prev_v["route"] or "—",
                    "new_val": cur_v["route"] or "—"
                })
            if cur_v["comment"] != prev_v["comment"] and (cur_v["comment"] or prev_v["comment"]):
                field_diffs.append({
                    "field": "Комментарий",
                    "label": "Комментарий",
                    "old_val": prev_v["comment"] or "—",
                    "new_val": cur_v["comment"] or "—"
                })

            # Accounting flags diff
            if cur_v.get("bu_record") != prev_v.get("bu_record"):
                field_diffs.append({
                    "field": "ОтражатьВБухгалтерскомУчете",
                    "label": "Mühasibat uçotu (БУ)",
                    "old_val": "Bəli" if prev_v.get("bu_record") else "Xeyr",
                    "new_val": "Bəli" if cur_v.get("bu_record") else "Xeyr"
                })
            if cur_v.get("nu_record") != prev_v.get("nu_record"):
                field_diffs.append({
                    "field": "ОтражатьВНалоговомУчете",
                    "label": "Vergi uçotu (НУ)",
                    "old_val": "Bəli" if prev_v.get("nu_record") else "Xeyr",
                    "new_val": "Bəli" if cur_v.get("nu_record") else "Xeyr"
                })
            if cur_v.get("account_settlement") != prev_v.get("account_settlement") and (cur_v.get("account_settlement") or prev_v.get("account_settlement")):
                field_diffs.append({
                    "field": "СчетУчетаРасчетовСКонтрагентом",
                    "label": "Müştəri Hesabı",
                    "old_val": prev_v.get("account_settlement") or "—",
                    "new_val": cur_v.get("account_settlement") or "—"
                })

            # Real document operational date diff: ONLY if the document's own date was edited
            cur_d = cur_v.get("doc_date") or cur_v.get("date")
            prev_d = prev_v.get("doc_date") or prev_v.get("date")
            if cur_d and prev_d and str(cur_d).strip() != str(prev_d).strip():
                field_diffs.append({
                    "field": "Дата",
                    "label": "Sənəd Tarixi",
                    "old_val": prev_d,
                    "new_val": cur_d
                })

            # Diff line items (quantity, price, sum, discounts, accounts, vat)
            old_map = {it["code"] or it["name"]: it for it in prev_v["items"]}
            new_map = {it["code"] or it["name"]: it for it in cur_v["items"]}

            for key, new_item in new_map.items():
                if key not in old_map:
                    item_diffs["added"].append(new_item)
                else:
                    old_item = old_map[key]
                    qty_diff = abs(new_item["qty"] - old_item["qty"]) > 0.0001
                    price_diff = abs(new_item["price"] - old_item["price"]) > 0.001
                    sum_diff = abs(new_item["total"] - old_item["total"]) > 0.001
                    disc_auto_diff = abs(new_item.get("discount_auto", 0) - old_item.get("discount_auto", 0)) > 0.01
                    disc_manual_diff = abs(new_item.get("discount_manual", 0) - old_item.get("discount_manual", 0)) > 0.01
                    acc_bu_diff = (new_item.get("account_bu", "") != old_item.get("account_bu", "")) and (new_item.get("account_bu") or old_item.get("account_bu"))
                    acc_inc_diff = (new_item.get("income_account_bu", "") != old_item.get("income_account_bu", "")) and (new_item.get("income_account_bu") or old_item.get("income_account_bu"))
                    vat_diff = (new_item.get("vat_rate", "") != old_item.get("vat_rate", "")) and (new_item.get("vat_rate") or old_item.get("vat_rate"))

                    if qty_diff or price_diff or sum_diff or disc_auto_diff or disc_manual_diff or acc_bu_diff or acc_inc_diff or vat_diff:
                        item_diffs["modified"].append({
                            "name": new_item["name"],
                            "code": new_item["code"],
                            "old_qty": old_item["qty"],
                            "new_qty": new_item["qty"],
                            "old_price": old_item["price"],
                            "new_price": new_item["price"],
                            "old_total": old_item["total"],
                            "new_total": new_item["total"],
                            "old_discount_auto": old_item.get("discount_auto", 0),
                            "new_discount_auto": new_item.get("discount_auto", 0),
                            "old_discount_manual": old_item.get("discount_manual", 0),
                            "new_discount_manual": new_item.get("discount_manual", 0),
                            "old_account_bu": old_item.get("account_bu", ""),
                            "new_account_bu": new_item.get("account_bu", ""),
                            "old_income_account_bu": old_item.get("income_account_bu", ""),
                            "new_income_account_bu": new_item.get("income_account_bu", ""),
                            "old_vat_rate": old_item.get("vat_rate", ""),
                            "new_vat_rate": new_item.get("vat_rate", "")
                        })

            for key, old_item in old_map.items():
                if key not in new_map:
                    item_diffs["removed"].append(old_item)

            if not field_diffs and not item_diffs["added"] and not item_diffs["removed"] and not item_diffs["modified"]:
                operation = "Сохранение без изменений (Перезапись)"
                field_diffs.append({
                    "field": "Информация",
                    "label": "Информация",
                    "old_val": "Реквизиты и товары не менялись",
                    "new_val": "Повторное сохранение документа"
                })
            elif not field_diffs and item_diffs["modified"]:
                # If only discounts or accounts changed in items
                has_disc = any(m.get("old_discount_auto") != m.get("new_discount_auto") or m.get("old_discount_manual") != m.get("new_discount_manual") for m in item_diffs["modified"])
                has_acc = any(m.get("old_account_bu") != m.get("new_account_bu") or m.get("old_income_account_bu") != m.get("new_income_account_bu") for m in item_diffs["modified"])
                if has_disc and has_acc:
                    operation = "Dəyişiklik (Endirim və Uçot hesabları)"
                elif has_disc:
                    operation = "Dəyişiklik (Endirim faizləri)"
                elif has_acc:
                    operation = "Dəyişiklik (Uçot hesabları)"

        version_diffs.append({
            "version": cur_v["version"],
            "author": cur_v["author"],
            "change_date": cur_v.get("change_date") or cur_v.get("action_date") or cur_v["date"],
            "action_date": cur_v.get("action_date") or cur_v.get("change_date") or cur_v["date"],
            "doc_date": cur_v.get("doc_date") or cur_v["date"],
            "date": cur_v.get("doc_date") or cur_v["date"],
            "operation": operation,
            "amount": cur_v["amount"],
            "posted": cur_v["posted"],
            "deleted": cur_v["deleted"],
            "field_diffs": field_diffs,
            "item_diffs": item_diffs,
            "total_items": cur_v["items_count"]
        })

    # 4. Also fetch Event Log timeline for who posted/unposted/saved
    event_timeline = []
    try:
        tz = conn.NewObject("ТаблицаЗначений")
        filt = conn.NewObject("Структура")
        filt.Вставить("Данные", doc_ref)
        conn.ВыгрузитьЖурналРегистрации(tz, filt, "", "", 30)
        for idx in range(tz.Количество()):
            row = tz.Получить(idx)
            ev_name = str(row.Событие or "")
            ev_user = str(row.ИмяПользователя or "Пользователь 1С").strip()
            ev_date = format_1c_datetime(row.Дата)
            ev_comment = str(row.Комментарий or "").strip()

            action = "Əməliyyat"
            action_type = "Hərəkət"
            badge_class = "blue"
            doc_status = "Qaralama"
            result_txt = ev_comment or "Sənədlə əməliyyat aparıldı"

            if "_$Data$_.Post" in ev_name:
                action = "Təsdiqləndi"
                action_type = "Təsdiq"
                badge_class = "green"
                doc_status = "Təsdiqləndi"
                result_txt = "Sənəd 1C-də təsdiqləndi (Provodka edildi)"
            elif "_$Data$_.Unpost" in ev_name:
                action = "Təsdiq ləğv edildi"
                action_type = "Təsdiq ləğvi"
                badge_class = "orange"
                doc_status = "Qaralama"
                result_txt = "Təsdiq ləğv edildi, sənəd qaralamaya qaytarıldı"
            elif "_$Data$_.New" in ev_name:
                action = "Yaradıldı"
                action_type = "Yaradılma"
                badge_class = "blue"
                doc_status = "Qaralama"
                result_txt = "Sənədin ilkin qeydiyyatı və yaradılması"
            elif "_$Data$_.Update" in ev_name:
                action = "Dəyişdirildi"
                action_type = "Redaktə"
                badge_class = "orange"
                doc_status = "Təsdiqləndi"
                result_txt = ev_comment or "Sənəd rekvizitləri və ya cədvəl hissəsi dəyişdirildi"
            elif "_$Data$_.Delete" in ev_name:
                action = "Silindi"
                action_type = "Silinmə"
                badge_class = "red"
                doc_status = "Silindi"
                result_txt = "Sənəd 1C-dən silindi"

            event_timeline.append({
                "order": idx + 1,
                "date": ev_date,
                "datetime": ev_date,
                "user": ev_user,
                "action": action,
                "action_type": action_type,
                "badge_class": badge_class,
                "doc_status": doc_status,
                "result": result_txt,
                "event": ev_name,
                "title": action,
                "comment": ev_comment
            })
    except Exception as e_log:
        print("Event log query skipped:", e_log)

    first_v = parsed_versions[0] if parsed_versions else {}
    last_v = parsed_versions[-1] if parsed_versions else {}
    cur_wh = last_v.get("warehouse") or first_v.get("warehouse", "")
    cur_contract = last_v.get("contract") or first_v.get("contract", "")
    cur_kontr = last_v.get("kontragent") or first_v.get("kontragent", "")

    if not cur_wh or not cur_contract:
        try:
            d_obj = doc_ref.ПолучитьОбъект()
            if not cur_wh:
                for attr in ["Склад", "СкладОрдер", "СкладКомпании", "СкладПолучатель", "СкладОтправитель"]:
                    if hasattr(d_obj, attr) and getattr(d_obj, attr):
                        cur_wh = str(getattr(getattr(d_obj, attr), "Наименование", "") or "").strip()
                        if cur_wh:
                            break
            if not cur_contract:
                for attr in ["ДоговорКонтрагента", "Договор"]:
                    if hasattr(d_obj, attr) and getattr(d_obj, attr):
                        cur_contract = str(getattr(getattr(d_obj, attr), "Наименование", "") or "").strip()
                        if cur_contract:
                            break
        except Exception:
            pass

    for v in parsed_versions:
        if not v.get("warehouse") and cur_wh:
            v["warehouse"] = cur_wh
        if not v.get("contract") and cur_contract:
            v["contract"] = cur_contract

    return {
        "doc_type": doc_type,
        "number": current_doc_num,
        "date": current_doc_date,
        "kontragent": cur_kontr,
        "warehouse": cur_wh,
        "contract": cur_contract,
        "amount": first_v.get("amount", 0.0),
        "posted": first_v.get("posted", False),
        "deleted": first_v.get("deleted", False),
        "total_versions": len(parsed_versions),
        "versions": version_diffs,
        "raw_versions": parsed_versions,
        "event_timeline": event_timeline
    }
