"""Read-only, bounded journal benchmark pinned to the authorized test database."""
import json
import sys
import time
import argparse
import calendar
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pythoncom
import win32com.client
from services.documents.realization import get_realization_list

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'tests' / 'journal_benchmark_results.json'
sys.stdout.reconfigure(encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--month', default='2026-10')
    parser.add_argument('--all-period', action='store_true')
    parser.add_argument('--max-pages', type=int, default=12)
    parser.add_argument('--initial-limit', type=int, default=1500)
    args = parser.parse_args()
    year, month = map(int, args.month.split('-'))
    last_day = calendar.monthrange(year, month)[1]
    report_path = ROOT / 'tests' / f'journal_benchmark_{"all" if args.all_period else args.month}_{args.initial_limit}.json'
    result = {'server': 'Test1C', 'ref': 'Aztrade_test3', 'read_only': True,
              'period': [f'{args.month}-01 00:00:00', f'{args.month}-{last_day:02d} 23:59:59'], 'pages': []}
    if args.all_period:
        result['period'] = ['', '']
    result['initial_limit'] = args.initial_limit
    pythoncom.CoInitialize()
    conn = None
    connector = None
    try:
        connector = win32com.client.Dispatch('V83.COMConnector')
        start = time.perf_counter()
        conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')
        result['connection_seconds'] = round(time.perf_counter() - start, 4)
        payload = dict(date_from=result['period'][0], date_to=result['period'][1],
                       search='', filters=[], limit=args.initial_limit, offset=0)
        start_all = time.perf_counter()
        total = 0
        first = None
        seen = set()
        duplicates = 0
        for page in range(args.max_pages):
            start = time.perf_counter()
            response = get_realization_list(conn, payload)
            elapsed = time.perf_counter() - start
            items = response.get('items', [])
            for item in items:
                identity = (item.get('date'), item.get('number'))
                duplicates += identity in seen
                seen.add(identity)
            total += len(items)
            result['pages'].append({'page': page + 1, 'rows': len(items), 'seconds': round(elapsed, 4)})
            print(json.dumps(result['pages'][-1]), flush=True)
            if first is None:
                first = response
            if not response.get('has_more'):
                result['complete'] = True
                break
            payload.update(limit=2000, offset=total, last_date=response.get('last_date', ''),
                           last_number=response.get('last_number', ''))
        else:
            result['complete'] = False
        result['total_rows'] = total
        result['duplicate_rows_across_pages'] = duplicates
        result['full_load_query_seconds'] = round(time.perf_counter() - start_all, 4)
        # Warm explicit refresh: two sequential repeats, never a periodic poll.
        result['refresh_seconds'] = []
        for _ in range(2):
            start = time.perf_counter()
            get_realization_list(conn, dict(date_from=result['period'][0], date_to=result['period'][1],
                                          search='', filters=[], limit=args.initial_limit, offset=0))
            result['refresh_seconds'].append(round(time.perf_counter() - start, 4))
        # Local fixture for rendering/processing: actual list fields, synthetic values only.
        keys = list(first['items'][0]) if first and first.get('items') else ['number', 'date']
        result['row_fields'] = keys
    except Exception as exc:
        result['error'] = str(exc)
    finally:
        conn = None
        connector = None
        pythoncom.CoUninitialize()
        REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(result, ensure_ascii=False), flush=True)
    return 1 if 'error' in result else 0


if __name__ == '__main__':
    raise SystemExit(main())
