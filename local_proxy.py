# -*- coding: utf-8 -*-
"""
1C UI & Remote API Smart Proxy Server.
Ev kompüterində ən son HTML/CSS/JS fayllarını lokal diskdən təqdim edir,
1C COM və verilənlər bazası API sorğularını isə Cloudflare WARP vasitəsilə ofis serverinə yönləndirir.
"""
import os
import sys
from flask import Flask, request, Response, render_template, send_from_directory
import requests

app_dir = os.path.dirname(os.path.abspath(__file__))
OFFICE_SERVER_URL = os.environ.get("OFFICE_SERVER_URL", "http://172.16.1.63:5050")

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

@proxy_app.route("/")
def index():
    return render_template("index.html")

@proxy_app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(os.path.join(app_dir, "static"), filename)

@proxy_app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
def forward_api(path):
    target_url = f"{OFFICE_SERVER_URL}/{path}"
    headers = {key: value for key, value in request.headers if key.lower() not in ["host", "content-length"]}
    
    try:
        resp = requests.request(
            method=request.method,
            url=target_url,
            headers=headers,
            data=request.get_data(),
            params=request.args,
            cookies=request.cookies,
            allow_redirects=False,
            timeout=60
        )
        excluded_headers = ["content-encoding", "content-length", "transfer-encoding", "connection"]
        resp_headers = [(k, v) for k, v in resp.headers.items() if k.lower() not in excluded_headers]
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
