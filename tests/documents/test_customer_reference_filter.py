import unittest
from services.documents.base import build_filter_conditions

class Query:
    def __init__(self): self.parameters={}
    def SetParameter(self,key,value): self.parameters[key]=value

class CustomerReferenceTests(unittest.TestCase):
    def test_selected_customer_uses_code_independent_of_display_name(self):
        query=Query();where=[]
        build_filter_conditions([{'fieldKey':'kontragent','operator':'Равно',
            'value':'ROYAL-Sagan - С000024890 - С000024890','referenceCode':'С000024890'}],query,where,{}, {})
        self.assertEqual(where,['Т.Контрагент.Код = &p_ref_0'])
        self.assertEqual(query.parameters['p_ref_0'],'С000024890')
    def test_free_text_keeps_name_search(self):
        query=Query();where=[]
        build_filter_conditions([{'fieldKey':'kontragent','operator':'Содержит','value':'ROYAL-Sagan'}],query,where,{}, {})
        self.assertIn('Т.Контрагент.Наименование ПОДОБНО',where[0])
        self.assertEqual(query.parameters['p_crit_0'],'%ROYAL-Sagan%')

if __name__=='__main__': unittest.main()
