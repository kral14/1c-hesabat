import unittest
from services.filter_policy import validate_filters
from services.documents.base import build_filter_conditions


class FilterPolicyTests(unittest.TestCase):
    def rule(self, key, value, operator='Равно', **kw):
        return dict(fieldKey=key, value=value, operator=operator, **kw)

    def test_number_validation_depends_on_operator(self):
        validate_filters([self.rule('number', 'C0000476122')])
        validate_filters([self.rule('number', 'C00004637603')])
        for op in ['Содержит', 'Не содержит', 'Начинается с', 'Заполнено', 'Не заполнено']:
            validate_filters([self.rule('number', '14', op)])
        for op in ['Равно', 'Не равно', 'В списке', 'Не в списке', 'В группе из списка']:
            with self.assertRaises(ValueError):
                validate_filters([self.rule('number', '14', op)])
        for op in ['В списке', 'Не в списке', 'В группе из списка']:
            validate_filters([self.rule('number', 'C0000476122; C0000476123', op)])
            with self.assertRaises(ValueError):
                validate_filters([self.rule('number', 'C0000476122; 14', op)])
        for op in ['Заполнено', 'Не заполнено']:
            validate_filters([self.rule('number', '', op)])

    def test_structured_number_list_requires_every_complete_number(self):
        for item in [{'comp': 'equal', 'value': '14'}, {'comp': 'contains', 'value': 'C0000476122'}]:
            with self.assertRaises(ValueError):
                validate_filters([self.rule('number', 'C0000476122', 'В группе из списка', structuredFilter={'items':[item]})])

    def test_invalid_types_and_reversed_ranges(self):
        for rule in [self.rule('date', '31.02.2026'), self.rule('amount', 'NaN'), self.rule('posted', 'maybe'), self.rule('warehouse', 'WH', 'Содержит'), self.rule('amount', '', 'Интервал (>=, <=)', valueFrom='20', valueTo='10')]:
            with self.assertRaises(ValueError):
                validate_filters([rule])

    def test_disabled_invalid_rule_does_not_block(self):
        validate_filters([self.rule('number', '14', enabled=False)])

    def test_interval_compiles_both_bounds(self):
        class Query:
            def __init__(self): self.params = {}
            def SetParameter(self, key, value): self.params[key] = value
        query, clauses = Query(), []
        build_filter_conditions([self.rule('amount', '', 'Интервал (>=, <=)', valueFrom='1,5', valueTo='10')], query, clauses, {})
        self.assertEqual(len(clauses), 2)
        self.assertEqual(list(query.params.values()), [1.5, 10.0])

    def test_number_list_compiles_exact_matches_and_contains_stays_partial(self):
        class Query:
            def __init__(self): self.params = {}
            def SetParameter(self, key, value): self.params[key] = value
        for op in ['В списке', 'Не в списке', 'В группе из списка']:
            query, clauses = Query(), []
            build_filter_conditions([self.rule('number', 'C0000476122; C0000476123', op)], query, clauses, {})
            self.assertEqual(list(query.params.values()), ['C0000476122', 'C0000476123'])
            self.assertNotIn('ПОДОБНО', clauses[0])
            self.assertEqual(clauses[0].startswith('НЕ'), op == 'Не в списке')
        query, clauses = Query(), []
        build_filter_conditions([self.rule('number', '14', 'Содержит')], query, clauses, {})
        self.assertEqual(list(query.params.values()), ['%14%'])


if __name__ == '__main__':
    unittest.main()
