# -*- coding: utf-8 -*-
"""
routes/order_analysis_routes.py
===============================
Müştəri Sifarişləri Analizi (Заказ покупателя анализ) üçün Flask Blueprint.
"""

import os
import datetime
from flask import Blueprint, request, jsonify, send_file
from services.common import print_server_error
from services.onec_service import one_c
from services.order_analysis_service import ORDER_ANALYSIS_EXCEL, export_order_analysis_excel

order_analysis_bp = Blueprint("order_analysis_bp", __name__)


@order_analysis_bp.route("/api/order_analysis/generate", methods=["POST"])
def generate_order_analysis():
    data = request.json or {}
    try:
        start_d = data.get("start_date", "")
        end_d = data.get("end_date", "")
        print(f"🛒 [1C SİFARİŞ ANALİZİ] Hesabat sorğusu: {start_d} - {end_d} | Qruplaşmalar: {data.get('groupings', [])}", flush=True)

        res = one_c.execute("order_analysis", data)
        print(f"✅ [1C SİFARİŞ ANALİZİ HAZIR] Cəmi sətir: {res.get('total_count', 0)}, Mağazalar: {res.get('stores_count', 0)}, Məhsullar: {res.get('items_count', 0)}", flush=True)
        return jsonify(res)
    except Exception as e:
        print_server_error("/api/order_analysis/generate", e, data)
        return jsonify({"success": False, "error": str(e)})


@order_analysis_bp.route("/api/order_analysis/export_excel", methods=["POST"])
def export_excel():
    data = request.json or {}
    try:
        report_data = data.get("report_data", {})
        file_path = export_order_analysis_excel(report_data)
        return jsonify({"success": True, "path": file_path})
    except Exception as e:
        print_server_error("/api/order_analysis/export_excel", e, data)
        return jsonify({"success": False, "error": str(e)})


@order_analysis_bp.route("/api/order_analysis/download_excel", methods=["GET"])
def download_excel():
    if os.path.exists(ORDER_ANALYSIS_EXCEL):
        filename = f"Zakaz_Pokupatel_Analiz_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(ORDER_ANALYSIS_EXCEL, as_attachment=True, download_name=filename)
    return "Excel faylı tapılmadı.", 404
