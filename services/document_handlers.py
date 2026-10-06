# -*- coding: utf-8 -*-
from services.common import get_barcodes_map
import datetime
import re
from services.common import print_server_error, get_all_price_types

def format_1c_datetime(raw_date):
    if not raw_date:
        return ""
    if hasattr(raw_date, "strftime"):
        try:
            return raw_date.strftime("%d.%m.%Y %H:%M:%S")
        except Exception:
            pass
    s = str(raw_date).strip()
    m_iso = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2}):(\d{1,2}))?", s)
    if m_iso:
        y, mo, d, hh, mm, ss = m_iso.groups()
        return f"{int(d):02d}.{int(mo):02d}.{int(y):04d} {int(hh or 0):02d}:{int(mm or 0):02d}:{int(ss or 0):02d}"
    m_dot = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?", s)
    if m_dot:
        d, mo, y, hh, mm, ss = m_dot.groups()
        return f"{int(d):02d}.{int(mo):02d}.{int(y):04d} {int(hh or 0):02d}:{int(mm or 0):02d}:{int(ss or 0):02d}"
    return s[:19]

def parse_query_datetime(val, is_end=False):
    if not val:
        return None
    if isinstance(val, datetime.datetime):
        return val
    val = str(val).strip().replace("T", " ")
    parts = val.split(" ")
    d_part = parts[0]
    t_part = parts[1] if len(parts) > 1 else ""

    if "." in d_part:
        d, m, y = map(int, d_part.split(".")[:3])
    elif "-" in d_part:
        y, m, d = map(int, d_part.split("-")[:3])
    else:
        return None

    if t_part:
        t_splits = t_part.split(":")
        hh = int(t_splits[0]) if len(t_splits) > 0 else (23 if is_end else 0)
        mm = int(t_splits[1]) if len(t_splits) > 1 else (59 if is_end else 0)
        ss = int(t_splits[2]) if len(t_splits) > 2 else (59 if is_end else 0)
    else:
        hh = 23 if is_end else 0
        mm = 59 if is_end else 0
        ss = 59 if is_end else 0

    return datetime.datetime(y, m, d, hh, mm, ss)

def handle_get_documents_list(conn, payload, key, resp_q):
    doc_type = payload.get("doc_type") or "УстановкаЦенНоменклатуры"
    date_from = payload.get("date_from", "").strip()
    date_to = payload.get("date_to", "").strip()
    search_str = payload.get("search", "").strip()
    offset = int(payload.get("offset", 0))
    limit_count = int(payload.get("limit", 0))

    doc_meta = conn.Метаданные.Документы.Найти(doc_type)
    if not doc_meta:
        raise ValueError(f"1C sənədi '{doc_type}' konfiqurasiyada tapılmadı")

    doc_synonym = str(doc_meta.Синоним or doc_type)
    req_names = set(str(r.Имя) for r in doc_meta.Реквизиты)
    has_kontr = "Контрагент" in req_names
    has_sum = "СуммаДокумента" in req_names
    has_sklad = "Склад" in req_names
    has_resp = "Ответственный" in req_names
    has_comm = "Комментарий" in req_names
    has_deal = "Сделка" in req_names
    has_contract = "ДоговорКонтрагента" in req_names
    has_agent = "Агент" in req_names
    has_info = "Информация" in req_names
    tab_names = set(str(t.Имя) for t in doc_meta.ТабличныеЧасти)
    has_tovary = "Товары" in tab_names
    has_nom_filter = False

    is_realization = (doc_type == "РеализацияТоваровУслуг")

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
        columns.append({"key": "kontragent", "label": "Контрагент", "width": 240, "align": "left"})
        if is_realization:
            sel_parts.append("Т.Контрагент.Код КАК KontragentCode")
            columns.append({"key": "kontragent_code", "label": "Код контрагента", "width": 115, "align": "left"})

    if has_agent:
        sel_parts.append("Т.Агент.Наименование КАК Agent")
        columns.append({"key": "agent", "label": "Агент", "width": 160, "align": "left"})

    if has_sum:
        sel_parts.append("Т.СуммаДокумента КАК Amount")
        columns.append({"key": "amount", "label": "Сумма", "width": 100, "align": "right"})

    if has_sklad:
        sel_parts.append("Т.Склад.Наименование КАК Warehouse")
        columns.append({"key": "warehouse", "label": "Склад", "width": 160, "align": "left"})

    if has_deal:
        sel_parts.append("Т.Сделка.Номер КАК Deal")
        deal_lbl = "Номер заказа" if is_realization else "Сделка"
        columns.append({"key": "deal", "label": deal_lbl, "width": 120, "align": "left"})

    if is_realization:
        sel_parts.append("ЕСТЬNULL(ОбрВложенный.Номер, \"\") КАК ObrabotkaNumber")
        columns.append({"key": "obrabotka_number", "label": "Номер обработки", "width": 125, "align": "left"})
        sel_parts.append("ЕСТЬNULL(ПРЕДСТАВЛЕНИЕ(ВМС.СтатусВМС), \"\") КАК StatusVMS")
        columns.append({"key": "vms_status", "label": "Статус ВМС", "width": 135, "align": "left"})

    if has_contract:
        sel_parts.append("Т.ДоговорКонтрагента.Наименование КАК Contract")
        columns.append({"key": "contract", "label": "Договор", "width": 150, "align": "left"})
        sel_parts.append("ПРЕДСТАВЛЕНИЕ(Т.ДоговорКонтрагента.Портфель) КАК Portfolio")
        columns.append({"key": "portfolio", "label": "Портфель", "width": 140, "align": "left"})
        if is_realization:
            sel_parts.append("Т.ДоговорКонтрагента.ТипЦен.Наименование КАК ContractPriceType")
            columns.append({"key": "contract_price_type", "label": "Тип цен договора", "width": 130, "align": "left"})

    if is_realization:
        sel_parts.append("ПогрузкаВложенный.Маршрут КАК PogruzkaMarshrut")
        columns.append({"key": "pogruzka_marshrut", "label": "Пагрузка маршрут", "width": 130, "align": "left"})
        sel_parts.append("ПРЕДСТАВЛЕНИЕ(ПогрузкаВложенный.Водитель) КАК PogruzkaVoditel")
        columns.append({"key": "pogruzka_voditel", "label": "Пагрузка водитель", "width": 150, "align": "left"})

    if has_info:
        sel_parts.append("Т.Информация КАК Info")
        columns.append({"key": "info", "label": "Информация", "width": 180, "align": "left"})

    if has_resp:
        sel_parts.append("Т.Ответственный.Наименование КАК Responsible")
        columns.append({"key": "responsible", "label": "Ответственный", "width": 130, "align": "left"})

    if has_comm:
        sel_parts.append("Т.Комментарий КАК Comment")
        columns.append({"key": "comment", "label": "Комментарий", "width": 200, "align": "left"})

    filters = payload.get("filters") or []
    last_date = payload.get("last_date", "").strip()
    last_number = payload.get("last_number", "").strip()

    # When search or filters are specified, retrieve all matching records directly
    if search_str or filters:
        if limit_count <= 0 or limit_count < 5000:
            limit_count = 5000
        offset = 0

    where_parts = []
    q_doc = conn.NewObject("Запрос")

    if date_from:
        try:
            dt_f = parse_query_datetime(date_from, is_end=False)
            if dt_f:
                q_doc.SetParameter("DateFrom", dt_f)
                where_parts.append("Т.Дата >= &DateFrom")
        except Exception as e_df:
            print("date_from parse error:", e_df)

    if date_to:
        try:
            dt_t = parse_query_datetime(date_to, is_end=True)
            if dt_t:
                q_doc.SetParameter("DateTo", dt_t)
                where_parts.append("Т.Дата <= &DateTo")
        except Exception as e_dt:
            print("date_to parse error:", e_dt)

    # Direct search in 1C SQL
    if search_str:
        q_doc.SetParameter("SearchPattern", f"%{search_str}%")
        search_conds = [
            "Т.Номер ПОДОБНО &SearchPattern",
            "Т.Комментарий ПОДОБНО &SearchPattern"
        ]
        if has_kontr:
            search_conds.append("Т.Контрагент.Наименование ПОДОБНО &SearchPattern")
            if is_realization:
                search_conds.append("Т.Контрагент.Код ПОДОБНО &SearchPattern")
        if has_deal:
            search_conds.append("Т.Сделка.Номер ПОДОБНО &SearchPattern")
        if has_sklad:
            search_conds.append("Т.Склад.Наименование ПОДОБНО &SearchPattern")
        if has_agent:
            search_conds.append("Т.Агент.Наименование ПОДОБНО &SearchPattern")
        if has_contract:
            search_conds.append("Т.ДоговорКонтрагента.Наименование ПОДОБНО &SearchPattern")
        if has_resp:
            search_conds.append("Т.Ответственный.Наименование ПОДОБНО &SearchPattern")
        if is_realization:
            search_conds.append("ЕСТЬNULL(ОбрВложенный.Номер, \"\") ПОДОБНО &SearchPattern")
            search_conds.append("ЕСТЬNULL(ПогрузкаВложенный.Маршрут, \"\") ПОДОБНО &SearchPattern")
        if has_tovary:
            search_conds.append(f"Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ ТЧ.Ссылка ИЗ Документ.{doc_type}.Товары КАК ТЧ ГДЕ ТЧ.Номенклатура.Наименование ПОДОБНО &SearchPattern ИЛИ ТЧ.Номенклатура.Код ПОДОБНО &SearchPattern ИЛИ ТЧ.Номенклатура.Артикул ПОДОБНО &SearchPattern)")
        where_parts.append(f"({' ИЛИ '.join(search_conds)})")

    debug_params = {}
    if search_str:
        debug_params["SearchPattern"] = f"%{search_str}%"

    # Direct column/criteria filters in 1C SQL
    if filters and isinstance(filters, list):
        for idx, crit in enumerate(filters):
            if not isinstance(crit, dict) or crit.get("enabled") is False:
                continue
            f_key = crit.get("fieldKey")
            f_op = crit.get("operator", "Равно")
            f_val = str(crit.get("value", "")).strip()
            param_key = f"FilParam_{idx}"

            field_sql = None
            if f_key == "number":
                field_sql = "Т.Номер"
            elif f_key == "kontragent" and has_kontr:
                field_sql = "Т.Контрагент.Наименование"
            elif f_key == "kontragent_code" and has_kontr and is_realization:
                field_sql = "Т.Контрагент.Код"
            elif f_key == "warehouse" and has_sklad:
                field_sql = "Т.Склад.Наименование"
            elif f_key == "deal" and has_deal:
                field_sql = "Т.Сделка.Номер"
            elif f_key == "comment" and has_comm:
                field_sql = "Т.Комментарий"
            elif f_key == "agent" and has_agent:
                field_sql = "Т.Агент.Наименование"
            elif f_key == "responsible" and has_resp:
                field_sql = "Т.Ответственный.Наименование"
            elif f_key == "contract" and has_contract:
                field_sql = "Т.ДоговорКонтрагента.Наименование"
            elif f_key == "amount" and has_sum:
                field_sql = "Т.СуммаДокумента"
            elif f_key == "obrabotka_number" and is_realization:
                field_sql = "ЕСТЬNULL(ОбрВложенный.Номер, \"\")"
            elif f_key == "pogruzka_marshrut" and is_realization:
                field_sql = "ЕСТЬNULL(ПогрузкаВложенный.Маршрут, \"\")"
            elif f_key == "nomenclature" and has_tovary:
                has_nom_filter = True
                s_filter = crit.get("structuredFilter") or {}
                s_items = s_filter.get("items") or []
                match_all = bool(s_filter.get("matchAll"))

                if not s_items:
                    raw_val = f_val
                    if raw_val.startswith("[И]"):
                        match_all = True
                        raw_val = raw_val[3:].strip()
                    tokens = [tok.strip() for tok in raw_val.split(";") if tok.strip()]
                    for tok in tokens:
                        if tok.lower().startswith("содержит:"):
                            s_items.append({"comp": "contains", "value": tok[9:].strip()})
                        else:
                            s_items.append({"comp": "equal", "value": tok})

                if f_op == "Заполнено":
                    where_parts.append(f"Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ ТЧ.Ссылка ИЗ Документ.{doc_type}.Товары КАК ТЧ)")
                    continue
                elif f_op == "Не заполнено":
                    where_parts.append(f"НЕ (Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ ТЧ.Ссылка ИЗ Документ.{doc_type}.Товары КАК ТЧ))")
                    continue

                item_cond_list = []
                for s_idx, s_item in enumerate(s_items):
                    s_val = str(s_item.get("value") or "").strip()
                    s_code = str(s_item.get("code") or "").strip()
                    s_art = str(s_item.get("artikul") or "").strip()
                    s_comp = s_item.get("comp") or ("contains" if f_op == "Содержит" else "equal")

                    single_parts = []
                    if s_code:
                        param_c = f"NomCode_{idx}_{s_idx}"
                        q_doc.SetParameter(param_c, s_code)
                        single_parts.append(f"ТЧ.Номенклатура.Код = &{param_c}")
                        clean_code = s_code.lstrip("0")
                        if clean_code and clean_code != s_code:
                            param_cc = f"NomCleanCode_{idx}_{s_idx}"
                            q_doc.SetParameter(param_cc, clean_code)
                            single_parts.append(f"ТЧ.Номенклатура.Код = &{param_cc}")
                    if s_art:
                        param_a = f"NomArt_{idx}_{s_idx}"
                        q_doc.SetParameter(param_a, s_art)
                        single_parts.append(f"ТЧ.Номенклатура.Артикул = &{param_a}")
                    if s_val:
                        import re
                        cleaned_val = re.sub(r"^\[[^\]]+\]\s*", "", s_val).strip()
                        param_v = f"NomVal_{idx}_{s_idx}"
                        param_vpattern = f"%{cleaned_val}%"
                        q_doc.SetParameter(param_v, param_vpattern)
                        single_parts.append(f"ТЧ.Номенклатура.Наименование ПОДОБНО &{param_v}")
                        single_parts.append(f"ТЧ.Номенклатура.Код ПОДОБНО &{param_v}")
                        single_parts.append(f"ТЧ.Номенклатура.Артикул ПОДОБНО &{param_v}")
                        param_vexact = f"NomExact_{idx}_{s_idx}"
                        q_doc.SetParameter(param_vexact, cleaned_val)
                        single_parts.append(f"ТЧ.Номенклатура.Наименование = &{param_vexact}")
                        single_parts.append(f"ТЧ.Номенклатура.Код = &{param_vexact}")

                    if single_parts:
                        item_cond_list.append(f"({' ИЛИ '.join(single_parts)})")

                is_neg = (f_op in ("Не равно", "Не в списке", "Не содержит"))
                if item_cond_list:
                    if match_all:
                        all_subqueries = [f"Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ ТЧ.Ссылка ИЗ Документ.{doc_type}.Товары КАК ТЧ ГДЕ {ic})" for ic in item_cond_list]
                        if is_neg:
                            where_parts.append(f"НЕ ({' И '.join(all_subqueries)})")
                        else:
                            where_parts.extend(all_subqueries)
                    else:
                        comb_cond = " ИЛИ ".join(item_cond_list)
                        if is_neg:
                            where_parts.append(f"НЕ (Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ ТЧ.Ссылка ИЗ Документ.{doc_type}.Товары КАК ТЧ ГДЕ ({comb_cond})))")
                        else:
                            where_parts.append(f"Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ ТЧ.Ссылка ИЗ Документ.{doc_type}.Товары КАК ТЧ ГДЕ ({comb_cond}))")
                continue
            elif f_key == "status" or f_key in ("posted", "deleted"):
                if f_val in ("deleted", "Помечен на удаление"):
                    where_parts.append("Т.ПометкаУдаления = ИСТИНА")
                elif f_val in ("posted", "Проведен"):
                    where_parts.append("(Т.Проведен = ИСТИНА И Т.ПометкаУдаления = ЛОЖЬ)")
                elif f_val in ("not_posted", "Не проведен"):
                    where_parts.append("(Т.Проведен = ЛОЖЬ И Т.ПометкаУдаления = ЛОЖЬ)")
                continue

            if field_sql:
                if f_op == "Заполнено":
                    where_parts.append(f"({field_sql} <> \"\" И НЕ {field_sql} ЕСТЬ NULL)")
                elif f_op == "Не заполнено":
                    where_parts.append(f"({field_sql} = \"\" ИЛИ {field_sql} ЕСТЬ NULL)")
                elif f_key == "amount":
                    try:
                        amt_num = float(f_val.replace(" ", "").replace(",", "."))
                        q_doc.SetParameter(param_key, amt_num)
                        if f_op == "Больше":
                            where_parts.append(f"{field_sql} > &{param_key}")
                        elif f_op == "Меньше":
                            where_parts.append(f"{field_sql} < &{param_key}")
                        else:
                            where_parts.append(f"{field_sql} = &{param_key}")
                    except Exception:
                        pass
                elif f_op in ("В группе из списка", "В списке", "Не в списке") or (";" in f_val and f_op in ("Равно", "Содержит")):
                    raw_val = f_val
                    tokens = [t.strip() for t in raw_val.split(";") if t.strip()]
                    tok_conds = []
                    for t_idx, tok in enumerate(tokens):
                        param_t = f"{param_key}_t{t_idx}"
                        t_parts = []
                        if f_key in ("kontragent", "kontragent_code") and has_kontr:
                            name_part = tok
                            code_part = ""
                            if " - " in tok:
                                sub_p = tok.split(" - ")
                                name_part = sub_p[0].strip()
                                code_part = sub_p[-1].strip()
                            
                            param_name = f"{param_t}_name"
                            q_doc.SetParameter(param_name, f"%{name_part}%")
                            debug_params[param_name] = f"%{name_part}%"
                            t_parts.append(f"Т.Контрагент.Наименование ПОДОБНО &{param_name}")
                            if code_part:
                                param_code = f"{param_t}_code"
                                q_doc.SetParameter(param_code, f"%{code_part}%")
                                debug_params[param_code] = f"%{code_part}%"
                                t_parts.append(f"Т.Контрагент.Код ПОДОБНО &{param_code}")
                            param_exact = f"{param_t}_exact"
                            q_doc.SetParameter(param_exact, tok)
                            debug_params[param_exact] = tok
                            t_parts.append(f"Т.Контрагент.Наименование = &{param_exact}")
                        else:
                            clean_tok = tok.replace("Содержит:", "").replace("содержит:", "").strip()
                            param_like = f"{param_t}_like"
                            q_doc.SetParameter(param_like, f"%{clean_tok}%")
                            debug_params[param_like] = f"%{clean_tok}%"
                            t_parts.append(f"{field_sql} ПОДОБНО &{param_like}")
                            param_exact = f"{param_t}_exact"
                            q_doc.SetParameter(param_exact, clean_tok)
                            debug_params[param_exact] = clean_tok
                            t_parts.append(f"{field_sql} = &{param_exact}")

                        if t_parts:
                            tok_conds.append(f"({' ИЛИ '.join(t_parts)})")
                    
                    if tok_conds:
                        comb = " ИЛИ ".join(tok_conds)
                        if f_op == "Не в списке":
                            where_parts.append(f"НЕ ({comb})")
                        else:
                            where_parts.append(f"({comb})")
                else:
                    if f_op == "Равно":
                        q_doc.SetParameter(param_key, f_val)
                        debug_params[param_key] = f_val
                        where_parts.append(f"{field_sql} = &{param_key}")
                    elif f_op == "Не равно":
                        q_doc.SetParameter(param_key, f_val)
                        debug_params[param_key] = f_val
                        where_parts.append(f"{field_sql} <> &{param_key}")
                    elif f_op == "Не содержит":
                        q_doc.SetParameter(param_key, f"%{f_val}%")
                        debug_params[param_key] = f"%{f_val}%"
                        where_parts.append(f"НЕ ({field_sql} ПОДОБНО &{param_key})")
                    else:  # Содержит / default
                        q_doc.SetParameter(param_key, f"%{f_val}%")
                        debug_params[param_key] = f"%{f_val}%"
                        where_parts.append(f"{field_sql} ПОДОБНО &{param_key}")

    # Keyset pagination for normal chunking (when NO search and NO filters)
    if last_date and not search_str and not filters:
        try:
            dt_last = parse_query_datetime(last_date, is_end=False)
            if dt_last:
                q_doc.SetParameter("LastDate", dt_last)
                q_doc.SetParameter("LastNumber", last_number or "")
                where_parts.append("(Т.Дата < &LastDate ИЛИ (Т.Дата = &LastDate И Т.Номер < &LastNumber))")
                offset = 0 # No COM skipping needed!
        except Exception as e_lp:
            print("keyset pagination error:", e_lp)

    where_sql = ("ГДЕ " + " И ".join(where_parts)) if where_parts else ""

    from_clause = f"Документ.{doc_type} КАК Т"
    if is_realization:
        from_clause += """
        ЛЕВОЕ СОЕДИНЕНИЕ (
            ВЫБРАТЬ
                П.Накладная КАК Накладная,
                МАКСИМУМ(П.Ссылка.Маршрут) КАК Маршрут,
                МАКСИМУМ(П.Ссылка.Водитель) КАК Водитель
            ИЗ
                Документ.ПогрузкиМашин.СписокРеализаций КАК П
            СГРУППИРОВАТЬ ПО
                П.Накладная
        ) КАК ПогрузкаВложенный
        ПО Т.Ссылка = ПогрузкаВложенный.Накладная
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
        """

    fetch_total = (offset + limit_count + 1) if (limit_count and limit_count > 0) else 0
    first_clause = f"ПЕРВЫЕ {fetch_total}" if fetch_total > 0 else ""

    q_doc.Text = f"""
    ВЫБРАТЬ {first_clause}
        {", ".join(sel_parts)}
    ИЗ
        {from_clause}
    {where_sql}
    УПОРЯДОЧИТЬ ПО
        Т.Дата УБЫВ,
        Т.Номер УБЫВ
    """

    res_doc = q_doc.Execute().Choose()
    items = []
    doc_numbers = []
    doc_refs = []

    if offset > 0:
        skipped = 0
        while skipped < offset and res_doc.Next():
            skipped += 1

    fetched_count = 0
    has_more = False

    while res_doc.Next():
        fetched_count += 1
        d_num = str(res_doc.Number or "").strip()
        doc_numbers.append(d_num)
        try:
            doc_refs.append(res_doc.Ref)
        except Exception:
            pass

        dv_str = ""
        try:
            dv = res_doc.DataVersion
            if dv is not None:
                dv_str = str(conn.Base64Строка(dv)).strip()
        except Exception:
            pass

        date_str = ""
        try:
            date_str = format_1c_datetime(res_doc.Date)
        except Exception:
            pass

        row_data = {
            "number": d_num,
            "date": date_str,
            "posted": bool(res_doc.Posted),
            "deleted": bool(res_doc.DeletionMark),
            "data_version": dv_str,
        }

        if has_kontr:
            row_data["kontragent"] = str(res_doc.Kontragent or "").strip()
            if is_realization:
                try:
                    row_data["kontragent_code"] = str(res_doc.KontragentCode or "").strip()
                except Exception:
                    row_data["kontragent_code"] = ""
        if has_agent:
            row_data["agent"] = str(res_doc.Agent or "").strip()
        if has_sum:
            row_data["amount"] = float(res_doc.Amount or 0)
        if has_sklad:
            row_data["warehouse"] = str(res_doc.Warehouse or "").strip()
        if has_deal:
            row_data["deal"] = str(res_doc.Deal or "").strip()
        if is_realization:
            try:
                row_data["obrabotka_number"] = str(res_doc.ObrabotkaNumber or "").strip()
            except Exception:
                row_data["obrabotka_number"] = ""
            try:
                row_data["vms_status"] = str(res_doc.StatusVMS or "").strip()
            except Exception:
                row_data["vms_status"] = ""
        if has_contract:
            row_data["contract"] = str(res_doc.Contract or "").strip()
            try:
                row_data["portfolio"] = str(res_doc.Portfolio or "").strip()
            except Exception:
                row_data["portfolio"] = ""
            if is_realization:
                try:
                    row_data["contract_price_type"] = str(res_doc.ContractPriceType or "").strip()
                except Exception:
                    row_data["contract_price_type"] = ""
        if is_realization:
            try:
                row_data["pogruzka_marshrut"] = str(res_doc.PogruzkaMarshrut or "").strip()
            except Exception:
                row_data["pogruzka_marshrut"] = ""
            try:
                row_data["pogruzka_voditel"] = str(res_doc.PogruzkaVoditel or "").strip()
            except Exception:
                row_data["pogruzka_voditel"] = ""
        if has_info:
            row_data["info"] = str(res_doc.Info or "").strip()
        if has_resp:
            row_data["responsible"] = str(res_doc.Responsible or "").strip()
        if has_comm:
            row_data["comment"] = str(res_doc.Comment or "").strip()

        items.append(row_data)

        if limit_count and limit_count > 0 and fetched_count >= limit_count:
            has_more = bool(res_doc.Next())
            break

    # Batch fetch nomenclatures ONLY if explicitly requested
    tab_names = set(str(t.Имя) for t in doc_meta.ТабличныеЧасти)
    has_tovary = "Товары" in tab_names
    doc_noms_map = {}
    doc_nomkeys_map = {}
    if has_tovary and (payload.get("include_nomenclatures") or has_nom_filter or search_str) and doc_refs:
        try:
            q_noms = conn.NewObject("Запрос")
            arr_refs = conn.NewObject("Массив")
            for r in doc_refs:
                arr_refs.Add(r)
            q_noms.SetParameter("DocRefs", arr_refs)
            q_noms.Text = f"""
            ВЫБРАТЬ РАЗЛИЧНЫЕ
                Т.Ссылка.Номер КАК Number,
                Т.Номенклатура.Наименование КАК NomName,
                Т.Номенклатура.Код КАК NomCode,
                Т.Номенклатура.Артикул КАК NomArt
            ИЗ
                Документ.{doc_type}.Товары КАК Т
            ГДЕ
                Т.Ссылка В (&DocRefs)
            """
            res_noms = q_noms.Execute().Choose()
            while res_noms.Next():
                d_n = str(res_noms.Number or "").strip()
                n_m = str(res_noms.NomName or "").strip()
                n_c = str(res_noms.NomCode or "").strip()
                n_a = str(res_noms.NomArt or "").strip()
                clean_code = n_c.lstrip("0") or n_c
                if d_n:
                    if n_m:
                        doc_noms_map.setdefault(d_n, []).append(n_m)
                    doc_nomkeys_map.setdefault(d_n, []).append(f"{n_c}|{clean_code}|{n_a}|{n_m}".lower())
        except Exception as e:
            print("Chunk nomenclature fetch skipped:", e)

    filtered_items = []
    for it in items:
        n_list = doc_noms_map.get(it["number"], [])
        it["nomenclatures"] = n_list
        it["nomenclature"] = ", ".join(n_list)
        it["nom_keys"] = doc_nomkeys_map.get(it["number"], [])
        filtered_items.append(it)

    last_item = filtered_items[-1] if filtered_items else None

    resp_q.put((True, {
        "doc_type": doc_type,
        "doc_title": doc_synonym,
        "columns": columns,
        "items": filtered_items,
        "total": len(filtered_items),
        "has_more": has_more,
        "offset": offset,
        "limit": limit_count,
        "last_date": last_item["date"] if last_item else "",
        "last_number": last_item["number"] if last_item else "",
        "debug_info": {
            "where_sql": where_sql,
            "parameters": debug_params,
            "filters_count": len([c for c in (filters or []) if isinstance(c, dict) and c.get("enabled") is not False]),
            "search": search_str or "",
            "total_fetched": len(filtered_items)
        }
    }))



def handle_get_document_details(conn, payload, key, resp_q):
    doc_type = payload.get("doc_type") or "УстановкаЦенНоменклатуры"
    doc_number = payload.get("number", "").strip()

    q_det = conn.NewObject("Запрос")
    q_det.Text = f"""
    ВЫБРАТЬ ПЕРВЫЕ 1
        Т.Ссылка КАК Ref
    ИЗ
        Документ.{doc_type} КАК Т
    ГДЕ
        Т.Номер = &DocNum
    """
    q_det.SetParameter("DocNum", doc_number)
    res_det = q_det.Execute().Choose()
    if not res_det.Next():
        raise ValueError(f"Sənəd №{doc_number} tapılmadı")

    doc_obj = res_det.Ref.ПолучитьОбъект()
    date_str = format_1c_datetime(doc_obj.Дата)

    org_name = ""
    if hasattr(doc_obj, "Организация") and doc_obj.Организация:
        org_name = str(getattr(doc_obj.Организация, "Наименование", "") or "").strip()

    kontr_name = ""
    if hasattr(doc_obj, "Контрагент") and doc_obj.Контрагент:
        kontr_name = str(getattr(doc_obj.Контрагент, "Наименование", "") or "").strip()

    dog_name = ""
    if hasattr(doc_obj, "ДоговорКонтрагента") and doc_obj.ДоговорКонтрагента:
        dog_name = str(getattr(doc_obj.ДоговорКонтрагента, "Наименование", "") or "").strip()

    sklad_name = ""
    if hasattr(doc_obj, "Склад") and doc_obj.Склад:
        sklad_name = str(getattr(doc_obj.Склад, "Наименование", "") or "").strip()

    curr_name = "AZN"
    if hasattr(doc_obj, "ВалютаДокумента") and doc_obj.ВалютаДокумента:
        curr_name = str(getattr(doc_obj.ВалютаДокумента, "Наименование", "") or "AZN").strip()

    doc_amount = float(getattr(doc_obj, "СуммаДокумента", 0) or 0)

    header = {
        "number": str(doc_obj.Номер),
        "date": date_str,
        "posted": bool(doc_obj.Проведен),
        "comment": str(getattr(doc_obj, "Комментарий", "") or ""),
        "responsible": str(getattr(doc_obj.Ответственный, "Наименование", "") if hasattr(doc_obj, "Ответственный") else ""),
        "organization": org_name,
        "kontragent": kontr_name,
        "contract": dog_name,
        "warehouse": sklad_name,
        "amount": doc_amount,
        "currency": curr_name
    }

    lines = []
    calc_total_sum = 0.0
    calc_total_vat = 0.0

    if hasattr(doc_obj, "Товары"):
        tab = doc_obj.Товары
        for i in range(tab.Количество()):
            row = tab.Получить(i)
            nom = row.Номенклатура
            qty = float(getattr(row, "Количество", 0) or 0)
            pr = float(getattr(row, "Цена", 0) or 0)
            sm = float(getattr(row, "Сумма", 0) or (qty * pr))
            vat_sm = float(getattr(row, "СуммаНДС", 0) or 0)
            total_row = float(getattr(row, "Всего", 0) or (sm + vat_sm))
            calc_total_sum += sm
            calc_total_vat += vat_sm

            lines.append({
                "line_num": i + 1,
                "code": str(getattr(nom, "Код", "") or "").strip(),
                "name": str(getattr(nom, "Наименование", "") or "").strip(),
                "artikul": str(getattr(nom, "Артикул", "") or "").strip(),
                "quantity": qty,
                "unit": str(getattr(row.ЕдиницаИзмерения, "Наименование", "") if hasattr(row, "ЕдиницаИзмерения") and row.ЕдиницаИзмерения else "əd"),
                "coefficient": float(getattr(row, "Коэффициент", 1) or 1),
                "price": pr,
                "sum": sm,
                "vat_rate": str(conn.String(row.СтавкаНДС)) if hasattr(row, "СтавкаНДС") and row.СтавкаНДС else ("18%" if vat_sm > 0 else "Без НДС"),
                "vat_sum": vat_sm,
                "total": total_row,
                "price_type": str(conn.String(row.ТипЦен)) if hasattr(row, "ТипЦен") and row.ТипЦен else ""
            })

    if header["amount"] == 0 and calc_total_sum > 0:
        header["amount"] = round(calc_total_sum + calc_total_vat, 2)
    header["total_vat"] = round(calc_total_vat, 2)

    resp_q.put((True, {
        "doc_type": doc_type,
        "header": header,
        "lines": lines,
        "total_lines": len(lines)
    }))

    # Action: Get Full Price Document for Editor (Pivoted by Items & Price Types)


def handle_get_price_document(conn, payload, key, resp_q):
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
        except Exception: pass

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

    # Read Price Types from doc
    doc_price_types = []
    if hasattr(doc_obj, "ТипыЦен"):
        for i in range(doc_obj.ТипыЦен.Количество()):
            pt_row = doc_obj.ТипыЦен.Получить(i)
            pt_name = str(pt_row.ТипЦен.Наименование).strip()
            if pt_name and pt_name not in doc_price_types:
                doc_price_types.append(pt_name)

    # Barcodes map
    b_map = {}
    try:
        b_map = get_barcodes_map(conn, key)
    except Exception: pass

    # Pivot items
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

    # Read all available price types in 1C
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

    resp_q.put((True, {
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
    }))

    # Action: Save Price Document to 1C (Draft / Запись mode strictly)


def handle_save_price_document(conn, payload, key, resp_q):
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
        except Exception: pass

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

    # Save exact comment entered/modified by user without any automatic audit appending
    doc_obj.Комментарий = comment_text

    # Clear existing goods table
    doc_obj.Товары.Очистить()

    # Cache price type and nomenclature COM references for speed
    pt_cache = {}
    for pt_name in price_types:
        pt_ref = conn.Справочники.ТипыЦенНоменклатуры.НайтиПоНаименованию(pt_name)
        if pt_ref and not pt_ref.Пустая():
            pt_cache[pt_name] = pt_ref

    # Update doc_obj.ТипыЦен
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
            # Add line
            row = doc_obj.Товары.Добавить()
            row.Номенклатура = nom_ref
            row.ТипЦен = pt_ref
            row.Цена = p_val
            if hasattr(pt_ref, "ВалютаЦены") and not pt_ref.ВалютаЦены.Пустая():
                row.Валюта = pt_ref.ВалютаЦены
            if u_ref:
                row.ЕдиницаИзмерения = u_ref
            total_rows_added += 1

    # Save as draft without posting!
    doc_obj.Записать(conn.РежимЗаписиДокумента.Запись)

    resp_q.put((True, {
        "number": str(doc_obj.Номер),
        "comment": str(doc_obj.Комментарий),
        "total_items": len(items_data),
        "total_rows": total_rows_added
    }))

    # Action: Resolve Nomenclature Batch (for fast Excel paste / lookup)


def handle_resolve_nomenclature_batch(conn, payload, key, resp_q):
    codes = payload.get("codes", [])
    if not codes:
        resp_q.put((True, {"found": {}}))
        return

    unique_codes = list(set([str(c).strip() for c in codes if str(c).strip()]))[:1000]
    if not unique_codes:
        resp_q.put((True, {"found": {}}))
        return

    arr = conn.NewObject("Массив")
    for c in unique_codes:
        arr.Add(c)

    id_type = str(payload.get("id_type", "code")).strip().lower()
    found_map = {}

    # If barcode mode requested, search in barcode register first
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
                if c_bc:
                    found_map[c_bc] = info
                if c_code:
                    found_map[c_code] = info
                if c_artikul:
                    found_map[c_artikul] = info
        except Exception as e_bc:
            print("Barcode resolve error:", e_bc)

    # Also query Nomenclature by Code or Artikul
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
            if c_code and c_code not in found_map:
                found_map[c_code] = info
            if c_artikul and c_artikul not in found_map:
                found_map[c_artikul] = info
    except Exception as e_nom:
        print("Nom query resolve error:", e_nom)

    resp_q.put((True, {"found": found_map}))



def handle_search_nomenclature(conn, payload, key, resp_q):
    query = str(payload.get("query", "")).strip()
    if not query or len(query) < 1:
        resp_q.put((True, {"items": []}))
        return

    b_map = {}
    try:
        b_map = get_barcodes_map(conn, key)
    except Exception: pass

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
    resp_q.put((True, {"items": items_list}))



def handle_get_all_price_types(conn, payload, key, resp_q):
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
    resp_q.put((True, {"price_types": pts}))



def handle_get_item_prices(conn, payload, key, resp_q):
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
    resp_q.put((True, {"prices": prices}))



def handle_get_batch_item_prices(conn, payload, key, resp_q):
    codes = payload.get("codes", [])
    names = payload.get("names", [])
    pts = payload.get("price_types", [])
    date_str = str(payload.get("date") or "").strip()

    if not pts:
        resp_q.put((True, {"prices_by_code": {}, "prices_by_name": {}}))
        return

    unique_codes = list(set([str(c).strip() for c in codes if str(c).strip()]))[:2000]
    unique_names = list(set([str(n).strip() for n in names if str(n).strip()]))[:2000]
    unique_pts = list(set([str(p).strip() for p in pts if str(p).strip()]))

    if not unique_pts or (not unique_codes and not unique_names):
        resp_q.put((True, {"prices_by_code": {}, "prices_by_name": {}}))
        return

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

            if p_val > 0 and pt_name:
                if c_code:
                    if c_code not in prices_by_code:
                        prices_by_code[c_code] = {}
                    prices_by_code[c_code][pt_name] = p_val
                if c_name:
                    if c_name not in prices_by_name:
                        prices_by_name[c_name] = {}
                    prices_by_name[c_name][pt_name] = p_val
    except Exception as e_batch:
        print("Error executing get_batch_item_prices:", e_batch)

    resp_q.put((True, {"prices_by_code": prices_by_code, "prices_by_name": prices_by_name}))



def handle_get_nomenclature_card(conn, payload, key, resp_q):
    item_code = str(payload.get("code") or "").strip().rstrip(",")
    item_name = str(payload.get("name") or "").strip()
    item_ref_str = str(payload.get("ref") or "").strip()

    card_data = None
    try:
        q = conn.NewObject("Запрос")
        q.SetParameter("ItemCode", item_code)
        q.SetParameter("ItemCodePattern", f"%{item_code}%")
        q.SetParameter("ItemName", item_name)
        q.SetParameter("ItemNamePattern", f"%{item_name}%")
        q.SetParameter("ItemRefStr", item_ref_str)

        conditions = []
        if item_code:
            conditions.append("(Т.Код = &ItemCode ИЛИ Т.Код ПОДОБНО &ItemCodePattern)")
        if item_name:
            conditions.append("(Т.Наименование = &ItemName ИЛИ Т.Наименование ПОДОБНО &ItemNamePattern)")
        if item_ref_str:
            conditions.append("(Т.Ссылка = &ItemRefStr)")

        where_cond = " ИЛИ ".join(conditions) if conditions else "1 = 1"

        q.Text = f"""
        ВЫБРАТЬ ПЕРВЫЕ 1
            Т.Ссылка КАК Ref,
            Т.Код КАК Code,
            Т.Наименование КАК Name,
            Т.НаименованиеПолное КАК FullName,
            Т.Артикул КАК Artikul,
            Т.Родитель.Наименование КАК ParentName,
            Т.ВидНоменклатуры.Наименование КАК VidNom,
            Т.БазоваяЕдиницаИзмерения.Наименование КАК Unit,
            Т.СтавкаНДС КАК VatRate,
            Т.НоменклатурнаяГруппа.Наименование КАК NomGroup,
            Т.Комментарий КАК Comment,
            Т.Услуга КАК IsService,
            Т.СтранаПроисхождения.Наименование КАК Country,
            Т.ЦеноваяГруппа.Наименование КАК PriceGroup,
            Т.Производитель.Наименование КАК Producer
        ИЗ
            Справочник.Номенклатура КАК Т
        ГДЕ
            НЕ Т.ЭтоГруппа И ({where_cond})
        """
        sel = q.Execute().Choose()
        if sel.Next():
            item_ref = sel.Ref
            vat_str = ""
            try:
                vat_str = str(conn.XMLСтрока(sel.VatRate)) if sel.VatRate else ""
            except Exception:
                vat_str = str(sel.VatRate or "")

            card_data = {
                "ref": conn.String(item_ref),
                "code": str(sel.Code or "").strip().rstrip(","),
                "name": str(sel.Name or "").strip(),
                "fullName": str(sel.FullName or "").strip(),
                "artikul": str(sel.Artikul or "").strip(),
                "parent": str(sel.ParentName or "").strip(),
                "vidNom": str(sel.VidNom or "").strip(),
                "unit": str(sel.Unit or "").strip(),
                "vatRate": vat_str,
                "nomGroup": str(sel.NomGroup or "").strip(),
                "comment": str(sel.Comment or "").strip(),
                "country": str(sel.Country or "").strip(),
                "priceGroup": str(sel.PriceGroup or "").strip(),
                "producer": str(sel.Producer or "").strip(),
                "isService": bool(sel.IsService)
            }

            # Barcodes
            try:
                q_bc = conn.NewObject("Запрос")
                q_bc.Text = """
                ВЫБРАТЬ
                    Ш.Штрихкод КАК Barcode,
                    Ш.ТипШтрихкода.Наименование КАК BcType,
                    Ш.ЕдиницаИзмерения.Наименование КАК Unit
                ИЗ
                    РегистрСведений.Штрихкоды КАК Ш
                ГДЕ
                    Ш.Владелец = &ItemRef
                """
                q_bc.SetParameter("ItemRef", item_ref)
                sel_bc = q_bc.Execute().Choose()
                barcodes = []
                while sel_bc.Next():
                    barcodes.append({
                        "barcode": str(sel_bc.Barcode or "").strip(),
                        "type": str(sel_bc.BcType or "").strip(),
                        "unit": str(sel_bc.Unit or "").strip()
                    })
                card_data["barcodes"] = barcodes
            except Exception as e_bc:
                print("Error reading barcodes for card:", e_bc)
                card_data["barcodes"] = []

            # Active Prices
            try:
                q_pr = conn.NewObject("Запрос")
                q_pr.Text = """
                ВЫБРАТЬ
                    Ц.ТипЦен.Наименование КАК PriceType,
                    Ц.Цена КАК Price,
                    Ц.Валюта.Наименование КАК Currency,
                    Ц.ЕдиницаИзмерения.Наименование КАК Unit
                ИЗ
                    РегистрСведений.ЦеныНоменклатуры.СрезПоследних(&CurDate, Номенклатура = &ItemRef) КАК Ц
                """
                q_pr.SetParameter("CurDate", datetime.datetime.now())
                q_pr.SetParameter("ItemRef", item_ref)
                sel_pr = q_pr.Execute().Choose()
                prices = []
                while sel_pr.Next():
                    prices.append({
                        "price_type": str(sel_pr.PriceType or "").strip(),
                        "price": float(sel_pr.Price or 0),
                        "currency": str(sel_pr.Currency or "").strip(),
                        "unit": str(sel_pr.Unit or "").strip()
                    })
                card_data["prices"] = prices
            except Exception as e_pr:
                print("Error reading prices for card:", e_pr)
                card_data["prices"] = []

            # Measurement Units
            try:
                q_u = conn.NewObject("Запрос")
                q_u.Text = """
                ВЫБРАТЬ
                    Е.Наименование КАК UnitName,
                    Е.Коэффициент КАК Ratio
                ИЗ
                    Справочник.ЕдиницыИзмерения КАК Е
                ГДЕ
                    Е.Владелец = &ItemRef
                """
                q_u.SetParameter("ItemRef", item_ref)
                sel_u = q_u.Execute().Choose()
                units = []
                while sel_u.Next():
                    units.append({
                        "unit": str(sel_u.UnitName or "").strip(),
                        "ratio": float(sel_u.Ratio or 1)
                    })
                card_data["units"] = units
            except Exception as e_u:
                card_data["units"] = []
    except Exception as e_card:
        print("Error getting nomenclature card:", e_card)

    resp_q.put((True, {"card": card_data}))





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
    "get_nomenclature_card": handle_get_nomenclature_card,
}
