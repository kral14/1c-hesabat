"""Resolve agent classifications from catalog-reference metadata, never guessed paths."""
import re
from services.filter_sql import text_condition

FIELDS = {'agent_sales_type': 'ВидыРеализации', 'agent_sales_group': 'ГруппыРеализации'}

def identifier(value):
    value = str(value)
    if not re.fullmatch(r'[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё_0-9]*', value):
        raise ValueError('Yanlış 1C metadata adı')
    return value

def catalog_name(conn, key):
    expected = FIELDS[key]
    catalog = conn.Метаданные.Справочники.Найти(expected)
    if not catalog:
        normalize = lambda value: re.sub(r'[^а-яёa-z0-9]', '', str(value).lower())
        matches = [item for item in conn.Метаданные.Справочники
                   if normalize(item.Синоним) == normalize(expected)]
        if len(matches) == 1: catalog = matches[0]
    if not catalog:
        raise ValueError(f'1C kataloqu tapılmadı: {expected}')
    return identifier(catalog.Имя)

def relation(conn, key):
    catalog = catalog_name(conn, key)
    agent = conn.Метаданные.Справочники.Найти('Агенты')
    if not agent: raise ValueError('Агенты metadata tapılmadı')
    description = conn.NewObject('ОписаниеТипов', 'СправочникСсылка.' + catalog)
    target = description.Типы().Получить(0)
    direct = [identifier(a.Имя) for a in agent.Реквизиты if a.Тип.СодержитТип(target)]
    tables = [(identifier(t.Имя),identifier(a.Имя)) for t in agent.ТабличныеЧасти
              for a in t.Реквизиты if a.Тип.СодержитТип(target)]
    if key == 'agent_sales_group':
        grouped = [entry for entry in tables if entry[0] == 'ГруппыРеализации']
        if len(grouped) == 1: return grouped[0]
    preferred = ('ВидРеализации',) if key == 'agent_sales_type' else ('КаналСбыта','ГруппаРеализации')
    for name in preferred:
        if name in direct: return None, name
    if len(direct) == 1: return None, direct[0]
    if not direct:
        if len(tables) == 1: return tables[0]
    raise ValueError(f'{catalog}: agentlə əlaqə birmənalı müəyyən edilmədi')

def condition(conn, query, rule, prefix, debug):
    key = rule.get('fieldKey') or rule.get('field')
    table, attribute = relation(conn, key)
    agent_path = 'Т.ДоговорКонтрагента.Агент'
    if table is None:
        return text_condition(query, agent_path+'.'+attribute+'.Наименование',rule,prefix,debug)
    # For multi-valued groups, negative operators exclude agents having any match.
    op = rule.get('operator') or 'Равно'
    inverse = {'Не равно':'Равно','Не в списке':'В списке','Не заполнено':'Заполнено'}
    positive = dict(rule,operator=inverse.get(op,op))
    clause = text_condition(query,'АГ.'+attribute+'.Наименование',positive,prefix,debug)
    membership = 'НЕ В' if op in inverse else 'В'
    return f'{agent_path} {membership} (ВЫБРАТЬ АГ.Ссылка ИЗ Справочник.Агенты.{table} КАК АГ ГДЕ {clause})'
