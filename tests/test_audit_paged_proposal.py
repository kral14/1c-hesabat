import ast, datetime, types, unittest
from pathlib import Path
from services.documents.base import parse_query_datetime
from services.onec_dates import as_1c_date
src=Path('services/audit_service.py').read_text(encoding='utf-8')
tree=ast.parse(src)
helpers=ast.Module(body=[node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name in ('get_event_timeline','get_audit_event_page')],type_ignores=[])
ns={'datetime':datetime,'as_1c_date':as_1c_date,'parse_query_datetime':parse_query_datetime,'format_1c_datetime':lambda d:d.strftime('%d.%m.%Y %H:%M:%S'),'DOCUMENT_TYPES':('ВозвратТоваровОтПокупателя',)}
exec(compile(helpers,'proposed audit helpers','exec'),ns)
class Table:
    def __init__(self): self.rows=[]
    def Количество(self): return len(self.rows)
    def Получить(self,i): return self.rows[i]
class Filter(dict):
    def Вставить(self,k,v): self[k]=v
class Query:
    DocRef='target-doc'
    def __init__(self): self.position=0
    def SetParameter(self,k,v): pass
    def Execute(self): return self
    def Choose(self): return self
    def Next(self): self.position+=1;return self.position==1
class Conn:
    def NewObject(self,name): return {'Запрос':Query,'ТаблицаЗначений':Table,'Структура':Filter}[name]()
    def ВыгрузитьЖурналРегистрации(self,table,filter,*args):
        assert args==('',''), 'No total event limit is allowed'
        assert filter['Данные']=='target-doc'
        for day,count in ((6,120),(7,130)):
            date=datetime.datetime(2026,10,day,12,tzinfo=datetime.timezone.utc)
            if filter['ДатаНачала']<=date<=filter['ДатаОкончания']:
                table.rows.extend(types.SimpleNamespace(Дата=date,Событие='_$Data$_.Update',ИмяПользователя='test',Комментарий='') for _ in range(count))
class PageTests(unittest.TestCase):
    def test_expanding_period_returns_all_events_without_day_overlap(self):
        payload={'doc_type':'ВозвратТоваровОтПокупателя','number':'C001','date_from':'2026-10-06','date_to':'2026-10-06 23:59:59'}
        narrow=ns['get_audit_event_page'](Conn(),payload)
        self.assertEqual(len(narrow['events']),120)
        self.assertEqual(narrow['next_cursor'],'')
        payload['date_to']='2026-10-07 23:59:59'
        first=ns['get_audit_event_page'](Conn(),payload)
        second=ns['get_audit_event_page'](Conn(),dict(payload,cursor=first['next_cursor']))
        self.assertEqual(len(first['events'])+len(second['events']),250)
        self.assertEqual(second['next_cursor'],'')
        self.assertEqual(first['next_cursor'],'2026-10-07 00:00:00')
    def test_invalid_cursor_rejected(self):
        with self.assertRaises(ValueError):ns['get_audit_event_page'](Conn(),{'doc_type':'ВозвратТоваровОтПокупателя','date_from':'2026-10-06','date_to':'2026-10-07','cursor':'2026-10-01'})
if __name__=='__main__':unittest.main()
