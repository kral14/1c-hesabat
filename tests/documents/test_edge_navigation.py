import unittest
from services.documents.navigation import edge_query
from services.documents.realization import get_realization_list
from tests.documents.test_realization_query_limits import Connection

class EdgeNavigationTests(unittest.TestCase):
    def test_multiple_sort_directions_reversed_independently_for_end(self):
        rules=[{'field':'kontragent','ascending':True},{'field':'amount','ascending':False}]
        text=self.query(sort_rules=rules,navigation_edge='end')
        self.assertIn('Kontragent УБЫВ, Amount ВОЗР',text)
        self.assertIn('ПЕРВЫЕ 201',text)
    def test_unlimited_multiple_sort_has_no_top(self):
        text=self.query(limit=0,sort_rules=[{'field':'amount','ascending':True}])
        self.assertNotIn('ПЕРВЫЕ',text)
        self.assertIn('Amount ВОЗР',text)
    def query(self, **payload):
        conn = Connection()
        get_realization_list(conn, {'limit':200,'date_from':'2026-04-01','date_to':'2026-04-30'})
        return edge_query(conn.query.Text, {'limit':200,'navigation_edge':'home',**payload})
    def test_end_reverses_sort_and_limits_both_selections(self):
        text = self.query(navigation_edge='end',sort_field='amount',sort_ascending=True)
        for part in text.split(';'):
            self.assertIn('ПЕРВЫЕ 201',part)
            self.assertIn('Amount УБЫВ',part)
        self.assertIn('Т.Дата >= &DateFrom',text)
        self.assertIn('Т.Дата <= &DateTo',text)
    def test_home_keeps_direction_and_next_page_is_bounded(self):
        text = self.query(sort_field='kontragent',sort_ascending=True,offset=200)
        self.assertIn('Kontragent ВОЗР',text)
        self.assertIn('ПЕРВЫЕ 401',text)
    def test_derived_sort_limits_final_selection_only(self):
        text = self.query(sort_field='obrabotka_number')
        initial,final = text.split(';')
        self.assertNotIn('ПЕРВЫЕ',initial)
        self.assertNotIn('УПОРЯДОЧИТЬ',initial)
        self.assertIn('ПЕРВЫЕ 201',final)
    def test_untrusted_or_unavailable_fields_rejected(self):
        for field in ('number;DROP','pogruzka_marshrut'):
            with self.assertRaises(ValueError): self.query(sort_field=field)

if __name__ == '__main__': unittest.main()
