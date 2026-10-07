# -*- coding: utf-8 -*-
"""
services/documents/__init__.py
Central modular router for 1C document operations.
Dispatches requests cleanly to per-document handler modules:
- realization.py (РеализацияТоваровУслуг)
- pogruzka.py    (ПогрузкиМашин)
- vozvrat.py     (ВозвратТоваровОтПокупателя)
- price.py       (УстановкаЦенНоменклатуры & Pricing)
- generic.py     (Generic fallback for all other 1C documents)
- nomenclature.py (Nomenclature lookup & barcodes)
"""
from services.documents.realization import get_realization_list, get_realization_details
from services.documents.pogruzka import get_pogruzka_list, get_pogruzka_details
from services.documents.vozvrat import get_vozvrat_list, get_vozvrat_details
from services.documents.generic import get_generic_documents_list, get_generic_document_details
from services.documents.price import (
    get_price_document_details,
    save_price_document,
    get_all_price_types_list,
    get_item_prices_dict
)
from services.documents.nomenclature import resolve_nomenclature_batch, search_nomenclature
from services.documents.base import format_1c_datetime, parse_query_datetime


def handle_get_documents_list(conn, payload, key, resp_q):
    doc_type = payload.get("doc_type") or "РеализацияТоваровУслуг"

    if doc_type == "РеализацияТоваровУслуг":
        res = get_realization_list(conn, payload)
    elif doc_type in ["ПогрузкиМашин", "ПогрузкаМашин"]:
        res = get_pogruzka_list(conn, payload)
    elif doc_type == "ВозвратТоваровОтПокупателя":
        res = get_vozvrat_list(conn, payload)
    else:
        res = get_generic_documents_list(conn, payload)

    resp_q.put((True, res))


def handle_get_document_details(conn, payload, key, resp_q):
    doc_type = payload.get("doc_type") or "РеализацияТоваровУслуг"

    if doc_type == "РеализацияТоваровУслуг":
        res = get_realization_details(conn, payload)
    elif doc_type in ["ПогрузкиМашин", "ПогрузкаМашин"]:
        import importlib
        import services.documents.pogruzka as p_mod
        importlib.reload(p_mod)
        res = p_mod.get_pogruzka_details(conn, payload)
    elif doc_type == "ВозвратТоваровОтПокупателя":
        res = get_vozvrat_details(conn, payload)
    else:
        res = get_generic_document_details(conn, payload)

    resp_q.put((True, res))


def handle_get_price_document(conn, payload, key, resp_q):
    res = get_price_document_details(conn, payload, key)
    resp_q.put((True, res))


def handle_save_price_document(conn, payload, key, resp_q):
    res = save_price_document(conn, payload)
    resp_q.put((True, res))


def handle_get_all_price_types(conn, payload, key, resp_q):
    pts = get_all_price_types_list(conn)
    resp_q.put((True, {"price_types": pts}))


def handle_get_item_prices(conn, payload, key, resp_q):
    prices = get_item_prices_dict(conn, payload)
    resp_q.put((True, {"prices": prices}))


def handle_get_batch_item_prices(conn, payload, key, resp_q):
    from services.documents.price import get_batch_item_prices_dict
    res = get_batch_item_prices_dict(conn, payload)
    resp_q.put((True, res))


def handle_resolve_nomenclature_batch(conn, payload, key, resp_q):
    res = resolve_nomenclature_batch(conn, payload, key)
    resp_q.put((True, res))


def handle_search_nomenclature(conn, payload, key, resp_q):
    res = search_nomenclature(conn, payload, key)
    resp_q.put((True, res))


def handle_find_pogruzka(conn, payload, key, resp_q):
    realiz_num = payload.get("realization_number", "").strip()
    pogruzka_num = payload.get("pogruzka_number", "").strip()
    only_duplicates = payload.get("only_duplicates", False)
    date_from = payload.get("date_from", "").strip()
    date_to = payload.get("date_to", "").strip()

    q_find = conn.NewObject("Запрос")
    where_parts = []
    if realiz_num:
        clean_latin = realiz_num.replace("С", "C").replace("с", "c").strip()
        clean_cyril = realiz_num.replace("C", "С").replace("c", "с").strip()
        q_find.SetParameter("RealizNum1", f"%{clean_latin}%")
        q_find.SetParameter("RealizNum2", f"%{clean_cyril}%")
        where_parts.append("(П.Накладная.Номер ПОДОБНО &RealizNum1 ИЛИ П.Накладная.Номер ПОДОБНО &RealizNum2)")
    if pogruzka_num:
        clean_pog = pogruzka_num.strip()
        q_find.SetParameter("PogruzkaNum", f"%{clean_pog}%")
        where_parts.append("П.Ссылка.Номер ПОДОБНО &PogruzkaNum")

    dt_from = parse_query_datetime(date_from, False)
    if dt_from:
        q_find.SetParameter("DateFrom", dt_from)
        where_parts.append("П.Накладная.Дата >= &DateFrom")

    dt_to = parse_query_datetime(date_to, True)
    if dt_to:
        q_find.SetParameter("DateTo", dt_to)
        where_parts.append("П.Накладная.Дата <= &DateTo")

    where_sql = f"ГДЕ {' И '.join(where_parts)}" if where_parts else ""

    q_find.Text = f"""
    ВЫБРАТЬ ПЕРВЫЕ 200
        П.Накладная.Номер КАК RealizNumber,
        П.Накладная.Дата КАК RealizDate,
        ПРЕДСТАВЛЕНИЕ(П.Накладная.Контрагент) КАК Kontragent,
        П.Накладная.СуммаДокумента КАК Amount,
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
    {where_sql}
    УПОРЯДОЧИТЬ ПО
        П.Накладная.Дата УБЫВ,
        П.Ссылка.Дата УБЫВ
    """
    res_f = q_find.Execute().Choose()
    items_map = {}
    while res_f.Next():
        r_num = str(res_f.RealizNumber or "").strip()
        if not r_num:
            continue
        if r_num not in items_map:
            items_map[r_num] = {
                "realiz_number": r_num,
                "realiz_date": format_1c_datetime(res_f.RealizDate),
                "kontragent": str(res_f.Kontragent or "").strip(),
                "amount": float(res_f.Amount or 0),
                "pogruzki": []
            }
        items_map[r_num]["pogruzki"].append({
            "pogruzka_number": str(res_f.PogruzkaNumber or "").strip(),
            "pogruzka_date": format_1c_datetime(res_f.PogruzkaDate),
            "marshrut": str(res_f.Marshrut or "").strip(),
            "voditel": str(res_f.Voditel or "").strip(),
            "warehouse": str(res_f.Sklad or "").strip(),
            "responsible": str(res_f.Responsible or "").strip(),
            "posted": bool(res_f.Posted),
            "deleted": bool(res_f.DeletionMark)
        })

    result_list = []
    for r_k, r_val in items_map.items():
        r_val["count"] = len(r_val["pogruzki"])
        r_val["is_duplicate"] = (r_val["count"] > 1)
        if only_duplicates and not r_val["is_duplicate"]:
            continue
        result_list.append(r_val)

    resp_q.put((True, {
        "items": result_list,
        "total": len(result_list)
    }))


DOCUMENT_HANDLERS = {
    "get_documents_list": handle_get_documents_list,
    "get_document_details": handle_get_document_details,
    "get_price_document": handle_get_price_document,
    "save_price_document": handle_save_price_document,
    "resolve_nomenclature_batch": handle_resolve_nomenclature_batch,
    "search_nomenclature": handle_search_nomenclature,
    "get_all_price_types": handle_get_all_price_types,
    "get_item_prices": handle_get_item_prices,
    "get_batch_item_prices": handle_get_batch_item_prices,
    "find_pogruzka": handle_find_pogruzka,
    "get_audit_list": lambda conn, payload, key, resp_q: resp_q.put((True, __import__("services.audit_service", fromlist=["get_audit_list"]).get_audit_list(conn, payload))),
    "get_audit_diff": lambda conn, payload, key, resp_q: resp_q.put((True, __import__("services.audit_service", fromlist=["get_document_version_diff"]).get_document_version_diff(conn, payload)))
}
