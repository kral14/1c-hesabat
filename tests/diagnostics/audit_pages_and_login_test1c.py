"""Read-only connection probes pinned to Test1C; no production session changes."""
import sys, re
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from services.onec_service import one_c
source=(Path(__file__).parent/'check_test_base.py').read_text(encoding='utf-8')
connstr=re.search(r"Connect\('([^']+)'\)",source)[1]
fields=dict(re.findall(r'(Srvr|Ref|Usr|Pwd)="([^"]*)"',connstr))
assert fields['Srvr']=='Test1C' and fields['Ref']=='Aztrade_test3'
payload=dict(server=fields['Srvr'],ref=fields['Ref'],user=fields['Usr'],password=fields['Pwd'])

try:
    result=one_c.execute('get_audit_list',{**payload,'doc_type':'ВозвратТоваровОтПокупателя','date_from':'2026-10-06','date_to':'2026-10-13 23:59:59','limit':1},retry=0,timeout=60)
    if result['items']:
        number=result['items'][0]['number']
        selected={**payload,'doc_type':'ВозвратТоваровОтПокупателя','number':number,'date_from':'2026-10-06','date_to':'2026-10-07 23:59:59'}
        snapshot=one_c.execute('get_audit_diff',{**selected,'include_events':False},retry=0,timeout=90)
        assert snapshot['event_timeline']==[]
        page=one_c.execute('get_audit_events',selected,retry=0,timeout=45)
        assert page['next_cursor']=='2026-10-07 00:00:00'
        last=one_c.execute('get_audit_events',dict(selected,cursor=page['next_cursor']),retry=0,timeout=45)
        assert not last['next_cursor']
        print('Test1C: snapshots without event scan and two sequential daily event pages passed.',flush=True)
    else: print('No matching test document in selected period.',flush=True)
    # A healthy login reuses the same COM connection instead of opening a second session.
    before=[id(conn) for conn in one_c.connections.values()]
    one_c.execute('get_reports',dict(payload,_login=True),retry=0,timeout=60)
    assert [id(conn) for conn in one_c.connections.values()]==before
    print('Healthy re-login retained the existing test connection.',flush=True)
finally: one_c.close_all()
