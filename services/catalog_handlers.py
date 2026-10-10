# -*- coding: utf-8 -*-
import datetime
from services.user_passwords import list_accounts, change_password
from services.common import (
    get_folders_map,
    resolve_root_portfolio,
    is_vehicle_group,
    get_barcodes_map,
    get_all_price_types,
    print_server_error
)

def handle_get_users(conn, payload, key, resp_q):
    q = conn.NewObject("Запрос")
    q.Text = "ВЫБРАТЬ Т.Наименование КАК Name, Т.Код КАК Code ИЗ Справочник.Пользователи КАК Т ГДЕ НЕ Т.ПометкаУдаления УПОРЯДОЧИТЬ ПО Name"
    res = q.Execute().Choose()
    users_list = []
    while res.Next():
        name = str(res.Name).strip()
        code = str(res.Code).strip()
        if name: users_list.append({"name": name, "code": code})
    resp_q.put((True, users_list))



def handle_get_portfolios(conn, payload, key, resp_q):
    q = conn.NewObject("Запрос")
    q.Text = """
    ВЫБРАТЬ РАЗЛИЧНЫЕ
        Т.Наименование КАК Portfolio
    ИЗ
        Справочник.Портфели КАК Т
    ГДЕ
        НЕ Т.ПометкаУдаления
    УПОРЯДОЧИТЬ ПО
        Portfolio
    """
    res = q.Execute().Choose()
    plist = []
    while res.Next():
        p_str = str(res.Portfolio or "").strip()
        if p_str and p_str not in plist:
            plist.append(p_str)
    resp_q.put((True, sorted(plist)))



def handle_get_agents(conn, payload, key, resp_q):
    q = conn.NewObject("Запрос")
    q.Text = """
    ВЫБРАТЬ РАЗЛИЧНЫЕ
        Договоры.Агент.Наименование КАК AgentName
    ИЗ
        Справочник.ДоговорыКонтрагентов КАК Договоры
    ГДЕ
        НЕ Договоры.Агент ЕСТЬ NULL 
        И Договоры.Агент <> ЗНАЧЕНИЕ(Справочник.ФизическиеЛица.ПустаяСсылка)
    УПОРЯДОЧИТЬ ПО
        AgentName
    """
    res = q.Execute().Choose()
    ag_list = []
    while res.Next():
        ag_name = str(res.AgentName or "").strip()
        if ag_name and ag_name not in ["-", "None"] and ag_name not in ag_list:
            ag_list.append(ag_name)
    resp_q.put((True, sorted(ag_list)))



def handle_search_kontragents(conn, payload, key, resp_q):
    pat = payload.get("query", "").strip()
    q = conn.NewObject("Запрос")
    q.Text = """
    ВЫБРАТЬ ПЕРВЫЕ 25
        Т.Наименование КАК Name,
        Т.Код КАК Code
    ИЗ
        Справочник.Контрагенты КАК Т
    ГДЕ
        НЕ Т.ЭтоГруппа
        И (Т.Наименование ПОДОБНО &Pattern ИЛИ Т.Код ПОДОБНО &Pattern)
    УПОРЯДОЧИТЬ ПО
        Т.Наименование
    """
    q.SetParameter("Pattern", f"%{pat}%")
    res = q.Execute().Choose()
    k_list = []
    while res.Next():
        k_list.append({"name": str(res.Name).strip(), "code": str(res.Code).strip()})
    resp_q.put((True, k_list))



def handle_search_nomenklatura(conn, payload, key, resp_q):
    pat = payload.get("query", "").strip()
    q = conn.NewObject("Запрос")
    q.Text = """
    ВЫБРАТЬ ПЕРВЫЕ 25
        Т.Наименование КАК Name,
        Т.Артикул КАК Artikul,
        Т.Код КАК Code
    ИЗ
        Справочник.Номенклатура КАК Т
    ГДЕ
        НЕ Т.ЭтоГруппа
        И (Т.Наименование ПОДОБНО &Pattern ИЛИ Т.Артикул ПОДОБНО &Pattern ИЛИ Т.Код ПОДОБНО &Pattern)
    УПОРЯДОЧИТЬ ПО
        Т.Наименование
    """
    q.SetParameter("Pattern", f"%{pat}%")
    res = q.Execute().Choose()
    n_list = []
    while res.Next():
        n_list.append({
            "name": str(res.Name).strip(),
            "artikul": str(res.Artikul or "").strip(),
            "code": str(res.Code).strip()
        })
    resp_q.put((True, n_list))



def handle_catalog_data(conn, payload, key, resp_q):
    cat_name = payload.get("catalog", "Номенклатура")
    folder_name = str(payload.get("folder") or "").strip()
    search_q = str(payload.get("search") or "").strip()

    if "портфел" in cat_name.lower():
        q_port = conn.NewObject("Запрос")
        q_port.Text = """
        ВЫБРАТЬ
            Т.Код КАК Code,
            Т.Наименование КАК Name
        ИЗ
            Справочник.Портфели КАК Т
        ГДЕ
            НЕ Т.ПометкаУдаления
        УПОРЯДОЧИТЬ ПО
            Name
        """
        items = []
        try:
            res_port = q_port.Execute().Choose()
            while res_port.Next():
                items.append({
                    "code": str(res_port.Code).strip(),
                    "name": str(res_port.Name).strip(),
                    "artikul": "",
                    "vid_nom": "",
                    "unit": "",
                    "is_folder": False
                })
        except Exception as ep:
            print("Error loading portfolios in catalog_data:", ep)
        resp_q.put((True, {
            "catalog": "Портфели",
            "folders": [],
            "items": items
        }))
        return

    # Map user or field catalog name to real 1C metadata catalog name
    cat_lower = str(cat_name or "").lower().strip()
    ref_cat = "Номенклатура"
    if any(w in cat_lower for w in ["тип цен", "типы цен", "типцен", "типыценноменклатуры", "price_type", "contract_price_type"]):
        ref_cat = "ТипыЦенНоменклатуры"
    elif any(w in cat_lower for w in ["договор", "договоры", "договорыконтрагентов", "contract"]):
        ref_cat = "ДоговорыКонтрагентов"
    elif any(w in cat_lower for w in ["контрагент", "клиент", "müştəri", "kontragent"]):
        ref_cat = "Контрагенты"
    elif any(w in cat_lower for w in ["агент", "agent", "satış nümayəndəsi"]):
        ref_cat = "Агенты"
    elif any(w in cat_lower for w in ["склад", "склады", "anbar", "warehouse"]):
        ref_cat = "Склады"
    elif any(w in cat_lower for w in ["пользовател", "пользователи", "ответственн", "responsible", "user"]):
        ref_cat = "Пользователи"
    elif any(w in cat_lower for w in ["водитель", "водители", "sürücü", "voditel", "pogruzka_voditel"]):
        ref_cat = "Водители"
    elif any(w in cat_lower for w in ["группа", "номенклатурныегруппы"]):
        ref_cat = "НоменклатурныеГруппы"
    elif any(w in cat_lower for w in ["портфел", "портфели", "portfolio"]):
        ref_cat = "Портфели"
    elif any(w in cat_lower for w in ["номенклатур", "məhsul", "tovar", "nomenclature"]):
        ref_cat = "Номенклатура"
    else:
        meta_cat = conn.Метаданные.Справочники.Найти(cat_name)
        if meta_cat:
            ref_cat = str(meta_cat.Имя)
        else:
            ref_cat = "Номенклатура"

    cat_meta = conn.Метаданные.Справочники.Найти(ref_cat)
    is_hier = bool(cat_meta.Иерархический) if cat_meta else False

    folders = []
    items = []
    target_code = None
    target_folder = None
    parent_folder = None

    locate_code = str(payload.get("locate_code") or "").strip()
    locate_name = str(payload.get("locate_name") or "").strip()
    locate_val = str(payload.get("locate_item") or "").strip()

    if is_hier and (locate_code or locate_name or locate_val) and not folder_name:
        try:
            q_loc = conn.NewObject("Запрос")
            where_loc = []
            if locate_code:
                where_loc.append("(Т.Код = &LocCode ИЛИ Т.Код ПОДОБНО &LocCodeLike)")
                q_loc.SetParameter("LocCode", locate_code)
                q_loc.SetParameter("LocCodeLike", f"{locate_code}%")
            if locate_name:
                where_loc.append("(Т.Наименование = &LocName ИЛИ Т.Наименование ПОДОБНО &LocNameLike)")
                q_loc.SetParameter("LocName", locate_name)
                q_loc.SetParameter("LocNameLike", f"{locate_name}%")
            if locate_val and not locate_code and not locate_name:
                where_loc.append("(Т.Код = &LocVal ИЛИ Т.Наименование = &LocVal ИЛИ Т.Код ПОДОБНО &LocLike ИЛИ Т.Наименование ПОДОБНО &LocLike)")
                q_loc.SetParameter("LocVal", locate_val)
                q_loc.SetParameter("LocLike", f"%{locate_val}%")

            if where_loc:
                q_loc.Text = f"""
                ВЫБРАТЬ ПЕРВЫЕ 1
                    Т.Код КАК Code,
                    Т.Наименование КАК Name,
                    ЕСТЬNULL(Т.Родитель.Наименование, "") КАК FolderName,
                    ЕСТЬNULL(Т.Родитель.Родитель.Наименование, "") КАК ParentFolderName
                ИЗ
                    Справочник.{ref_cat} КАК Т
                ГДЕ
                    НЕ Т.ПометкаУдаления
                    И НЕ Т.ЭтоГруппа
                    И ({" ИЛИ ".join(where_loc)})
                """
                res_loc = q_loc.Execute().Choose()
                if res_loc.Next():
                    target_code = str(res_loc.Code).strip()
                    target_folder = str(res_loc.FolderName or "").strip()
                    parent_folder = str(res_loc.ParentFolderName or "").strip()
                    if target_folder:
                        folder_name = target_folder
        except Exception as eloc:
            print(f"Error locating item in catalog {ref_cat}:", eloc)

    if is_hier and folder_name and not parent_folder:
        try:
            q_p = conn.NewObject("Запрос")
            q_p.Text = f"""
            ВЫБРАТЬ ПЕРВЫЕ 1
                ЕСТЬNULL(Т.Родитель.Наименование, "") КАК ParentName
            ИЗ
                Справочник.{ref_cat} КАК Т
            ГДЕ
                Т.ЭтоГруппа
                И НЕ Т.ПометкаУдаления
                И Т.Наименование = &FolderName
            """
            q_p.SetParameter("FolderName", folder_name)
            res_p = q_p.Execute().Choose()
            if res_p.Next():
                parent_folder = str(res_p.ParentName or "").strip()
        except Exception:
            pass

    # 1. Non-hierarchical (Flat) Catalogs (e.g. ТипыЦенНоменклатуры, Portfolios, etc.)
    if not is_hier:
        q_items = conn.NewObject("Запрос")
        where_c = ["НЕ Т.ПометкаУдаления"]
        if search_q:
            where_c.append("(Т.Наименование ПОДОБНО &Search ИЛИ Т.Код ПОДОБНО &Search)")
            q_items.SetParameter("Search", f"%{search_q}%")
        w_sql = "ГДЕ " + " И ".join(where_c)
        q_items.Text = f"""
        ВЫБРАТЬ ПЕРВЫЕ 100
            Т.Код КАК Code,
            Т.Наименование КАК Name
        ИЗ
            Справочник.{ref_cat} КАК Т
        {w_sql}
        УПОРЯДОЧИТЬ ПО
            Name
        """
        try:
            res_i = q_items.Execute().Choose()
            while res_i.Next():
                items.append({
                    "code": str(res_i.Code).strip(),
                    "name": str(res_i.Name).strip(),
                    "artikul": "",
                    "barcode": "",
                    "vid_nom": "",
                    "unit": "",
                    "is_folder": False
                })
        except Exception as ei:
            print(f"Error fetching items for flat catalog {ref_cat}:", ei)

        resp_q.put((True, {
            "catalog": cat_name,
            "folder": "",
            "folders": [],
            "items": items
        }))
        return

    # 2. Hierarchical Catalogs (e.g. Номенклатура, Контрагенты, Склады, Договоры, etc.)
    # 2a. Fetch full folder tree (bütün qovluq iyerarxiyası)
    q_f = conn.NewObject("Запрос")
    q_f.Text = f"""
    ВЫБРАТЬ
        Т.Код КАК Code,
        Т.Наименование КАК Name,
        ЕСТЬNULL(Т.Родитель.Наименование, "") КАК ParentName
    ИЗ
        Справочник.{ref_cat} КАК Т
    ГДЕ
        Т.ЭтоГруппа
        И НЕ Т.ПометкаУдаления
    УПОРЯДОЧИТЬ ПО
        Name
    """

    try:
        res_f = q_f.Execute().Choose()
        while res_f.Next():
            folders.append({
                "code": str(res_f.Code).strip(),
                "name": str(res_f.Name).strip(),
                "parent": str(res_f.ParentName).strip(),
                "is_folder": True
            })
    except Exception as ef:
        # Some catalogs are hierarchical by element (not group)
        pass

    # 2b. Fetch items (elements)
    artikul_sql = "Т.Артикул КАК Artikul," if ref_cat == "Номенклатура" else '"" КАК Artikul,'
    barcode_sql = "ЕСТЬNULL(Ш.Штрихкод, \"\") КАК Barcode," if ref_cat == "Номенклатура" else '"" КАК Barcode,'
    vid_sql = "Т.ВидНоменклатуры.Наименование КАК VidNom," if ref_cat == "Номенклатура" else '"" КАК VidNom,'
    unit_sql = "Т.БазоваяЕдиницаИзмерения.Наименование КАК Unit" if ref_cat == "Номенклатура" else '"" КАК Unit'
    join_barcode = """ЛЕВОЕ СОЕДИНЕНИЕ (
        ВЫБРАТЬ
            Штрихкоды.Владелец КАК Владелец,
            МИНИМУМ(Штрихкоды.Штрихкод) КАК Штрихкод
        ИЗ
            РегистрСведений.Штрихкоды КАК Штрихкоды
        ГДЕ
            НЕ Штрихкоды.Штрихкод ЕСТЬ NULL И Штрихкоды.Штрихкод <> ""
        СГРУППИРОВАТЬ ПО
            Штрихкоды.Владелец
    ) КАК Ш ПО (Ш.Владелец = Т.Ссылка)""" if ref_cat == "Номенклатура" else ""

    folder_sql = """
        ЕСТЬNULL(Т.Родитель.Наименование, "") КАК FolderName,
        ЕСТЬNULL(Т.Родитель.Родитель.Наименование, "") КАК ParentFolderName,
    """ if is_hier else '"" КАК FolderName, "" КАК ParentFolderName,'

    search_field = payload.get("search_field", "all")
    q_items = conn.NewObject("Запрос")
    if search_q:
        if search_field == "artikul" and ref_cat == "Номенклатура":
            where_search = "Т.Артикул ПОДОБНО &Search"
            order_search = "Т.ЭтоГруппа УБЫВ, Т.Артикул, Name"
        elif search_field == "code":
            where_search = "Т.Код ПОДОБНО &Search"
            order_search = "Т.ЭтоГруппа УБЫВ, Т.Код, Name"
        elif search_field == "barcode" and ref_cat == "Номенклатура":
            where_search = "Ш.Штрихкод ПОДОБНО &Search"
            order_search = "Т.ЭтоГруппа УБЫВ, Ш.Штрихкод, Name"
        elif search_field == "name":
            where_search = "Т.Наименование ПОДОБНО &Search"
            order_search = "Т.ЭтоГруппа УБЫВ, Name"
        else:
            artikul_cond = "ИЛИ Т.Артикул ПОДОБНО &Search ИЛИ Ш.Штрихкод ПОДОБНО &Search" if ref_cat == "Номенклатура" else ""
            where_search = f"(Т.Наименование ПОДОБНО &Search ИЛИ Т.Код ПОДОБНО &Search {artikul_cond})"
            order_search = "Т.ЭтоГруппа УБЫВ, Name"

        q_items.Text = f"""
        ВЫБРАТЬ ПЕРВЫЕ 100
            Т.Код КАК Code,
            Т.Наименование КАК Name,
            {artikul_sql}
            {barcode_sql}
            {vid_sql}
            {unit_sql},
            {folder_sql}
            Т.ЭтоГруппа КАК IsFolder
        ИЗ
            Справочник.{ref_cat} КАК Т
            {join_barcode}
        ГДЕ
            НЕ Т.ПометкаУдаления
            И НЕ Т.ЭтоГруппа
            И {where_search}
        УПОРЯДОЧИТЬ ПО
            {order_search}
        """
        q_items.SetParameter("Search", f"%{search_q}%")
    elif folder_name:
        q_items.Text = f"""
        ВЫБРАТЬ ПЕРВЫЕ 500
            Т.Код КАК Code,
            Т.Наименование КАК Name,
            {artikul_sql}
            {barcode_sql}
            {vid_sql}
            {unit_sql},
            {folder_sql}
            Т.ЭтоГруппа КАК IsFolder
        ИЗ
            Справочник.{ref_cat} КАК Т
            {join_barcode}
        ГДЕ
            НЕ Т.ПометкаУдаления
            И Т.Родитель.Наименование = &Parent
        УПОРЯДОЧИТЬ ПО
            Т.ЭтоГруппа УБЫВ,
            Name
        """
        q_items.SetParameter("Parent", folder_name)
    else:
        q_items.Text = f"""
        ВЫБРАТЬ ПЕРВЫЕ 500
            Т.Код КАК Code,
            Т.Наименование КАК Name,
            {artikul_sql}
            {barcode_sql}
            {vid_sql}
            {unit_sql},
            {folder_sql}
            Т.ЭтоГруппа КАК IsFolder
        ИЗ
            Справочник.{ref_cat} КАК Т
            {join_barcode}
        ГДЕ
            НЕ Т.ПометкаУдаления
            И (Т.Родитель ЕСТЬ NULL ИЛИ Т.Родитель = ЗНАЧЕНИЕ(Справочник.{ref_cat}.ПустаяСсылка))
        УПОРЯДОЧИТЬ ПО
            Т.ЭтоГруппа УБЫВ,
            Name
        """

    try:
        res_i = q_items.Execute().Choose()
        while res_i.Next():
            f_name = ""
            p_f_name = ""
            if is_hier:
                try:
                    f_name = str(res_i.FolderName or "").strip()
                except Exception:
                    f_name = str(getattr(res_i, "FolderName", "") or "").strip()

                try:
                    p_f_name = str(res_i.ParentFolderName or "").strip()
                except Exception:
                    p_f_name = str(getattr(res_i, "ParentFolderName", "") or "").strip()

            items.append({
                "code": str(res_i.Code).strip(),
                "name": str(res_i.Name).strip(),
                "artikul": str(res_i.Artikul).strip() if ref_cat == "Номенклатура" else "",
                "barcode": str(res_i.Barcode).strip() if ref_cat == "Номенклатура" else "",
                "vid_nom": str(res_i.VidNom).strip() if ref_cat == "Номенклатура" else "",
                "unit": str(res_i.Unit).strip() if ref_cat == "Номенклатура" else "",
                "folder": f_name,
                "parent_folder": p_f_name,
                "is_folder": bool(res_i.IsFolder)
            })
    except Exception as ei:
        print("Error fetching items:", ei)

    # Axtarış zamanı tapılan ilk elementin qovluğunu seçilən qovluq təyin edirik
    if search_q and items and not target_folder:
        for it in items:
            if it.get("folder"):
                target_folder = it["folder"]
                parent_folder = it.get("parent_folder", "")
                target_code = it.get("code", "")
                folder_name = target_folder
                break

    # Ensure target_code is included in items if located but beyond pagination limit
    if target_code and not any(it.get("code") == target_code for it in items):
        try:
            q_force = conn.NewObject("Запрос")
            q_force.SetParameter("TCode", target_code)
            q_force.Text = f"""
            ВЫБРАТЬ ПЕРВЫЕ 1
                Т.Код КАК Code,
                Т.Наименование КАК Name,
                {artikul_sql}
                {barcode_sql}
                {vid_sql}
                {unit_sql},
                Т.ЭтоГруппа КАК IsFolder
            ИЗ
                Справочник.{ref_cat} КАК Т
                {join_barcode}
            ГДЕ
                Т.Код = &TCode
            """
            res_force = q_force.Execute().Choose()
            if res_force.Next():
                items.append({
                    "code": str(res_force.Code).strip(),
                    "name": str(res_force.Name).strip(),
                    "artikul": str(res_force.Artikul).strip() if ref_cat == "Номенклатура" else "",
                    "barcode": str(res_force.Barcode).strip() if ref_cat == "Номенклатура" else "",
                    "vid_nom": str(res_force.VidNom).strip() if ref_cat == "Номенклатура" else "",
                    "unit": str(res_force.Unit).strip() if ref_cat == "Номенклатура" else "",
                    "is_folder": bool(res_force.IsFolder)
                })
        except Exception as e_f:
            print("Notice: Error force-fetching target item:", e_f)

    resp_q.put((True, {
        "catalog": cat_name,
        "folder": folder_name,
        "parent_folder": parent_folder,
        "folders": folders,
        "items": items,
        "target_code": target_code,
        "target_folder": target_folder
    }))



def handle_get_reports(conn, payload, key, resp_q):
    q = conn.NewObject("Запрос")
    q.Text = """
    ВЫБРАТЬ РАЗЛИЧНЫЕ
        Т.Ссылка.Наименование КАК SettingName,
        Т.Ссылка.НастраиваемыйОбъект КАК ObjectName,
        Т.Ссылка.Описание КАК Description
    ИЗ
        Справочник.СохраненныеНастройки.Пользователи КАК Т
    ГДЕ
        (Т.Пользователь.Наименование ПОДОБНО &UserPattern
         ИЛИ Т.Пользователь.Код ПОДОБНО &UserPattern)
        И НЕ Т.Ссылка.Наименование ПОДОБНО "Настройки формы%"
    УПОРЯДОЧИТЬ ПО
        SettingName
    """
    user = payload.get("_resolved_user") or payload.get("user") or "Nesib"
    q.SetParameter("UserPattern", f"%{user}%")
    res = q.Execute().Choose()

    rep_list = []
    while res.Next():
        s_name = str(res.SettingName).strip()
        o_name = str(res.ObjectName).strip()
        d_name = str(res.Description or "").strip()
        if s_name:
            rep_list.append({
                "setting_name": s_name,
                "object_name": o_name,
                "description": d_name
            })

    # Also fetch warehouse reports
    q_wh = conn.NewObject("Запрос")
    q_wh.Text = """
    ВЫБРАТЬ РАЗЛИЧНЫЕ
        Т.Ссылка.Наименование КАК SettingName,
        Т.Ссылка.НастраиваемыйОбъект КАК ObjectName,
        Т.Ссылка.Описание КАК Description
    ИЗ
        Справочник.СохраненныеНастройки КАК Т
    ГДЕ
        (Т.Ссылка.Наименование ПОДОБНО "%склад%" 
         ИЛИ Т.Ссылка.Наименование ПОДОБНО "%товар%"
         ИЛИ Т.Ссылка.Наименование ПОДОБНО "%остат%"
         ИЛИ Т.Ссылка.Наименование ПОДОБНО "%anbar%")
        И НЕ Т.Ссылка.Наименование ПОДОБНО "Настройки формы%"
    УПОРЯДОЧИТЬ ПО
        SettingName
    """
    res_wh = q_wh.Execute().Choose()
    wh_list = []
    while res_wh.Next():
        s_name = str(res_wh.SettingName).strip()
        o_name = str(res_wh.ObjectName).strip()
        d_name = str(res_wh.Description or "").strip()
        if s_name and not any(r["setting_name"] == s_name for r in rep_list):
            wh_list.append({
                "setting_name": s_name,
                "object_name": o_name,
                "description": d_name
            })

    direct_calc_rep = {
        "setting_name": "⚡ Canlı Realizator Hesabatı (Müstəqil Hesablama)",
        "object_name": "Müstəqil Birbaşa Reyestr Hesablaması",
        "description": "Reyestrlərdən (Взаиморасчеты və Продажи) birbaşa canlı çıxarış. 0.05 saniyə icra!",
        "is_direct": True
    }

    resp_q.put((True, {
        "user_reports": [direct_calc_rep] + rep_list,
        "warehouse_reports": wh_list
    }))



def handle_get_price_types(conn, payload, key, resp_q):
    pts = get_all_price_types(conn, key)
    resp_q.put((True, {"price_types": pts}))


def handle_get_portfolio_catalog_filters(conn, payload, key, resp_q):
    root_portfolios = set()
    try:
        q_rf = conn.NewObject("Запрос")
        q_rf.Text = """
        ВЫБРАТЬ
            Т.Наименование КАК Name
        ИЗ
            Справочник.Номенклатура КАК Т
        ГДЕ
            Т.ЭтоГруппа
            И НЕ Т.ПометкаУдаления
            И (Т.Родитель ЕСТЬ NULL ИЛИ Т.Родитель = ЗНАЧЕНИЕ(Справочник.Номенклатура.ПустаяСсылка))
        УПОРЯДОЧИТЬ ПО
            Name
        """
        r_rf = q_rf.Execute().Choose()
        while r_rf.Next():
            nm = str(r_rf.Name or "").strip()
            if nm and not nm.startswith("!"):
                root_portfolios.add(nm)
    except Exception as e_rf:
        print("Error fetching root portfolio folders:", e_rf)

    try:
        q_p = conn.NewObject("Запрос")
        q_p.Text = """
        ВЫБРАТЬ
            Т.Наименование КАК Name
        ИЗ
            Справочник.Портфели КАК Т
        ГДЕ
            НЕ Т.ПометкаУдаления
        УПОРЯДОЧИТЬ ПО
            Name
        """
        r_p = q_p.Execute().Choose()
        while r_p.Next():
            nm = str(r_p.Name or "").strip()
            if nm and not nm.startswith("!"):
                root_portfolios.add(nm)
    except Exception:
        pass

    # Query groups assigned to actual commercial goods with parent folder code
    q_ng = conn.NewObject("Запрос")
    q_ng.Text = """
    ВЫБРАТЬ РАЗЛИЧНЫЕ
        Т.Родитель.Код КАК ParentCode,
        Т.НоменклатурнаяГруппа.Наименование КАК Name
    ИЗ
        Справочник.Номенклатура КАК Т
    ГДЕ
        НЕ Т.ЭтоГруппа
        И НЕ Т.ПометкаУдаления
        И Т.НоменклатурнаяГруппа ЕСТЬ НЕ NULL
        И Т.НоменклатурнаяГруппа <> ЗНАЧЕНИЕ(Справочник.НоменклатурныеГруппы.ПустаяСсылка)
    УПОРЯДОЧИТЬ ПО
        Name
    """
    r_ng = q_ng.Execute().Choose()
    fmap = get_folders_map(conn, key)
    nom_groups = set()
    portfolio_groups_map = {}
    while r_ng.Next():
        g_name = str(r_ng.Name or "").strip()
        if not g_name or is_vehicle_group(g_name):
            continue
        nom_groups.add(g_name)
        p_code = str(r_ng.ParentCode or "").strip()
        port = resolve_root_portfolio(p_code, fmap)
        if port and not port.startswith("!"):
            if port not in portfolio_groups_map:
                portfolio_groups_map[port] = set()
            portfolio_groups_map[port].add(g_name)

    portfolio_groups = {p: sorted(list(grps)) for p, grps in sorted(portfolio_groups_map.items())}
    pts = get_all_price_types(conn, key)

    resp_q.put((True, {
        "portfolios": sorted(list(root_portfolios)),
        "nom_groups": sorted(list(nom_groups)),
        "portfolio_groups": portfolio_groups,
        "price_types": pts
    }))


def handle_get_portfolio_catalog_items(conn, payload, key, resp_q):
    fmap = get_folders_map(conn, key)

    # Multiple or single portfolios
    raw_ports = payload.get("portfolios")
    if isinstance(raw_ports, list):
        selected_portfolios = [str(p).strip() for p in raw_ports if str(p).strip() and str(p) != "(Все портфели)"]
    elif payload.get("portfolio"):
        single_p = str(payload.get("portfolio")).strip()
        selected_portfolios = [single_p] if single_p and single_p != "(Все портфели)" else []
    else:
        selected_portfolios = []

    # Multiple or single nom groups
    raw_groups = payload.get("nom_groups")
    if isinstance(raw_groups, list):
        selected_nom_groups = [str(g).strip() for g in raw_groups if str(g).strip() and str(g) != "(Все группы)"]
    elif payload.get("nom_group"):
        single_g = str(payload.get("nom_group")).strip()
        selected_nom_groups = [single_g] if single_g and single_g != "(Все группы)" else []
    else:
        selected_nom_groups = []

    search_txt = str(payload.get("search") or "").strip().lower()

    # Handle 1 or more price types
    raw_pts = payload.get("price_types")
    if not raw_pts or not isinstance(raw_pts, list):
        single_pt = str(payload.get("price_type") or "20").strip()
        raw_pts = [single_pt] if single_pt else []

    selected_price_types = []
    for pt in raw_pts:
        pt_s = str(pt).strip()
        if pt_s and pt_s not in selected_price_types and pt_s.lower() != "none" and pt_s != "(Без цен)":
            selected_price_types.append(pt_s)

    where_clauses = ["НЕ Т.ЭтоГруппа", "НЕ Т.ПометкаУдаления"]
    port_folders_obj = None

    if len(selected_portfolios) == 1:
        try:
            p_find = conn.Справочники.Номенклатура.НайтиПоНаименованию(selected_portfolios[0], True)
            if p_find and not p_find.Пустая():
                port_folders_obj = p_find
                where_clauses.append("Т.Ссылка В ИЕРАРХИИ (&PortFolder)")
        except Exception as e_fnd:
            print(f"⚠️ [PortFolder lookup fallback]: {e_fnd}", flush=True)
            port_folders_obj = None
    elif len(selected_portfolios) > 1:
        try:
            p_list = conn.NewObject("СписокЗначений")
            for p_name in selected_portfolios:
                p_find = conn.Справочники.Номенклатура.НайтиПоНаименованию(p_name, True)
                if p_find and not p_find.Пустая():
                    p_list.Добавить(p_find)
            if p_list.Количество() > 0:
                port_folders_obj = p_list
                where_clauses.append("Т.Ссылка В ИЕРАРХИИ (&PortFolder)")
        except Exception as e_fnd:
            print(f"⚠️ [Multi PortFolder lookup fallback]: {e_fnd}", flush=True)
            port_folders_obj = None

    if len(selected_nom_groups) == 1:
        where_clauses.append("Т.НоменклатурнаяГруппа.Наименование = &NomGroupName")
    elif len(selected_nom_groups) > 1:
        where_clauses.append("Т.НоменклатурнаяГруппа.Наименование В (&NomGroupNames)")

    # Multi-Price SQL Construction
    price_select_parts = []
    price_join_parts = []
    price_params = {}
    for p_i, pt in enumerate(selected_price_types):
        price_select_parts.append(f"ЕСТЬNULL(Цены_{p_i}.Цена, 0) КАК Price_{p_i}")
        price_join_parts.append(f"""
        ЛЕВОЕ СОЕДИНЕНИЕ РегистрСведений.ЦеныНоменклатуры.СрезПоследних(
            &CurrentDate, 
            ТипЦен.Код = &PriceType_{p_i} ИЛИ ТипЦен.Наименование = &PriceType_{p_i}
        ) КАК Цены_{p_i}
            ПО Т.Ссылка = Цены_{p_i}.Номенклатура
        """)
        price_params[f"PriceType_{p_i}"] = pt

    price_select_sql = (", " + ", ".join(price_select_parts)) if price_select_parts else ""
    price_join_sql = "\n".join(price_join_parts)

    # Barcode join with single barcode per item to prevent row explosion
    barcode_join = """
    ЛЕВОЕ СОЕДИНЕНИЕ (
        ВЫБРАТЬ
            Ш.Владелец КАК ItemRef,
            МИНИМУМ(Ш.Штрихкод) КАК Barcode
        ИЗ
            РегистрСведений.Штрихкоды КАК Ш
        СГРУППИРОВАТЬ ПО
            Ш.Владелец
    ) КАК Ш
        ПО Т.Ссылка = Ш.ItemRef
    """

    q = conn.NewObject("Запрос")
    q.Text = f"""
    ВЫБРАТЬ
        Т.Код КАК Code,
        Т.Артикул КАК Artikul,
        Т.СВкод КАК CVCode,
        Т.Наименование КАК Name,
        Т.НаименованиеПолное КАК FullName,
        Т.Родитель.Код КАК ParentCode,
        Т.Родитель.Наименование КАК FolderName,
        Т.НоменклатурнаяГруппа.Наименование КАК NomGroup,
        Т.ВидНоменклатуры.Наименование КАК ItemType,
        Т.БазоваяЕдиницаИзмерения.Наименование КАК BaseUnit,
        Т.Производитель.Наименование КАК Manufacturer,
        Т.Комментарий КАК Comment,
        ЕСТЬNULL(Ш.Barcode, "") КАК Barcode
        {price_select_sql}
    ИЗ
        Справочник.Номенклатура КАК Т
        {barcode_join}
        {price_join_sql}
    ГДЕ
        {" И ".join(where_clauses)}
    УПОРЯДОЧИТЬ ПО
        Т.НоменклатурнаяГруппа.Наименование,
        Т.Наименование
    """

    if port_folders_obj:
        q.SetParameter("PortFolder", port_folders_obj)
    if selected_price_types:
        q.SetParameter("CurrentDate", datetime.datetime.now())
        for p_k, p_v in price_params.items():
            q.SetParameter(p_k, p_v)
    if len(selected_nom_groups) == 1:
        q.SetParameter("NomGroupName", selected_nom_groups[0])
    elif len(selected_nom_groups) > 1:
        g_list = conn.NewObject("СписокЗначений")
        for g in selected_nom_groups:
            g_list.Добавить(g)
        q.SetParameter("NomGroupNames", g_list)

    try:
        res = q.Execute().Choose()
    except Exception as eq:
        if port_folders_obj and "PortFolder" in str(eq):
            print("⚠️ [1C QUERY RETRY] Hierarchy parameter error, retrying without SQL hierarchy filter...", flush=True)
            clean_clauses = [c for c in where_clauses if "PortFolder" not in c]
            q.Text = f"""
            ВЫБРАТЬ
                Т.Код КАК Code,
                Т.Артикул КАК Artikul,
                Т.СВкод КАК CVCode,
                Т.Наименование КАК Name,
                Т.НаименованиеПолное КАК FullName,
                Т.Родитель.Код КАК ParentCode,
                Т.Родитель.Наименование КАК FolderName,
                Т.НоменклатурнаяГруппа.Наименование КАК NomGroup,
                Т.ВидНоменклатуры.Наименование КАК ItemType,
                Т.БазоваяЕдиницаИзмерения.Наименование КАК BaseUnit,
                Т.Производитель.Наименование КАК Manufacturer,
                Т.Комментарий КАК Comment,
                ЕСТЬNULL(Ш.Barcode, "") КАК Barcode
                {price_select_sql}
            ИЗ
                Справочник.Номенклатура КАК Т
                {barcode_join}
                {price_join_sql}
            ГДЕ
                {" И ".join(clean_clauses)}
            УПОРЯДОЧИТЬ ПО
                Т.НоменклатурнаяГруппа.Наименование,
                Т.Наименование
            """
            port_folders_obj = None
            res = q.Execute().Choose()
        else:
            raise eq

    items = []
    while res.Next():
        p_code = str(res.ParentCode or "").strip()
        root_port = resolve_root_portfolio(p_code, fmap)

        if selected_portfolios and not any(root_port.lower() == sp.lower() for sp in selected_portfolios):
            continue

        group = str(res.NomGroup or "").strip()
        if selected_nom_groups and group not in selected_nom_groups:
            continue

        name = str(res.Name or "").strip()
        code = str(res.Code or "").strip()
        artikul = str(res.Artikul or "").strip()
        cv_code = str(res.CVCode or "").strip()
        folder = str(res.FolderName or "").strip()
        group = str(res.NomGroup or "").strip()
        item_type = str(res.ItemType or "").strip()
        unit = str(res.BaseUnit or "").strip()
        manuf = str(res.Manufacturer or "").strip()
        comment = str(getattr(res, "Comment", "") or "").strip()
        bc = str(res.Barcode or "").strip()

        if search_txt:
            match_src = f"{name} {code} {artikul} {cv_code} {bc} {folder} {group} {root_port} {manuf} {comment}".lower()
            if search_txt not in match_src:
                continue

        row_prices = {}
        for p_i, pt in enumerate(selected_price_types):
            row_prices[pt] = float(getattr(res, f"Price_{p_i}", 0) or 0)

        items.append({
            "code": code,
            "artikul": artikul,
            "cv": cv_code,
            "barcode": bc,
            "name": name,
            "folder": folder,
            "group": group,
            "portfolio": root_port or (selected_portfolios[0] if selected_portfolios else ""),
            "type": item_type,
            "unit": unit,
            "price": row_prices.get(selected_price_types[0], 0.0) if selected_price_types else 0.0,
            "prices": row_prices,
            "manufacturer": manuf,
            "comment": comment
        })

    resp_q.put((True, {
        "items": items,
        "price_types": selected_price_types,
        "total": len(items)
    }))



def handle_get_nomenclature_stock(conn, payload, key, resp_q):
    code = str(payload.get("code") or "").strip()
    name = str(payload.get("name") or "").strip()

    if not code and not name:
        resp_q.put((True, {
            "code": "",
            "name": "",
            "unit": "əd",
            "warehouses": [],
            "prices": []
        }))
        return

    try:
        # Step 1: Find item reference
        q_nom = conn.NewObject("Запрос")
        where_n = []
        if code:
            where_n.append("Т.Код = &Code")
            q_nom.SetParameter("Code", code)
        if name and not code:
            where_n.append("Т.Наименование = &Name")
            q_nom.SetParameter("Name", name)

        q_nom.Text = f"""
        ВЫБРАТЬ ПЕРВЫЕ 1
            Т.Ссылка КАК Ref,
            Т.Код КАК Code,
            Т.Наименование КАК Name,
            Т.БазоваяЕдиницаИзмерения.Наименование КАК Unit
        ИЗ
            Справочник.Номенклатура КАК Т
        ГДЕ
            НЕ Т.ПометкаУдаления
            И ({' ИЛИ '.join(where_n)})
        """
        res_n = q_nom.Execute().Choose()
        if not res_n.Next():
            resp_q.put((True, {
                "code": code,
                "name": name,
                "unit": "əd",
                "warehouses": [],
                "prices": []
            }))
            return

        nom_ref = res_n.Ref
        item_code = str(res_n.Code or "").strip()
        item_name = str(res_n.Name or "").strip()
        item_unit = str(res_n.Unit or "əd").strip()

        # Step 2: Query Total Stock by Warehouse
        q_stock = conn.NewObject("Запрос")
        q_stock.SetParameter("NomRef", nom_ref)
        q_stock.Text = """
        ВЫБРАТЬ
            Т.Склад.Наименование КАК Warehouse,
            Т.Склад.Код КАК WarehouseCode,
            Т.ХарактеристикаНоменклатуры.Наименование КАК Characteristic,
            Т.КоличествоОстаток КАК TotalStock
        ИЗ
            РегистрНакопления.ТоварыНаСкладах.Остатки(, Номенклатура = &NomRef) КАК Т
        УПОРЯДОЧИТЬ ПО
            Warehouse
        """
        res_s = q_stock.Execute().Choose()
        warehouses = []
        while res_s.Next():
            tot = float(res_s.TotalStock or 0)
            warehouses.append({
                "warehouse": str(res_s.Warehouse or "").strip(),
                "warehouse_code": str(res_s.WarehouseCode or "").strip(),
                "characteristic": str(res_s.Characteristic or "").strip(),
                "total_stock": tot,
                "reserve_stock": 0.0,
                "free_stock": tot
            })

        # Step 3: Query Reserve Stock
        try:
            q_res = conn.NewObject("Запрос")
            q_res.SetParameter("NomRef", nom_ref)
            q_res.Text = """
            ВЫБРАТЬ
                Т.Склад.Наименование КАК Warehouse,
                Т.КоличествоОстаток КАК ReserveStock
            ИЗ
                РегистрНакопления.ТоварыВРезервеНаСкладах.Остатки(, Номенклатура = &NomRef) КАК Т
            """
            res_r = q_res.Execute().Choose()
            reserve_map = {}
            while res_r.Next():
                w = str(res_r.Warehouse or "").strip()
                reserve_map[w] = float(res_r.ReserveStock or 0)

            for w_item in warehouses:
                w_name = w_item["warehouse"]
                r_qty = reserve_map.get(w_name, 0.0)
                w_item["reserve_stock"] = r_qty
                w_item["free_stock"] = max(0.0, w_item["total_stock"] - r_qty)
        except Exception as e_res:
            print("Notice: Error querying ТоварыВРезервеНаСкладах:", e_res)

        # Step 4: Query Prices
        prices = []
        try:
            q_p = conn.NewObject("Запрос")
            q_p.SetParameter("NomRef", nom_ref)
            q_p.Text = """
            ВЫБРАТЬ
                Т.ТипЦен.Наименование КАК PriceType,
                Т.ТипЦен.Код КАК PriceTypeCode,
                Т.Цена КАК Price,
                Т.Валюта.Наименование КАК Currency
            ИЗ
                РегистрСведений.ЦеныНоменклатуры.СрезПоследних(, Номенклатура = &NomRef) КАК Т
            УПОРЯДОЧИТЬ ПО
                PriceType
            """
            res_p = q_p.Execute().Choose()
            while res_p.Next():
                prices.append({
                    "price_type": str(res_p.PriceType or "").strip(),
                    "price_type_code": str(res_p.PriceTypeCode or "").strip(),
                    "price": float(res_p.Price or 0),
                    "currency": str(res_p.Currency or "AZN").strip()
                })
        except Exception as e_price:
            print("Notice: Error querying ЦеныНоменклатуры:", e_price)

        resp_q.put((True, {
            "code": item_code,
            "name": item_name,
            "unit": item_unit,
            "warehouses": warehouses,
            "prices": prices
        }))
    except Exception as e:
        print("Error in handle_get_nomenclature_stock:", e)
        resp_q.put((False, str(e)))



def handle_catalog_card(conn, payload, key, resp_q):
    catalog = str(payload.get("catalog") or "")
    if catalog in ("Agent", "agent"):
        catalog = "Агенты"
    allowed = {"Контрагенты", "Склады", "ДоговорыКонтрагентов", "ТипыЦенНоменклатуры",
               "Пользователи", "Портфели", "Водители", "Номенклатура", "ФизическиеЛица", "Агенты"}
    if catalog not in allowed:
        raise ValueError("Справочник не поддерживается")
    code = str(payload.get("code") or "").strip()
    name = str(payload.get("name") or "").strip()
    if not code and not name:
        raise ValueError("Выберите элемент справочника")
    query = conn.NewObject("Запрос")
    query.SetParameter("Value", code or name)
    field = "Код" if code else "Наименование"
    query.Text = f"ВЫБРАТЬ ПЕРВЫЕ 2 Т.Ссылка КАК Ref ИЗ Справочник.{catalog} КАК Т ГДЕ Т.{field} = &Value"
    rows = query.Execute().Choose()
    if not rows.Next():
        raise ValueError("Элемент не найден. Выберите его кнопкой «…»")
    reference = rows.Ref
    if rows.Next():
        raise ValueError("Найдено несколько элементов. Выберите нужный кнопкой «…»")
    obj = reference.GetObject()
    fields = [{"label": "Код", "value": str(obj.Код)}, {"label": "Наименование", "value": str(obj.Наименование)}]
    metadata = getattr(conn.Метаданные.Справочники, catalog)
    for attribute in metadata.Реквизиты:
        attribute_name = str(attribute.Имя)
        if any(token in attribute_name.lower() for token in ("парол", "password", "token", "секрет")):
            continue
        try:
            value = getattr(obj, attribute_name)
            fields.append({"label": str(attribute.Синоним or attribute_name), "value": "" if value is None else str(conn.String(value))})
        except Exception:
            continue
    resp_q.put((True, {"code": str(obj.Код), "name": str(obj.Наименование), "fields": fields}))


CATALOG_HANDLERS = {
    "user_accounts": list_accounts,
    "change_user_password": change_password,
    "catalog_card": handle_catalog_card,
    "get_users": handle_get_users,
    "get_portfolios": handle_get_portfolios,
    "get_agents": handle_get_agents,
    "search_kontragents": handle_search_kontragents,
    "search_nomenklatura": handle_search_nomenklatura,
    "catalog_data": handle_catalog_data,
    "get_reports": handle_get_reports,
    "get_price_types": handle_get_price_types,
    "get_portfolio_catalog_filters": handle_get_portfolio_catalog_filters,
    "get_portfolio_catalog_items": handle_get_portfolio_catalog_items,
    "get_nomenclature_stock": handle_get_nomenclature_stock,
}
