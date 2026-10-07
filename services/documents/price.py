# -*- coding: utf-8 -*-
"""
services/documents/price.py
Dedicated handler for 'УстановкаЦенНоменклатуры' documents and pricing registers.
"""
import datetime
from services.documents.base import format_1c_datetime, parse_query_datetime
from services.common import get_barcodes_map

def get_price_document_details(conn, payload, key):
    doc_number = payload.get("number", "").strip()
    doc_date_str = payload.get("date", "").strip()

    date_cond = ""
    q_pdoc = conn.NewObject("Запрос")
    if doc_date_str:
        try:
            if "." in doc_date_str:
                yr = int(doc_date_str.split(".")[2][:4])
            else:
                yr = int(doc_date_str.split("-")[0])
            date_cond = " И ГОД(Т.Дата) = &Year"
            q_pdoc.SetParameter("Year", yr)
        except Exception:
            pass

    q_pdoc.Text = f"""
    ВЫБРАТЬ ПЕРВЫЕ 1
        Т.Ссылка КАК Ref
    ИЗ
        Документ.УстановкаЦенНоменклатуры КАК Т
    ГДЕ
        Т.Номер = &DocNum
        {date_cond}
    УПОРЯДОЧИТЬ ПО
        Т.Дата УБЫВ
    """
    q_pdoc.SetParameter("DocNum", doc_number)
    res_pdoc = q_pdoc.Execute().Choose()
    if not res_pdoc.Next():
        raise ValueError(f"Sənəd №{doc_number} tapılmadı")

    doc_obj = res_pdoc.Ref.ПолучитьОбъект()
    date_str = format_1c_datetime(doc_obj.Дата)

    doc_price_types = []
    if hasattr(doc_obj, "ТипыЦен"):
        for i in range(doc_obj.ТипыЦен.Количество()):
            pt_row = doc_obj.ТипыЦен.Получить(i)
            pt_name = str(pt_row.ТипЦен.Наименование).strip()
            if pt_name and pt_name not in doc_price_types:
                doc_price_types.append(pt_name)

    b_map = {}
    try:
        b_map = get_barcodes_map(conn, key)
    except Exception:
        pass

    item_dict = {}
    item_order = []
    if hasattr(doc_obj, "Товары"):
        for i in range(doc_obj.Товары.Количество()):
            r = doc_obj.Товары.Получить(i)
            nom = r.Номенклатура
            code = str(getattr(nom, "Код", "") or "").strip()
            if not code:
                continue
            name = str(getattr(nom, "Наименование", "") or "").strip()
            artikul = str(getattr(nom, "Артикул", "") or "").strip()
            unit_name = str(getattr(r.ЕдиницаИзмерения, "Наименование", "шт") or "шт")
            pt_name = str(getattr(r.ТипЦен, "Наименование", "") or "").strip()
            price = float(getattr(r, "Цена", 0) or 0)
            bc = ""
            if name in b_map:
                bc = b_map[name].get("unit") or b_map[name].get("box") or ""

            if code not in item_dict:
                item_dict[code] = {
                    "code": code,
                    "name": name,
                    "artikul": artikul,
                    "barcode": bc,
                    "unit": unit_name,
                    "prices": {}
                }
                item_order.append(code)

            if pt_name:
                item_dict[code]["prices"][pt_name] = price
                if pt_name not in doc_price_types:
                    doc_price_types.append(pt_name)

    items = [item_dict[c] for c in item_order]

    all_price_types = []
    try:
        q_all_pt = conn.NewObject("Запрос")
        q_all_pt.Text = """
        ВЫБРАТЬ
            Т.Наименование КАК Name
        ИЗ
            Справочник.ТипыЦенНоменклатуры КАК Т
        ГДЕ
            НЕ Т.ПометкаУдаления
        УПОРЯДОЧИТЬ ПО
            Т.Наименование
        """
        sel_all_pt = q_all_pt.Execute().Choose()
        while sel_all_pt.Next():
            nm = str(sel_all_pt.Name or "").strip()
            if nm and nm not in all_price_types:
                all_price_types.append(nm)
    except Exception as e_pt:
        print("Error reading all price types:", e_pt)

    for pt in doc_price_types:
        if pt not in all_price_types:
            all_price_types.append(pt)

    return {
        "number": str(doc_obj.Номер),
        "date": date_str,
        "posted": bool(doc_obj.Проведен),
        "responsible": str(getattr(doc_obj.Ответственный, "Наименование", "") if hasattr(doc_obj, "Ответственный") else ""),
        "comment": str(getattr(doc_obj, "Комментарий", "") or ""),
        "zero_prices": bool(getattr(doc_obj, "НеПроводитьНулевыеЗначения", False)),
        "price_types": doc_price_types,
        "all_price_types": all_price_types if all_price_types else doc_price_types,
        "items": items,
        "total_items": len(items)
    }


def save_price_document(conn, payload):
    doc_number = payload.get("number", "").strip()
    doc_date_str = payload.get("date", "").strip()
    comment_text = payload.get("comment", "").strip()
    items_data = payload.get("items", [])
    price_types = payload.get("price_types", [])

    date_cond = ""
    q_find = conn.NewObject("Запрос")
    if doc_date_str:
        try:
            if "." in doc_date_str:
                yr = int(doc_date_str.split(".")[2][:4])
            else:
                yr = int(doc_date_str.split("-")[0])
            date_cond = " И ГОД(Т.Дата) = &Year"
            q_find.SetParameter("Year", yr)
        except Exception:
            pass

    q_find.Text = f"""
    ВЫБРАТЬ ПЕРВЫЕ 1
        Т.Ссылка КАК Ref
    ИЗ
        Документ.УстановкаЦенНоменклатуры КАК Т
    ГДЕ
        Т.Номер = &DocNum
        {date_cond}
    УПОРЯДОЧИТЬ ПО
        Т.Дата УБЫВ
    """
    q_find.SetParameter("DocNum", doc_number)
    res_find = q_find.Execute().Choose()
    if not res_find.Next():
        raise ValueError(f"1C-də №{doc_number} nömrəli sənəd tapılmadı")

    doc_obj = res_find.Ref.ПолучитьОбъект()
    doc_obj.Комментарий = comment_text
    doc_obj.Товары.Очистить()

    pt_cache = {}
    for pt_name in price_types:
        pt_ref = conn.Справочники.ТипыЦенНоменклатуры.НайтиПоНаименованию(pt_name)
        if pt_ref and not pt_ref.Пустая():
            pt_cache[pt_name] = pt_ref

    if hasattr(doc_obj, "ТипыЦен"):
        doc_obj.ТипыЦен.Очистить()
        for pt_name in price_types:
            pt_ref = pt_cache.get(pt_name)
            if pt_ref and not pt_ref.Пустая():
                r_pt = doc_obj.ТипыЦен.Добавить()
                r_pt.ТипЦен = pt_ref

    total_rows_added = 0
    for item in items_data:
        code = item.get("code")
        if not code:
            continue
        nom_ref = conn.Справочники.Номенклатура.НайтиПоКоду(code)
        if not nom_ref or nom_ref.Пустая():
            continue

        u_ref = None
        if hasattr(nom_ref, "ЕдиницаХраненияОстатков") and not nom_ref.ЕдиницаХраненияОстатков.Пустая():
            u_ref = nom_ref.ЕдиницаХраненияОстатков
        elif hasattr(nom_ref, "БазоваяЕдиницаИзмерения") and not nom_ref.БазоваяЕдиницаИзмерения.Пустая():
            u_ref = nom_ref.БазоваяЕдиницаИзмерения

        prices = item.get("prices", {})
        for pt_name, pt_ref in pt_cache.items():
            p_val = float(prices.get(pt_name, 0) or 0)
            if p_val <= 0:
                continue
            row = doc_obj.Товары.Добавить()
            row.Номенклатура = nom_ref
            row.ТипЦен = pt_ref
            row.Цена = p_val
            if hasattr(pt_ref, "ВалютаЦены") and not pt_ref.ВалютаЦены.Пустая():
                row.Валюта = pt_ref.ВалютаЦены
            if u_ref:
                row.ЕдиницаИзмерения = u_ref
            total_rows_added += 1

    doc_obj.Записать(conn.РежимЗаписиДокумента.Запись)

    return {
        "number": str(doc_obj.Номер),
        "comment": str(doc_obj.Комментарий),
        "total_items": len(items_data),
        "total_rows": total_rows_added
    }


def get_all_price_types_list(conn):
    pts = []
    try:
        q_pt = conn.NewObject("Запрос")
        q_pt.Text = """
        ВЫБРАТЬ
            Т.Наименование КАК Name,
            Т.Код КАК Code
        ИЗ
            Справочник.ТипыЦенНоменклатуры КАК Т
        ГДЕ
            НЕ Т.ПометкаУдаления
        УПОРЯДОЧИТЬ ПО
            Т.Наименование
        """
        sel_pt = q_pt.Execute().Choose()
        while sel_pt.Next():
            nm = str(sel_pt.Name or "").strip()
            cd = str(sel_pt.Code or "").strip()
            if nm and nm not in [p["name"] for p in pts]:
                pts.append({"name": nm, "code": cd})
    except Exception as e_pt:
        print("Error reading all price types:", e_pt)
    return pts


def get_item_prices_dict(conn, payload):
    item_code = str(payload.get("code") or "").strip()
    item_name = str(payload.get("name") or "").strip()
    date_str = str(payload.get("date") or "").strip()

    prices = {}
    try:
        q_pr = conn.NewObject("Запрос")
        q_pr.SetParameter("ItemCode", item_code)
        q_pr.SetParameter("ItemName", item_name)

        has_date = False
        if date_str:
            try:
                d_part = date_str.split()[0]
                if "." in d_part:
                    dp = d_part.split(".")
                    dt = datetime.datetime(int(dp[2]), int(dp[1]), int(dp[0]), 23, 59, 59)
                    q_pr.SetParameter("DocDate", dt)
                    has_date = True
            except Exception:
                pass

        date_clause = "&DocDate" if has_date else ""
        q_pr.Text = f"""
        ВЫБРАТЬ
            Т.ТипЦен.Наименование КАК PriceTypeName,
            Т.ТипЦен.Код КАК PriceTypeCode,
            Т.Цена КАК Price
        ИЗ
            РегистрСведений.ЦеныНоменклатуры.СрезПоследних(
                {date_clause},
                (Номенклатура.Код = &ItemCode И &ItemCode <> "")
                ИЛИ (Номенклатура.Наименование = &ItemName И &ItemName <> "")
            ) КАК Т
        """
        sel_pr = q_pr.Execute().Choose()
        while sel_pr.Next():
            pt_name = str(sel_pr.PriceTypeName or "").strip()
            p_val = float(sel_pr.Price or 0)
            if pt_name and p_val > 0:
                prices[pt_name] = p_val
    except Exception as e_pr:
        print("Error reading item prices:", e_pr)
    return prices


def get_batch_item_prices_dict(conn, payload):
    codes = payload.get("codes", [])
    names = payload.get("names", [])
    pts = payload.get("price_types", [])
    date_str = str(payload.get("date") or "").strip()

    if not pts:
        return {"prices_by_code": {}, "prices_by_name": {}}

    unique_codes = list(set([str(c).strip() for c in codes if str(c).strip()]))[:2000]
    unique_names = list(set([str(n).strip() for n in names if str(n).strip()]))[:2000]
    unique_pts = list(set([str(p).strip() for p in pts if str(p).strip()]))

    if not unique_pts or (not unique_codes and not unique_names):
        return {"prices_by_code": {}, "prices_by_name": {}}

    arr_codes = conn.NewObject("Массив")
    for c in unique_codes:
        arr_codes.Add(c)

    arr_names = conn.NewObject("Массив")
    for n in unique_names:
        arr_names.Add(n)

    arr_pts = conn.NewObject("Массив")
    for pt in unique_pts:
        arr_pts.Add(pt)

    q_batch = conn.NewObject("Запрос")
    q_batch.SetParameter("Codes", arr_codes)
    q_batch.SetParameter("Names", arr_names)
    q_batch.SetParameter("PriceTypes", arr_pts)

    has_date = False
    if date_str:
        try:
            d_part = date_str.split()[0]
            if "." in d_part:
                dp = d_part.split(".")
                dt = datetime.datetime(int(dp[2]), int(dp[1]), int(dp[0]), 23, 59, 59)
                q_batch.SetParameter("DocDate", dt)
                has_date = True
        except Exception:
            pass

    date_clause = "&DocDate" if has_date else ""

    cond_parts = []
    if unique_codes:
        cond_parts.append("Номенклатура.Код В (&Codes)")
    if unique_names:
        cond_parts.append("Номенклатура.Наименование В (&Names)")
    nom_cond = " ИЛИ ".join(cond_parts) if cond_parts else "ИСТИНА"

    q_batch.Text = f"""
    ВЫБРАТЬ
        Т.Номенклатура.Код КАК Code,
        Т.Номенклатура.Наименование КАК ItemName,
        Т.ТипЦен.Наименование КАК PriceTypeName,
        Т.Цена КАК Price
    ИЗ
        РегистрСведений.ЦеныНоменклатуры.СрезПоследних(
            {date_clause},
            ТипЦен.Наименование В (&PriceTypes)
            И ({nom_cond})
        ) КАК Т
    """

    prices_by_code = {}
    prices_by_name = {}
    try:
        sel_batch = q_batch.Execute().Choose()
        while sel_batch.Next():
            c_code = str(getattr(sel_batch, "Code", "") or "").strip()
            c_name = str(getattr(sel_batch, "ItemName", "") or "").strip()
            pt_name = str(getattr(sel_batch, "PriceTypeName", "") or "").strip()
            p_val = float(getattr(sel_batch, "Price", 0) or 0)
            if c_code:
                if c_code not in prices_by_code:
                    prices_by_code[c_code] = {}
                prices_by_code[c_code][pt_name] = p_val
            if c_name:
                if c_name not in prices_by_name:
                    prices_by_name[c_name] = {}
                prices_by_name[c_name][pt_name] = p_val
    except Exception as e_b:
        print("Batch prices error:", e_b)

    return {"prices_by_code": prices_by_code, "prices_by_name": prices_by_name}
