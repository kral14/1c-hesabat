import unittest
from types import SimpleNamespace as NS
from unittest.mock import Mock
from services.agent_filters import condition, relation
from services.documents.base import build_filter_conditions


def attr(name,catalog):
    return NS(Имя=name,Тип=NS(СодержитТип=lambda target:target=='СправочникСсылка.'+catalog))

def connection(table=False,missing=False):
    agent=NS(Реквизиты=[attr('ВидРеализации','ВидыРеализации'),attr('КаналСбыта','ГруппыРеализации')],
             ТабличныеЧасти=[NS(Имя='ГруппыРеализации',Реквизиты=[attr('Группа','ГруппыРеализации')])] if table else [])
    def find(name):
        if missing: return None
        return agent if name=='Агенты' else NS(Имя=name)
    class Catalogs:
        Найти = staticmethod(find)
        def __iter__(self): return iter([])
    return NS(Метаданные=NS(Справочники=Catalogs()),
              NewObject=lambda kind,name:NS(Типы=lambda:NS(Получить=lambda index:name)))

class AgentFilterTests(unittest.TestCase):
    def test_type_description_constructor_works_through_edge_wrapper(self):
        from services.documents.navigation import EdgeConnection
        conn=connection()
        wrapped=EdgeConnection(conn,{'limit':200})
        self.assertEqual(relation(wrapped,'agent_sales_type'),(None,'ВидРеализации'))
        self.assertTrue(wrapped.first, 'metadata constructor must not consume the document query wrapper')

    def test_type_uses_verified_scalar_metadata(self):
        self.assertEqual(relation(connection(),'agent_sales_type'),(None,'ВидРеализации'))
    def test_group_prefers_group_table_over_sales_channel(self):
        self.assertEqual(relation(connection(True),'agent_sales_group'),('ГруппыРеализации','Группа'))
    def test_group_scalar_is_verified_by_reference_type(self):
        self.assertEqual(relation(connection(),'agent_sales_group'),(None,'КаналСбыта'))
    def test_missing_metadata_never_guesses_a_path(self):
        with self.assertRaises(ValueError): relation(connection(missing=True),'agent_sales_type')
    def test_scalar_operators_are_parameterized(self):
        for op in ('Равно','Не равно','В списке','Не в списке','Заполнено','Не заполнено'):
            q=Mock();debug={}
            sql=condition(connection(),q,dict(fieldKey='agent_sales_type',operator=op,value='GR'), 'p',debug)
            self.assertIn('Т.ДоговорКонтрагента.Агент.ВидРеализации.Наименование',sql)
            self.assertNotIn("'GR'",sql)
    def test_negative_group_excludes_any_matching_membership(self):
        for op in ('Не равно','Не в списке','Не заполнено'):
            sql=condition(connection(True),Mock(),dict(fieldKey='agent_sales_group',operator=op,value='KK'),'p',{})
            self.assertIn('Агент НЕ В (ВЫБРАТЬ',sql)
            self.assertIn('Справочник.Агенты.ГруппыРеализации',sql)
    def test_shared_builder_applies_before_page_limit(self):
        clauses=[];q=Mock()
        build_filter_conditions([dict(fieldKey='agent_sales_type',operator='Равно',value='PS')],q,clauses,{},conn=connection())
        self.assertEqual(len(clauses),1)
        q.SetParameter.assert_called_once_with('p_agent_0_0','PS')
    def test_disabled_filter_never_reads_metadata(self):
        build_filter_conditions([dict(fieldKey='agent_sales_type',enabled=False)],Mock(),[],{},conn=None)

if __name__ == '__main__': unittest.main()
