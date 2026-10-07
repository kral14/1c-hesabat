# -*- coding: utf-8 -*-
import os
import datetime
from flask import Blueprint, request, jsonify, send_file
from services.common import PORTFOLIO_EXCEL, print_server_error
from services.onec_service import one_c

catalog_bp = Blueprint("catalog_bp", __name__)

@catalog_bp.route("/api/catalog_card", methods=["POST"])
def catalog_card_endpoint():
    data = request.json or {}
    try:
        return jsonify({"success": True, "item": one_c.execute("catalog_card", data)})
    except Exception as error:
        return jsonify({"success": False, "error": str(error)})

@catalog_bp.route("/api/users", methods=["POST"])
def get_users():
    data = request.json or {}
    try:
        users = one_c.execute("get_users", data)
        return jsonify({"success": True, "users": users})
    except Exception as e:
        print(f"⚠️ [/api/users fallback due to license/com error]: {e}")
        return jsonify({"success": True, "users": ["Nesib", "Administrator"]})

@catalog_bp.route("/api/portfolios", methods=["POST"])
def get_portfolios():
    data = request.json or {}
    try:
        portfolios = one_c.execute("get_portfolios", data)
        return jsonify({"success": True, "portfolios": portfolios})
    except Exception as e:
        print_server_error("/api/portfolios", e, data)
        return jsonify({"success": False, "error": str(e)})

@catalog_bp.route("/api/agents", methods=["POST"])
def get_agents():
    data = request.json or {}
    try:
        agents = one_c.execute("get_agents", data)
        return jsonify({"success": True, "agents": agents})
    except Exception as e:
        print_server_error("/api/agents", e, data)
        return jsonify({"success": False, "error": str(e)})

@catalog_bp.route("/api/search_kontragents", methods=["POST"])
def search_kontragents():
    data = request.json or {}
    try:
        items = one_c.execute("search_kontragents", data)
        return jsonify({"success": True, "items": items})
    except Exception as e:
        print_server_error("/api/search_kontragents", e, data)
        return jsonify({"success": False, "error": str(e)})

@catalog_bp.route("/api/search_nomenklatura", methods=["POST"])
def search_nomenklatura():
    data = request.json or {}
    try:
        items = one_c.execute("search_nomenklatura", data)
        return jsonify({"success": True, "items": items})
    except Exception as e:
        print_server_error("/api/search_nomenklatura", e, data)
        return jsonify({"success": False, "error": str(e)})

@catalog_bp.route("/api/price_types", methods=["GET", "POST"])
@catalog_bp.route("/api/documents/price_types", methods=["GET", "POST"])
def get_price_types_endpoint():
    data = request.get_json(silent=True) or {}
    try:
        res = one_c.execute("get_all_price_types", data)
        pts = res.get("price_types", []) if isinstance(res, dict) else res
        return jsonify({
            "success": True,
            "price_types": pts
        })
    except Exception as e:
        print_server_error("/api/price_types", e, data)
        return jsonify({"success": False, "error": str(e), "price_types": []})

@catalog_bp.route("/api/catalog_data", methods=["POST"])
def catalog_data_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("catalog_data", data)
        return jsonify({"success": True, **res})
    except Exception as e:
        print_server_error("/api/catalog_data", e, data)
        return jsonify({"success": False, "error": str(e)})

@catalog_bp.route("/api/portfolio_catalog/filters", methods=["GET", "POST"])
def portfolio_catalog_filters_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_portfolio_catalog_filters", data)
        return jsonify({"success": True, **res})
    except Exception as e:
        print_server_error("/api/portfolio_catalog/filters", e, data)
        return jsonify({"success": False, "error": str(e)})

@catalog_bp.route("/api/portfolio_catalog/items", methods=["POST"])
def portfolio_catalog_items_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_portfolio_catalog_items", data)
        if isinstance(res, dict):
            return jsonify({
                "success": True,
                "items": res.get("items", []),
                "price_types": res.get("price_types", []),
                "total": res.get("total", len(res.get("items", [])))
            })
        return jsonify({"success": True, "items": res, "total": len(res)})
    except Exception as e:
        print_server_error("/api/portfolio_catalog/items", e, data)
        return jsonify({"success": False, "error": str(e)})

@catalog_bp.route("/api/portfolio_catalog/export_excel", methods=["POST"])
def portfolio_catalog_export_excel_endpoint():
    data = request.json or {}
    try:
        items = data.get("items", [])
        filters = data.get("filters", {})
        import excel_generator
        excel_generator.generate_portfolio_catalog_excel(items, filters, PORTFOLIO_EXCEL)
        return jsonify({"success": True, "download_url": "/api/portfolio_catalog/download_excel"})
    except Exception as e:
        print_server_error("/api/portfolio_catalog/export_excel", e, data)
        return jsonify({"success": False, "error": str(e)})

@catalog_bp.route("/api/portfolio_catalog/download_excel", methods=["GET"])
def download_portfolio_catalog_excel():
    if os.path.exists(PORTFOLIO_EXCEL):
        filename = f"Kataloq_Portfel_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(PORTFOLIO_EXCEL, as_attachment=True, download_name=filename)
    return "Excel faylı tapılmadı.", 404

@catalog_bp.route("/api/nomenclature/search", methods=["POST"])
@catalog_bp.route("/api/documents/search_nomenclature", methods=["POST"])
def search_nomenclature_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("search_nomenclature", data)
        return jsonify({
            "success": True,
            "items": res.get("items", [])
        })
    except Exception as e:
        print_server_error("/api/nomenclature/search", e, data)
        return jsonify({"success": False, "error": str(e), "items": []})

@catalog_bp.route("/api/nomenclature/prices", methods=["POST"])
@catalog_bp.route("/api/documents/item_prices", methods=["POST"])
def get_item_prices_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_item_prices", data)
        return jsonify({
            "success": True,
            "prices": res.get("prices", {}) if isinstance(res, dict) else {}
        })
    except Exception as e:
        print_server_error("/api/documents/item_prices", e, data)
        return jsonify({"success": False, "error": str(e), "prices": {}})

@catalog_bp.route("/api/nomenclature/card", methods=["POST"])
@catalog_bp.route("/api/documents/nomenclature_card", methods=["POST"])
def get_nomenclature_card_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_nomenclature_card", data)
        card = res.get("card") if isinstance(res, dict) else None
        if not card:
            return jsonify({"success": False, "error": "Товар не найден"})
        return jsonify({"success": True, "card": card})
    except Exception as e:
        print_server_error("/api/nomenclature/card", e, data)
        return jsonify({"success": False, "error": str(e)})

@catalog_bp.route("/api/nomenclature/stock", methods=["POST"])
@catalog_bp.route("/api/documents/nomenclature_stock", methods=["POST"])
def get_nomenclature_stock_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_nomenclature_stock", data)
        if isinstance(res, dict):
            return jsonify({"success": True, **res})
        return jsonify({"success": True, "warehouses": [], "prices": []})
    except Exception as e:
        print_server_error("/api/nomenclature/stock", e, data)
        return jsonify({"success": False, "error": str(e), "warehouses": [], "prices": []})

