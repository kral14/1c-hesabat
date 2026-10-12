"""Bounded read-only HTTP benchmark, pinned to the authorized Test1C infobase."""
import gzip
import json
import sys
import time
import urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import database

ROOT = Path(__file__).resolve().parents[2]
sys.stdout.reconfigure(encoding='utf-8')

def main():
    credentials = database.get_active_base() or {}
    if (str(credentials.get('server','')).casefold(), str(credentials.get('ref','')).casefold()) != ('test1c','aztrade_test3'):
        raise RuntimeError('Only Test1C / Aztrade_test3 is authorized')
    creds = {key:credentials.get(key,'') for key in ('server','ref','user','password')}
    rows = []
    limits = [200] if '--baseline' in sys.argv else ([0, 0] if '--full' in sys.argv else [200, 200, 2000, 2000])
    for limit in limits:
        payload = {**creds, 'doc_type':'РеализацияТоваровУслуг', 'date_from':'2026-04-01 00:00:00',
                   'date_to':'2026-10-31 23:59:59', 'search':'', 'filters':[], 'limit':limit, 'offset':0, 'profile':True}
        request = urllib.request.Request('http://127.0.0.1:5050/api/documents/list',
            data=json.dumps(payload).encode(), headers={'Content-Type':'application/json','Accept-Encoding':'gzip'})
        started = time.perf_counter()
        with urllib.request.urlopen(request, timeout=90) as response:
            wire = response.read()
            encoding = response.headers.get('Content-Encoding')
            server_timing = response.headers.get('Server-Timing')
        elapsed = time.perf_counter()-started
        decode_start = time.perf_counter()
        raw = gzip.decompress(wire) if encoding == 'gzip' else wire
        parsed = json.loads(raw)
        decode_ms = (time.perf_counter()-decode_start)*1000
        if not parsed.get('success'):
            print(json.dumps({'success':False,'error':parsed.get('error'),'elapsed_seconds':round(elapsed,3)},ensure_ascii=False))
            return 1
        compression = {}
        for level in (1, 6, 9):
            begin = time.perf_counter()
            compressed = gzip.compress(raw, compresslevel=level)
            compression[str(level)] = {'ms':round((time.perf_counter()-begin)*1000,2),'bytes':len(compressed)}
        entry = {'limit':limit,'rows':len(parsed.get('items',[])), 'http_ms':round(elapsed*1000,2),
                 'wire_bytes':len(wire),'json_bytes':len(raw),'decode_json_ms':round(decode_ms,2),
                 'server_timing':server_timing,'pipeline':(parsed.get('debug_info') or {}).get('timings_ms'),
                 'gzip_levels':compression}
        rows.append(entry)
        print(json.dumps(entry,ensure_ascii=False),flush=True)
    if '--baseline' not in sys.argv:
        name = 'office_pipeline_full_results.json' if '--full' in sys.argv else 'office_pipeline_results.json'
        (ROOT/'tests/artifacts'/name).write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
    return 0

if __name__ == '__main__': raise SystemExit(main())
