"""Read-only audit verification pinned to the authorized test infobase."""
import sys, time, re
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import pythoncom, win32com.client
from services.audit_service import get_audit_list
from services.audit_filters import document_conditions, audit_field_map

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    source = (Path(__file__).parent / 'check_test_base.py').read_text(encoding='utf-8')
    match = re.search(r"Connect\('([^']+)'\)", source)
    conn_str = match[1]
    assert 'Srvr="Test1C";' in conn_str and 'Ref="Aztrade_test3";' in conn_str
    pythoncom.CoInitialize()
    try:
        connector = win32com.client.Dispatch('V83.COMConnector')
        conn = connector.Connect(conn_str)
        print('Connected: Test1C / Aztrade_test3 (read-only)', flush=True)
        for doc_type in ('РеализацияТоваровУслуг', 'ВозвратТоваровОтПокупателя'):
            mapping = audit_field_map(conn, doc_type)
            q = conn.NewObject('Запрос')
            q.Text = f'ВЫБРАТЬ ПЕРВЫЕ 1 Т.Номер КАК Number, {mapping['warehouse']} КАК Warehouse, Т.ДоговорКонтрагента.Агент.Наименование КАК Agent, Т.ДоговорКонтрагента.Портфель.Наименование КАК Portfolio ИЗ Документ.{doc_type} КАК Т'
            row = q.Execute().Choose()
            assert row.Next()
            print(doc_type + ': number/warehouse/agent/portfolio fields valid', flush=True)
            for field, value in [('number',str(row.Number).strip()), ('warehouse',str(row.Warehouse).strip()), ('agent',str(row.Agent).strip()), ('portfolio',str(row.Portfolio).strip())]:
                if not value: value = '__no_match__'
                payload = {'doc_type':doc_type, 'period_field':'date', 'limit':5, 'filters':[{'fieldKey':field,'operator':'Равно','value':value}]}
                result = get_audit_list(conn, payload)
                if field == 'number': assert all(item['number'] == value for item in result['items'])
                print(f'{field}: query passed ({len(result["items"])} rows)', flush=True)
        payload = {'doc_type':'ВозвратТоваровОтПокупателя','period_field':'change_date', 'date_from':'2099-01-01', 'date_to':'2099-01-02','limit':5}
        assert not get_audit_list(conn,payload)['items']
        print('No document-date fallback for change-date period: passed', flush=True)
        row = q = None
        conn = None
        connector = None
        import gc
        gc.collect()
    finally:
        pythoncom.CoUninitialize()

if __name__ == '__main__': main()
