import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.documents.base import narrow_search_to_column, build_filter_conditions


class SearchColumnTests(unittest.TestCase):
    def test_find_modes_use_correct_parameter_and_operator(self):
        class Query:
            def SetParameter(self, name, value): self.value = value
        for mode, expected, operator in [('contains', '%TEST%', 'ПОДОБНО'), ('starts', 'TEST%', 'ПОДОБНО'), ('exact', 'TEST', '=')]:
            query = Query()
            conditions = ['Т.Номер ПОДОБНО &SearchVal']
            narrow_search_to_column({'search': 'TEST', 'search_field': 'number', 'search_mode': mode}, conditions, {}, query)
            self.assertEqual(query.value, expected)
            self.assertEqual(conditions, [f'Т.Номер {operator} &SearchVal'])
    def test_ui_filter_keys_are_applied_to_query(self):
        class Query:
            def __init__(self): self.parameters = {}
            def SetParameter(self, name, value): self.parameters[name] = value
        query = Query()
        conditions = []
        build_filter_conditions([{'fieldKey': 'kontragent', 'comparison': 'Равно', 'value': 'TEST 12B'}],
                                query, conditions, {})
        self.assertEqual(query.parameters['p_crit_0'], 'TEST 12B')
        self.assertEqual(conditions, ['Т.Контрагент.Наименование = &p_crit_0'])

    def test_unknown_filter_does_not_enter_query(self):
        import contextlib
        import io
        conditions = []
        with contextlib.redirect_stdout(io.StringIO()) as warning:
            build_filter_conditions([{'fieldKey': 'unknown', 'value': 'x'}], None, conditions, {})
        self.assertEqual(conditions, [])
        self.assertIn('unknown', warning.getvalue())

    def test_number_search_preserves_period_and_removes_global_search(self):
        conditions = ['Т.Дата >= &DateFrom', '(Т.Номер ПОДОБНО &SearchVal ИЛИ Т.Комментарий ПОДОБНО &SearchVal)']
        narrow_search_to_column({'search': '123', 'search_field': 'number'}, conditions, {})
        self.assertEqual(conditions, ['Т.Дата >= &DateFrom', 'Т.Номер ПОДОБНО &SearchVal'])

    def test_unknown_column_does_not_enter_query_text(self):
        conditions = ['(Т.Номер ПОДОБНО &SearchVal)']
        original = list(conditions)
        narrow_search_to_column({'search': '123', 'search_field': 'arbitrary query text'}, conditions, {})
        self.assertEqual(conditions, original)

    def test_reference_column_uses_trusted_mapping(self):
        conditions = ['(Т.Номер ПОДОБНО &SearchVal)']
        narrow_search_to_column({'search': 'Customer', 'search_field': 'kontragent'}, conditions,
                               {'kontragent': 'Т.Контрагент.Наименование'})
        self.assertEqual(conditions, ['Т.Контрагент.Наименование ПОДОБНО &SearchVal'])


if __name__ == '__main__':
    unittest.main()
