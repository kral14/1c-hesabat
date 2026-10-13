import unittest
from services.audit_filters import document_conditions, version_conditions

class Query:
    def __init__(self): self.params = {}
    def SetParameter(self, key, value): self.params[key] = value

class AuditFiltersTests(unittest.TestCase):
    def test_combined_filters_have_distinct_parameters(self):
        q = Query()
        filters = [{'fieldKey':k,'operator':'Равно','value':v} for k,v in [('number','0001'),('warehouse','WH'),('agent','A'),('portfolio','P')]]
        parts = document_conditions(q, {'filters':filters}, 'РеализацияТоваровУслуг')
        self.assertEqual(len(parts),4)
        self.assertEqual(len(q.params),4)
        self.assertEqual(q.params['af_0_p_crit_0'],'0001')
        self.assertIn('Т.ДоговорКонтрагента.Портфель.Наименование',parts[3])
        for i, part in enumerate(parts): self.assertIn(f'&af_{i}_p_crit_0',part)
    def test_reference_code_preserved(self):
        q = Query()
        parts = document_conditions(q,{'filters':[{'fieldKey':'kontragent','operator':'Равно','value':'Name','referenceCode':'123'}]},'РеализацияТоваровУслуг')
        self.assertIn('Т.Контрагент.Код = &af_0_p_ref_0',parts)
        self.assertEqual(q.params['af_0_p_ref_0'],'123')
    def test_dates_are_separate_and_intervals_use_both_bounds(self):
        q = Query()
        filters = [{'fieldKey':k,'operator':'Интервал (>=, <=)','valueFrom':'01.10.2026','valueTo':'13.10.2026'} for k in ('date','change_date')]
        payload = {'filters':filters, 'period_field':'date','date_from':'2026-10-01','date_to':'2026-10-13'}
        doc = document_conditions(q,payload,'ВозвратТоваровОтПокупателя')
        ver = version_conditions(q,payload)
        self.assertIn('Т.Дата >=',doc[0])
        self.assertIn('Т.Дата <=',doc[0])
        self.assertIn('Т.ДатаВерсии >=',ver[0])
        self.assertNotEqual(q.params['af_0valueFrom'],q.params['af_0valueTo'])
    def test_amount_interval_uses_both_bounds(self):
        q = Query()
        parts = document_conditions(q,{'filters':[{'fieldKey':'amount','operator':'Интервал (>=, <=)','valueFrom':'10','valueTo':'20'}]},'РеализацияТоваровУслуг')
        self.assertEqual(len(parts),2)
        self.assertEqual(sorted(q.params.values()),[10,20])
    def test_return_warehouse_override(self):
        parts = document_conditions(Query(),{'filters':[{'fieldKey':'warehouse','operator':'Равно','value':'WH'}]},'ВозвратТоваровОтПокупателя',field_map={'warehouse':'Т.СкладОрдер.Наименование'})
        self.assertIn('Т.СкладОрдер.Наименование',parts[0])
    def test_unsupported_field_is_rejected(self):
        with self.assertRaises(ValueError): document_conditions(Query(), {'filters':[{'fieldKey':'portfolio','value':'P'}]},'ПогрузкиМашин')
    def test_posting_filter_before_limit(self):
        parts = document_conditions(Query(),{'filter_mode':'draft_only'},'ВозвратТоваровОтПокупателя')
        self.assertIn('Т.Проведен = ЛОЖЬ',parts)
        self.assertIn('Т.ПометкаУдаления = ЛОЖЬ',parts)

if __name__ == '__main__': unittest.main()
