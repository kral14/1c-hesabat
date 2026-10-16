"""Small read-only number-filter batch over an existing test worker session.

Never calls Connect, starts a worker, changes the database, or retries a query.
"""
import json
from pathlib import Path
import database
from services.onec_gateway import OneCGateway


def main():
    credentials = database.get_active_base() or {}
    if (str(credentials.get('server', '')).lower(), str(credentials.get('ref', '')).lower()) != ('test1c', 'aztrade_test3'):
        raise RuntimeError('Only Test1C / Aztrade_test3 is allowed')
    gateway = OneCGateway(auto_start=False)
    initial = gateway.status(refresh=True)
    if not initial.get('available') or initial.get('busy') or initial.get('queued') or initial.get('session_count') != 1:
        raise RuntimeError('An idle existing test session is required')
    tokens = initial.get('session_tokens')
    if not gateway.execute('connection_probe', dict(credentials), retry=0, timeout=10).get('connected'):
        raise RuntimeError('Existing worker session does not match the test connection; no new session will be opened')
    def read(filters, period):
        state = gateway.status(refresh=True)
        if state.get('busy') or state.get('queued') or state.get('session_tokens') != tokens:
            raise RuntimeError('Session changed or is busy; batch stopped without reconnecting')
        return gateway.execute('get_documents_list', {**credentials, 'doc_type':'РеализацияТоваровУслуг', 'limit':2, 'offset':0, 'filters':filters, **period}, retry=0, timeout=20)
    period = {'date_from':'2026-10-01', 'date_to':'2026-10-31'}
    baseline = read([], period)
    if not baseline.get('items'): raise RuntimeError('No test documents in the selected period')
    sample = baseline['items'][0]
    number = str(sample['number']).strip()
    day = str(sample['date']).split(' ')[0]
    period = {'date_from':day, 'date_to':day}
    partial = number[-3:]
    cases = [('Равно',number), ('Не равно',number), ('В списке',number), ('Не в списке',number), ('В группе из списка',number), ('Содержит',partial), ('Не содержит',partial), ('Начинается с',number[:4]), ('Заполнено',''), ('Не заполнено','')]
    results = []
    report = Path('tests/artifacts/filter_number_existing_session.json')
    for op, value in cases:
        result = {'operator':op}
        try:
            response = read([{'fieldKey':'number','operator':op,'value':value,'enabled':True}], period)
            rows = response['items']
            for row in rows:
                current = str(row.get('number') or '').strip().casefold()
                target = value.casefold()
                expected = current == target if op in ('Равно','В списке','В группе из списка') else current != target if op in ('Не равно','Не в списке') else target in current if op == 'Содержит' else target not in current if op == 'Не содержит' else current.startswith(target) if op == 'Начинается с' else bool(current) if op == 'Заполнено' else not current
                if not expected: raise AssertionError('Returned document does not satisfy the comparison')
            if op in ('Равно','В списке','В группе из списка','Содержит','Начинается с','Заполнено') and not rows:
                raise AssertionError('Known matching test document was not returned')
            result.update(status='pass', rows=len(rows))
        except Exception as error:
            result.update(status='fail', error=str(error)[:1200])
        results.append(result)
        report.write_text(json.dumps({'database':'Test1C / Aztrade_test3','cases':results},ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=True),flush=True)
        if result['status'] == 'fail': break
    print(json.dumps({'completed':len(results),'passed':sum(v['status']=='pass' for v in results),'session_preserved':gateway.status(refresh=True).get('session_tokens')==tokens}),flush=True)


if __name__ == '__main__': main()
