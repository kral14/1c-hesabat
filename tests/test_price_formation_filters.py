import unittest
from types import SimpleNamespace as NS
from unittest.mock import patch
from services.price_formation_filters import condition
from services.documents.price import form_price_document

class Array(list):
    def Add(self,item): self.append(item)
class Query:
    def __init__(self,refs=()): self.params={}; self.refs=iter(refs)
    def SetParameter(self,key,value): self.params[key]=value
    def Execute(self): return self
    def Choose(self): return self
    def Next(self):
        try: self.Ref=next(self.refs); return True
        except StopIteration: return False
class Connection:
    def __init__(self,hier=True,refs=('child-ref',)):
        self.queries=[];self.refs=refs
        self.Метаданные=NS(Справочники=NS(Найти=lambda name:NS(Иерархический=hier)))
    def NewObject(self,kind):
        if kind=='Массив': return Array()
        query=Query(self.refs if self.queries else ())
        self.queries.append(query)
        return query
class FormationTests(unittest.TestCase):
    def test_every_selector_and_operator(self):
        for catalog,expr in [('Номенклатура','Т'),('НоменклатурныеГруппы','Т.НоменклатурнаяГруппа'),('ЦеновыеГруппы','Т.ЦеноваяГруппа')]:
            for op in ('equal','not_equal','in_list','not_in_list','in_group','not_in_group','in_group_list','not_in_group_list'):
                with self.subTest(catalog=catalog,op=op):
                    conn=Connection();query=conn.NewObject('Запрос')
                    sql=condition(conn,query,expr,catalog,['Example'],op,'Selection')
                    self.assertEqual(sql.startswith('НЕ ('),op.startswith('not_'))
                    self.assertEqual('В ИЕРАРХИИ' in sql,'group' in op)
                    self.assertNotIn('Example',sql)
                    if 'group' in op:self.assertEqual(query.params['SelectionRefs'],['child-ref'])
    def test_product_hierarchy_compares_reference_not_table_alias(self):
        for op in ('in_group','not_in_group','in_group_list','not_in_group_list'):
            conn=Connection();query=conn.NewObject('Запрос')
            sql=condition(conn,query,'Т','Номенклатура',['Folder'],op,'ItemsList',article=True)
            self.assertIn('Т.Ссылка В ИЕРАРХИИ (&ItemsListRefs)',sql)
            self.assertNotIn('Т В ИЕРАРХИИ',sql)
    def test_group_reference_path_does_not_append_another_reference(self):
        conn=Connection();query=conn.NewObject('Запрос')
        sql=condition(conn,query,'Т.НоменклатурнаяГруппа','НоменклатурныеГруппы',['Folder'],'in_group','NomGroups')
        self.assertIn('Т.НоменклатурнаяГруппа В ИЕРАРХИИ',sql)
        self.assertNotIn('Т.НоменклатурнаяГруппа.Ссылка',sql)

    def test_nonhierarchical_catalog_rejects_group_operator(self):
        conn=Connection(False)
        with self.assertRaises(ValueError): condition(conn,conn.NewObject('Запрос'),'Т','Номенклатура',['x'],'in_group','p')
    def test_equal_rejects_multiple_values(self):
        conn=Connection()
        with self.assertRaises(ValueError): condition(conn,conn.NewObject('Запрос'),'Т','Номенклатура',['x','y'],'equal','p')
    def test_unknown_operator_is_never_silently_ignored(self):
        conn=Connection()
        with self.assertRaises(ValueError): condition(conn,conn.NewObject('Запрос'),'Т','Номенклатура',['x'],'bad','p')
    def test_missing_hierarchy_selection_has_correct_polarity(self):
        for op,expected in [('in_group','1 = 0'),('not_in_group','1 = 1')]:
            conn=Connection(refs=())
            self.assertEqual(condition(conn,conn.NewObject('Запрос'),'Т','Номенклатура',['missing'],op,'p'),expected)
    def test_negative_price_type_uses_complement(self):
        for op in ('not_equal','not_in_list'):
            conn=Connection()
            with patch('services.documents.price.get_all_price_types_list',return_value=[dict(name='A'),dict(name='B')]):
                result=form_price_document(conn,dict(price_types=['A'],comp_pt=op))
            self.assertEqual(result['price_types'],['B'])
            self.assertEqual(conn.queries[0].params['PriceTypes'],['B'])
    def test_iso_date_is_sent_to_query(self):
        conn=Connection()
        form_price_document(conn,dict(price_types=['A'],date='2026-10-16'))
        self.assertIn('DocDate',conn.queries[0].params)
    def test_invalid_date_is_rejected(self):
        with self.assertRaises(ValueError):form_price_document(Connection(),dict(price_types=['A'],date='garbage'))
    def test_negative_price_types_no_remaining_columns(self):
        with patch('services.documents.price.get_all_price_types_list',return_value=[dict(name='A')]):
            result=form_price_document(Connection(),dict(price_types=['A'],comp_pt='not_equal'))
        self.assertEqual(result['items'],[])
        self.assertEqual(result['price_types'],[])

if __name__=='__main__':unittest.main()
