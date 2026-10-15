import unittest
from services.driver_filter import matches_name, driver_condition


class Query:
    def __init__(self): self.parameters = {}
    def SetParameter(self,key,value): self.parameters[key] = value


class Array(list):
    def Add(self,value): self.append(value)


class Connection:
    def NewObject(self,kind):
        assert kind == 'Массив'
        return Array()


class DriverFilterTests(unittest.TestCase):
    def test_all_comparisons_ignore_outer_whitespace(self):
        data = {'':'', 'A':'  Driver One  ', 'B':'Driver Two', 'C':'   '}
        cases = [('Равно','Driver One',['A']), ('Не равно','Driver One',['','B','C']),
                 ('В списке','Driver One; Driver Two',['A','B']), ('Не в списке','Driver One; Driver Two',['','C']),
                 ('Содержит','One',['A']), ('Не содержит','One',['','B','C']), ('Начинается с','Driver One',['A']),
                 ('Заполнено','',['A','B']), ('Не заполнено','',['','C'])]
        for op,value,expected in cases:
            with self.subTest(operator=op):
                rule = dict(fieldKey='pogruzka_voditel',operator=op,value=value)
                query = Query()
                sql = driver_condition(Connection(),query,rule,data,'test',{})
                self.assertEqual(query.parameters['test_selected'],expected)
                self.assertEqual(query.parameters['test_nonempty'],['A','B'])
                self.assertIn('ПФ.ActiveVoditelRef.Код',sql)
                self.assertNotIn('Наименование',sql)

    def test_structured_list_comparisons(self):
        rule = dict(operator='В списке',value='Driver',structuredFilter={'items':[{'value':'Driver','comp':'contains'}]})
        self.assertTrue(matches_name('  Driver One ',rule))
        rule['structuredFilter']['items'][0]['comp'] = 'equal'
        self.assertFalse(matches_name('  Driver One ',rule))

    def test_unmatched_value_cannot_broaden_filter(self):
        query = Query()
        self.assertEqual(driver_condition(Connection(),query,dict(fieldKey='pogruzka_voditel',operator='Равно',value='Missing'),{'A':'Driver'},'test',{}),'1 = 0')
