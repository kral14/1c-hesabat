"""Audit filters compiled before grouping and limiting results."""
import re
from services.onec_dates import as_1c_date
from services.documents.base import build_filter_conditions, parse_query_datetime

DOCUMENT_TYPES = ('РеализацияТоваровУслуг', 'ВозвратТоваровОтПокупателя', 'ПогрузкиМашин', 'УстановкаЦенНоменклатуры')
COMMON_FIELDS = {'number', 'date', 'posted', 'deleted', 'amount'}
PARTNER_FIELDS = {'kontragent', 'warehouse', 'agent', 'portfolio', 'contract'}

class Parameters:
    def __init__(self, query, prefix):
        self.query, self.prefix = query, prefix
    def SetParameter(self, key, value):
        self.query.SetParameter(self.prefix + key, value)

def date_condition(query, condition, expression, prefix):
    op = condition.get('operator', 'Равно')
    if op.startswith('Интервал'):
        bounds = re.search(r'\((>=|>),\s*(<=|<)\)', op)
        if not bounds:
            raise ValueError('Yanlış tarix intervalı')
        clauses = []
        for key, cmp, is_end in [('valueFrom', bounds[1], False), ('valueTo', bounds[2], True)]:
            value = condition.get(key)
            if value:
                parsed = parse_query_datetime(value, is_end)
                if parsed is None: raise ValueError('Yanlış tarix')
                name = prefix + key
                query.SetParameter(name, as_1c_date(parsed))
                clauses.append(f'{expression} {cmp} &{name}')
        if not clauses: raise ValueError('Tarix intervalını daxil edin')
        return ' И '.join(clauses)
    comparisons = {'Равно':'=', 'Не равно':'<>', 'Больше':'>', 'Больше или равно':'>=', 'Меньше':'<', 'Меньше или равно':'<='}
    if op in ('Заполнено', 'Не заполнено'):
        return f'{expression} {"<>" if op == "Заполнено" else "="} ДАТАВРЕМЯ(1,1,1)'
    if op not in comparisons: raise ValueError('Tarix üçün uyğun olmayan müqayisə')
    value = parse_query_datetime(condition.get('value'), op in ('Меньше или равно', 'Больше'))
    if value is None: raise ValueError('Tarixi daxil edin')
    name = prefix + 'date'
    query.SetParameter(name, as_1c_date(value))
    return f'{expression} {comparisons[op]} &{name}'

def document_conditions(query, payload, doc_type, prefix='af_', field_map=None):
    if doc_type not in DOCUMENT_TYPES: raise ValueError('Audit üçün sənəd növünü seçin')
    allowed = COMMON_FIELDS | (PARTNER_FIELDS if doc_type in DOCUMENT_TYPES[:2] else set())
    if doc_type == 'УстановкаЦенНоменклатуры': allowed = allowed - {'amount'}
    rules = payload.get('filters') or []
    if not isinstance(rules, list): raise ValueError('Yanlış filtr formatı')
    clauses = []
    mapping = {'portfolio':'Т.ДоговорКонтрагента.Портфель.Наименование', 'contract':'Т.ДоговорКонтрагента.Наименование'}
    if field_map: mapping.update(field_map)
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict): raise ValueError('Yanlış filtr şərti')
        if rule.get('enabled') is False: continue
        field = rule.get('fieldKey') or rule.get('field')
        if field == 'change_date': continue
        if field not in allowed: raise ValueError(f'Bu sənəd növü üçün filtr dəstəklənmir: {field}')
        if field == 'date':
            clauses.append(date_condition(query, rule, 'Т.Дата', prefix + str(index)))
            continue
        if field == 'amount' and str(rule.get('operator', '')).startswith('Интервал'):
            bounds = re.search(r'\((>=|>),\s*(<=|<)\)', rule['operator'])
            if not bounds: raise ValueError('Yanlış məbləğ intervalı')
            added = False
            for value_key, cmp in [('valueFrom', bounds[1]), ('valueTo', bounds[2])]:
                if str(rule.get(value_key, '')).strip():
                    value = float(str(rule[value_key]).replace(',', '.'))
                    name = prefix + str(index) + value_key
                    query.SetParameter(name, as_1c_date(value))
                    clauses.append(f'Т.СуммаДокумента {cmp} &{name}')
                    added = True
            if not added: raise ValueError('Məbləğ intervalını daxil edin')
            continue
        values = []
        rule_prefix = prefix + str(index) + '_'
        build_filter_conditions([rule], Parameters(query, rule_prefix), values, {}, mapping)
        if not values: raise ValueError(f'Filtr dəyərini daxil edin: {field}')
        clauses.extend(re.sub(r'&([A-Za-z_][A-Za-z_0-9]*)', lambda m:'&' + rule_prefix + m[1], v) for v in values)
    if payload.get('period_field') == 'date':
        for key, cmp, end in [('date_from','>=',False),('date_to','<=',True)]:
            if payload.get(key):
                query.SetParameter(prefix + key, as_1c_date(parse_query_datetime(payload[key], end)))
                clauses.append(f'Т.Дата {cmp} &{prefix}{key}')
    mode = payload.get('filter_mode')
    if mode == 'posted_only': clauses.append('Т.Проведен = ИСТИНА')
    elif mode == 'draft_only': clauses.extend(['Т.Проведен = ЛОЖЬ', 'Т.ПометкаУдаления = ЛОЖЬ'])
    return clauses

def version_conditions(query, payload):
    clauses = []
    for index, rule in enumerate(payload.get('filters') or []):
        if rule.get('enabled') is not False and (rule.get('fieldKey') or rule.get('field')) == 'change_date':
            clauses.append(date_condition(query, rule, 'Т.ДатаВерсии', 'av_' + str(index)))
    return clauses


def audit_field_map(conn, doc_type):
    """Use the document's own warehouse attribute; returns may use СкладОрдер."""
    attributes = {str(a.Имя) for a in getattr(conn.Метаданные.Документы, doc_type).Реквизиты}
    warehouse = next((name for name in ('Склад', 'СкладОрдер', 'СкладКомпании', 'СкладПолучатель', 'СкладОтправитель') if name in attributes), None)
    return {'warehouse': f'Т.{warehouse}.Наименование' if warehouse else ''}
