"""Enable optional document reference filters only for verified metadata fields."""


def reference_filter_fields(conn, doc_type):
    metadata = getattr(conn, 'Метаданные', None)
    documents = getattr(metadata, 'Документы', None)
    if documents is None: return {}
    find = getattr(documents, 'Найти', None)
    document = find(doc_type) if find else getattr(documents, doc_type, None)
    if document is None: return {}
    attributes = {str(attr.Имя) for attr in document.Реквизиты}
    fields = {key: f'Т.{attribute}.Наименование' for key, attribute in {
        'organization': 'Организация', 'division': 'Подразделение', 'currency': 'ВалютаДокумента'
    }.items() if attribute in attributes}
    if 'ДоговорКонтрагента' in attributes:
        catalogs = getattr(metadata, 'Справочники', None)
        find_catalog = getattr(catalogs, 'Найти', None)
        contract = find_catalog('ДоговорыКонтрагентов') if find_catalog else None
        contract_fields = {str(attr.Имя) for attr in getattr(contract, 'Реквизиты', [])}
        for key, attribute in [('contract_price_type', 'ТипЦен'), ('portfolio', 'Портфель')]:
            if attribute in contract_fields:
                fields[key] = f'Т.ДоговорКонтрагента.{attribute}.Наименование'
    return fields
