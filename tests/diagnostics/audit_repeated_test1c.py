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

import time
try:
    for index in range(3):
        start=time.perf_counter()
        result=one_c.execute('get_audit_list',{**payload,'doc_type':'ВозвратТоваровОтПокупателя','date_from':'2026-10-06','date_to':'2026-10-13 23:59:59','limit':30,'period_field':'change_date'},retry=0,timeout=60)
        print('Audit round',index+1,'rows',len(result['items']),'seconds',round(time.perf_counter()-start,2),flush=True)
    users=one_c.execute('get_users',payload,retry=0,timeout=30)
    print('Users after three Audit requests: passed',flush=True)
finally: one_c.close_all()
