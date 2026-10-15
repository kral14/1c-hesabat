"""Compare driver names as displayed, using catalogue codes in 1C predicates.

KA 1.1 may contain names with leading whitespace. Its 8.3.17 query language
cannot trim those strings in predicates, whereas the journal trims them for
display. Read the driver dictionary once per request and resolve names to codes.
"""
import re
from services.filter_policy import validate_filters


def matches_name(name, rule):
    current = str(name or '').strip().casefold()
    op = rule.get('operator') or rule.get('comparison') or 'Равно'
    target = str(rule.get('value') or '').strip().casefold()
    if op == 'Заполнено': return bool(current)
    if op == 'Не заполнено': return not current
    if op in ('В списке','Не в списке','В группе из списка'):
        structured = rule.get('structuredFilter') or {}
        entries = structured.get('items') or [{'value':v.strip(),'comp':'equal'} for v in re.split(r'[,;\n]+',target) if v.strip()]
        def match(entry):
            value = str(entry.get('value') or '').strip().casefold()
            return value in current if entry.get('comp') == 'contains' else value == current
        found = bool(entries) and (all(map(match,entries)) if structured.get('matchAll') else any(map(match,entries)))
        return not found if op == 'Не в списке' else found
    if op == 'Равно': return current == target
    if op == 'Не равно': return current != target
    if op == 'Содержит': return target in current
    if op == 'Не содержит': return target not in current
    if op == 'Начинается с': return current.startswith(target)
    raise ValueError('Sürücü üçün uyğun olmayan müqayisə')


def load_driver_names(conn):
    query = conn.NewObject('Запрос')
    query.Text = 'ВЫБРАТЬ Т.Код КАК Code, Т.Наименование КАК Name ИЗ Справочник.Водители КАК Т'
    rows = query.Execute().Choose()
    names = {'':''}
    while rows.Next(): names[str(rows.Code or '').strip()] = str(rows.Name or '').strip()
    return names


def driver_condition(conn, query, rule, names, prefix, debug):
    validate_filters([rule])
    def array_parameter(suffix, codes):
        array = conn.NewObject('Массив')
        for code in codes: array.Add(code)
        key = prefix + suffix
        query.SetParameter(key, array)
        debug[key] = {'driver_code_count':len(codes)}
        return '&' + key
    nonempty = [code for code, name in names.items() if str(name or '').strip()]
    active = 'ЕСТЬNULL(ПФ.ActiveVoditelRef.Код, "")'
    any_driver = 'ЕСТЬNULL(ПФ.AnyVoditelRef.Код, "")'
    # Match the journal's preference for a nonblank active driver, then fallback.
    expression = f'ВЫБОР КОГДА {active} В ({array_parameter("_nonempty",nonempty)}) ТОГДА {active} ИНАЧЕ {any_driver} КОНЕЦ'
    selected = [code for code, name in names.items() if matches_name(name,rule)]
    if not selected: return '1 = 0'
    return f'({expression}) В ({array_parameter("_selected",selected)})'
