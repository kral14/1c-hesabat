# -*- coding: utf-8 -*-
"""
1C Reporter — Flask giriş nöqtəsi.

Struktur:
  services/common.py            - yol sabitləri, xəta loqu, keşlər (qovluq, barkod, qiymət növləri)
  services/onec_service.py      - 1C STA COM işçi axını (OneCService) və əməliyyat dispetçeri
  services/catalog_handlers.py  - kataloq, portfel, agent, istifadəçi əməliyyatları
  services/report_handlers.py   - hesabat əməliyyatları (universal_report, universal_sales, generate)
  services/document_handlers.py - sənəd jurnalı, sənəd redaktoru, qiymət əməliyyatları
  routes/*.py                   - Flask Blueprint marşrutları
"""
import sys
import gzip
from time import perf_counter
from flask import Flask, request

sys.stdout.reconfigure(encoding='utf-8')

import database
database.init_db()

from services.onec_service import one_c  # noqa: F401  (1C işçi axınını işə salır)
from routes.base_routes import base_bp
from routes.report_routes import report_bp
from routes.catalog_routes import catalog_bp
from routes.document_routes import document_bp
from routes.order_analysis_routes import order_analysis_bp
from routes.job_routes import job_bp

import os

if getattr(sys, 'frozen', False):
    base_res = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    app = Flask(
        __name__,
        template_folder=os.path.join(base_res, 'templates'),
        static_folder=os.path.join(base_res, 'static')
    )
else:
    app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True

@app.get('/api/runtime/status')
def runtime_status():
    return {'auto_reload': os.environ.get('REPORTER_AUTO_RELOAD') == '1', 'pid': os.getpid(),
            'independent_worker': True,
            'worker': one_c.status() if request.args.get('worker') != '0' else None}
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def compress_and_headers(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'

    # 1C-dən gələn böyük JSON və mətn cavablarını GZIP ilə sıxırıq
    accept_encoding = request.headers.get('Accept-Encoding', '')
    if ('gzip' in accept_encoding.lower() and
        not response.direct_passthrough and
        not response.is_streamed and
        request.method != 'HEAD' and
        response.status_code < 300 and
        not response.headers.get('Content-Encoding')):
        data = response.get_data()
        orig_len = len(data)
        if orig_len > 500:
            content_type = response.headers.get('Content-Type', '')
            if 'application/json' in content_type or 'text/' in content_type or 'javascript' in content_type:
                compression_start = perf_counter()
                compressed = gzip.compress(data)
                compression_ms = (perf_counter() - compression_start) * 1000
                comp_len = len(compressed)
                ratio = (1.0 - (comp_len / orig_len)) * 100.0
                
                # Konsolda aydın sıxılma loqu
                orig_kb = orig_len / 1024.0
                comp_kb = comp_len / 1024.0
                print(f"🗜️ [GZIP SIXILMA] {request.path}: {orig_kb:.1f} KB -> {comp_kb:.1f} KB ({ratio:.1f}% qənaət)", flush=True)

                response.set_data(compressed)
                response.headers['Content-Encoding'] = 'gzip'
                response.headers['Content-Length'] = comp_len
                response.vary.add('Accept-Encoding')
                response.headers.pop('ETag', None)
                previous_timing = response.headers.get('Server-Timing')
                response.headers['Server-Timing'] = (previous_timing + ', ' if previous_timing else '') + f'gzip;dur={compression_ms:.2f}'

    return response

app.register_blueprint(base_bp)
app.register_blueprint(job_bp)
app.register_blueprint(report_bp)
app.register_blueprint(catalog_bp)
app.register_blueprint(document_bp)
app.register_blueprint(order_analysis_bp)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=False)
