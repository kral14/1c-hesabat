"""Remaining read-only filter checks: receipt, positive driver, combined rules.

Uses one existing Test1C session; never starts a worker or opens/replaces COM.
Reports contain no credentials, customer names, driver names, or document numbers.
"""
import json
import re
import argparse
from pathlib import Path
import database
from services.filter_policy import REFERENCES, COMPARISONS, INTERVALS
from services.onec_dates import parse_calendar_date
from services.onec_gateway import OneCGateway

OPS = ['Равно','Не равно','В списке','Не в списке','Содержит','Не содержит','Начинается с','Заполнено','Не заполнено']


def rule(field, op, value='', **extra):
    return dict(fieldKey=field, operator=op, value=value, enabled=True, **extra)


def satisfies(row, condition):
    key, op = condition['fieldKey'], condition['operator']
    value, target = row.get(key), condition.get('value', '')
    if key == 'date':
        current = parse_calendar_date(value)
        compare = lambda v, end=False: parse_calendar_date(v, is_end=end)
        empty = current is None or current.year == 1
    elif key == 'amount':
        current = float(value or 0)
        compare = lambda v, end=False: float(str(v).replace(',', '.'))
        empty = current == 0
    elif key in ('posted','deleted'):
        current, target = bool(value), str(target).lower() in ('true','да','1')
        return current == target if op == 'Равно' else current != target
    else:
        normalize = lambda v: str(v or '').strip().casefold().replace('wms','вмс') if key == 'vms_status' else str(v or '').strip().casefold()
        current, target = normalize(value), normalize(target)
        compare = lambda v, end=False: normalize(v)
        empty = not current
    if op in ('Заполнено','Не заполнено'): return not empty if op == 'Заполнено' else empty
    if op.startswith('Интервал'):
        bounds = re.search(r'\((>=|>),\s*(<=|<)\)', op)
        low, high = compare(condition['valueFrom']), compare(condition['valueTo'], True)
        return (current >= low if bounds[1] == '>=' else current > low) and (current <= high if bounds[2] == '<=' else current < high)
    if op in ('В списке','Не в списке','В группе из списка'):
        found = current in [compare(v.strip()) for v in re.split(r'[,;\n]+', str(target))]
        return not found if op == 'Не в списке' else found
    other = compare(target, op in ('Меньше','Меньше или равно'))
    if op == 'Равно': return current == other
    if op == 'Не равно': return current != other
    if op == 'Больше': return current > other
    if op == 'Меньше': return current < other
    if op == 'Больше или равно': return current >= other
    if op == 'Меньше или равно': return current <= other
    if op == 'Содержит': return other in current
    if op == 'Не содержит': return other not in current
    if op == 'Начинается с': return current.startswith(other)
    raise AssertionError('Unrecognized comparison')


class Batch:
    def __init__(self, report_suffix=''):
        self.report = Path(f'tests/artifacts/filter_remaining_existing_session{report_suffix}.json')
        self.credentials = database.get_active_base() or {}
        if (str(self.credentials.get('server','')).lower(),str(self.credentials.get('ref','')).lower()) != ('test1c','aztrade_test3'):
            raise RuntimeError('Only Test1C / Aztrade_test3 is allowed')
        self.gateway = OneCGateway(auto_start=False)
        state = self.gateway.status(refresh=True)
        if not state.get('available') or state.get('busy') or state.get('queued') or state.get('session_count') != 1:
            raise RuntimeError('An idle existing test session is required')
        self.tokens = state['session_tokens']
        if not self.gateway.execute('connection_probe',dict(self.credentials),retry=0,timeout=10).get('connected'):
            raise RuntimeError('Existing session is not the selected test connection; reconnect refused')
        self.results, self.coverage = [], {}
    def call(self, action, payload):
        state = self.gateway.status(refresh=True)
        if state.get('busy') or state.get('queued') or state.get('session_tokens') != self.tokens:
            raise RuntimeError('Session changed or busy; no query queued')
        return self.gateway.execute(action,{**self.credentials,**payload},retry=0,timeout=20)
    def read(self, doc, conditions, period):
        return self.call('get_documents_list',dict(doc_type=doc,limit=2,offset=0,filters=conditions,**period))
    def save(self):
        self.report.write_text(json.dumps({
            'database':'Test1C / Aztrade_test3','coverage':self.coverage,'cases':self.results,
            'session_preserved':self.gateway.status(refresh=True).get('session_tokens')==self.tokens
        },ensure_ascii=False,indent=2),encoding='utf-8')
    def check(self, phase, doc, conditions, period, must_find=False, oracle=None):
        record = dict(phase=phase,fields=[c['fieldKey'] for c in conditions],operators=[c['operator'] for c in conditions])
        try:
            rows = self.read(doc,conditions,period)['items']
            if must_find and not rows: raise AssertionError('Known matching document was not returned')
            if any(not (oracle(row) if oracle else all(satisfies(row,c) for c in conditions)) for row in rows):
                raise AssertionError('Returned document does not satisfy all selected conditions')
            record.update(status='pass',rows=len(rows))
        except Exception as error:
            record.update(status='fail',error=str(error)[:1800])
            self.results.append(record); self.save(); print(json.dumps(record,ensure_ascii=True),flush=True)
            raise
        self.results.append(record); self.save()
        return rows


def receipt(batch):
    doc = 'ПоступлениеТоваровУслуг'
    baseline = batch.read(doc,[],{})
    if not baseline['items']: raise RuntimeError('No receipt fixture')
    sample = baseline['items'][0]
    day = sample['date'].split(' ')[0]
    period = dict(date_from=day,date_to=day)
    keys = list(dict.fromkeys([c['key'] for c in baseline['columns'] if c['key'] != 'status']+['posted','deleted']))
    for key in keys:
        seed = sample.get(key)
        if key in ('posted','deleted'): operators = ['Равно','Не равно']; target = 'Да' if seed else 'Нет'
        elif key in ('date','amount'): operators = sorted(COMPARISONS | INTERVALS | {'Заполнено','Не заполнено'}); target = str(seed)
        else:
            operators = [op for op in OPS if key not in REFERENCES or op not in ('Содержит','Не содержит','Начинается с')]
            if key == 'number': operators.append('В группе из списка')
            target = str(seed).strip() if seed not in (None,'') else '__FILTER_VALUE_NOT_PRESENT__'
        for op in operators:
            condition = rule(key,op,target)
            if op.startswith('Интервал'): condition.update(valueFrom=target,valueTo=target)
            must_find = satisfies(sample,condition)
            batch.check('receipt',doc,[condition],period,must_find=must_find)
        print(json.dumps({'phase':'receipt','field':key,'completed':len(batch.results)},ensure_ascii=True),flush=True)
    # Goods are checked independently through document details, cached per number.
    details = {}
    def goods(row):
        number = row['number']
        if number not in details:
            details[number] = batch.call('get_document_details',dict(doc_type=doc,number=number)).get('tovary',[])
        return details[number]
    seed_goods = goods(sample)
    seed = next((str(v['code']).strip() for v in seed_goods if v.get('code')),None)
    batch.coverage['receipt_goods_nonempty_fixture'] = seed is not None
    probe = seed or '__FILTER_GOODS_NOT_PRESENT__'
    for op in OPS + ['В группе из списка']:
        def oracle(row, op=op):
            products = goods(row)
            if op == 'Заполнено': return bool(products)
            if op == 'Не заполнено': return not products
            positive_op = {'Не равно':'Равно','Не в списке':'В списке','Не содержит':'Содержит'}.get(op,op)
            found = any(satisfies({'code':v.get(field,'')},rule('code',positive_op,probe)) for v in products for field in ('code','nomenklatura'))
            return not found if op in ('Не равно','Не в списке','Не содержит') else found
        must_find = bool(seed) and op in ('Равно','В списке','В группе из списка','Содержит','Начинается с','Заполнено')
        batch.check('receipt_goods',doc,[rule('nomenclature',op,probe)],period,must_find,oracle)
    batch.coverage['receipt_complete'] = True; batch.save()


def driver_and_combinations(batch, check_driver=True):
    doc = 'РеализацияТоваровУслуг'
    # The latest loading fixture was July 2026. Search only that month first.
    period = dict(date_from='2026-07-01',date_to='2026-07-31')
    drivers = batch.read(doc,[rule('pogruzka_voditel','Заполнено')],period)['items']
    if not drivers:
        period = dict(date_from='2026-01-01',date_to='2026-12-31')
        drivers = batch.read(doc,[rule('pogruzka_voditel','Заполнено')],period)['items']
    if drivers:
        sample = drivers[0]
        batch.coverage['positive_driver_fixture'] = True
        period = dict(date_from=sample['date'].split(' ')[0],date_to=sample['date'].split(' ')[0])
        seed = str(sample['pogruzka_voditel']).strip()
        for op in OPS if check_driver else []:
            condition = rule('pogruzka_voditel',op,seed[:3] if op in ('Содержит','Не содержит','Начинается с') else seed)
            batch.check('positive_driver',doc,[condition],period,must_find=satisfies(sample,condition))
    else:
        batch.coverage['positive_driver_fixture'] = False
        sample = batch.read(doc,[],dict(date_from='2026-01-01',date_to='2026-12-31'))['items'][0]
        period = dict(date_from=sample['date'].split(' ')[0],date_to=sample['date'].split(' ')[0])
    print(json.dumps({'phase':'positive_driver','fixture_found':bool(drivers)},ensure_ascii=True),flush=True)
    predicates = [rule('number','Равно',sample['number']),rule('date','Равно',sample['date']),
                  rule('posted','Равно','Да' if sample['posted'] else 'Нет'),
                  rule('vms_status','Заполнено' if sample.get('vms_status') else 'Не заполнено'),
                  rule('pogruzka_voditel','Заполнено' if sample.get('pogruzka_voditel') else 'Не заполнено')]
    combinations = [[0,1],[0,2],[1,3],[3,4],[1,3,4],[0,1,2,3,4]]
    for indexes in combinations:
        batch.check('combined',doc,[predicates[i] for i in indexes],period,must_find=True)
    # Contradictory number rules must not accidentally broaden the result.
    rows = batch.check('combined',doc,[predicates[0],rule('number','Не равно',sample['number'])],period)
    if rows: raise AssertionError('Contradictory filters returned documents')
    batch.coverage['combined_complete'] = True; batch.save()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', choices=['all','combined'], default='all')
    args = parser.parse_args()
    batch = Batch('_combined' if args.phase == 'combined' else '')
    try:
        if args.phase == 'all': receipt(batch)
        driver_and_combinations(batch,check_driver=args.phase == 'all')
    finally:
        batch.save()
        print(json.dumps({'completed':len(batch.results),'passed':sum(c['status']=='pass' for c in batch.results),'coverage':batch.coverage,'session_preserved':batch.gateway.status(refresh=True).get('session_tokens')==batch.tokens}),flush=True)


if __name__ == '__main__': main()
