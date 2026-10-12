# -*- coding: utf-8 -*-
"""
1C UI & Remote API Smart Proxy Server (High Performance Pooled Session).
Ev kompüterində ən son HTML/CSS/JS fayllarını lokal diskdən təqdim edir,
1C COM və verilənlər bazası API sorğularını isə Cloudflare WARP vasitəsilə
Keep-Alive TCP Session və Gzip dəstəyi ilə ofis serverinə yönləndirir.
"""
import os
import sys
import time
from flask import Flask, request, Response, render_template, send_from_directory
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

app_dir = os.path.dirname(os.path.abspath(__file__))
OFFICE_SERVER_URL = os.environ.get("OFFICE_SERVER_URL", "http://172.16.1.63:5050")

# Daimi HTTP/TCP Connection Pool (Hər dəfə yenidən TCP/TLS qurulmasını aradan qaldırır)
proxy_session = requests.Session()
retries = Retry(
    total=3,
    backoff_factor=0.3,
    status_forcelist=[502, 503, 504],
    allowed_methods=frozenset(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]),
    raise_on_status=False
)
adapter = HTTPAdapter(pool_connections=50, pool_maxsize=50, max_retries=retries, pool_block=False)
proxy_session.mount("http://", adapter)
proxy_session.mount("https://", adapter)

proxy_app = Flask(
    __name__,
    template_folder=os.path.join(app_dir, "templates"),
    static_folder=os.path.join(app_dir, "static")
)
proxy_app.config['TEMPLATES_AUTO_RELOAD'] = True
proxy_app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

@proxy_app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@proxy_app.route("/ping")
def proxy_ping():
    return "pong"

@proxy_app.route("/proxy-status")
def proxy_status():
    return {"office_url": OFFICE_SERVER_URL, "auto_reload": os.environ.get('REPORTER_AUTO_RELOAD') == '1'}

@proxy_app.route("/")
def index():
    return render_template("index.html")

@proxy_app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(os.path.join(app_dir, "static"), filename)

_fast_cache = {}

@proxy_app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
def forward_api(path):
    target_url = f"{OFFICE_SERVER_URL}/{path}"
    headers = {key: value for key, value in request.headers if key.lower() not in ["host", "content-length"]}
    
    # Sıxılmış (GZIP) cavabları dəstəklədiyimizi bildiririk
    headers["Accept-Encoding"] = "gzip, deflate"

    # Statik kataloqları (qiymət növləri kimi) keşdən anında qaytarırıq (1C-ni ləngitməmək üçün)
    cache_key = f"{path}:{request.method}"
    if path in ["api/price_types", "api/documents/price_types"]:
        cached_entry = _fast_cache.get(cache_key)
        if cached_entry and (time.time() - cached_entry["time"] < 3600 * 12):
            print(f"⚡ [PROXY KEŞ] {path} dərhal lokal keşdən təqdim edildi (0.00 san) ✅", flush=True)
            return Response(cached_entry["content"], cached_entry["status"], cached_entry["headers"])

    req_data = request.get_data()
    if path == "api/documents/list" and req_data:
        try:
            import json
            body_json = json.loads(req_data)
            filters = body_json.get("filters")
            if isinstance(filters, list):
                safe_filters = [f for f in filters if f.get("fieldKey") != "vms_status" and f.get("field") != "vms_status"]
                if len(safe_filters) != len(filters):
                    body_json["filters"] = safe_filters
                    req_data = json.dumps(body_json).encode("utf-8")
                    headers["Content-Type"] = "application/json"
        except Exception:
            pass

    t_start = time.time()
    if path.startswith("api/"):
        print(f"🚀 [PROXY GÖNDƏRİR] {path} -> Ofisə sorğu getdi...", flush=True)
    try:
        # Qoşulma timeout: 15 san, Cavab oxuma timeout: 300 san (ağır hesabatların qırılmaması üçün)
        resp = proxy_session.request(
            method=request.method,
            url=target_url,
            headers=headers,
            data=req_data,
            params=request.args,
            cookies=request.cookies,
            allow_redirects=False,
            timeout=(15.0, 300.0)
        )
        duration = time.time() - t_start
        excluded_headers = ["content-encoding", "content-length", "transfer-encoding", "connection"]
        resp_headers = [(k, v) for k, v in resp.headers.items() if k.lower() not in excluded_headers]
        
        # Ofis serverindən qəbul edilən məlumat həcmini və müddətini loqla göstəririk
        if len(resp.content) > 1024:
            kb = len(resp.content) / 1024.0
            print(f"📥 [PROXY QƏBUL] {path}: {kb:.1f} KB (Müddət: {duration:.2f} san | Ofisdən Gzip ilə gəldi ✅)", flush=True)

        if path in ["api/price_types", "api/documents/price_types"] and resp.status_code == 200:
            _fast_cache[cache_key] = {
                "content": resp.content,
                "status": resp.status_code,
                "headers": resp_headers,
                "time": time.time()
            }

        return Response(resp.content, resp.status_code, resp_headers)
    except Exception as e:
        return Response(f'{{"success": false, "error": "Ofis serverinə qoşulma xətası: {str(e)}"}}', status=502, mimetype="application/json")

def start_proxy(port=5051):
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)
    proxy_app.run(host="127.0.0.1", port=port, debug=False, threaded=True)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5051
    print(f"🚀 1C UI Proxy Server 127.0.0.1:{port} ünvanında başladılır -> {OFFICE_SERVER_URL}", flush=True)
    start_proxy(port)
