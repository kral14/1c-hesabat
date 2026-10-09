# -*- coding: utf-8 -*-
import os
import re
import sys
import datetime
import traceback

if getattr(sys, 'frozen', False):
    APP_DIR = os.path.dirname(sys.executable)
else:
    APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH_DIR = APP_DIR
EXPORTS_DIR = os.path.join(APP_DIR, "exports")
os.makedirs(EXPORTS_DIR, exist_ok=True)

EXCEL_OUTPUT = os.path.join(EXPORTS_DIR, "report_export.xlsx")
UNIVERSAL_EXCEL = os.path.join(EXPORTS_DIR, "universal_export.xlsx")
UNIVERSAL_REPORT_EXCEL = os.path.join(EXPORTS_DIR, "universal_report_export.xlsx")
PORTFOLIO_EXCEL = os.path.join(EXPORTS_DIR, "portfolio_catalog_export.xlsx")
CACHE_DIR = os.path.join(SCRATCH_DIR, "epf_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def print_server_error(source, err, payload=None):
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print("\n" + "=" * 70, flush=True)
    print(f"❌ [1C SERVER XƏTASI] Tarix: {now_str} | Mənbə: {source}", flush=True)
    if payload:
        safe_p = dict(payload) if isinstance(payload, dict) else {"payload": str(payload)}
        for name in safe_p:
            if any(token in str(name).lower() for token in ('password', 'парол', 'pwd')):
                safe_p[name] = "***"
        print(f"📦 Parametrlər: {safe_p}", flush=True)
    print(f"⚠️ Xəta Təsviri: {err}", flush=True)
    print("-" * 70, flush=True)
    traceback.print_exc()
    print("=" * 70 + "\n", flush=True)

_folders_cache = {}

def is_vehicle_group(name):
    """
    Returns True if the nomenclature group name corresponds to a company vehicle,
    truck, fleet maintenance, or internal logistics asset, rather than commercial merchandise.
    """
    if not name:
        return True
    n_lower = name.lower().strip()
    v_keywords = [
        "yük", "yuk", "avto", "maşın", "masin", "qaraj", "garaj", "texnika",
        "hyundai", "isuzu", "mercedes", "mersedes", "kamaz", "gazel", "qazel",
        "sprinter", "vito", "transit", "tranzit", "volvo", "scania", "iveco",
        "shacman", "howo", "toyota", "nissan", "mitsubishi", "atego", "actros",
        "canter", "sonata", "elantra", "accent", "porter", "h-100", "hd-65", "hd-72", "hd-78", "bmw"
    ]
    if any(kw in n_lower for kw in v_keywords):
        return True
    if re.search(r'\b\d{2}\s*[-\s]?[A-Za-z]{2}\s*[-\s]?\d{3}\b', name):
        return True
    return False

def get_folders_map(conn, base_key):
    global _folders_cache
    if base_key in _folders_cache:
        return _folders_cache[base_key]
    try:
        q_f = conn.NewObject("Запрос")
        q_f.Text = """
        ВЫБРАТЬ
            Т.Ссылка КАК Ref,
            Т.Код КАК Code,
            Т.Наименование КАК Name,
            Т.Родитель КАК Parent,
            Т.Родитель.Код КАК ParentCode
        ИЗ
            Справочник.Номенклатура КАК Т
        ГДЕ
            Т.ЭтоГруппа
        """
        res_f = q_f.Execute().Choose()
        fmap = {}
        while res_f.Next():
            r_id = conn.String(res_f.Ref)
            p_id = conn.String(res_f.Parent) if res_f.Parent else ""
            c_code = str(res_f.Code or "").strip()
            p_code = str(res_f.ParentCode or "").strip()
            nm = str(res_f.Name or "").strip()
            fmap[r_id] = (nm, p_id)
            if c_code:
                fmap[c_code] = (nm, p_code)
        _folders_cache[base_key] = fmap
        return fmap
    except Exception as ex_f:
        print("Error caching folders map:", ex_f)
        return {}

def resolve_root_portfolio(p_id, fmap):
    if not p_id or not fmap:
        return "Digər"
    curr = str(p_id).strip()
    last_name = "Digər"
    visited = set()
    while curr and curr in fmap and curr not in visited:
        visited.add(curr)
        name = fmap[curr][0]
        parent_ref = fmap[curr][1]
        last_name = name
        curr = parent_ref
    return last_name

_barcodes_cache = {}

def get_barcodes_map(conn, base_key):
    global _barcodes_cache
    if base_key in _barcodes_cache:
        return _barcodes_cache[base_key]
    try:
        q_b = conn.NewObject("Запрос")
        q_b.Text = """
        ВЫБРАТЬ
            Т.Владелец.Наименование КАК ItemName,
            Т.Штрихкод КАК Barcode,
            Т.ЕдиницаИзмерения.Наименование КАК UnitName,
            Т.ЕдиницаИзмерения.Коэффициент КАК Ratio
        ИЗ
            РегистрСведений.Штрихкоды КАК Т
        ГДЕ
            НЕ Т.Штрихкод ЕСТЬ NULL И Т.Штрихкод <> ""
        """
        res_b = q_b.Execute().Choose()
        b_map = {}
        while res_b.Next():
            iname = str(res_b.ItemName or "").strip()
            bc = str(res_b.Barcode or "").strip()
            uname = str(res_b.UnitName or "").strip().lower()
            ratio = float(res_b.Ratio or 1)
            if not iname or not bc:
                continue
            if iname not in b_map:
                b_map[iname] = {"unit": "", "box": "", "block": ""}

            if "blok" in uname or "блок" in uname or "упак" in uname:
                if not b_map[iname]["block"]:
                    b_map[iname]["block"] = bc
            elif "qutu" in uname or "кор" in uname or "ящ" in uname or ratio > 1:
                if not b_map[iname]["box"]:
                    b_map[iname]["box"] = bc
            else:
                if not b_map[iname]["unit"]:
                    b_map[iname]["unit"] = bc

        _barcodes_cache[base_key] = b_map
        return b_map
    except Exception as e:
        print("get_barcodes_map error:", e)
        return {}

_price_types_cache = {}

def get_all_price_types(conn, base_key):
    global _price_types_cache
    if base_key in _price_types_cache:
        return _price_types_cache[base_key]
    try:
        qp = conn.NewObject("Запрос")
        qp.Text = """
        ВЫБРАТЬ
            Т.Код КАК Code,
            Т.Наименование КАК Name,
            Т.ВалютаЦены.Наименование КАК Currency
        ИЗ
            Справочник.ТипыЦенНоменклатуры КАК Т
        УПОРЯДОЧИТЬ ПО
            Т.Наименование
        """
        resp = qp.Execute().Choose()
        pts = [
            {"code": "20", "name": "20", "desc": "20"},
            {"code": "cost", "name": "Себестоимость", "desc": "Себестоимость"}
        ]
        seen_names = {"20", "себестоимость"}
        while resp.Next():
            p_name = str(resp.Name or "").strip()
            p_code = str(resp.Code or "").strip()
            if not p_name:
                continue
            if p_name.lower() not in seen_names:
                seen_names.add(p_name.lower())
                pts.append({
                    "code": p_code or p_name,
                    "name": p_name,
                    "desc": p_name
                })
        _price_types_cache[base_key] = pts
        return pts
    except Exception as e:
        print("get_all_price_types error:", e)
        return [
            {"code": "20", "name": "20", "desc": "20"},
            {"code": "cost", "name": "Себестоимость", "desc": "Себестоимость"},
            {"code": "60", "name": "60", "desc": "60"},
            {"code": "30", "name": "30", "desc": "30"},
            {"code": "10", "name": "10", "desc": "10"},
            {"code": "100", "name": "100", "desc": "100"},
            {"code": "50", "name": "50", "desc": "50"}
        ]
