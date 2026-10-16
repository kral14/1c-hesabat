"""Read-only comparison matrix. Refuses every database except the named test DB.

Run with python -m tests.diagnostics.filter_matrix_test_only --doc realization
No credentials or document values are written to the report.
"""
import argparse
import json
import re
import time
from pathlib import Path
from services.onec_dates import CalendarConnection, parse_calendar_date
from services.filter_policy import REFERENCES, BOOLEANS, COMPARISONS, INTERVALS
from services.documents.realization import get_realization_list
from services.documents.vozvrat import get_vozvrat_list
from services.documents.pogruzka import get_pogruzka_list
from services.documents.generic import get_generic_documents_list

DOCS = {'realization': ('РеализацияТоваровУслуг', get_realization_list),
        'return': ('ВозвратТоваровОтПокупателя', get_vozvrat_list),
        'loading': ('ПогрузкиМашин', get_pogruzka_list),
        'order': ('ЗаказПокупателя', get_generic_documents_list),
        'receipt': ('ПоступлениеТоваровУслуг', get_generic_documents_list)}
TEXT = ['Равно', 'Не равно', 'В списке', 'Не в списке', 'Содержит', 'Не содержит', 'Начинается с', 'Заполнено', 'Не заполнено']


class EmptyResult:
    def Choose(self): return self
    def Next(self): return False


class ProbeQuery:
    def __init__(self, raw, owner): self.raw, self.owner = raw, owner
    @property
    def Text(self): return self.raw.Text
    @Text.setter
    def Text(self, value): self.raw.Text = value
    def SetParameter(self, name, value): self.raw.SetParameter(name, value)
    def Execute(self):
        result = self.raw.Execute()
        self.owner.row_present = bool(result.Choose().Next())
        return EmptyResult()


class ProbeConnection:
    def __init__(self, raw): self.raw, self.row_present = raw, False
    def __getattr__(self, key): return getattr(self.raw, key)
    def NewObject(self, kind):
        obj = self.raw.NewObject(kind)
        return ProbeQuery(obj, self) if kind == 'Запрос' else obj


def main():
    import pythoncom
    import win32com.client
    parser = argparse.ArgumentParser()
    parser.add_argument('--doc', choices=DOCS, required=True)
    parser.add_argument('--fields', default='')
    parser.add_argument('--query-only', action='store_true', help='Execute real 1C queries without decoding/enriching rows; semantic predicates are tested separately')
    args = parser.parse_args()
    source = Path('tests/diagnostics/check_test_base.py').read_text(encoding='utf-8')
    connection = re.search(r"Connect\('([^']+)'\)", source)[1]
    if 'Srvr="Test1C"' not in connection or 'Ref="Aztrade_test3"' not in connection:
        raise RuntimeError('Only Test1C / Aztrade_test3 is authorized')
    pythoncom.CoInitialize()
    raw = conn = None
    results = []
    report = Path(f'tests/artifacts/filter_matrix_{args.doc}{"_recheck" if args.fields else ""}.json')
    def save():
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps({'database': 'Test1C / Aztrade_test3', 'document': args.doc, 'mode': 'query_execution' if args.query_only else 'full_handler', 'cases': results}, ensure_ascii=False, indent=2), encoding='utf-8')
    try:
        raw = win32com.client.Dispatch('V83.COMConnector').Connect(connection)
        conn = CalendarConnection(raw)
        doc, handler = DOCS[args.doc]
        baseline = handler(conn, {'doc_type': doc, 'limit': 5})
        rows = baseline['items']
        if not rows: raise RuntimeError('No baseline test documents')
        last = parse_calendar_date(rows[0]['date'])
        print('number format:', len(str(rows[0]['number'])), re.sub(r'\d','0',str(rows[0]['number'])), flush=True)
        payload = {'doc_type': doc, 'limit': 2, 'date_from': f'{last.year}-01-01', 'date_to': f'{last.year}-12-31'}
        keys = [c['key'] for c in baseline['columns'] if c['key'] != 'status'] + ['posted', 'deleted', 'nomenclature']
        handler_conn = ProbeConnection(conn) if args.query_only else conn
        for key in dict.fromkeys(keys):
            if args.fields and key not in args.fields.split(','): continue
            seed = next((r.get(key) for r in rows if r.get(key) not in (None, '')), '')
            if key in BOOLEANS: ops = ['Равно', 'Не равно']; seed = 'Да'
            elif key in ('date', 'amount', 'realization_count'): ops = sorted(COMPARISONS | INTERVALS | {'Заполнено', 'Не заполнено'})
            elif key in REFERENCES: ops = ['Равно', 'Не равно', 'В списке', 'Не в списке', 'Заполнено', 'Не заполнено']
            elif key == 'vms_status': ops = ['Равно', 'Не равно', 'В списке', 'Не в списке', 'Заполнено', 'Не заполнено']; seed = 'Выгружен'
            else: ops = TEXT + (['В группе из списка'] if key in ('number', 'nomenclature') else [])
            for op in ops:
                value = seed if seed != '' else ('0' if key in ('amount', 'realization_count') else '__FILTER_NO_SUCH_VALUE__')
                rule = {'fieldKey': key, 'operator': op, 'value': value, 'enabled': True}
                if op.startswith('Интервал'): rule.update(valueFrom=value, valueTo=value)
                start = time.monotonic()
                case = {'field': key, 'operator': op}
                try:
                    response = handler(handler_conn, {**payload, 'filters': [rule]})
                    case.update(status='pass', rows=len(response['items']))
                    if args.query_only: case['row_present'] = handler_conn.row_present
                except Exception as error:
                    # COM errors contain query text but never the connection string.
                    case.update(status='fail', error=str(error)[:1800])
                case['seconds'] = round(time.monotonic() - start, 3)
                results.append(case)
                save()
            print(f'{args.doc}: {key}: {len(results)} cases, {sum(c["status"] == "fail" for c in results)} failures', flush=True)
        print(json.dumps({'document': args.doc, 'cases': len(results), 'failures': sum(c['status'] == 'fail' for c in results)}), flush=True)
    finally:
        conn = raw = None
        pythoncom.CoUninitialize()


if __name__ == '__main__': main()
