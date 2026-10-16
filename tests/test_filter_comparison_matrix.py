"""Execute compiled scalar predicates against an independent SQL dataset."""
import re
import sqlite3
import unittest
from services.documents.base import build_filter_conditions
from services.filter_policy import REFERENCES
from tests.test_agent_filters import connection as agent_connection


class Query:
    def __init__(self): self.parameters = {}
    def SetParameter(self, key, value): self.parameters[key] = value


class ComparisonMatrixTests(unittest.TestCase):
    def test_every_text_field_and_comparison_against_real_predicates(self):
        fields = sorted(REFERENCES | {'comment', 'kontragent_code', 'contract_price_type', 'pogruzka_voditel', 'pogruzka_marshrut', 'obrabotka_number', 'marshrut', 'voditel'})
        cases = [('Равно', 'Alpha', [1]), ('Не равно', 'Alpha', [2, 3, 4, 5]),
                 ('В списке', 'Alpha; Beta', [1, 2]), ('Не в списке', 'Alpha; Beta', [3, 4, 5]),
                 ('Заполнено', '', [1, 2, 3]), ('Не заполнено', '', [4, 5])]
        text_cases = [('Содержит', 'Alpha', [1, 3]), ('Не содержит', 'Alpha', [2, 4, 5]), ('Начинается с', 'Alpha', [1, 3]), ('В группе из списка', 'Alpha; Beta', [1, 2])]
        database = sqlite3.connect(':memory:')
        self.addCleanup(database.close)
        database.execute('CREATE TABLE data (id INTEGER, value TEXT)')
        database.executemany('INSERT INTO data VALUES (?,?)', [(1, 'Alpha'), (2, 'Beta'), (3, 'Alpha extra'), (4, ''), (5, None)])
        for field in fields:
            for op, value, expected in cases + ([] if field in REFERENCES else text_cases):
                with self.subTest(field=field, operator=op):
                    query, clauses = Query(), []
                    build_filter_conditions([{'fieldKey': field, 'operator': op, 'value': value}], query, clauses, {}, {field: 'value'}, conn=agent_connection() if field.startswith('agent_sales_') else None)
                    self.assertEqual(len(clauses), 1, 'active condition must never be dropped')
                    sql = clauses[0].replace('ЕСТЬNULL', 'COALESCE').replace('ПОДОБНО', 'LIKE').replace('СПЕЦСИМВОЛ', 'ESCAPE').replace('НЕ ', 'NOT ').replace(' ИЛИ ', ' OR ').replace(' И ', ' AND ')
                    sql = sql.replace('Т.ДоговорКонтрагента.Агент.ВидРеализации.Наименование','value').replace('Т.ДоговорКонтрагента.Агент.КаналСбыта.Наименование','value')
                    sql = re.sub(r'&(\w+)', r':\1', sql)
                    actual = [row[0] for row in database.execute('SELECT id FROM data WHERE ' + sql + ' ORDER BY id', query.parameters)]
                    self.assertEqual(actual, expected)

    def test_structured_list_keeps_exact_and_contains_distinct(self):
        query, clauses = Query(), []
        build_filter_conditions([{'fieldKey':'kontragent_code', 'operator':'В списке', 'value':'Alpha; Beta', 'structuredFilter':{'items':[{'comp':'equal','value':'Alpha'},{'comp':'contains','value':'Beta'}]}}], query, clauses, {}, {'kontragent_code':'value'})
        self.assertEqual(list(query.parameters.values()), ['Alpha', '%Beta%'])
        self.assertIn(' = ', clauses[0]); self.assertIn('ПОДОБНО', clauses[0])

    def test_numeric_and_date_empty_conditions_use_typed_values(self):
        for field, expected in [('amount','0'), ('realization_count','0'), ('date','ДАТАВРЕМЯ(1,1,1)')]:
            for op, comparison in [('Заполнено','<>'), ('Не заполнено','=')]:
                query, clauses = Query(), []
                build_filter_conditions([{'fieldKey':field,'operator':op}], query, clauses, {}, {field:'value'})
                self.assertEqual(clauses, [f'value {comparison} {expected}'])

    def test_goods_every_supported_comparison_produces_a_condition(self):
        for op in ['Равно','Не равно','Содержит','Не содержит','Начинается с','В списке','Не в списке','В группе из списка','Заполнено','Не заполнено']:
            query, clauses = Query(), []
            build_filter_conditions([{'fieldKey':'nomenclature','operator':op,'value':'[S434400] Product'}],query,clauses,{})
            self.assertTrue(clauses, op)
            self.assertIn('Т.Ссылка',clauses[0])
            if op == 'Равно':
                self.assertEqual(list(query.parameters.values()), ['S434400'])
                self.assertNotIn('ПОДОБНО', clauses[0])
