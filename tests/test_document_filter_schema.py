"""Exercise every advertised document field through the actual query handlers (no 1C)."""
import unittest
from types import SimpleNamespace as NS
from unittest.mock import patch
from services.filter_policy import DOCUMENT_FIELDS, BASE_FIELDS, REFERENCES, BOOLEANS, normalize_filters
from services.documents.realization import get_realization_list
from services.documents.vozvrat import get_vozvrat_list
from services.documents.pogruzka import get_pogruzka_list
from services.documents.generic import get_generic_documents_list
from tests.test_agent_filters import connection as agent_connection


class Query:
    def __init__(self): self.parameters={}; self.Text=''
    def SetParameter(self, name, value): self.parameters[name]=value
    def Execute(self): return self
    def Choose(self): return self
    def Next(self): return False


class Array(list):
    def Add(self, value): self.append(value)


class Connection:
    def __init__(self, fields=(), goods=True):
        agent=agent_connection()
        meta=NS(Синоним='Test document',Реквизиты=[NS(Имя=name) for name in fields],ТабличныеЧасти=NS(Найти=lambda name:NS() if goods and name=='Товары' else None))
        self.Метаданные=NS(Справочники=agent.Метаданные.Справочники,Документы=NS(Найти=lambda name:meta,ВозвратТоваровОтПокупателя=meta))
        self.queries=[];self.agent=agent
    def NewObject(self, kind, *args):
        if kind=='ОписаниеТипов': return self.agent.NewObject(kind,*args)
        if kind=='Массив': return Array()
        assert kind=='Запрос',kind
        q=Query();self.queries.append(q);return q


def cases(key):
    if key in BOOLEANS: return [(op,'Да',{}) for op in ('Равно','Не равно')]
    if key in ('date','amount','realization_count'):
        value='14.10.2026 09:00:00' if key=='date' else '1,5'
        result=[(op,value,{}) for op in ('Равно','Не равно','Меньше','Меньше или равно','Больше','Больше или равно')]
        result += [(op,value,dict(valueFrom=value,valueTo=value)) for op in ('Интервал (>, <)','Интервал (>=, <=)','Интервал (>=, <)','Интервал (>, <=)')]
    else:
        value='Выгружен' if key=='vms_status' else ('C0000476122' if key=='number' else 'Test')
        ops=['Равно','Не равно','В списке','Не в списке']
        if key not in REFERENCES and key!='vms_status': ops+=['Содержит','Не содержит','Начинается с']
        if key=='number': ops+=['В группе из списка']
        result=[(op,value,{}) for op in ops]
    return result+[(op,'',{}) for op in ('Заполнено','Не заполнено')]


class DocumentFilterSchemaTests(unittest.TestCase):
    def test_all_specialized_document_fields_and_operators_compile(self):
        count=0
        for doc, handler in [('РеализацияТоваровУслуг',get_realization_list),('ВозвратТоваровОтПокупателя',get_vozvrat_list),('ПогрузкиМашин',get_pogruzka_list)]:
            attributes=['Склад','Организация','Подразделение','ВалютаДокумента']
            fields=handler(Connection(attributes),dict(doc_type=doc))['supported_filter_fields']
            self.assertTrue(DOCUMENT_FIELDS[doc].issubset(fields),'existing fields must remain supported')
            for key in fields:
                for op,value,extra in cases(key):
                    with self.subTest(doc=doc,field=key,operator=op):
                        conn=Connection(attributes)
                        with patch('services.documents.realization.load_driver_names',return_value={'':'','A':'Test'}):
                            result=handler(conn,dict(doc_type=doc,limit=10,filters=[dict(fieldKey=key,operator=op,value=value,**extra)]))
                        self.assertIn(key,result['supported_filter_fields'])
                        self.assertTrue(any('ГДЕ' in q.Text for q in conn.queries),'active condition cannot vanish')
                        count+=1
        print('Specialized document field/operator query cases:',count)

    def test_generic_fields_follow_metadata_and_all_operators_compile(self):
        count=0
        for doc in ('ЗаказПокупателя','ПоступлениеТоваровУслуг','СписаниеТоваров','ОприходованиеТоваров','ИнвентаризацияТоваровНаСкладе'):
            attrs=['Склад','Контрагент','ДоговорКонтрагента','СуммаДокумента','Ответственный','Комментарий','Сделка','Организация','Подразделение','ВалютаДокумента']
            fields=get_generic_documents_list(Connection(attrs),dict(doc_type=doc))['supported_filter_fields']
            for key in fields:
                for op,value,extra in cases(key):
                    with self.subTest(doc=doc,field=key,operator=op):
                        conn=Connection(attrs)
                        get_generic_documents_list(conn,dict(doc_type=doc,filters=[dict(fieldKey=key,operator=op,value=value,**extra)]))
                        self.assertIn('ГДЕ',conn.queries[0].Text)
                        if key=='nomenclature': self.assertIn('Документ.'+doc+'.Товары',conn.queries[0].Text)
                        count+=1
        print('Metadata-based document field/operator query cases:',count)

    def test_absent_fields_are_rejected_before_query_execution(self):
        result=get_generic_documents_list(Connection(goods=False),dict(doc_type='СписаниеТоваров'))
        self.assertEqual(set(result['supported_filter_fields']),BASE_FIELDS)
        for key in ('nomenclature','warehouse','agent','amount','kontragent','organization','vms_status','pogruzka_duplicate'):
            with self.subTest(field=key),self.assertRaisesRegex(ValueError,key):
                get_generic_documents_list(Connection(goods=False),dict(doc_type='СписаниеТоваров',filters=[dict(fieldKey=key,operator='Равно',value='Test')]))

    def test_aliases_and_old_comparison_keys_normalize_without_mutating_input(self):
        rule=dict(field='wms_status',comparison='Равно',value='Выгружен')
        normalized=normalize_filters([rule])[0]
        self.assertEqual(normalized['fieldKey'],'vms_status');self.assertEqual(rule['field'],'wms_status')
        conn=Connection()
        get_realization_list(conn,dict(filters=[rule],limit=10))
        self.assertIn('КАК ВМС',conn.queries[0].Text)

    def test_optional_reference_filters_require_document_and_contract_metadata(self):
        from services.document_filter_metadata import reference_filter_fields
        conn=Connection(['Организация','Подразделение','ВалютаДокумента','ДоговорКонтрагента'])
        original=conn.Метаданные.Справочники.Найти
        conn.Метаданные.Справочники=NS(Найти=lambda name:NS(Реквизиты=[NS(Имя='ТипЦен'),NS(Имя='Портфель')]) if name=='ДоговорыКонтрагентов' else original(name))
        fields=reference_filter_fields(conn,'ЗаказПокупателя')
        self.assertEqual(set(fields),{'organization','division','currency','contract_price_type','portfolio'})
        self.assertEqual(reference_filter_fields(Connection(), 'СписаниеТоваров'),{})
        result=get_generic_documents_list(conn,dict(doc_type='ЗаказПокупателя',filters=[dict(fieldKey='contract_price_type',operator='Равно',value='GR')]))
        self.assertIn('contract_price_type',result['supported_filter_fields'])
        self.assertIn('Т.ДоговорКонтрагента.ТипЦен.Наименование',conn.queries[0].Text)

    def test_product_attribute_filters_stay_on_the_requested_attribute(self):
        for key, expression in [('artikul','ТТ.Номенклатура.Артикул'),('barcode','ШК.Штрихкод')]:
            for op,value,extra in cases(key):
                with self.subTest(field=key,operator=op):
                    conn=Connection()
                    result=get_generic_documents_list(conn,dict(doc_type='СписаниеТоваров',filters=[dict(fieldKey=key,operator=op,value=value,**extra)]))
                    text=conn.queries[0].Text
                    self.assertIn(expression,text)
                    self.assertNotIn('Номенклатура.Наименование',text)
                    if key=='barcode': self.assertIn('ШК.Владелец = ТТ.Номенклатура',text)
                    if op in ('Не равно','Не содержит','Не в списке','Не заполнено'): self.assertIn('НЕ (',text)

    def test_product_list_selection_uses_code_instead_of_duplicate_name(self):
        conn=Connection()
        get_generic_documents_list(conn,dict(doc_type='СписаниеТоваров',filters=[dict(fieldKey='nomenclature',operator='В списке',value='Same name',structuredFilter={'items':[{'value':'Same name','code':'S002','comp':'equal'}]})]))
        self.assertEqual(list(conn.queries[0].parameters.values()),['S002'])
        self.assertNotIn('Номенклатура.Наименование',conn.queries[0].Text)

    def test_special_boolean_branch_does_not_bypass_validation(self):
        for op,value in [('Содержит','Да'),('Равно','garbage')]:
            with self.assertRaises(ValueError):
                get_realization_list(Connection(),dict(filters=[dict(fieldKey='pogruzka_duplicate',operator=op,value=value)]))

if __name__=='__main__': unittest.main()
