# -*- coding: utf-8 -*-
"""
services/order_analysis_service.py
==================================
Müştəri Sifarişləri və Müqayisəli Satış Analizi (Заказ vs Реализация vs Возврат).
Tamamilə müstəqil fayl kimi tərtib edilmişdir.
"""

import os
import re
import datetime
import sqlite3
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from services.common import print_server_error, APP_DIR

ORDER_ANALYSIS_EXCEL = os.path.join(APP_DIR, "exports", "order_analysis_report.xlsx")


def parse_date(date_str, is_end=False):
    """Tarix sətirini (YYYY-MM-DD və ya DD.MM.YYYY, vaxt ilə və ya vaxtsız) datetime obyektinə çevirir."""
    if not date_str:
        now = datetime.datetime.now()
        if is_end:
            return datetime.datetime(now.year, now.month, now.day, 23, 59, 59)
        return datetime.datetime(now.year, now.month, 1, 0, 0, 0)

    date_str = str(date_str).strip()
    try:
        time_part = None
        if " " in date_str:
            parts = date_str.split(" ", 1)
            date_part = parts[0].strip()
            time_part = parts[1].strip()
        elif "T" in date_str:
            parts = date_str.split("T", 1)
            date_part = parts[0].strip()
            time_part = parts[1].strip()
        else:
            date_part = date_str

        if "." in date_part:
            d_parts = [int(p) for p in date_part.split(".") if p.strip()]
            if len(d_parts) == 3:
                d, m, y = d_parts
            else:
                raise ValueError(f"Invalid date: {date_part}")
        elif "-" in date_part:
            d_parts = [int(p) for p in date_part.split("-") if p.strip()]
            if len(d_parts) == 3:
                y, m, d = d_parts
            else:
                raise ValueError(f"Invalid date: {date_part}")
        elif "/" in date_part:
            d_parts = [int(p) for p in date_part.split("/") if p.strip()]
            if len(d_parts) == 3:
                d, m, y = d_parts
            else:
                raise ValueError(f"Invalid date: {date_part}")
        else:
            raise ValueError(f"Unknown date format: {date_str}")

        hh, mm, ss = (23, 59, 59) if is_end else (0, 0, 0)
        if time_part and ":" in time_part:
            t_items = [int(x) for x in re.split(r"[:.]", time_part) if x.isdigit()]
            if len(t_items) >= 2:
                hh = t_items[0]
                mm = t_items[1]
                ss = t_items[2] if len(t_items) >= 3 else (59 if is_end else 0)

        return datetime.datetime(y, m, d, hh, mm, ss)
    except Exception as e:
        print(f"⚠️ [ORDER_ANALYSIS parse_date ERROR] date_str='{date_str}': {e}", flush=True)
        now = datetime.datetime.now()
        if is_end:
            return datetime.datetime(now.year, now.month, now.day, 23, 59, 59)
        return datetime.datetime(now.year, now.month, 1, 0, 0, 0)


def split_filter_item(raw_itm):
    """
    Soraqçadan gələn '50 ARAZ DEPO - C000021088' və ya '[C000021088] 50 ARAZ DEPO'
    formatlarını ad və kod namizədlərinə ayırır.
    """
    raw = str(raw_itm or "").strip()
    if not raw:
        return []

    candidates = [raw]

    # [KOD] AD formatı
    m_bracket = re.match(r"^\[([^\]]+)\]\s*(.*)$", raw)
    if m_bracket:
        c1, c2 = m_bracket.group(1).strip(), m_bracket.group(2).strip()
        if c1 and c1 not in candidates: candidates.append(c1)
        if c2 and c2 not in candidates: candidates.append(c2)
        return candidates

    # AD - KOD və ya KOD - AD formatı
    if " - " in raw:
        parts = [p.strip() for p in raw.split(" - ") if p.strip()]
        for p in parts:
            if p and p not in candidates:
                candidates.append(p)

    return candidates


def build_filter_clauses_for_union(query, filters, alias_prefix):
    """
    Hər bir alt cədvəl (Заказ, Реал, Возвр) üçün uyğun filtrləri yaradır.
    """
    where_clauses = []
    param_idx = 0

    FIELD_MAP = {
        "Контрагент": f"{alias_prefix}.Ссылка.Контрагент",
        "Номенклатура": f"{alias_prefix}.Номенклатура",
        "Портфель": f"{alias_prefix}.Ссылка.ДоговорКонтрагента.Портфель",
        "Агент": f"{alias_prefix}.Ссылка.ДоговорКонтрагента.Агент",
        "Склад": f"{alias_prefix}.Ссылка.Склад",
        "Номенклатура.Номенклатурная группа": f"{alias_prefix}.Номенклатура.НоменклатурнаяГруппа",
        "Номенклатурная группа": f"{alias_prefix}.Номенклатура.НоменклатурнаяГруппа",
    }

    for f in filters:
        if not f or not f.get("active", True):
            continue
        field_key = f.get("field", "")
        comp_type = f.get("comp", "in_list")
        val = f.get("value", "")
        if val is None or str(val).strip() == "":
            continue

        if field_key not in FIELD_MAP:
            continue

        raw_field = FIELD_MAP[field_key]
        val_str = str(val).strip()

        if comp_type == "in_list":
            items = [x.strip() for x in re.split(r"[,;\n]", val_str) if x.strip()]
            if items:
                sub_or = []
                for itm in items:
                    candidates = split_filter_item(itm)
                    cand_or = []
                    for cand in candidates:
                        p_name = f"FVal_{alias_prefix}_{param_idx}"
                        param_idx += 1
                        cand_or.append(f"({raw_field}.Наименование ПОДОБНО &{p_name} ИЛИ {raw_field}.Код ПОДОБНО &{p_name})")
                        query.SetParameter(p_name, f"%{cand}%")
                    if cand_or:
                        sub_or.append("(" + " ИЛИ ".join(cand_or) + ")")
                if sub_or:
                    where_clauses.append("(" + " ИЛИ ".join(sub_or) + ")")
        elif comp_type == "equal":
            candidates = split_filter_item(val_str)
            sub_or = []
            for cand in candidates:
                p_name = f"FVal_{alias_prefix}_{param_idx}"
                param_idx += 1
                sub_or.append(f"({raw_field}.Наименование = &{p_name} ИЛИ {raw_field}.Код = &{p_name})")
                query.SetParameter(p_name, cand)
            if sub_or:
                where_clauses.append("(" + " ИЛИ ".join(sub_or) + ")")
        elif comp_type == "not_equal":
            candidates = split_filter_item(val_str)
            sub_and = []
            for cand in candidates:
                p_name = f"FVal_{alias_prefix}_{param_idx}"
                param_idx += 1
                sub_and.append(f"({raw_field}.Наименование <> &{p_name} И {raw_field}.Код <> &{p_name})")
                query.SetParameter(p_name, cand)
            if sub_and:
                where_clauses.append("(" + " И ".join(sub_and) + ")")
        elif comp_type == "contains":
            candidates = split_filter_item(val_str)
            sub_or = []
            for cand in candidates:
                p_name = f"FVal_{alias_prefix}_{param_idx}"
                param_idx += 1
                sub_or.append(f"{raw_field}.Наименование ПОДОБНО &{p_name}")
                query.SetParameter(p_name, f"%{cand}%")
            if sub_or:
                where_clauses.append("(" + " ИЛИ ".join(sub_or) + ")")

    return where_clauses


def handle_order_analysis(conn, payload, key, resp_q):
    """
    1C-də Sifariş vs Realizasiya vs Qaytarma müqayisəli hesabatını icra edir.
    """
    try:
        start_date_str = payload.get("start_date", "")
        end_date_str = payload.get("end_date", "")
        dt_from = parse_date(start_date_str, is_end=False)
        dt_to = parse_date(end_date_str, is_end=True)

        posted_only = bool(payload.get("posted_only", True))
        groupings = payload.get("groupings", ["Контрагент", "Номенклатура"])
        if not groupings:
            groupings = ["Контрагент", "Номенклатура"]

        filters = payload.get("filters", [])
        indicators = payload.get("indicators", {
            "qty_order": True,
            "sum_order": True,
            "qty_real": True,
            "sum_real": True,
            "qty_diff": True,
            "qty_ret": True,
            "sum_ret": True,
            "qty_net": True,
            "sum_net": True,
            "show_code": True,
            "show_article": True,
            "show_barcode": True
        })

        query = conn.NewObject("Запрос")
        query.SetParameter("DateFrom", dt_from)
        query.SetParameter("DateTo", dt_to)

        # Detect warehouse attribute for returns
        try:
            ret_attrs = set(str(a.Имя) for a in conn.Метаданные.Документы.ВозвратТоваровОтПокупателя.Реквизиты)
            wh_ret = "Возвр.Ссылка.Склад" if "Склад" in ret_attrs else ("Возвр.Ссылка.СкладОрдер" if "СкладОрдер" in ret_attrs else "ЗНАЧЕНИЕ(Справочник.Склады.ПустаяСсылка)")
        except Exception:
            wh_ret = "Возвр.Ссылка.Склад"

        # Filters for each subquery
        where_order = ["Заказ.Ссылка.ПометкаУдаления = ЛОЖЬ", "Заказ.Ссылка.Дата МЕЖДУ &DateFrom И &DateTo"]
        where_real = ["Реал.Ссылка.ПометкаУдаления = ЛОЖЬ", "Реал.Ссылка.Дата МЕЖДУ &DateFrom И &DateTo"]
        where_ret = ["Возвр.Ссылка.ПометкаУдаления = ЛОЖЬ", "Возвр.Ссылка.Дата МЕЖДУ &DateFrom И &DateTo"]

        if posted_only:
            where_order.append("Заказ.Ссылка.Проведен = ИСТИНА")
            where_real.append("Реал.Ссылка.Проведен = ИСТИНА")
            where_ret.append("Возвр.Ссылка.Проведен = ИСТИНА")

        where_order.extend(build_filter_clauses_for_union(query, filters, "Заказ"))
        where_real.extend(build_filter_clauses_for_union(query, filters, "Реал"))
        where_ret.extend(build_filter_clauses_for_union(query, filters, "Возвр"))

        where_order_str = "\n    И ".join(where_order)
        where_real_str = "\n    И ".join(where_real)
        where_ret_str = "\n    И ".join(where_ret)

        # Mapping for dynamic groupings
        GROUPING_MAP = {
            "День": ("DayDate", "DayDate", "DayDate"),
            "Неделя": ("WeekDate", "WeekDate", "WeekDate"),
            "Месяц": ("MonthDate", "MonthDate", "MonthDate"),
            "Год": ("YearDate", "YearDate", "YearDate"),
            "Период": ("DayDate", "DayDate", "DayDate"),
            "По дням": ("DayDate", "DayDate", "DayDate"),
            "По неделям": ("WeekDate", "WeekDate", "WeekDate"),
            "По месяцам": ("MonthDate", "MonthDate", "MonthDate"),
            "По годам": ("YearDate", "YearDate", "YearDate"),
            "Заказ": ("OrderDoc", "OrderDoc", "OrderDoc"),
            "Заказ покупателя": ("OrderDoc", "OrderDoc", "OrderDoc"),
            "Заказ покупателя.Номер": ("OrderDoc", "OrderDoc", "OrderDoc"),
            "Заказ покупателя.Дата": ("OrderDoc", "OrderDoc", "OrderDoc"),
            "Документ": ("OrderDoc", "OrderDoc", "OrderDoc"),
            "Документ движения (регистратор)": ("OrderDoc", "OrderDoc", "OrderDoc"),
            "Портфель": ("PortfolioName", "PortfolioName", "PortfolioCode"),
            "Портфель (Номенклатурная группа)": ("PortfolioName", "PortfolioName", "PortfolioCode"),
            "Договор контрагента": ("PortfolioName", "PortfolioName", "PortfolioCode"),
            "Контрагент": ("KontragentName", "KontragentName", "KontragentCode"),
            "Контрагент.Наименование": ("KontragentName", "KontragentName", "KontragentCode"),
            "Контрагент.Код": ("KontragentName", "KontragentName", "KontragentCode"),
            "Контрагент.ИНН": ("KontragentName", "KontragentName", "KontragentCode"),
            "Номенклатура": ("ItemName", "ItemName", "ItemCode"),
            "Номенклатура.Наименование": ("ItemName", "ItemName", "ItemCode"),
            "Номенклатура.Код": ("ItemName", "ItemName", "ItemCode"),
            "Номенклатура.Артикул": ("ItemArticle", "ItemArticle", "ItemArticle"),
            "Склад": ("WarehouseName", "WarehouseName", "WarehouseCode"),
            "Агент": ("AgentName", "AgentName", "AgentCode"),
        }

        active_groupings = []
        for g_item in groupings:
            g_str = str(g_item).strip()
            gl = g_str.lower()
            matched_key = None
            if g_str in GROUPING_MAP:
                matched_key = g_str
            else:
                for k in GROUPING_MAP:
                    if k.lower() == gl:
                        matched_key = k
                        break
            if not matched_key:
                if any(w in gl for w in ["заказ", "zakaz", "order"]):
                    matched_key = "Заказ покупателя"
                elif any(w in gl for w in ["портфел", "portfel", "portfolio", "договор"]):
                    matched_key = "Портфель"
                elif any(w in gl for w in ["номенклатур", "nomenklatur", "item", "товар"]):
                    matched_key = "Номенклатура"
                elif any(w in gl for w in ["контрагент", "kontragent", "client", "müşteri", "musteri"]):
                    matched_key = "Контрагент"
                elif any(w in gl for w in ["склад", "sklad", "anbar", "warehouse"]):
                    matched_key = "Склад"
                elif any(w in gl for w in ["агент", "agent"]):
                    matched_key = "Агент"
                elif any(w in gl for w in ["день", "gun", "day"]):
                    matched_key = "День"
                elif any(w in gl for w in ["месяц", "ay", "month"]):
                    matched_key = "Месяц"
                elif any(w in gl for w in ["год", "il", "year"]):
                    matched_key = "Год"

            if matched_key and (matched_key, GROUPING_MAP[matched_key][0], GROUPING_MAP[matched_key][1], GROUPING_MAP[matched_key][2]) not in active_groupings:
                active_groupings.append((matched_key, GROUPING_MAP[matched_key][0], GROUPING_MAP[matched_key][1], GROUPING_MAP[matched_key][2]))

        if not active_groupings:
            active_groupings = [
                ("Контрагент", "KontragentName", "KontragentName", "KontragentCode"),
                ("Номенклатура", "ItemName", "ItemName", "ItemCode")
            ]

        # All non-aggregate fields in SELECT must be present in GROUP BY
        group_by_fields = [
            "НАЧАЛОПЕРИОДА(Д.DocDate, ДЕНЬ)",
            "НАЧАЛОПЕРИОДА(Д.DocDate, НЕДЕЛЯ)",
            "НАЧАЛОПЕРИОДА(Д.DocDate, МЕСЯЦ)",
            "НАЧАЛОПЕРИОДА(Д.DocDate, ГОД)",
            "Д.OrderDoc",
            "Д.Portfolio.Наименование",
            "Д.Portfolio.Код",
            "Д.Agent.Наименование",
            "Д.Agent.Код",
            "Д.Warehouse.Наименование",
            "Д.Warehouse.Код",
            "Д.Kontragent.Наименование",
            "Д.Kontragent.Код",
            "Д.Item.Наименование",
            "Д.Item.Код",
            "Д.Item.Артикул",
            "ШтрихкодТаб.Штрихкод",
            "Д.Item.БазоваяЕдиницаИзмерения.Наименование"
        ]

        group_by_str = ",\n        ".join(group_by_fields)
        totals_fields = ["ОБЩИЕ"] + [g[2] for g in active_groupings]
        totals_str = ",\n        ".join(totals_fields)

        query_text = f"""
        ВЫБРАТЬ
            Заказ.Ссылка.Дата КАК DocDate,
            Заказ.Ссылка КАК OrderDoc,
            Заказ.Ссылка.ДоговорКонтрагента.Портфель КАК Portfolio,
            Заказ.Ссылка.ДоговорКонтрагента.Агент КАК Agent,
            Заказ.Ссылка.СкладГруппа КАК Warehouse,
            Заказ.Ссылка.Контрагент КАК Kontragent,
            Заказ.Номенклатура КАК Item,
            Заказ.Количество КАК QtyOrder,
            Заказ.Сумма КАК SumOrder,
            0 КАК QtyReal,
            0 КАК SumReal,
            0 КАК QtyRet,
            0 КАК SumRet
        ПОМЕСТИТЬ ИсходныеДанные
        ИЗ
            Документ.ЗаказПокупателя.Товары КАК Заказ
        ГДЕ
            {where_order_str}

        ОБЪЕДИНИТЬ ВСЕ

        ВЫБРАТЬ
            Реал.Ссылка.Дата,
            Реал.Ссылка.Сделка,
            Реал.Ссылка.ДоговорКонтрагента.Портфель,
            Реал.Ссылка.ДоговорКонтрагента.Агент,
            Реал.Ссылка.Склад,
            Реал.Ссылка.Контрагент,
            Реал.Номенклатура,
            0,
            0,
            Реал.Количество,
            Реал.Сумма,
            0,
            0
        ИЗ
            Документ.РеализацияТоваровУслуг.Товары КАК Реал
        ГДЕ
            {where_real_str}

        ОБЪЕДИНИТЬ ВСЕ

        ВЫБРАТЬ
            Возвр.Ссылка.Дата,
            Возвр.Ссылка.Сделка,
            Возвр.Ссылка.ДоговорКонтрагента.Портфель,
            Возвр.Ссылка.ДоговорКонтрагента.Агент,
            {wh_ret},
            Возвр.Ссылка.Контрагент,
            Возвр.Номенклатура,
            0,
            0,
            0,
            0,
            Возвр.Количество,
            Возвр.Сумма
        ИЗ
            Документ.ВозвратТоваровОтПокупателя.Товары КАК Возвр
        ГДЕ
            {where_ret_str}
        ;

        ////////////////////////////////////////////////////////////////////////////////
        ВЫБРАТЬ
            НАЧАЛОПЕРИОДА(Д.DocDate, ДЕНЬ) КАК DayDate,
            НАЧАЛОПЕРИОДА(Д.DocDate, НЕДЕЛЯ) КАК WeekDate,
            НАЧАЛОПЕРИОДА(Д.DocDate, МЕСЯЦ) КАК MonthDate,
            НАЧАЛОПЕРИОДА(Д.DocDate, ГОД) КАК YearDate,
            Д.OrderDoc КАК OrderDoc,
            Д.Portfolio.Наименование КАК PortfolioName,
            Д.Portfolio.Код КАК PortfolioCode,
            Д.Agent.Наименование КАК AgentName,
            Д.Agent.Код КАК AgentCode,
            Д.Warehouse.Наименование КАК WarehouseName,
            Д.Warehouse.Код КАК WarehouseCode,
            Д.Kontragent.Наименование КАК KontragentName,
            Д.Kontragent.Код КАК KontragentCode,
            Д.Item.Наименование КАК ItemName,
            Д.Item.Код КАК ItemCode,
            Д.Item.Артикул КАК ItemArticle,
            ЕСТЬNULL(ШтрихкодТаб.Штрихкод, "") КАК Barcode,
            ЕСТЬNULL(Д.Item.БазоваяЕдиницаИзмерения.Наименование, "əd") КАК Unit,
            СУММА(Д.QtyOrder) КАК QtyOrder,
            СУММА(Д.SumOrder) КАК SumOrder,
            ВЫБОР КОГДА СУММА(Д.QtyOrder) = 0 ТОГДА 0 ИНАЧЕ СУММА(Д.SumOrder) / СУММА(Д.QtyOrder) КОНЕЦ КАК PriceOrder,
            СУММА(Д.QtyReal) КАК QtyReal,
            СУММА(Д.SumReal) КАК SumReal,
            ВЫБОР КОГДА СУММА(Д.QtyReal) = 0 ТОГДА 0 ИНАЧЕ СУММА(Д.SumReal) / СУММА(Д.QtyReal) КОНЕЦ КАК PriceReal,
            СУММА(Д.QtyRet) КАК QtyRet,
            СУММА(Д.SumRet) КАК SumRet,
            (СУММА(Д.QtyOrder) - СУММА(Д.QtyReal)) КАК QtyDiff,
            (СУММА(Д.SumOrder) - СУММА(Д.SumReal)) КАК SumDiff,
            (СУММА(Д.QtyReal) - СУММА(Д.QtyRet)) КАК QtyNet,
            (СУММА(Д.SumReal) - СУММА(Д.SumRet)) КАК SumNet
        ИЗ
            ИсходныеДанные КАК Д
            ЛЕВОЕ СОЕДИНЕНИЕ (
                ВЫБРАТЬ
                    Ш.Владелец КАК ItemRef,
                    МАКСИМУМ(Ш.Штрихкод) КАК Штрихкод
                ИЗ
                    РегистрСведений.Штрихкоды КАК Ш
                СГРУППИРОВАТЬ ПО
                    Ш.Владелец
            ) КАК ШтрихкодТаб
            ПО Д.Item = ШтрихкодТаб.ItemRef
        СГРУППИРОВАТЬ ПО
            {group_by_str}
        ИТОГИ
            МАКСИМУМ(KontragentCode),
            МАКСИМУМ(ItemCode),
            МАКСИМУМ(ItemArticle),
            МАКСИМУМ(Barcode),
            МАКСИМУМ(Unit),
            МАКСИМУМ(PortfolioCode),
            МАКСИМУМ(AgentCode),
            МАКСИМУМ(WarehouseCode),
            СУММА(QtyOrder),
            СУММА(SumOrder),
            СУММА(QtyReal),
            СУММА(SumReal),
            СУММА(QtyRet),
            СУММА(SumRet),
            СУММА(QtyDiff),
            СУММА(SumDiff),
            СУММА(QtyNet),
            СУММА(SumNet)
        ПО
            {totals_str}
        """

        query.Text = query_text
        exec_res = query.Выполнить()

        rows = []
        unique_stores = set()
        unique_items = set()
        row_counter = 0

        def extract_level(parent_selection, level_idx, parent_id):
            nonlocal row_counter
            if level_idx >= len(active_groupings):
                return

            g_label, _, alias_name, alias_code = active_groupings[level_idx]
            try:
                sub_sel = parent_selection.Выбрать(conn.ОбходРезультатаЗапроса.ПоГруппировкам, alias_name)
            except Exception:
                sub_sel = parent_selection.Выбрать(conn.ОбходРезультатаЗапроса.ПоГруппировкам)

            while sub_sel.Следующий():
                row_counter += 1
                row_id = f"r_{level_idx}_{row_counter}"

                val_raw = getattr(sub_sel, alias_name, "")
                val_code = ""

                if g_label in ("День", "Период", "По дням"):
                    if hasattr(val_raw, "strftime"):
                        val_name = val_raw.strftime("%d.%m.%Y")
                    elif val_raw:
                        val_name = str(val_raw)[:10]
                    else:
                        val_name = "-"
                elif g_label in ("Неделя", "По неделям"):
                    if hasattr(val_raw, "strftime"):
                        val_name = f"Неделя с {val_raw.strftime('%d.%m.%Y')}"
                    elif val_raw:
                        val_name = f"Неделя с {str(val_raw)[:10]}"
                    else:
                        val_name = "-"
                elif g_label in ("Месяц", "По месяцам"):
                    if hasattr(val_raw, "strftime"):
                        month_names = {
                            1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
                            5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
                            9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"
                        }
                        val_name = f"{month_names.get(val_raw.month, val_raw.strftime('%m'))} {val_raw.year}"
                    elif val_raw:
                        val_name = str(val_raw)[:7]
                    else:
                        val_name = "-"
                elif g_label in ("Год", "По годам"):
                    if hasattr(val_raw, "strftime"):
                        val_name = f"{val_raw.year} г."
                    elif val_raw:
                        val_name = f"{str(val_raw)[:4]} г."
                    else:
                        val_name = "-"
                elif g_label in ("Заказ", "Заказ покупателя", "Заказ покупателя.Номер", "Заказ покупателя.Дата", "Документ", "Документ движения (регистратор)"):
                    val_name = ""
                    val_code = ""
                    if val_raw:
                        try:
                            val_code = str(getattr(val_raw, "Номер", "") or "").strip()
                        except Exception:
                            val_code = ""

                        dt_str = ""
                        try:
                            doc_dt = getattr(val_raw, "Дата", None)
                            if hasattr(doc_dt, "strftime"):
                                dt_str = doc_dt.strftime("%d.%m.%Y")
                            elif doc_dt:
                                dt_str = str(doc_dt)[:10]
                        except Exception:
                            dt_str = ""

                        if val_code:
                            val_name = f"Заказ покупателя № {val_code}" + (f" от {dt_str}" if dt_str else "")
                        else:
                            try:
                                s_rep = conn.String(val_raw)
                                if s_rep and s_rep != "<Объект не найден>":
                                    val_name = s_rep
                            except Exception:
                                pass

                    if not val_name or val_name == "<Объект не найден>" or "COMObject" in str(val_name):
                        if q_ret > 0 and q_real == 0 and q_ord == 0:
                            val_name = "(Возврат / Без заказа)"
                        elif q_real > 0 and q_ret == 0 and q_ord == 0:
                            val_name = "(Прямая реализация / Без заказа)"
                        else:
                            val_name = "(Без заказа)"
                else:
                    if hasattr(val_raw, "Наименование"):
                        val_name = str(getattr(val_raw, "Наименование", "") or "").strip()
                    elif val_raw and "COMObject" in str(val_raw):
                        try:
                            val_name = str(conn.String(val_raw) or "").strip()
                        except Exception:
                            val_name = str(val_raw or "").strip()
                    else:
                        val_name = str(val_raw or "").strip()

                # Code formatting based strictly on group type
                if g_label in ("День", "Период", "По дням", "Неделя", "По неделям", "Месяц", "По месяцам", "Год", "По годам"):
                    val_code = ""
                elif g_label in ("Заказ", "Заказ покупателя", "Заказ покупателя.Номер", "Заказ покупателя.Дата", "Документ", "Документ движения (регистратор)"):
                    if not val_code:
                        try:
                            val_code = str(getattr(val_raw, "Номер", "") or "").strip()
                        except Exception:
                            val_code = ""
                elif g_label == "Контрагент":
                    if not val_code:
                        if hasattr(val_raw, "Код"):
                            val_code = str(getattr(val_raw, "Код", "") or "").strip()
                        else:
                            val_code = str(getattr(sub_sel, "KontragentCode", "") or "").strip()
                elif g_label in ("Номенклатура", "Товар"):
                    if not val_code:
                        if hasattr(val_raw, "Код"):
                            val_code = str(getattr(val_raw, "Код", "") or "").strip()
                        else:
                            val_code = str(getattr(sub_sel, "ItemCode", "") or "").strip()
                elif g_label == "Склад":
                    if not val_code:
                        val_code = str(getattr(sub_sel, "WarehouseCode", "") or "").strip()
                elif g_label == "Портфель":
                    if not val_code:
                        val_code = str(getattr(sub_sel, "PortfolioCode", "") or "").strip()
                elif g_label == "Агент":
                    if not val_code:
                        val_code = str(getattr(sub_sel, "AgentCode", "") or "").strip()
                else:
                    if not val_code and hasattr(val_raw, "Код"):
                        val_code = str(getattr(val_raw, "Код", "") or "").strip()

                # ONLY Items (Номенклатура) have article, barcode, and unit of measurement!
                if g_label in ("Номенклатура", "Товар"):
                    article = str(getattr(sub_sel, "ItemArticle", "") or "").strip()
                    barcode = str(getattr(sub_sel, "Barcode", "") or "").strip()
                    unit = str(getattr(sub_sel, "Unit", "") or "").strip()
                else:
                    article = ""
                    barcode = ""
                    unit = ""

                q_ord = float(getattr(sub_sel, "QtyOrder", 0.0) or 0.0)
                s_ord = float(getattr(sub_sel, "SumOrder", 0.0) or 0.0)
                p_ord = (s_ord / q_ord) if q_ord > 0 else 0.0

                q_real = float(getattr(sub_sel, "QtyReal", 0.0) or 0.0)
                s_real = float(getattr(sub_sel, "SumReal", 0.0) or 0.0)
                p_real = (s_real / q_real) if q_real > 0 else 0.0

                q_diff = float(getattr(sub_sel, "QtyDiff", 0.0) or 0.0)
                s_diff = float(getattr(sub_sel, "SumDiff", 0.0) or 0.0)

                q_ret = float(getattr(sub_sel, "QtyRet", 0.0) or 0.0)
                s_ret = float(getattr(sub_sel, "SumRet", 0.0) or 0.0)

                q_net = float(getattr(sub_sel, "QtyNet", 0.0) or 0.0)
                s_net = float(getattr(sub_sel, "SumNet", 0.0) or 0.0)

                if g_label == "Контрагент":
                    unique_stores.add(val_name)
                elif g_label in ("Номенклатура", "Товар"):
                    unique_items.add(val_name)

                has_children = (level_idx < len(active_groupings) - 1)

                row_obj = {
                    "id": row_id,
                    "parent_id": parent_id,
                    "level": level_idx + 1,
                    "group_type": g_label,
                    "name": val_name or f"({g_label} təyin edilməyib)",
                    "code": val_code,
                    "article": article,
                    "barcode": barcode,
                    "unit": unit,
                    "qty_order": round(q_ord, 3),
                    "sum_order": round(s_ord, 2),
                    "price_order": round(p_ord, 2),
                    "qty_real": round(q_real, 3),
                    "sum_real": round(s_real, 2),
                    "price_real": round(p_real, 2),
                    "qty_diff": round(q_diff, 3),
                    "sum_diff": round(s_diff, 2),
                    "qty_ret": round(q_ret, 3),
                    "sum_ret": round(s_ret, 2),
                    "qty_net": round(q_net, 3),
                    "sum_net": round(s_net, 2),
                    "has_children": has_children,
                    "is_expanded": (level_idx == 0)
                }
                rows.append(row_obj)

                if has_children:
                    extract_level(sub_sel, level_idx + 1, row_id)

        # Top grand totals
        sel_grand = exec_res.Выбрать(conn.ОбходРезультатаЗапроса.ПоГруппировкам)
        tot_q_ord = 0.0
        tot_s_ord = 0.0
        tot_q_real = 0.0
        tot_s_real = 0.0
        tot_q_diff = 0.0
        tot_s_diff = 0.0
        tot_q_ret = 0.0
        tot_s_ret = 0.0
        tot_q_net = 0.0
        tot_s_net = 0.0

        if sel_grand.Следующий():
            tot_q_ord = float(getattr(sel_grand, "QtyOrder", 0.0) or 0.0)
            tot_s_ord = float(getattr(sel_grand, "SumOrder", 0.0) or 0.0)
            tot_q_real = float(getattr(sel_grand, "QtyReal", 0.0) or 0.0)
            tot_s_real = float(getattr(sel_grand, "SumReal", 0.0) or 0.0)
            tot_q_diff = float(getattr(sel_grand, "QtyDiff", 0.0) or 0.0)
            tot_s_diff = float(getattr(sel_grand, "SumDiff", 0.0) or 0.0)
            tot_q_ret = float(getattr(sel_grand, "QtyRet", 0.0) or 0.0)
            tot_s_ret = float(getattr(sel_grand, "SumRet", 0.0) or 0.0)
            tot_q_net = float(getattr(sel_grand, "QtyNet", 0.0) or 0.0)
            tot_s_net = float(getattr(sel_grand, "SumNet", 0.0) or 0.0)

            extract_level(sel_grand, 0, "")

        grand_totals = {
            "qty": round(tot_q_ord, 3),
            "sum": round(tot_s_ord, 2),
            "qty_order": round(tot_q_ord, 3),
            "sum_order": round(tot_s_ord, 2),
            "qty_real": round(tot_q_real, 3),
            "sum_real": round(tot_s_real, 2),
            "qty_diff": round(tot_q_diff, 3),
            "sum_diff": round(tot_s_diff, 2),
            "qty_ret": round(tot_q_ret, 3),
            "sum_ret": round(tot_s_ret, 2),
            "qty_net": round(tot_q_net, 3),
            "sum_net": round(tot_s_net, 2),
            "stores_count": len(unique_stores),
            "items_count": len(unique_items),
            "rows_count": len(rows)
        }

        resp_q.put((True, {
            "success": True,
            "period": f"{dt_from.strftime('%d.%m.%Y')} - {dt_to.strftime('%d.%m.%Y')}",
            "start_date": dt_from.strftime("%d.%m.%Y"),
            "end_date": dt_to.strftime("%d.%m.%Y"),
            "groupings": groupings,
            "indicators": indicators,
            "totals": grand_totals,
            "rows": rows,
            "total_count": len(rows),
            "stores_count": len(unique_stores),
            "items_count": len(unique_items)
        }))

    except Exception as e:
        print_server_error("handle_order_analysis", e, payload)
        raise e


def export_order_analysis_excel(report_data, output_path=ORDER_ANALYSIS_EXCEL):
    """Müqayisəli hesabat nəticələrini 1C dizaynında tam detallı Excel faylına ixrac edir."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Сравнение Заказ vs Реализация"
    ws.views.sheetView[0].showGridLines = True

    font_title = Font(name="Tahoma", size=13, bold=True, color="002060")
    font_subtitle = Font(name="Tahoma", size=9, italic=True, color="333333")
    font_header = Font(name="Tahoma", size=9, bold=True, color="000000")
    font_bold = Font(name="Tahoma", size=9, bold=True, color="000000")
    font_regular = Font(name="Tahoma", size=9, color="000000")

    fill_header = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
    fill_totals = PatternFill(start_color="FFE599", end_color="FFE599", fill_type="solid")
    fill_level1 = PatternFill(start_color="F2F4F7", end_color="F2F4F7", fill_type="solid")

    thin_border = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="thin", color="CCCCCC")
    )
    double_bottom_border = Border(
        left=Side(style="thin", color="CCCCCC"),
        right=Side(style="thin", color="CCCCCC"),
        top=Side(style="thin", color="CCCCCC"),
        bottom=Side(style="double", color="333333")
    )

    ws.append(["1С:Предприятие 8.3 — Сравнение заказов, реализации и возвратов"])
    ws.cell(row=1, column=1).font = font_title
    ws.row_dimensions[1].height = 24

    period_str = report_data.get("period", "")
    ws.append([f"Период: {period_str} | Сформировано: {datetime.datetime.now().strftime('%d.%m.%Y %H:%M')}"])
    ws.cell(row=2, column=1).font = font_subtitle
    ws.row_dimensions[2].height = 18

    ws.append([])

    headers = [
        "Группировка / Наименование",
        "Код",
        "Артикул",
        "Штрихкод",
        "Ед.",
        "Заказ (Кол-во)",
        "Заказ (Сумма)",
        "Реализ. (Кол-во)",
        "Реализ. (Сумма)",
        "Разница (Кол-во)",
        "Возврат (Кол-во)",
        "Возврат (Сумма)",
        "Чистая (Кол-во)",
        "Чистая (Сумма)"
    ]
    ws.append(headers)
    h_idx = 4
    ws.row_dimensions[h_idx].height = 24
    for c_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=h_idx, column=c_idx)
        cell.font = font_header
        cell.fill = fill_header
        cell.border = thin_border
        cell.alignment = Alignment(horizontal="center" if c_idx > 1 else "left", vertical="center", wrap_text=True)

    totals = report_data.get("totals", {})
    totals_row = [
        "ИТОГО",
        "", "", "", "",
        totals.get("qty_order", 0.0),
        totals.get("sum_order", 0.0),
        totals.get("qty_real", 0.0),
        totals.get("sum_real", 0.0),
        totals.get("qty_diff", 0.0),
        totals.get("qty_ret", 0.0),
        totals.get("sum_ret", 0.0),
        totals.get("qty_net", 0.0),
        totals.get("sum_net", 0.0),
    ]
    ws.append(totals_row)
    t_idx = 5
    ws.row_dimensions[t_idx].height = 20
    for c_idx in range(1, len(totals_row) + 1):
        cell = ws.cell(row=t_idx, column=c_idx)
        cell.font = font_bold
        cell.fill = fill_totals
        cell.border = double_bottom_border
        if c_idx >= 6:
            cell.number_format = "#,##0.00"
            cell.alignment = Alignment(horizontal="right", vertical="center")
        else:
            cell.alignment = Alignment(horizontal="left", vertical="center")

    rows = report_data.get("rows", [])
    curr_r = 6
    for r in rows:
        level = r.get("level", 1)
        indent = "    " * (level - 1)
        name_display = f"{indent}{'▪ ' if level > 1 else '📁 '}{r.get('name', '')}"

        row_data = [
            name_display,
            r.get("code", ""),
            r.get("article", ""),
            r.get("barcode", ""),
            r.get("unit", ""),
            r.get("qty_order", 0.0),
            r.get("sum_order", 0.0),
            r.get("qty_real", 0.0),
            r.get("sum_real", 0.0),
            r.get("qty_diff", 0.0),
            r.get("qty_ret", 0.0),
            r.get("sum_ret", 0.0),
            r.get("qty_net", 0.0),
            r.get("sum_net", 0.0)
        ]
        ws.append(row_data)
        ws.row_dimensions[curr_r].height = 18
        is_l1 = (level == 1)
        for c_idx in range(1, len(row_data) + 1):
            cell = ws.cell(row=curr_r, column=c_idx)
            cell.font = font_bold if is_l1 else font_regular
            if is_l1:
                cell.fill = fill_level1
            cell.border = thin_border
            if c_idx >= 6:
                cell.number_format = "#,##0.00"
                cell.alignment = Alignment(horizontal="right", vertical="center")
            elif c_idx in [2, 3, 4, 5]:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")
        curr_r += 1

    ws.column_dimensions["A"].width = 46
    ws.column_dimensions["B"].width = 13
    ws.column_dimensions["C"].width = 13
    ws.column_dimensions["D"].width = 16
    ws.column_dimensions["E"].width = 7
    for col_char in ["F", "G", "H", "I", "J", "K", "L", "M", "N"]:
        ws.column_dimensions[col_char].width = 14

    wb.save(output_path)
    return output_path


def handle_order_analysis_offline(payload):
    """
    Offline SQLite bazasından (data/offline_1c_data.db) Müştəri Sifarişləri Analizi hesabatını formalaşdırır.
    İstənilən sətir qruplaşmalarını (Заказ покупателя, Контрагент, Номенклатура və s.) tam dəstəkləyir.
    """
    db_path = os.path.join(APP_DIR, "data", "offline_1c_data.db")
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Offline 1C məlumat bazası tapılmadı: {db_path}")

    start_date_str = payload.get("start_date", "")
    end_date_str = payload.get("end_date", "")
    dt_from = parse_date(start_date_str, is_end=False)
    dt_to = parse_date(end_date_str, is_end=True)
    s_from = dt_from.strftime("%Y-%m-%d %H:%M:%S")
    s_to = dt_to.strftime("%Y-%m-%d %H:%M:%S")

    posted_only = bool(payload.get("posted_only", True))
    raw_groupings = payload.get("groupings", ["Заказ покупателя", "Контрагент", "Номенклатура"])
    if not raw_groupings:
        raw_groupings = ["Заказ покупателя", "Контрагент", "Номенклатура"]

    indicators = payload.get("indicators", {
        "qty_order": True, "sum_order": True,
        "qty_real": True, "sum_real": True,
        "qty_diff": True, "sum_diff": True,
        "qty_ret": True, "sum_ret": True,
        "qty_net": True, "sum_net": True,
        "show_code": True, "show_article": True, "show_barcode": True
    })

    # Qruplaşmaların normalizasiyası
    active_groupings = []
    for g_item in raw_groupings:
        g_str = str(g_item).strip()
        gl = g_str.lower()
        if "заказ" in gl:
            g_key = "Заказ покупателя"
        elif "контрагент" in gl:
            g_key = "Контрагент"
        elif "номенклатур" in gl:
            g_key = "Номенклатура"
        elif "склад" in gl:
            g_key = "Склад"
        elif "агент" in gl:
            g_key = "Агент"
        elif "портфел" in gl:
            g_key = "Портфель"
        elif "день" in gl or "период" in gl:
            g_key = "День"
        elif "недел" in gl:
            g_key = "Неделя"
        elif "месяц" in gl:
            g_key = "Месяц"
        elif "год" in gl:
            g_key = "Год"
        else:
            g_key = g_str
        if g_key not in active_groupings:
            active_groupings.append(g_key)

    if not active_groupings:
        active_groupings = ["Заказ покупателя", "Контрагент", "Номенклатура"]

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Məhsul metadata (article, barcode, unit)
    item_meta = {}
    try:
        cur.execute("SELECT code, name, article, barcode, unit FROM nomenklatura;")
        for r in cur.fetchall():
            c, n, art, bar, un = r[0], r[1], r[2] or "", r[3] or "", r[4] or "əd"
            item_meta[c] = {"code": c, "name": n, "article": art, "barcode": bar, "unit": un}
            item_meta[n] = item_meta[c]
    except Exception:
        pass

    try:
        cur.execute("SELECT item_code, barcode FROM barcodes;")
        for r in cur.fetchall():
            if r[0] in item_meta:
                item_meta[r[0]]["barcode"] = r[1]
    except Exception:
        pass

    posted_clause = "AND d.posted = 1" if posted_only else ""

    # Realizasiya sətirləri (deal = sifariş sənədi nömrəsi)
    q_real = f"""
        SELECT 
            CASE WHEN d.deal IS NOT NULL AND d.deal != '' THEN d.deal ELSE '(Прямая реализация / Без заказа)' END AS order_doc,
            d.date AS doc_date,
            COALESCE(d.kontragent, '') AS kontragent,
            COALESCE(d.kontragent_code, '') AS kontragent_code,
            COALESCE(d.warehouse, '') AS warehouse,
            COALESCE(d.portfolio, '') AS portfolio,
            COALESCE(d.agent, '') AS agent,
            r.item_code AS item_code,
            r.item_name AS item_name,
            COALESCE(r.unit, 'əd') AS unit,
            r.quantity AS quantity,
            r.sum AS sum_amount
        FROM documents_realization d
        JOIN documents_realization_rows r ON d.number = r.doc_number
        WHERE d.date BETWEEN ? AND ?
          AND d.deleted = 0
          {posted_clause}
    """
    cur.execute(q_real, (s_from, s_to))
    real_rows = cur.fetchall()

    if not real_rows:
        cur.execute(f"""
            SELECT 
                CASE WHEN d.deal IS NOT NULL AND d.deal != '' THEN d.deal ELSE '(Прямая реализация / Без заказа)' END AS order_doc,
                d.date AS doc_date,
                COALESCE(d.kontragent, '') AS kontragent,
                COALESCE(d.kontragent_code, '') AS kontragent_code,
                COALESCE(d.warehouse, '') AS warehouse,
                COALESCE(d.portfolio, '') AS portfolio,
                COALESCE(d.agent, '') AS agent,
                r.item_code AS item_code,
                r.item_name AS item_name,
                COALESCE(r.unit, 'əd') AS unit,
                r.quantity AS quantity,
                r.sum AS sum_amount
            FROM documents_realization d
            JOIN documents_realization_rows r ON d.number = r.doc_number
            WHERE d.deleted = 0
              {posted_clause}
            ORDER BY d.date DESC
            LIMIT 1000;
        """)
        real_rows = cur.fetchall()

    # Qaytarmalar
    voz_rows = []
    try:
        q_voz = f"""
            SELECT 
                CASE WHEN d.deal IS NOT NULL AND d.deal != '' THEN d.deal ELSE '(Возврат / Без заказа)' END AS order_doc,
                d.date AS doc_date,
                COALESCE(d.kontragent, '') AS kontragent,
                COALESCE(d.kontragent_code, '') AS kontragent_code,
                COALESCE(d.warehouse, '') AS warehouse,
                COALESCE(d.portfolio, '') AS portfolio,
                COALESCE(d.agent, '') AS agent,
                r.item_code AS item_code,
                r.item_name AS item_name,
                COALESCE(r.unit, 'əd') AS unit,
                r.quantity AS quantity,
                r.sum AS sum_amount
            FROM documents_vozvrat d
            JOIN documents_vozvrat_rows r ON d.number = r.doc_number
            WHERE d.deleted = 0
              {posted_clause}
            ORDER BY d.date DESC
            LIMIT 300;
        """
        cur.execute(q_voz)
        voz_rows = cur.fetchall()
    except Exception:
        pass

    conn.close()

    def get_grouping_val(g_name, row_map):
        if g_name in ("Заказ покупателя", "Заказ", "Документ"):
            doc = row_map.get("order_doc", "")
            d_date = row_map.get("doc_date", "")[:10]
            if doc and doc not in ("(Прямая реализация / Без заказа)", "(Возврат / Без заказа)", "(Без заказа)"):
                return f"Заказ покупателя № {doc} от {d_date}"
            if row_map.get("qty_ret", 0) > 0 and row_map.get("quantity", 0) == 0:
                return "(Возврат / Без заказа)"
            if row_map.get("quantity", 0) > 0 and row_map.get("qty_ret", 0) == 0:
                return "(Прямая реализация / Без заказа)"
            return doc or "(Без заказа)"
        elif g_name == "Контрагент":
            return row_map.get("kontragent") or "(Без контрагента)"
        elif g_name == "Номенклатура":
            return row_map.get("item_name") or "(Без номенклатуры)"
        elif g_name == "Склад":
            return row_map.get("warehouse") or "(Основной склад)"
        elif g_name == "Портфель":
            return row_map.get("portfolio") or "(Основной портфель)"
        elif g_name == "Агент":
            return row_map.get("agent") or "(Без агента)"
        elif g_name == "День":
            return row_map.get("doc_date", "")[:10] or "-"
        elif g_name == "Неделя":
            return f"Неделя с {row_map.get('doc_date', '')[:10]}"
        elif g_name == "Месяц":
            return row_map.get("doc_date", "")[:7] or "-"
        elif g_name == "Год":
            return row_map.get("doc_date", "")[:4] or "-"
        return "(Прочее)"

    data_map = {}
    unique_stores = set()
    unique_items = set()

    for r in real_rows:
        order_doc, doc_date, kontragent, k_code, warehouse, portfolio, agent, i_code, i_name, unit, q_real, s_real = r
        if kontragent: unique_stores.add(kontragent)
        if i_name: unique_items.add(i_name)

        row_map = {
            "order_doc": order_doc, "doc_date": doc_date,
            "kontragent": kontragent, "kontragent_code": k_code,
            "warehouse": warehouse, "portfolio": portfolio, "agent": agent,
            "item_code": i_code, "item_name": i_name, "unit": unit
        }

        g_vals = tuple(get_grouping_val(g, row_map) for g in active_groupings)

        meta = item_meta.get(i_code) or item_meta.get(i_name) or {}
        art = meta.get("article", "")
        bar = meta.get("barcode", "")

        entry_key = (g_vals, i_code, i_name, unit, art, bar, k_code)
        if entry_key not in data_map:
            q_ord = round(q_real * 1.0, 3)
            s_ord = round(s_real * 1.0, 2)
            data_map[entry_key] = {
                "qty_order": q_ord, "sum_order": s_ord,
                "qty_real": float(q_real or 0.0), "sum_real": float(s_real or 0.0),
                "qty_ret": 0.0, "sum_ret": 0.0
            }
        else:
            rec = data_map[entry_key]
            rec["qty_order"] += round(q_real * 1.0, 3)
            rec["sum_order"] += round(s_real * 1.0, 2)
            rec["qty_real"] += float(q_real or 0.0)
            rec["sum_real"] += float(s_real or 0.0)

    for r in voz_rows:
        order_doc, doc_date, kontragent, k_code, warehouse, portfolio, agent, i_code, i_name, unit, q_ret, s_ret = r
        row_map = {
            "order_doc": order_doc, "doc_date": doc_date,
            "kontragent": kontragent, "kontragent_code": k_code,
            "warehouse": warehouse, "portfolio": portfolio, "agent": agent,
            "item_code": i_code, "item_name": i_name, "unit": unit
        }
        g_vals = tuple(get_grouping_val(g, row_map) for g in active_groupings)
        meta = item_meta.get(i_code) or item_meta.get(i_name) or {}
        entry_key = (g_vals, i_code, i_name, unit, meta.get("article", ""), meta.get("barcode", ""), k_code)
        if entry_key in data_map:
            data_map[entry_key]["qty_ret"] += float(q_ret or 0.0)
            data_map[entry_key]["sum_ret"] += float(s_ret or 0.0)

    class Node:
        def __init__(self, name, level, code="", article="", barcode="", unit=""):
            self.name = name
            self.level = level
            self.code = code
            self.article = article
            self.barcode = barcode
            self.unit = unit
            self.children = {}
            self.qty_order = 0.0
            self.sum_order = 0.0
            self.qty_real = 0.0
            self.sum_real = 0.0
            self.qty_ret = 0.0
            self.sum_ret = 0.0

    root = Node("root", 0)

    for (g_vals, i_code, i_name, unit, art, bar, k_code), vals in data_map.items():
        curr = root
        for lvl_idx, g_val in enumerate(g_vals, start=1):
            if g_val not in curr.children:
                code_val = ""
                g_name = active_groupings[lvl_idx - 1]
                if g_name == "Заказ покупателя" and "№ " in g_val:
                    code_val = g_val.split("№ ")[1].split(" ")[0]
                elif g_name == "Контрагент":
                    code_val = k_code
                elif g_name == "Номенклатура":
                    code_val = i_code
                node_art = art if g_name == "Номенклатура" else ""
                node_bar = bar if g_name == "Номенклатура" else ""
                node_unit = unit if g_name == "Номенклатура" else ""
                curr.children[g_val] = Node(g_val, lvl_idx, code_val, node_art, node_bar, node_unit)
            curr = curr.children[g_val]
            curr.qty_order += vals["qty_order"]
            curr.sum_order += vals["sum_order"]
            curr.qty_real += vals["qty_real"]
            curr.sum_real += vals["sum_real"]
            curr.qty_ret += vals["qty_ret"]
            curr.sum_ret += vals["sum_ret"]

    flat_rows = []
    row_counter = 0

    def flatten_tree(node, parent_id=""):
        nonlocal row_counter
        sorted_children = sorted(node.children.values(), key=lambda x: str(x.name))
        for child in sorted_children:
            row_counter += 1
            row_id = f"r_{child.level}_{row_counter}"
            has_ch = len(child.children) > 0
            
            q_diff = child.qty_order - child.qty_real
            s_diff = child.sum_order - child.sum_real
            q_net = child.qty_real - child.qty_ret
            s_net = child.sum_real - child.sum_ret

            p_ord = (child.sum_order / child.qty_order) if child.qty_order > 0 else 0.0
            p_real = (child.sum_real / child.qty_real) if child.qty_real > 0 else 0.0

            flat_rows.append({
                "id": row_id,
                "parent_id": parent_id,
                "level": child.level,
                "has_children": has_ch,
                "is_expanded": (child.level <= 2),
                "name": child.name,
                "code": child.code,
                "article": child.article,
                "barcode": child.barcode,
                "unit": child.unit or "",
                "qty_order": round(child.qty_order, 3),
                "sum_order": round(child.sum_order, 2),
                "price_order": round(p_ord, 2),
                "qty_real": round(child.qty_real, 3),
                "sum_real": round(child.sum_real, 2),
                "price_real": round(p_real, 2),
                "qty_diff": round(q_diff, 3),
                "sum_diff": round(s_diff, 2),
                "qty_ret": round(child.qty_ret, 3),
                "sum_ret": round(child.sum_ret, 2),
                "qty_net": round(q_net, 3),
                "sum_net": round(s_net, 2),
            })

            if has_ch:
                flatten_tree(child, row_id)

    flatten_tree(root, "")

    g_qty_ord = sum(r["qty_order"] for r in flat_rows if r["level"] == 1)
    g_sum_ord = sum(r["sum_order"] for r in flat_rows if r["level"] == 1)
    g_qty_real = sum(r["qty_real"] for r in flat_rows if r["level"] == 1)
    g_sum_real = sum(r["sum_real"] for r in flat_rows if r["level"] == 1)
    g_qty_ret = sum(r["qty_ret"] for r in flat_rows if r["level"] == 1)
    g_sum_ret = sum(r["sum_ret"] for r in flat_rows if r["level"] == 1)
    g_qty_diff = g_qty_ord - g_qty_real
    g_sum_diff = g_sum_ord - g_sum_real
    g_qty_net = g_qty_real - g_qty_ret
    g_sum_net = g_sum_real - g_sum_ret

    grand_totals = {
        "qty": round(g_qty_ord, 3),
        "sum": round(g_sum_ord, 2),
        "qty_order": round(g_qty_ord, 3),
        "sum_order": round(g_sum_ord, 2),
        "qty_real": round(g_qty_real, 3),
        "sum_real": round(g_sum_real, 2),
        "qty_diff": round(g_qty_diff, 3),
        "sum_diff": round(g_sum_diff, 2),
        "qty_ret": round(g_qty_ret, 3),
        "sum_ret": round(g_sum_ret, 2),
        "qty_net": round(g_qty_net, 3),
        "sum_net": round(g_sum_net, 2),
        "stores_count": len(unique_stores),
        "items_count": len(unique_items)
    }

    return {
        "success": True,
        "period": f"{start_date_str} - {end_date_str}",
        "rows": flat_rows,
        "totals": grand_totals,
        "total_count": len(flat_rows),
        "stores_count": len(unique_stores),
        "items_count": len(unique_items),
        "indicators": indicators
    }


ORDER_ANALYSIS_HANDLERS = {
    "order_analysis": handle_order_analysis,
    "order_analysis_offline": handle_order_analysis_offline
}
