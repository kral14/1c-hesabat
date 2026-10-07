# -*- coding: utf-8 -*-
"""
services/documents/base.py
Shared utility functions for 1C document query handlers.
"""
import datetime
import re

def narrow_search_to_column(payload, where_parts, field_map, query=None):
    """Honor the journal's selected text column using only trusted query fields."""
    key = payload.get("search_field")
    fields = {"number": "Т.Номер", **field_map}
    expression = fields.get(key)
    if not payload.get("search") or not expression or key in {"amount", "date", "posted", "deleted"}:
        return
    mode = payload.get("search_mode", "contains")
    term = str(payload["search"])
    pattern = term if mode == "exact" else (term + "%" if mode == "starts" else "%" + term + "%")
    if query is not None:
        query.SetParameter("SearchVal", pattern)
    for index, condition in enumerate(where_parts):
        if "&SearchVal" in condition:
            where_parts[index] = f"{expression} {'=' if mode == 'exact' else 'ПОДОБНО'} &SearchVal"
            return

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


def build_filter_conditions(filters, q_doc, where_parts, debug_params, field_map=None):
    """
    Translates UI filter rules into 1C query conditions safely and accurately.
    field_map: dict of UI field key -> 1C SQL expression (e.g. {'kontragent': 'Т.Контрагент.Наименование'})
    """
    if not filters or not isinstance(filters, list):
        return

    mapping = {
        "number": "Т.Номер",
        "date": "Т.Дата",
        "posted": "Т.Проведен",
        "deleted": "Т.ПометкаУдаления",
        "kontragent": "Т.Контрагент.Наименование",
        "kontragent_code": "Т.Контрагент.Код",
        "amount": "Т.СуммаДокумента",
        "warehouse": "Т.Склад.Наименование",
        "responsible": "Т.Ответственный.Наименование",
        "comment": "Т.Комментарий",
        "marshrut": "Т.Маршрут",
        "voditel": "ПРЕДСТАВЛЕНИЕ(Т.Водитель)"
    }
    if field_map:
        mapping.update(field_map)

    for idx, crit in enumerate(filters):
        if not isinstance(crit, dict) or crit.get("enabled") is False:
            continue
        f_field = str(crit.get("field") or crit.get("fieldKey") or "").strip()
        f_op = str(crit.get("operator") or crit.get("comparison") or "Содержит").strip()
        f_val = crit.get("value", "")

        if f_field in ["nomenclature", "nomenklatura", "goods", "tovar"]:
            doc_table = mapping.get("__doc_table") or "Документ.РеализацияТоваровУслуг"
            param_key = f"p_crit_{idx}"
            
            # Check if this is PogruzkiMashin
            if "ПогрузкиМашин" in doc_table:
                subquery_from = (
                    f"{doc_table}.СписокРеализаций КАК ПМ "
                    "ВНУТРЕННЕЕ СОЕДИНЕНИЕ Документ.РеализацияТоваровУслуг.Товары КАК ТТ "
                    "ПО ПМ.Накладная = ТТ.Ссылка"
                )
                link_field = "ПМ.Ссылка"
            else:
                subquery_from = f"{doc_table}.Товары КАК ТТ"
                link_field = "ТТ.Ссылка"

            if f_op in ["Заполнено", "Не заполнено"]:
                cond = f"Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ {link_field} ИЗ {subquery_from} ГДЕ ТТ.Номенклатура ЕСТЬ НЕ NULL)"
                where_parts.append(cond if f_op == "Заполнено" else f"НЕ ({cond})")
                continue

            if f_val is None or str(f_val).strip() == "":
                continue
            val_str = str(f_val).strip()

            if f_op == "Равно":
                q_doc.SetParameter(param_key, val_str)
                debug_params[param_key] = val_str
                nom_cond = f"(ТТ.Номенклатура.Наименование = &{param_key} ИЛИ ТТ.Номенклатура.Код = &{param_key} ИЛИ ТТ.Номенклатура.Наименование ПОДОБНО &{param_key})"
                where_parts.append(f"Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ {link_field} ИЗ {subquery_from} ГДЕ {nom_cond})")
            elif f_op == "Не равно":
                q_doc.SetParameter(param_key, val_str)
                debug_params[param_key] = val_str
                nom_cond = f"(ТТ.Номенклатура.Наименование = &{param_key} ИЛИ ТТ.Номенклатура.Код = &{param_key})"
                where_parts.append(f"НЕ (Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ {link_field} ИЗ {subquery_from} ГДЕ {nom_cond}))")
            elif f_op == "Не содержит":
                q_doc.SetParameter(param_key, f"%{val_str}%")
                debug_params[param_key] = f"%{val_str}%"
                nom_cond = f"(ТТ.Номенклатура.Наименование ПОДОБНО &{param_key} ИЛИ ТТ.Номенклатура.Код ПОДОБНО &{param_key} ИЛИ ТТ.Номенклатура.Артикул ПОДОБНО &{param_key})"
                where_parts.append(f"НЕ (Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ {link_field} ИЗ {subquery_from} ГДЕ {nom_cond}))")
            elif f_op == "Начинается с":
                q_doc.SetParameter(param_key, f"{val_str}%")
                debug_params[param_key] = f"{val_str}%"
                nom_cond = f"(ТТ.Номенклатура.Наименование ПОДОБНО &{param_key} ИЛИ ТТ.Номенклатура.Код ПОДОБНО &{param_key})"
                where_parts.append(f"Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ {link_field} ИЗ {subquery_from} ГДЕ {nom_cond})")
            elif f_op in ["В списке", "Не в списке", "В группе из списка"]:
                raw_tokens = re.split(r"[,;]+", val_str)
                tokens = [t.strip() for t in raw_tokens if t.strip()]
                if tokens:
                    tok_conds = []
                    for t_i, tok in enumerate(tokens):
                        p_tok = f"{param_key}_tok_{t_i}"
                        q_doc.SetParameter(p_tok, f"%{tok}%")
                        debug_params[p_tok] = f"%{tok}%"
                        tok_conds.append(f"(ТТ.Номенклатура.Наименование ПОДОБНО &{p_tok} ИЛИ ТТ.Номенклатура.Код ПОДОБНО &{p_tok})")
                    comb = " ИЛИ ".join(tok_conds)
                    if f_op == "Не в списке":
                        where_parts.append(f"НЕ (Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ {link_field} ИЗ {subquery_from} ГДЕ {comb}))")
                    else:
                        where_parts.append(f"Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ {link_field} ИЗ {subquery_from} ГДЕ {comb})")
            else: # Содержит
                q_doc.SetParameter(param_key, f"%{val_str}%")
                debug_params[param_key] = f"%{val_str}%"
                nom_cond = f"(ТТ.Номенклатура.Наименование ПОДОБНО &{param_key} ИЛИ ТТ.Номенклатура.Код ПОДОБНО &{param_key} ИЛИ ТТ.Номенклатура.Артикул ПОДОБНО &{param_key})"
                where_parts.append(f"Т.Ссылка В (ВЫБРАТЬ РАЗЛИЧНЫЕ {link_field} ИЗ {subquery_from} ГДЕ {nom_cond})")
            continue

        field_sql = mapping.get(f_field)
        if not field_sql:
            print(f"[FILTER WARNING] Field '{f_field}' not in mapping, skipping.")
            continue

        param_key = f"p_crit_{idx}"

        if f_op in ["Заполнено", "Не заполнено"]:
            cond = f"({field_sql} ЕСТЬ НЕ NULL И {field_sql} <> \"\")"
            where_parts.append(cond if f_op == "Заполнено" else f"НЕ {cond}")
            continue

        if f_val is None or str(f_val).strip() == "":
            continue
        val_str = str(f_val).strip()

        if f_field in ["posted", "deleted"]:
            b_val = (val_str.lower() in ["true", "1", "да", "yes", "истина"])
            q_doc.SetParameter(param_key, b_val)
            debug_params[param_key] = b_val
            comparison = "<>" if f_op == "Не равно" else "="
            where_parts.append(f"{field_sql} {comparison} &{param_key}")
            continue

        if f_field == "date":
            dt_val = parse_query_datetime(val_str, is_end=(f_op in ["Меньше или равно", "Больше или равно"]))
            if dt_val:
                q_doc.SetParameter(param_key, dt_val)
                debug_params[param_key] = dt_val
                if f_op == "Равно":
                    where_parts.append(f"{field_sql} = &{param_key}")
                elif f_op == "Не равно":
                    where_parts.append(f"{field_sql} <> &{param_key}")
                elif f_op in ["Больше", "Интервал (>, <)", "Интервал (>, <=)"]:
                    where_parts.append(f"{field_sql} > &{param_key}")
                elif f_op in ["Больше или равно", "Интервал (>=, <=)", "Интервал (>=, <)"]:
                    where_parts.append(f"{field_sql} >= &{param_key}")
                elif f_op in ["Меньше"]:
                    where_parts.append(f"{field_sql} < &{param_key}")
                elif f_op in ["Меньше или равно"]:
                    where_parts.append(f"{field_sql} <= &{param_key}")
            continue

        if f_field == "amount":
            try:
                num_val = float(str(val_str).replace(",", ".").replace(" ", ""))
                q_doc.SetParameter(param_key, num_val)
                debug_params[param_key] = num_val
                if f_op == "Равно":
                    where_parts.append(f"{field_sql} = &{param_key}")
                elif f_op == "Не равно":
                    where_parts.append(f"{field_sql} <> &{param_key}")
                elif f_op in ["Больше", "Интервал (>, <)", "Интервал (>, <=)"]:
                    where_parts.append(f"{field_sql} > &{param_key}")
                elif f_op in ["Больше или равно", "Интервал (>=, <=)", "Интервал (>=, <)"]:
                    where_parts.append(f"{field_sql} >= &{param_key}")
                elif f_op in ["Меньше"]:
                    where_parts.append(f"{field_sql} < &{param_key}")
                elif f_op in ["Меньше или равно"]:
                    where_parts.append(f"{field_sql} <= &{param_key}")
            except Exception:
                pass
            continue

        # Text filters
        if f_op in ["В списке", "Не в списке", "В группе из списка"]:
            raw_tokens = re.split(r"[,;]+", val_str)
            tokens = [t.strip() for t in raw_tokens if t.strip()]
            if tokens:
                tok_conds = []
                for t_i, tok in enumerate(tokens):
                    p_tok = f"{param_key}_tok_{t_i}"
                    q_doc.SetParameter(p_tok, f"%{tok}%")
                    debug_params[p_tok] = f"%{tok}%"
                    tok_conds.append(f"{field_sql} ПОДОБНО &{p_tok}")
                if tok_conds:
                    comb = " ИЛИ ".join(tok_conds)
                    where_parts.append(f"НЕ ({comb})" if f_op == "Не в списке" else f"({comb})")
        elif f_op == "Равно":
            q_doc.SetParameter(param_key, val_str)
            debug_params[param_key] = val_str
            where_parts.append(f"{field_sql} = &{param_key}")
        elif f_op == "Не равно":
            q_doc.SetParameter(param_key, val_str)
            debug_params[param_key] = val_str
            where_parts.append(f"{field_sql} <> &{param_key}")
        elif f_op == "Начинается с":
            q_doc.SetParameter(param_key, val_str + "%")
            debug_params[param_key] = val_str + "%"
            where_parts.append(f"{field_sql} ПОДОБНО &{param_key}")
        elif f_op == "Не содержит":
            q_doc.SetParameter(param_key, f"%{val_str}%")
            debug_params[param_key] = f"%{val_str}%"
            where_parts.append(f"НЕ ({field_sql} ПОДОБНО &{param_key})")
        else: # Содержит
            q_doc.SetParameter(param_key, f"%{val_str}%")
            debug_params[param_key] = f"%{val_str}%"
            where_parts.append(f"{field_sql} ПОДОБНО &{param_key}")
