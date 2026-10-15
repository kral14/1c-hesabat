"""Shared scalar comparison semantics for document filters."""
import re


def text_condition(query, expression, rule, prefix, debug):
    op = rule.get('operator') or rule.get('comparison') or 'Содержит'
    expression = f'ЕСТЬNULL({expression}, "")'
    unlimited = (rule.get('fieldKey') or rule.get('field')) == 'comment'
    def literal_pattern(value):
        return value.replace('~', '~~').replace('%', '~%').replace('_', '~_').replace('[', '~[')
    if op in ('Заполнено', 'Не заполнено'):
        if unlimited:
            clause = f'{expression} ПОДОБНО ""'
            return f'НЕ ({clause})' if op == 'Заполнено' else clause
        return f'{expression} {"<>" if op == "Заполнено" else "="} ""'
    def parameter(value, index):
        name = f'{prefix}_{index}'
        query.SetParameter(name, value)
        debug[name] = value
        return '&' + name
    if op in ('В списке', 'Не в списке', 'В группе из списка'):
        structured = rule.get('structuredFilter') or {}
        entries = structured.get('items') or [{'value': v.strip(), 'comp': 'equal'} for v in re.split(r'[,;\n]+', str(rule.get('value') or '')) if v.strip()]
        if not entries: raise ValueError('Siyahıya ən az bir dəyər daxil edin')
        clauses = []
        for index, entry in enumerate(entries):
            value = str(entry.get('value') or '').strip()
            if not value: raise ValueError('Siyahıda boş dəyər var')
            contains = entry.get('comp', 'equal') == 'contains'
            pattern = '%' + literal_pattern(value) + '%' if contains else literal_pattern(value)
            if contains or unlimited:
                clauses.append(f'{expression} ПОДОБНО {parameter(pattern, index)} СПЕЦСИМВОЛ "~"')
            else:
                clauses.append(f'{expression} = {parameter(value, index)}')
        join = ' И ' if structured.get('matchAll') else ' ИЛИ '
        combined = '(' + join.join(clauses) + ')'
        return 'НЕ ' + combined if op == 'Не в списке' else combined
    value = str(rule.get('value') or '').strip()
    if op in ('Равно', 'Не равно'):
        if unlimited:
            clause = f'{expression} ПОДОБНО {parameter(literal_pattern(value), 0)} СПЕЦСИМВОЛ "~"'
            return f'НЕ ({clause})' if op == 'Не равно' else clause
        return f'{expression} {"=" if op == "Равно" else "<>"} {parameter(value, 0)}'
    if op not in ('Содержит', 'Не содержит', 'Начинается с'):
        raise ValueError('Mətn üçün uyğun olmayan müqayisə')
    escaped = literal_pattern(value)
    pattern = escaped + '%' if op == 'Начинается с' else '%' + escaped + '%'
    clause = f'{expression} ПОДОБНО {parameter(pattern, 0)} СПЕЦСИМВОЛ "~"'
    return 'НЕ (' + clause + ')' if op == 'Не содержит' else clause
