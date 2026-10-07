# -*- coding: utf-8 -*-
"""
services/documents/nomenclature.py
Handlers for nomenclature lookup, barcode resolution, and batch matching.
"""
from services.common import get_barcodes_map

def resolve_nomenclature_batch(conn, payload, key):
    codes = payload.get("codes", [])
    if not codes:
        return {"found": {}}

    unique_codes = list(set([str(c).strip() for c in codes if str(c).strip()]))[:1000]
    if not unique_codes:
        return {"found": {}}

    arr = conn.NewObject("Массив")
    for c in unique_codes:
        arr.Add(c)

    id_type = str(payload.get("id_type", "code")).strip().lower()
    found_map = {}

    if id_type == "barcode":
        try:
            q_bc = conn.NewObject("Запрос")
            q_bc.SetParameter("Codes", arr)
            q_bc.Text = """
            ВЫБРАТЬ
                Ш.Штрихкод КАК Barcode,
                Т.Код КАК Code,
                Т.Наименование КАК Name,
                Т.Артикул КАК Artikul,
                ЕСТЬNULL(Т.ЕдиницаХраненияОстатков.Наименование, Т.БазоваяЕдиницаИзмерения.Наименование) КАК Unit
            ИЗ
                РегистрСведений.Штрихкоды КАК Ш
                ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.Номенклатура КАК Т
                    ПО Ш.Владелец = Т.Ссылка
            ГДЕ
                НЕ Т.ЭтоГруппа
                И Ш.Штрихкод В (&Codes)
            """
            sel_bc = q_bc.Execute().Choose()
            while sel_bc.Next():
                c_code = str(getattr(sel_bc, "Code", "") or "").strip()
                c_name = str(getattr(sel_bc, "Name", "") or "").strip()
                c_artikul = str(getattr(sel_bc, "Artikul", "") or "").strip()
                c_unit = str(getattr(sel_bc, "Unit", "") or "шт").strip()
                c_bc = str(getattr(sel_bc, "Barcode", "") or "").strip()

                info = {
                    "code": c_code,
                    "name": c_name,
                    "artikul": c_artikul,
                    "barcode": c_bc,
                    "unit": c_unit
                }
                if c_bc: found_map[c_bc] = info
                if c_code: found_map[c_code] = info
                if c_artikul: found_map[c_artikul] = info
        except Exception as e_bc:
            print("Barcode resolve error:", e_bc)

    try:
        q_nom = conn.NewObject("Запрос")
        q_nom.SetParameter("Codes", arr)
        q_nom.Text = """
        ВЫБРАТЬ
            Т.Код КАК Code,
            Т.Наименование КАК Name,
            Т.Артикул КАК Artikul,
            ЕСТЬNULL(Т.ЕдиницаХраненияОстатков.Наименование, Т.БазоваяЕдиницаИзмерения.Наименование) КАК Unit
        ИЗ
            Справочник.Номенклатура КАК Т
        ГДЕ
            НЕ Т.ЭтоГруппа
            И (Т.Код В (&Codes) ИЛИ Т.Артикул В (&Codes))
        """
        sel_nom = q_nom.Execute().Choose()
        while sel_nom.Next():
            c_code = str(getattr(sel_nom, "Code", "") or "").strip()
            c_name = str(getattr(sel_nom, "Name", "") or "").strip()
            c_artikul = str(getattr(sel_nom, "Artikul", "") or "").strip()
            c_unit = str(getattr(sel_nom, "Unit", "") or "шт").strip()

            info = {
                "code": c_code,
                "name": c_name,
                "artikul": c_artikul,
                "barcode": "",
                "unit": c_unit
            }
            if c_code and c_code not in found_map: found_map[c_code] = info
            if c_artikul and c_artikul not in found_map: found_map[c_artikul] = info
    except Exception as e_nom:
        print("Nom query resolve error:", e_nom)

    return {"found": found_map}


def search_nomenclature(conn, payload, key):
    query = str(payload.get("query", "")).strip()
    if not query or len(query) < 1:
        return {"items": []}

    b_map = {}
    try:
        b_map = get_barcodes_map(conn, key)
    except Exception:
        pass

    q_search = conn.NewObject("Запрос")
    q_search.SetParameter("QText", f"%{query}%")
    q_search.Text = """
    ВЫБРАТЬ ПЕРВЫЕ 35
        Т.Код КАК Code,
        Т.Наименование КАК Name,
        Т.Артикул КАК Artikul,
        ЕСТЬNULL(Т.ЕдиницаХраненияОстатков.Наименование, Т.БазоваяЕдиницаИзмерения.Наименование) КАК Unit
    ИЗ
        Справочник.Номенклатура КАК Т
    ГДЕ
        НЕ Т.ЭтоГруппа
        И (Т.Наименование ПОДОБНО &QText ИЛИ Т.Код ПОДОБНО &QText ИЛИ Т.Артикул ПОДОБНО &QText)
    УПОРЯДОЧИТЬ ПО
        Т.Наименование
    """
    sel_s = q_search.Execute().Choose()
    items_list = []
    while sel_s.Next():
        c_code = str(getattr(sel_s, "Code", "") or "").strip()
        c_name = str(getattr(sel_s, "Name", "") or "").strip()
        c_artikul = str(getattr(sel_s, "Artikul", "") or "").strip()
        c_unit = str(getattr(sel_s, "Unit", "") or "шт").strip()
        bc = ""
        if c_name in b_map:
            bc = b_map[c_name].get("unit") or b_map[c_name].get("box") or ""

        items_list.append({
            "code": c_code,
            "name": c_name,
            "artikul": c_artikul,
            "unit": c_unit,
            "barcode": bc
        })
    return {"items": items_list}
