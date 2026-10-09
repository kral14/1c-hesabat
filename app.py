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
from flask import Flask

sys.stdout.reconfigure(encoding='utf-8')

import database
database.init_db()

from services.onec_service import one_c  # noqa: F401  (1C işçi axınını işə salır)
from routes.base_routes import base_bp
from routes.report_routes import report_bp
from routes.catalog_routes import catalog_bp
from routes.document_routes import document_bp

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
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

app.register_blueprint(base_bp)
app.register_blueprint(report_bp)
app.register_blueprint(catalog_bp)
app.register_blueprint(document_bp)

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=False)
