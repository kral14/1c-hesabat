# -*- coding: utf-8 -*-
import os
import json
import datetime
from flask import Blueprint, request, jsonify, send_file
from services.common import (
    APP_DIR,
    SCRATCH_DIR,
    EXCEL_OUTPUT,
    UNIVERSAL_EXCEL,
    UNIVERSAL_REPORT_EXCEL,
    print_server_error
)
from services.onec_service import one_c

report_bp = Blueprint("report_bp", __name__)

@report_bp.route("/api/generate_report", methods=["POST"])
def generate_report():
    data = request.json or {}
    try:
        res = one_c.execute("generate", data)
        return jsonify({"success": True, **res})
    except Exception as e:
        print_server_error("/api/generate_report", e, data)
        return jsonify({"success": False, "error": str(e)})

@report_bp.route("/api/universal_sales", methods=["POST"])
def universal_sales():
    data = request.json or {}
    try:
        res = one_c.execute("universal_sales", data)
        return jsonify({"success": True, **res})
    except Exception as e:
        print_server_error("/api/universal_sales", e, data)
        return jsonify({"success": False, "error": str(e)})

@report_bp.route("/api/download_excel", methods=["GET"])
def download_excel():
    if os.path.exists(EXCEL_OUTPUT):
        filename = f"Hesabat_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(EXCEL_OUTPUT, as_attachment=True, download_name=filename)
    return "Excel faylı tapılmadı.", 404

@report_bp.route("/api/download_universal_excel", methods=["GET"])
def download_universal_excel():
    if os.path.exists(UNIVERSAL_EXCEL):
        filename = f"Universal_Satis_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(UNIVERSAL_EXCEL, as_attachment=True, download_name=filename)
    return "Excel faylı tapılmadı.", 404

@report_bp.route("/api/universal_report", methods=["POST"])
def universal_report_endpoint():
    data = request.json or {}
    cache_path = os.path.join(APP_DIR, "data", "last_successful_report.json")
    try:
        filters_cnt = len(data.get("filters", []))
        print(f"📊 [1C HESABAT SORĞUSU] /api/universal_report | Dövr: {data.get('start_date')} - {data.get('end_date')} | Süzgəclər: {filters_cnt} ədəd", flush=True)
        res = one_c.execute("universal_report", data)
        total_rows = res.get("total_count", len(res.get("items", [])))
        print(f"✅ [1C HESABAT HAZIR] Cəmi sətir sayı: {total_rows} sətir yükləndi.", flush=True)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(res, f, ensure_ascii=False)
        except Exception:
            pass
        return jsonify({"success": True, **res})
    except Exception as e:
        print_server_error("/api/universal_report", e, data)
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    cached_res = json.load(f)
                print("⚡ [1C KEŞDƏN YÜKLƏNDİ] Lisenziya məşğul olduğundan sonuncu hesabat keşdən verildi.", flush=True)
                return jsonify({
                    "success": True,
                    "is_cached": True,
                    "warning_message": "1C lisenziya limiti məşğuldur. Sonuncu formalaşdırılmış hesabat keşdən göstərilir.",
                    **cached_res
                })
            except Exception:
                pass
        return jsonify({"success": False, "error": str(e)})

@report_bp.route("/api/download_universal_report_excel", methods=["GET"])
def download_universal_report_excel():
    if os.path.exists(UNIVERSAL_REPORT_EXCEL):
        filename = f"Tovari_na_skladakh_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(UNIVERSAL_REPORT_EXCEL, as_attachment=True, download_name=filename)
    return "Excel faylı tapılmadı.", 404

@report_bp.route("/api/export_universal_report_excel", methods=["POST"])
def export_universal_report_excel_endpoint():
    data = request.json or {}
    try:
        report_data = data.get("report_data", {})
        config = data.get("config", {})
        import excel_generator
        excel_generator.generate_1c_excel(report_data, config, UNIVERSAL_REPORT_EXCEL)
        return jsonify({"success": True})
    except Exception as e:
        print_server_error("/api/export_universal_report_excel", e, data)
        return jsonify({"success": False, "error": str(e)})
