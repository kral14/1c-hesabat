import unittest
from types import SimpleNamespace as NS
from services.documents.generic import get_generic_documents_list


class Query:
    def __init__(self):
        self.parameters = {}
        self.done = False
        self.Number = 'TEST-ORDER'
        self.Date = '14.10.2026 09:00:00'
        self.Posted = True
        self.DeletionMark = False
        self.KontragentCode = 'C001'
        self.GolovnoyKontragentCode = 'C002'
        self.Kontragent = 'Test store'
        self.GolovnoyKontragent = 'Test parent'
        self.Agent = 'Test agent'
        self.Contract = 'Test contract'
        self.Warehouse = 'Test warehouse'
        self.Portfolio = 'Test portfolio'
    def SetParameter(self, name, value): self.parameters[name] = value
    def Execute(self): return self
    def Choose(self): return self
    def Next(self):
        if self.done: return False
        self.done = True
        return True


class Connection:
    def __init__(self, warehouse='СкладГруппа'):
        fields = ['Контрагент', 'ДоговорКонтрагента'] + ([warehouse] if warehouse else [])
        metadata = NS(ТабличныеЧасти=NS(Найти=lambda name: NS() if name == 'Товары' else None), Синоним='Заказ покупателя', Реквизиты=[NS(Имя=f) for f in fields])
        self.Метаданные = NS(Документы=NS(Найти=lambda name: metadata))
        self.query = Query()
    def NewObject(self, kind): return self.query


class OrderJournalFieldsTests(unittest.TestCase):
    def test_order_warehouse_and_portfolio_select_filter_and_response(self):
        conn = Connection()
        result = get_generic_documents_list(conn, {
            'doc_type':'ЗаказПокупателя', 'limit':200,
            'filters':[
                {'fieldKey':'warehouse','operator':'Равно','value':'Test warehouse'},
                {'fieldKey':'portfolio','operator':'Равно','value':'Test portfolio'},
            ]})
        self.assertIn('ПРЕДСТАВЛЕНИЕ(Т.СкладГруппа) КАК Warehouse', conn.query.Text)
        self.assertIn('Т.ДоговорКонтрагента.Портфель.Наименование КАК Portfolio', conn.query.Text)
        self.assertIn('ЕСТЬNULL(Т.СкладГруппа.Наименование, "") = &p_crit_0_0', conn.query.Text)
        self.assertNotIn('Т.Склад.Наименование', conn.query.Text)
        self.assertIn('warehouse', [c['key'] for c in result['columns']])
        self.assertIn('portfolio', [c['key'] for c in result['columns']])
        self.assertEqual(result['items'][0]['warehouse'], 'Test warehouse')
        self.assertEqual(result['items'][0]['portfolio'], 'Test portfolio')

    def test_standard_warehouse_keeps_its_own_metadata_field(self):
        conn = Connection('Склад')
        get_generic_documents_list(conn, {'doc_type':'ЗаказПокупателя'})
        self.assertIn('ПРЕДСТАВЛЕНИЕ(Т.Склад) КАК Warehouse', conn.query.Text)
        self.assertNotIn('Т.СкладГруппа', conn.query.Text)

    def test_absent_warehouse_does_not_generate_nonexistent_path(self):
        conn = Connection(None)
        with self.assertRaisesRegex(ValueError, 'warehouse'):
            get_generic_documents_list(conn, {'doc_type':'ЗаказПокупателя', 'filters':[
                {'fieldKey':'warehouse','operator':'Равно','value':'Test warehouse'}]})
        self.assertNotIn('Т.Склад', getattr(conn.query, 'Text', ''))


if __name__ == '__main__': unittest.main()
