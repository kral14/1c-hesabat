"""Bounded edge pages, ordered on 1C before transfer to the client."""
import re

ALIASES = {
    'date':'Date', 'number':'Number', 'amount':'Amount', 'kontragent':'Kontragent',
    'kontragent_code':'KontragentCode', 'golovnoy_kontragent':'GolovnoyKontragent',
    'agent':'Agent', 'portfolio':'Portfolio', 'warehouse':'Warehouse', 'deal':'Deal',
    'contract':'Contract', 'contract_price_type':'ContractPriceType', 'responsible':'Responsible',
    'comment':'Comment', 'vms_status':'StatusVMS', 'obrabotka_number':'ObrabotkaNumber',
    'marshrut':'Marshrut', 'voditel':'Voditel', 'posted':'Posted', 'deleted':'DeletionMark'
}

def edge_query(text, payload):
    rules = payload.get('sort_rules') or [{'field':payload.get('sort_field','date'), 'ascending':payload.get('sort_ascending',False)}]
    sort_aliases = {}
    for rule in rules:
        if rule.get('enabled') is False: continue
        alias = ALIASES.get(rule.get('field'))
        if alias not in ('StatusVMS','Warehouse','Responsible','Voditel'): continue
        # 1C presentation is a display-only operation: an ORDER BY of its alias
        # still fails. Select a separate typed sort key and retain the label.
        pattern = rf'ПРЕДСТАВЛЕНИЕ\(([^()]+)\)\s+КАК\s+{alias}\b'
        match = re.search(pattern,text,flags=re.I)
        if not match: continue
        sort_alias = 'Sort' + alias
        expression = match[1] if alias == 'StatusVMS' else match[1] + '.Наименование'
        text = re.sub(pattern,lambda m:m[0] + f', {expression} КАК {sort_alias}',text,flags=re.I)
        sort_aliases[alias] = sort_alias
    ordering = []
    for rule in rules:
        if rule.get('enabled') is False: continue
        alias = ALIASES.get(rule.get('field'))
        if not alias: raise ValueError('Bu sütun üzrə server sıralaması dəstəklənmir.')
        alias = sort_aliases.get(alias,alias)
        ascending = bool(rule.get('ascending', False))
        if payload.get('navigation_edge') == 'end': ascending = not ascending
        direction = 'ВОЗР' if ascending else 'УБЫВ'
        if alias not in [key for key, _ in ordering]: ordering.append((alias,direction))
    if not ordering: ordering = [('Date','УБЫВ')]
    for key in ('Date','Number','Ref'):
        if key not in [name for name, _ in ordering]: ordering.append((key,ordering[0][1]))
    order_sql = ', '.join(f'{key} {direction}' for key,direction in ordering)
    count = int(payload.get('offset', 0)) + int(payload['limit']) + 1 if int(payload['limit']) > 0 else 0
    clauses = text.split(';')
    # Realization uses an intermediate table. Select its whole filtered scope
    # inside 1C; only the bounded, ordered final page crosses COM/network.
    if len(clauses) > 1:
        clauses[0] = re.sub(r'ПЕРВЫЕ\s+\d+', '', clauses[0], count=1)
        clauses[0] = re.split(r'УПОРЯДОЧИТЬ\s+ПО', clauses[0], flags=re.I)[0]
        if count and all(re.search(r'КАК\s+' + key + r'\b', clauses[0], flags=re.I) for key,_ in ordering):
            clauses[0] = re.sub(r'ВЫБРАТЬ', f'ВЫБРАТЬ ПЕРВЫЕ {count}', clauses[0], count=1)
            clauses[0] += '\nУПОРЯДОЧИТЬ ПО ' + order_sql
    final = clauses[-1]
    if not all(re.search(r'КАК\s+' + key + r'\b', final, flags=re.I) for key,_ in ordering):
        raise ValueError('Bu sütun üzrə sürətli keçid hələ dəstəklənmir. Bütün məlumat rejimini seçin.')
    final = re.split(r'УПОРЯДОЧИТЬ\s+ПО', final, flags=re.I)[0]
    final = re.sub(r'ПЕРВЫЕ\s+\d+', '', final, count=1)
    if count: final = re.sub(r'ВЫБРАТЬ', f'ВЫБРАТЬ ПЕРВЫЕ {count}', final, count=1)
    final += '\nУПОРЯДОЧИТЬ ПО ' + order_sql
    clauses[-1] = final
    return ';'.join(clauses)

class EdgeQuery:
    def __init__(self, query, payload):
        object.__setattr__(self, '_query', query)
        object.__setattr__(self, '_payload', payload)
    def __getattr__(self, name): return getattr(self._query, name)
    def __setattr__(self, name, value):
        setattr(self._query, name, edge_query(value, self._payload) if name == 'Text' else value)

class EdgeConnection:
    def __init__(self, conn, payload): self.conn, self.payload, self.first = conn, payload, True
    def __getattr__(self, name): return getattr(self.conn, name)
    def NewObject(self, kind):
        obj = self.conn.NewObject(kind)
        if kind == 'Запрос' and self.first:
            self.first = False
            return EdgeQuery(obj, self.payload)
        return obj
