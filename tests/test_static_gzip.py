"""Exercise the production response hook without starting database/COM workers."""
import ast
import gzip
import json
import unittest
import sys
from time import perf_counter
from pathlib import Path
from flask import Flask, request, jsonify

ROOT = Path(__file__).resolve().parents[1]
sys.stdout.reconfigure(encoding='utf-8')

class StaticGzipTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask('static-regression', static_folder=str(ROOT / 'static'), static_url_path='/static')
        tree = ast.parse((ROOT / 'app.py').read_text(encoding='utf-8-sig'))
        hook = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'compress_and_headers')
        exec(compile(ast.Module(body=[hook], type_ignores=[]), 'app.py', 'exec'), {'app':self.app, 'gzip':gzip, 'request':request, 'perf_counter':perf_counter})
        self.app.add_url_rule('/data', view_func=lambda: jsonify(message='abc' * 1000))
        self.client = self.app.test_client()

    def test_all_stylesheets_load_with_browser_encoding_header(self):
        for source in (ROOT / 'static/css').glob('*.css'):
            with self.subTest(file=source.name):
                response = self.client.get('/static/css/' + source.name + '?v=5', headers={'Accept-Encoding':'gzip, deflate, br'})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data, source.read_bytes())
                self.assertIn('text/css', response.content_type)
                response.close()

    def test_javascript_is_served_intact(self):
        response = self.client.get('/static/js/app.js', headers={'Accept-Encoding':'gzip'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, (ROOT / 'static/js/app.js').read_bytes())
        response.close()

    def test_json_is_still_gzip_compressed(self):
        response = self.client.get('/data', headers={'Accept-Encoding':'gzip'})
        self.assertEqual(response.headers['Content-Encoding'], 'gzip')
        self.assertEqual(json.loads(gzip.decompress(response.data))['message'], 'abc' * 1000)
        self.assertIn('Accept-Encoding', response.headers['Vary'])

    def test_head_static_response_has_no_body(self):
        response = self.client.head('/static/css/1c_mdi.css', headers={'Accept-Encoding':'gzip'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, b'')
        response.close()

    def test_home_proxy_serves_styles_locally(self):
        sys.path.insert(0, str(ROOT))
        from local_proxy import proxy_app
        with proxy_app.test_client() as client:
            response = client.get('/static/css/1c_mdi.css', headers={'Accept-Encoding':'gzip'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, (ROOT / 'static/css/1c_mdi.css').read_bytes())
            response.close()

if __name__ == '__main__': unittest.main()
