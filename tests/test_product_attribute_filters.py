"""Independent result oracle for per-document article and barcode filters."""
import sqlite3
import unittest
from services.documents.base import build_filter_conditions


class Query:
    def __init__(self): self.parameters={}
    def SetParameter(self, key, value): self.parameters[key]=value


class ProductAttributeFilterTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:');self.addCleanup(self.db.close)
        self.db.executescript('''
          CREATE TABLE docs(id INTEGER);
          INSERT INTO docs VALUES(1),(2),(3),(4);
          CREATE TABLE goods(doc_id INTEGER, product TEXT, artikul TEXT);
          INSERT INTO goods VALUES(1,'A','Alpha'),(1,'B','Beta'),(2,'C','Beta extra'),(3,'D','');
          CREATE TABLE barcodes(product TEXT, barcode TEXT);
          INSERT INTO barcodes VALUES('A','00111'),('A','00112'),('B','00222'),('C','002223');
        ''')
    def result(self, key, operator, value='', **extra):
        query=Query();where=[]
        build_filter_conditions([dict(fieldKey=key,operator=operator,value=value,**extra)],query,where,{}, {'__doc_table':'Документ.СписаниеТоваров'})
        sql=where[0]
        replacements=[('Документ.СписаниеТоваров.Товары','goods'),('РегистрСведений.Штрихкоды','barcodes'),
            ('ТТ.Номенклатура.Артикул','ТТ.artikul'),('ТТ.Номенклатура','ТТ.product'),('ТТ.Ссылка','ТТ.doc_id'),('Т.Ссылка','Т.id'),
            ('ШК.Штрихкод','ШК.barcode'),('ШК.Владелец','ШК.product'),('ЕСТЬNULL','COALESCE'),('ЛЕВОЕ СОЕДИНЕНИЕ','LEFT JOIN'),
            ('ВЫБРАТЬ','SELECT'),(' КАК ',' AS '),(' ИЗ ',' FROM '),(' ГДЕ ',' WHERE '),(' ПО ',' ON '),(' В (',' IN ('),
            ('ПОДОБНО','LIKE'),('СПЕЦСИМВОЛ','ESCAPE'),('НЕ ','NOT '),(' ИЛИ ',' OR '),(' И ',' AND ')]
        for before,after in replacements: sql=sql.replace(before,after)
        import re
        sql=re.sub(r'&(\w+)',r':\1',sql)
        return [row[0] for row in self.db.execute('SELECT id FROM docs AS Т WHERE '+sql+' ORDER BY id',query.parameters)]
    def test_positive_negative_list_partial_and_empty_results(self):
        for key, exact, partial, second in [('artikul','Alpha','Beta','Beta extra'),('barcode','00111','00222','002223')]:
            cases=[('Равно',exact,[1]),('Не равно',exact,[2,3,4]),('Содержит',partial,[1,2]),('Не содержит',partial,[3,4]),
                ('Начинается с',partial,[1,2]),('В списке',exact+'; '+second,[1,2]),('Не в списке',exact+'; '+second,[3,4]),
                ('Заполнено','',[1,2]),('Не заполнено','',[3,4])]
            for op,value,expected in cases:
                with self.subTest(key=key,op=op): self.assertEqual(self.result(key,op,value),expected)
    def test_all_list_entries_can_match_different_products_of_one_document(self):
        self.assertEqual(self.result('barcode','В списке','00111; 00222',structuredFilter={'matchAll':True,'items':[{'comp':'equal','value':'00111'},{'comp':'equal','value':'00222'}]}),[1])
    def test_catalog_selection_compares_attribute_instead_of_product_name(self):
        self.assertEqual(self.result('artikul','В списке','Product',structuredFilter={'items':[{'value':'Product','code':'S001','artikul':'Alpha','comp':'equal'}]}),[1])

if __name__=='__main__': unittest.main()
