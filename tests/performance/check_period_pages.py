"""Read only a few small pages; print aggregate pagination evidence only."""
import sys, json, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import database
from services.documents.base import parse_query_datetime
sys.stdout.reconfigure(encoding='utf-8')
creds = database.get_active_base() or {}
assert (creds.get('server','').lower(),creds.get('ref','').lower()) == ('test1c','aztrade_test3')
limit = 10000 if '--bulk' in sys.argv else 200
for month in ('04','10'):
    cursor = {}
    seen = set()
    for page in range(3):
        payload = {**{k:creds.get(k,'') for k in ('server','ref','user','password')},
                   'doc_type':'РеализацияТоваровУслуг','date_from':f'2026-{month}-01 00:00:00',
                   'date_to':f'2026-{month}-'+('30' if month=='04' else '31')+' 23:59:59',
                   'limit':limit,'offset':page*limit,'filters':[],'search':'',**cursor}
        req=urllib.request.Request('http://127.0.0.1:5050/api/documents/list',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=90) as response: result=json.load(response)
        if not result.get('success'): raise RuntimeError(result.get('error'))
        rows=result.get('items',[])
        dates=[parse_query_datetime(row.get('date')) for row in rows]
        keys=[row.get('number') for row in rows]
        print(json.dumps({'month':month,'page':page,'rows':len(rows),'duplicates':sum(k in seen for k in keys),
                          'outside_period':sum(d is None or d.year!=2026 or d.month!=int(month) for d in dates),
                          'first_date':str(dates[0]) if dates else None,'last_date':str(dates[-1]) if dates else None,
                          'has_more':result.get('has_more')},ensure_ascii=False),flush=True)
        seen.update(keys)
        cursor={k:result.get(k,'') for k in ('last_date','last_number')}
        if not result.get('has_more'): break
