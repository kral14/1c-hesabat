"""Bounded warehouse/responsible tests over the already active test session."""
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
        raise RuntimeError('Existing session does not match the test database; no reconnect allowed')
    def read(filters, period):
        state = gateway.status(refresh=True)
        if state.get('busy') or state.get('queued') or state.get('session_tokens') != tokens:
            raise RuntimeError('Session changed or is busy; batch stopped')
        return gateway.execute('get_documents_list', {
            **credentials, 'doc_type':'ПогрузкиМашин', 'limit':2, 'offset':0,
            'filters':filters, **period
        }, retry=0, timeout=20)
    baseline = read([], {})
    if not baseline.get('items'):
        raise RuntimeError('No loading documents in test database; cannot verify reference filters')
    day = str(baseline['items'][0]['date']).split(' ')[0]
    period = {'date_from':day, 'date_to':day}
    results, fixtures = [], {}
    report = Path('tests/artifacts/filter_loading_references_existing_session.json')
    for field in ('warehouse', 'responsible'):
        seed = next((str(row.get(field)).strip() for row in baseline['items'] if str(row.get(field) or '').strip()), None)
        fixtures[field] = seed is not None
        target = seed or '__FILTER_REFERENCE_NOT_PRESENT__'
        for op in ('Равно','Не равно','В списке','Не в списке','Заполнено','Не заполнено'):
            result = {'field':field, 'operator':op}
            try:
                rule = {'fieldKey':field,'operator':op,'value':target if op not in ('Заполнено','Не заполнено') else '', 'enabled':True}
                response = read([rule], period)
                rows = response['items']
                for row in rows:
                    current = str(row.get(field) or '').strip().casefold()
                    expected = current == target.casefold() if op in ('Равно','В списке') else current != target.casefold() if op in ('Не равно','Не в списке') else bool(current) if op == 'Заполнено' else not current
                    if not expected: raise AssertionError('Returned reference does not satisfy the comparison')
                if seed and op in ('Равно','В списке','Заполнено') and not rows:
                    raise AssertionError('Known matching reference was not returned')
                result.update(status='pass',rows=len(rows))
            except Exception as error:
                result.update(status='fail',error=str(error)[:1800])
            results.append(result)
            report.write_text(json.dumps({'database':'Test1C / Aztrade_test3','document':'ПогрузкиМашин','date':day,'nonempty_fixtures':fixtures,'cases':results},ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps(result,ensure_ascii=True),flush=True)
            if result['status'] == 'fail':
                print(json.dumps({'stopped_on_failure':True,'session_preserved':gateway.status(refresh=True).get('session_tokens')==tokens}),flush=True)
                return
    print(json.dumps({'completed':len(results),'passed':sum(v['status']=='pass' for v in results),'nonempty_fixtures':fixtures,'session_preserved':gateway.status(refresh=True).get('session_tokens')==tokens}),flush=True)


if __name__ == '__main__': main()
