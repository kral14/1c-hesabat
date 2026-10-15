import unittest
from unittest.mock import patch
from services.documents.realization import get_realization_list


class Query:
    def Add(self, value): pass
    def SetParameter(self, name, value): pass
    def Execute(self): return self
    def Choose(self): return self
    def Next(self): return False


class Connection:
    def __init__(self): self.query = Query()
    def NewObject(self, kind): return self.query


class RealizationWmsFilterTests(unittest.TestCase):
    def test_related_filters_are_joined_before_page_selection(self):
        for field, alias in [('pogruzka_voditel','ПФ'), ('pogruzka_marshrut','ПФ'), ('obrabotka_number','ОФ')]:
            for op in ['Равно','Не равно','Содержит','Не содержит','Начинается с','В списке','Не в списке','Заполнено','Не заполнено']:
                with self.subTest(field=field, operator=op):
                    conn = Connection()
                    with patch('services.documents.realization.load_driver_names',return_value={'A':'Test','B':''}):
                        get_realization_list(conn, {'limit':200,'filters':[{'fieldKey':field,'operator':op,'value':'Test'}]})
                    selection = conn.query.Text.split(';')[0]
                    self.assertIn('КАК ' + alias, selection)
                    self.assertIn(alias + '.', selection.split('ГДЕ')[-1])

    def test_status_alias_exists_before_page_filter(self):
        for op, value in [('Равно', 'Выгружен'), ('Не равно', 'Подтвержден WMS'), ('Заполнено', ''), ('Не заполнено', '')]:
            conn = Connection()
            get_realization_list(conn, {'limit': 200, 'filters': [{'fieldKey': 'vms_status', 'operator': op, 'value': value}]})
            selection = conn.query.Text.split(';')[0]
            self.assertIn('СрезПоследних КАК ВМС', selection)
            self.assertIn('ПО Т.Ссылка = ВМС.Документ1С', selection)
            self.assertLess(selection.index('КАК ВМС'), selection.index('ГДЕ'))
            self.assertIn('ВМС.СтатусВМС', selection)

    def test_no_status_filter_does_not_add_selection_join(self):
        for filters in [[], [{'fieldKey': 'vms_status', 'operator': 'Равно', 'value': 'Выгружен', 'enabled': False}]]:
            conn = Connection()
            get_realization_list(conn, {'limit': 200, 'filters': filters})
            self.assertNotIn('КАК ВМС', conn.query.Text.split(';')[0])
