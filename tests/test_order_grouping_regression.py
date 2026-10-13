import ast
import unittest
from pathlib import Path
from types import SimpleNamespace


class OrderGroupingRegression(unittest.TestCase):
    def test_movements_without_order(self):
        source = Path('services/order_analysis_service.py').read_text(encoding='utf-8-sig')
        tree = ast.parse(source)
        extraction = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == 'extract_level')
        wrapper = ast.parse('def exercise(parent):\n row_counter = 0\n').body[0]
        wrapper.body.extend([extraction, ast.parse('extract_level(parent, 0, None)').body[0]])
        module = ast.fix_missing_locations(ast.Module(body=[wrapper], type_ignores=[]))
        for quantities, expected in [
            ((0, 0, 2), '(Возврат / Без заказа)'),
            ((0, 2, 0), '(Прямая реализация / Без заказа)'),
            ((2, 0, 0), '(Без заказа)'),
            ((0, 0, 0), '(Без заказа)'),
        ]:
            with self.subTest(quantities=quantities):
                class Selection:
                    def __init__(self):
                        self.done = False
                        self.OrderRef = None
                        self.QtyOrder, self.QtyReal, self.QtyRet = quantities
                    def Выбрать(self, *args):
                        return self
                    def Следующий(self):
                        if self.done:
                            return False
                        self.done = True
                        return True
                scope = dict(active_groupings=[('Заказ', '', 'OrderRef', '')],
                             conn=SimpleNamespace(ОбходРезультатаЗапроса=SimpleNamespace(ПоГруппировкам=1)),
                             rows=[], unique_stores=set(), unique_items=set())
                exec(compile(module, '<order-grouping>', 'exec'), scope)
                scope['exercise'](Selection())
                self.assertEqual(scope['rows'][0]['name'], expected)
                self.assertEqual(scope['rows'][0]['qty_ret'], quantities[2])


if __name__ == '__main__':
    unittest.main()
