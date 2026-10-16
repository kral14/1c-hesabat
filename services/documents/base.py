# -*- coding: utf-8 -*-
"""
services/documents/base.py
Shared utility functions for 1C document query handlers.
"""
from services.onec_dates import as_1c_date, parse_calendar_date, format_calendar_date
from services.filter_policy_loader import normalize_filters, validate_supported_fields
from services.filter_policy import validate_filters, number_values
from services.filter_sql import text_condition
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
    return format_calendar_date(raw_date)


def parse_query_datetime(val, is_end=False):
    return parse_calendar_date(val, is_end)


def build_filter_conditions(filters, q_doc, where_parts, debug_params, field_map=None, conn=None):
    """
    Translates UI filter rules into 1C query conditions safely and accurately.
    field_map: dict of UI field key -> 1C SQL expression (e.g. {'kontragent': 'Т.Контрагент.Наименование'})
    """
    if filters is None or filters == []:
        return

    filters = normalize_filters(filters)
    if field_map and "__supported_fields" in field_map:
        validate_supported_fields(filters, field_map["__supported_fields"])

    mapping = {
        "number": "Т.Номер",
        "date": "Т.Дата",
        "posted": "Т.Проведен",
        "deleted": "Т.ПометкаУдаления",
        "kontragent": "Т.Контрагент.Наименование",
        "kontragent_code": "Т.Контрагент.Код",
        "golovnoy_kontragent": "Т.Контрагент.ГоловнойКонтрагент.Наименование",
        "golovnoy_kontragent_code": "Т.Контрагент.ГоловнойКонтрагент.Код",
        "agent": "Т.ДоговорКонтрагента.Агент.Наименование",
        "amount": "Т.СуммаДокумента",
        "warehouse": "Т.Склад.Наименование",
        "responsible": "Т.Ответственный.Наименование",
        "comment": "Т.Комментарий",
        "marshrut": "Т.Маршрут",
        "voditel": "Т.Водитель.Наименование"
    }
    if field_map:
        mapping.update(field_map)

    for idx, crit in enumerate(filters):
        if not isinstance(crit, dict) or crit.get("enabled") is False:
            continue
        f_field = str(crit.get("field") or crit.get("fieldKey") or "").strip()
        if f_field in ('agent_sales_type','agent_sales_group'):
            from services.agent_filters import condition
            if conn is None: raise ValueError('Agent təsnifatı üçün 1C bağlantısı tələb olunur')
            where_parts.append(condition(conn,q_doc,crit,f'p_agent_{idx}',debug_params))
            continue
        f_op = str(crit.get("operator") or crit.get("comparison") or "Содержит").strip()
        f_val = crit.get("value", "")
        if crit.get('referenceCode') and f_field in ('kontragent','golovnoy_kontragent') and f_op == 'Равно' and (crit.get('referenceName') is None or crit['referenceName'] == f_val):
            expression='Т.Контрагент.Код' if f_field=='kontragent' else 'Т.Контрагент.ГоловнойКонтрагент.Код'
            param_key=f'p_ref_{idx}'
            q_doc.SetParameter(param_key,str(crit['referenceCode']).strip())
            where_parts.append(f'{expression} = &{param_key}')
            continue

        if f_field in ["nomenclature", "nomenklatura", "goods", "tovar", "artikul", "barcode"]:
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

            attribute_expression = None
            if f_field == 'artikul': attribute_expression = 'ТТ.Номенклатура.Артикул'
            if f_field == 'barcode':
                subquery_from += ' ЛЕВОЕ СОЕДИНЕНИЕ РегистрСведений.Штрихкоды КАК ШК ПО ШК.Владелец = ТТ.Номенклатура'
                attribute_expression = 'ШК.Штрихкод'
            if f_op in ["Заполнено", "Не заполнено"]:
                filled = text_condition(q_doc, attribute_expression, {'operator': 'Заполнено'}, param_key, debug_params) if attribute_expression else 'ТТ.Номенклатура <> ЗНАЧЕНИЕ(Справочник.Номенклатура.ПустаяСсылка)'
                cond = f"Т.Ссылка В (ВЫБРАТЬ {link_field} ИЗ {subquery_from} ГДЕ {filled})"
                where_parts.append(cond if f_op == "Заполнено" else f"НЕ ({cond})")
                continue
            positive_op = {"Не равно": "Равно", "Не содержит": "Содержит", "Не в списке": "В списке"}.get(f_op, f_op)
            structured = crit.get('structuredFilter') or {}
            entries = structured.get('items') if positive_op in ('В списке', 'В группе из списка') else None
            if not entries:
                tokens = re.split(r'[,;\n]+', str(f_val)) if positive_op in ('В списке', 'В группе из списка') else [f_val]
                entries = [{'value': str(v).strip(), 'comp': 'contains' if positive_op == 'Содержит' else 'equal'} for v in tokens if str(v).strip()]
            document_matches = []
            for token_index, entry in enumerate(entries):
                value = str(entry.get('value') or '').strip()
                selected_code = str(entry.get('code') or '').strip() if entry.get('comp', 'equal') == 'equal' else ''
                bracket = re.match(r'^\[([^\]]+)\]\s*(.*)$', value)
                token_op = 'Содержит' if entry.get('comp') == 'contains' else ('Начинается с' if positive_op == 'Начинается с' else 'Равно')
                fields = [('Код', selected_code)] if selected_code and token_op == 'Равно' else [('Код', bracket[1])] if bracket and token_op == 'Равно' else [(name, value) for name in ('Наименование', 'Код', 'Артикул')]
                if attribute_expression:
                    token = entry.get(f_field) if entry.get('comp', 'equal') == 'equal' and entry.get(f_field) else value
                    conditions = [text_condition(q_doc, attribute_expression, {'operator': token_op, 'value': token}, f'{param_key}_{token_index}', debug_params)]
                else:
                    conditions = [text_condition(q_doc, f'ТТ.Номенклатура.{name}', {'operator': token_op, 'value': token}, f'{param_key}_{token_index}_{i}', debug_params) for i, (name, token) in enumerate(fields)]
                document_matches.append(f"Т.Ссылка В (ВЫБРАТЬ {link_field} ИЗ {subquery_from} ГДЕ ({' ИЛИ '.join(conditions)}))")
            if not document_matches: raise ValueError('Məhsul filtrinin dəyərini daxil edin')
            join = ' И ' if structured.get('matchAll') else ' ИЛИ '
            condition = '(' + join.join(document_matches) + ')'
            where_parts.append('НЕ ' + condition if f_op in ('Не равно', 'Не содержит', 'Не в списке') else condition)
            continue

        if f_field == "vms_status":
            expression = 'ЕСТЬNULL(ВМС.СтатусВМС, ЗНАЧЕНИЕ(Перечисление.СтатусыВМС.ПустаяСсылка))'
            empty = 'ЗНАЧЕНИЕ(Перечисление.СтатусыВМС.ПустаяСсылка)'
            if f_op in ('Заполнено', 'Не заполнено'):
                where_parts.append(f'{expression} {"<>" if f_op == "Заполнено" else "="} {empty}')
                continue
            statuses = {'выгружен': 'Выгружен', 'подтвержденвмс': 'ПодтвержденВМС', 'естьрасхождение': 'ЕстьРасхождение'}
            structured = crit.get('structuredFilter') or {}
            values = [item.get('value', '') for item in structured.get('items', [])] if structured.get('items') else re.split(r'[,;\n]+', str(f_val))
            literals = []
            for value in values:
                normalized = re.sub(r'[\s_]+', '', str(value).lower().replace('wms', 'вмс'))
                name = statuses.get(normalized)
                if not name: raise ValueError('WMS statusunu siyahıdan seçin: ' + str(value))
                literals.append(f'{expression} = ЗНАЧЕНИЕ(Перечисление.СтатусыВМС.{name})')
            if not literals: raise ValueError('WMS statusunu seçin')
            condition = '(' + ' ИЛИ '.join(literals) + ')'
            where_parts.append('НЕ ' + condition if f_op in ('Не равно', 'Не в списке') else condition)
            continue

        field_sql = mapping.get(f_field)
        if not field_sql:
            raise ValueError(f'Filtr sahəsi dəstəklənmir: {f_field}')

        if "ПРЕДСТАВЛЕНИЕ" in field_sql and "ПОДСТРОКА" not in field_sql:
            field_sql = f"ПОДСТРОКА({field_sql}, 1, 150)"

        param_key = f"p_crit_{idx}"

        if f_op.startswith('Интервал') and f_field in ('date', 'amount', 'realization_count'):
            bounds = re.search(r'\((>=|>),\s*(<=|<)\)', f_op)
            for name, comparison in [('valueFrom', bounds[1]), ('valueTo', bounds[2])]:
                raw = crit.get(name)
                if raw is None or str(raw).strip() == '':
                    continue
                value = as_1c_date(parse_query_datetime(raw, name == 'valueTo')) if f_field == 'date' else float(str(raw).replace(',', '.'))
                parameter = f'{param_key}_{name}'
                q_doc.SetParameter(parameter, value)
                debug_params[parameter] = value
                where_parts.append(f'{field_sql} {comparison} &{parameter}')
            continue

        if f_op in ["Заполнено", "Не заполнено"]:
            if f_field in ("date", "amount", "realization_count"):
                empty = "ДАТАВРЕМЯ(1,1,1)" if f_field == "date" else "0"
                where_parts.append(f'{field_sql} {"<>" if f_op == "Заполнено" else "="} {empty}')
            else:
                where_parts.append(text_condition(q_doc, field_sql, crit, param_key, debug_params))
            continue

        if f_val is None or str(f_val).strip() == "":
            continue
        val_str = str(f_val).strip()

        if f_field in ["posted", "deleted"]:
            b_val = (val_str.lower() in ["true", "1", "да", "yes", "истина"])
            if f_op == "Не равно":
                b_val = not b_val
            where_parts.append(f"{field_sql} = ИСТИНА" if b_val else f"{field_sql} = ЛОЖЬ")
            debug_params[param_key] = b_val
            continue

        if f_field == "date":
            dt_val = parse_query_datetime(val_str, is_end=(f_op in ["Меньше", "Меньше или равно"]))
            if dt_val:
                q_doc.SetParameter(param_key, as_1c_date(dt_val))
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

        if f_field in ("amount", "realization_count"):
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
        if f_field != 'number':
            where_parts.append(text_condition(q_doc, field_sql, crit, param_key, debug_params))
            continue
        if f_op in ["В списке", "Не в списке", "В группе из списка"]:
            if f_field == 'number':
                tokens = number_values(crit)
                conditions = []
                for token_index, token in enumerate(tokens):
                    parameter = f'{param_key}_tok_{token_index}'
                    q_doc.SetParameter(parameter, token)
                    debug_params[parameter] = token
                    conditions.append(f'{field_sql} = &{parameter}')
                combined = ' ИЛИ '.join(conditions)
                where_parts.append(f'НЕ ({combined})' if f_op == 'Не в списке' else f'({combined})')
                continue
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
