"""Validated comparisons for the read-only price formation query."""
BASIC={'equal','not_equal','in_list','not_in_list'}
HIERARCHY={'in_group','not_in_group','in_group_list','not_in_group_list'}

def values(raw):
    if isinstance(raw,str): raw=raw.split(';')
    if not isinstance(raw,(list,tuple)): raise ValueError('Filtr dəyəri siyahı olmalıdır')
    return list(dict.fromkeys(str(value).strip() for value in raw if str(value).strip()))

def validate(op,entries,hierarchical=True):
    if op not in BASIC | (HIERARCHY if hierarchical else set()):
        raise ValueError('Dəstəklənməyən müqayisə: '+str(op))
    if entries and op in ('equal','not_equal','in_group','not_in_group') and len(entries)!=1:
        raise ValueError('Bu müqayisə üçün yalnız bir dəyər seçin; bir neçə dəyər üçün siyahı müqayisəsini seçin.')

def array(conn,entries):
    result=conn.NewObject('Массив')
    for entry in entries: result.Add(entry)
    return result

def condition(conn,query,expression,catalog,entries,op,prefix,article=False):
    validate(op,entries)
    if not entries: return None
    query.SetParameter(prefix,array(conn,entries))
    comparisons=[f'{expression}.Наименование В (&{prefix})',f'{expression}.Код В (&{prefix})']
    if article: comparisons.append(f'{expression}.Артикул В (&{prefix})')
    clause='('+' ИЛИ '.join(comparisons)+')'
    if op in HIERARCHY:
        metadata=conn.Метаданные.Справочники.Найти(catalog)
        if not metadata or not metadata.Иерархический:
            raise ValueError(catalog+': kataloq iyerarxik deyil; siyahı müqayisəsini seçin.')
        lookup=conn.NewObject('Запрос')
        lookup.SetParameter('Names',array(conn,entries))
        lookup.Text=f'ВЫБРАТЬ Г.Ссылка КАК Ref ИЗ Справочник.{catalog} КАК Г ГДЕ Г.Наименование В (&Names) ИЛИ Г.Код В (&Names)'
        rows=lookup.Execute().Choose()
        refs=[]
        while rows.Next(): refs.append(rows.Ref)
        if not refs: return '1 = 1' if op.startswith('not_') else '1 = 0'
        query.SetParameter(prefix+'Refs',array(conn,refs))
        reference = expression + '.Ссылка' if expression == 'Т' else expression
        clause=f'{reference} В ИЕРАРХИИ (&{prefix}Refs)'
    return 'НЕ ('+clause+')' if op.startswith('not_') else clause
