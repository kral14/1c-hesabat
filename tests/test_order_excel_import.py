import io
import unittest
from openpyxl import Workbook
from flask import Flask
from routes.document_routes import document_bp
from services.order_excel_import import read_store_quantities


def workbook_bytes(rows):
    book = Workbook()
    for row in rows: book.active.append(row)
    output = io.BytesIO()
    book.save(output)
    book.close()
    return output.getvalue()


class OrderExcelImportTests(unittest.TestCase):
    def test_headers_and_reordered_columns(self):
        result = read_store_quantities(workbook_bytes([
            ['Miqdar', 'Mağaza kodu'], ['12,5', 'C000020101'], [4, 'C000032840']]))
        self.assertEqual(result['rows'], [{'code':'C000020101','quantity':'12.5'}, {'code':'C000032840','quantity':'4'}])

    def test_no_header_and_numeric_code(self):
        result = read_store_quantities(workbook_bytes([[101, 8], [None, None], ['C0000001', 0.125]]))
        self.assertEqual(result['rows'][0], {'code':'101','quantity':'8'})
        self.assertEqual(len(result['rows']), 2)

    def test_invalid_quantities_are_rejected(self):
        for qty in [None, 0, -1, 'oops', 'NaN', 1.2345]:
            with self.subTest(qty=qty), self.assertRaises(ValueError):
                read_store_quantities(workbook_bytes([['C00001', qty]]))

    def test_upload_route_does_not_write_to_onec(self):
        app = Flask(__name__)
        app.register_blueprint(document_bp)
        with app.test_client() as client:
            response = client.post('/api/orders/preview/import-excel', data={
                'file':(io.BytesIO(workbook_bytes([['C00001',12]])), 'quantities.xlsx')})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['rows'][0]['quantity'], '12')
            self.assertEqual(client.post('/api/orders/preview/import-excel',data={
                'file':(io.BytesIO(b'broken'), 'bad.xlsx')}).status_code, 400)


if __name__ == '__main__': unittest.main()
