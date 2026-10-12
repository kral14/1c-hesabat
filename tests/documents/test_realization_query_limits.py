import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from services.documents.realization import get_realization_list

class Query:
    def SetParameter(self, key, value): pass
    def Execute(self): return self
    def Choose(self): return self
    def Next(self): return False

class Connection:
    def __init__(self): self.query = Query()
    def NewObject(self, kind): return self.query

class QueryLimitTests(unittest.TestCase):
    def test_only_active_duplicates_excludes_deleted_loading_documents(self):
        conn=Connection()
        get_realization_list(conn, {'limit':200,'filters':[{'fieldKey':'pogruzka_active_duplicate','operator':'Равно','value':'Да'}]})
        first=conn.query.Text.split(';')[0]
        self.assertIn('ГДЕ НЕ ПД.Ссылка.ПометкаУдаления',first)
        self.assertIn('КОЛИЧЕСТВО(РАЗЛИЧНЫЕ ПД.Ссылка) > 1',first)
    def test_duplicates_filtered_on_server_before_pagination(self):
        conn = Connection()
        get_realization_list(conn, {'limit':200, 'filters':[
            {'fieldKey':'pogruzka_duplicate','operator':'Равно','value':'Да'}]})
        first = conn.query.Text.split(';')[0]
        self.assertNotIn('ПД.Ссылка.ПометкаУдаления', first)
        self.assertIn('КОЛИЧЕСТВО(РАЗЛИЧНЫЕ ПД.Ссылка) > 1', first)
        self.assertIn('СГРУППИРОВАТЬ ПО ПД.Накладная', first)

    def test_nonduplicates_and_disabled_condition(self):
        conn = Connection()
        criterion = {'fieldKey':'pogruzka_duplicate','operator':'Равно','value':'Нет'}
        get_realization_list(conn, {'limit':200, 'filters':[criterion]})
        self.assertIn('НЕ (Т.Ссылка В (', conn.query.Text.split(';')[0])
        criterion['enabled'] = False
        get_realization_list(conn, {'limit':200, 'filters':[criterion]})
        self.assertNotIn('ПД.Накладная', conn.query.Text)

    def test_limited_selection_orders_before_cutting_page(self):
        conn = Connection()
        get_realization_list(conn, {'limit':200})
        first = conn.query.Text.split(';')[0]
        self.assertIn('ПЕРВЫЕ 201', first)
        self.assertIn('УПОРЯДОЧИТЬ', first)
        self.assertNotIn('СГРУPПИРОВАТЬ', conn.query.Text)

    def test_unlimited_temp_selection_does_not_use_illegal_order(self):
        conn = Connection()
        result = get_realization_list(conn, {'limit':0})
        first, final = conn.query.Text.split(';', 1)
        self.assertNotIn('ПЕРВЫЕ', first)
        self.assertNotIn('УПОРЯДОЧИТЬ', first)
        self.assertIn('УПОРЯДОЧИТЬ', final)
        self.assertFalse(result['has_more'])

if __name__ == '__main__': unittest.main()
