"""Reject malformed active document conditions before building a query."""
import math
import re
from services.onec_dates import parse_calendar_date

EQUALITY = {'Равно', 'Не равно'}
EMPTY = {'Заполнено', 'Не заполнено'}
COMPARISONS = EQUALITY | {'Меньше', 'Меньше или равно', 'Больше', 'Больше или равно'}
INTERVALS = {'Интервал (>, <)', 'Интервал (>=, <=)', 'Интервал (>=, <)', 'Интервал (>, <=)'}
REFERENCES = {'agent_sales_type', 'agent_sales_group', 'warehouse', 'portfolio', 'kontragent', 'golovnoy_kontragent', 'contract', 'contract_price_type', 'organization', 'division', 'responsible', 'agent', 'currency', 'deal'}
BOOLEANS = {'posted', 'deleted', 'pogruzka_duplicate', 'pogruzka_active_duplicate'}
NUMBER_LISTS = {'В списке', 'Не в списке', 'В группе из списка'}


def number_values(rule):
    """List membership uses complete numbers, never embedded contains rules."""
    if rule.get('operator') not in NUMBER_LISTS:
        return [str(rule.get('value') or '').strip()]
    structured = rule.get('structuredFilter') or {}
    if structured.get('items'):
        return [str(item.get('value') or '').strip() if item.get('comp', 'equal') == 'equal' else '' for item in structured['items']]
    return [part.strip() for part in re.split(r'[,;\n]+', str(rule.get('value') or ''))]


def validate_filters(filters, number_length=None):
    if not isinstance(filters, list):
        raise ValueError('Filtr siyahı olmalıdır')
    for index, rule in enumerate(filters):
        if not isinstance(rule, dict):
            raise ValueError('Yanlış filtr sətri')
        if rule.get('enabled') is False:
            continue
        key = rule.get('fieldKey') or rule.get('field')
        key = 'vms_status' if key == 'wms_status' else key
        op = rule.get('operator') or rule.get('comparison') or 'Содержит'
        value = rule.get('value')
        allowed = EQUALITY | EMPTY | {'В списке', 'Не в списке', 'В группе из списка', 'Содержит', 'Не содержит', 'Начинается с'}
        if key in BOOLEANS:
            allowed = EQUALITY
        elif key == 'vms_status':
            allowed = EQUALITY | EMPTY | {'В списке', 'Не в списке'}
        elif key in REFERENCES:
            allowed = EQUALITY | EMPTY | {'В списке', 'Не в списке'}
        elif key in {'date', 'amount', 'realization_count'}:
            allowed = COMPARISONS | EMPTY | INTERVALS
        error = None
        if op not in allowed:
            error = 'Bu sahə üçün müqayisə uyğun deyil'
        elif op not in EMPTY:
            values = [rule.get('valueFrom'), rule.get('valueTo')] if op in INTERVALS else [value]
            present = [v for v in values if v is not None and str(v).strip()]
            if not present:
                error = 'Dəyəri daxil edin'
            elif key == 'number' and op in EQUALITY | NUMBER_LISTS:
                numbers = number_values(rule)
                if not numbers or any(not re.fullmatch(r'(?:[A-Za-zА-Яа-я]\d{10,11}|\d{9,11})', text) or (number_length and len(text) != number_length) for text in numbers):
                    error = 'Tam sənəd nömrəsini yazın, məsələn C0000476122'
            elif key in BOOLEANS and str(value).lower() not in {'да', 'нет', 'true', 'false', '1', '0', 'yes', 'no', 'истина', 'ложь'}:
                error = 'Bəli və ya xeyr seçin'
            elif key in {'date', 'amount', 'realization_count'}:
                try:
                    parsed = [parse_calendar_date(v) if key == 'date' else float(str(v).replace(',', '.')) for v in present]
                    if any(v is None or (key != 'date' and not math.isfinite(v)) for v in parsed) or (len(parsed) == 2 and parsed[0] > parsed[1]):
                        raise ValueError()
                except (ValueError, TypeError, OverflowError):
                    error = 'Tarix, miqdar və ya interval düzgün deyil'
        if error:
            raise ValueError(f'{index + 1}. {key}: {error}')


BASE_FIELDS = {'number', 'date', 'posted', 'deleted'}
DOCUMENT_FIELDS = {
    'РеализацияТоваровУслуг': BASE_FIELDS | {'kontragent', 'kontragent_code', 'golovnoy_kontragent', 'golovnoy_kontragent_code', 'agent', 'agent_sales_type', 'agent_sales_group', 'amount', 'warehouse', 'responsible', 'comment', 'portfolio', 'contract', 'contract_price_type', 'deal', 'vms_status', 'nomenclature', 'pogruzka_marshrut', 'pogruzka_voditel', 'pogruzka_duplicate', 'pogruzka_active_duplicate', 'obrabotka_number'},
    'ВозвратТоваровОтПокупателя': BASE_FIELDS | {'kontragent', 'kontragent_code', 'golovnoy_kontragent', 'golovnoy_kontragent_code', 'agent', 'agent_sales_type', 'agent_sales_group', 'amount', 'warehouse', 'responsible', 'comment', 'portfolio', 'contract', 'deal', 'vms_status', 'nomenclature'},
    'ПогрузкиМашин': BASE_FIELDS | {'marshrut', 'voditel', 'warehouse', 'responsible', 'amount', 'realization_count', 'nomenclature'},
}


def normalize_filters(filters):
    if not isinstance(filters, list):
        raise ValueError('Filtr siyahı olmalıdır')
    result = []
    for rule in filters:
        if not isinstance(rule, dict):
            raise ValueError('Yanlış filtr sətri')
        rule = dict(rule)
        key = rule.get('fieldKey') or rule.get('field')
        key = 'vms_status' if key == 'wms_status' else key
        rule['fieldKey'] = rule['field'] = key
        rule['operator'] = rule.get('operator') or rule.get('comparison') or 'Содержит'
        result.append(rule)
    validate_filters(result)
    return result


def validate_supported_fields(filters, supported):
    for rule in filters:
        if rule.get('enabled') is not False and rule['fieldKey'] not in supported:
            raise ValueError('Filtr sahəsi bu sənəddə dəstəklənmir: ' + str(rule['fieldKey']))
