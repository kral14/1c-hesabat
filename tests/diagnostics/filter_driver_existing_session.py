"""One bounded, read-only driver-filter batch over the existing test session."""
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
    def read(op, value):
        state = gateway.status(refresh=True)
        if state.get('busy') or state.get('queued') or state.get('session_tokens') != tokens:
            raise RuntimeError('Session changed or is busy; batch stopped')
        return gateway.execute('get_documents_list', {
            **credentials, 'doc_type':'РеализацияТоваровУслуг', 'limit':2, 'offset':0,
            'date_from':'2026-10-01', 'date_to':'2026-10-31',
            'filters':[{'fieldKey':'pogruzka_voditel','operator':op,'value':value,'enabled':True}]
        }, retry=0, timeout=20)
    results = []
    report = Path('tests/artifacts/filter_driver_existing_session.json')
    seed = None
    cases = [('Заполнено',''), ('Не заполнено','')]
    for op, value in cases:
        result = {'operator':op}
        try:
            response = read(op, value)
            rows = response['items']
            if any(bool(str(row.get('pogruzka_voditel') or '').strip()) != (op == 'Заполнено') for row in rows):
                raise AssertionError('Returned driver does not satisfy filled/empty condition')
            if op == 'Заполнено':
                if rows: seed = str(rows[0]['pogruzka_voditel']).strip()
                probe = seed or '__FILTER_DRIVER_NOT_PRESENT__'
                cases.extend((operator, probe[:3] if seed and operator in ('Содержит','Не содержит','Начинается с') else probe) for operator in ('Равно','Не равно','В списке','Не в списке','Содержит','Не содержит','Начинается с'))
            if op not in ('Заполнено','Не заполнено'):
                target = value.casefold()
                for row in rows:
                    current = str(row.get('pogruzka_voditel') or '').strip().casefold()
                    expected = current == target if op in ('Равно','В списке') else current != target if op in ('Не равно','Не в списке') else target in current if op == 'Содержит' else target not in current if op == 'Не содержит' else current.startswith(target)
                    if not expected: raise AssertionError('Returned driver does not satisfy the comparison')
                if seed is not None and op in ('Равно','В списке','Содержит','Начинается с') and not rows:
                    raise AssertionError('Known matching driver was not returned')
            result.update(status='pass', rows=len(rows))
        except Exception as error:
            result.update(status='fail', error=str(error)[:1800])
        results.append(result)
        report.write_text(json.dumps({'database':'Test1C / Aztrade_test3','document':'РеализацияТоваровУслуг','field':'pogruzka_voditel','seed_found':seed is not None,'cases':results},ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=True),flush=True)
        if result['status'] == 'fail': break
    print(json.dumps({'completed':len(results),'passed':sum(v['status']=='pass' for v in results),'seed_found':seed is not None,'session_preserved':gateway.status(refresh=True).get('session_tokens')==tokens}),flush=True)


if __name__ == '__main__': main()
