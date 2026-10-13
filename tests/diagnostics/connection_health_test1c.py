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
    before=one_c.execute('connection_probe',payload,retry=0)
    assert before['connected'] is False
    assert not one_c.connections, 'Probe must not open a connection'
    assert one_c.execute('ping',payload,retry=0)=='pong'
    result=one_c.execute('connection_probe',payload,retry=0)
    assert result['connected'] is True
    print('Test1C / Aztrade_test3: startup ping and passive connection probe passed.',flush=True)
finally: one_c.close_all()
