# -*- coding: utf-8 -*-
import os
import io
import csv
from flask import Blueprint, request, jsonify, send_file
from services.common import APP_DIR, print_server_error
from services.onec_service import one_c

document_bp = Blueprint("document_bp", __name__)

@document_bp.route("/api/documents/list", methods=["POST"])
def documents_list_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_documents_list", data)
        return jsonify({
            "success": True,
            "doc_type": res.get("doc_type"),
            "doc_title": res.get("doc_title"),
            "columns": res.get("columns", []),
            "items": res.get("items", []),
            "total": res.get("total", 0),
            "has_more": res.get("has_more", False),
            "last_date": res.get("last_date", ""),
            "last_number": res.get("last_number", "")
        })
    except Exception as e:
        print_server_error("/api/documents/list", e, data)
        return jsonify({"success": False, "error": str(e)})

@document_bp.route("/api/documents/details", methods=["POST"])
def document_details_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_document_details", data)
        return jsonify({
            "success": True,
            "doc_type": res.get("doc_type"),
            "header": res.get("header", {}),
            "lines": res.get("lines", []),
            "total_lines": res.get("total_lines", 0)
        })
    except Exception as e:
        print_server_error("/api/documents/details", e, data)
        return jsonify({"success": False, "error": str(e)})

@document_bp.route("/api/documents/price_doc", methods=["POST"])
def get_price_doc_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_price_document", data)
        return jsonify({
            "success": True,
            "data": res
        })
    except Exception as e:
        print_server_error("/api/documents/price_doc", e, data)
        return jsonify({"success": False, "error": str(e)})

@document_bp.route("/api/documents/save_price_doc", methods=["POST"])
def save_price_doc_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("save_price_document", data)
        return jsonify({
            "success": True,
            "data": res
        })
    except Exception as e:
        print_server_error("/api/documents/save_price_doc", e, data)
        return jsonify({"success": False, "error": str(e)})

@document_bp.route("/api/documents/resolve_nomenclature", methods=["POST"])
def resolve_nomenclature_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("resolve_nomenclature_batch", data)
        return jsonify({
            "success": True,
            "found": res.get("found", {})
        })
    except Exception as e:
        print_server_error("/api/documents/resolve_nomenclature", e, data)
        return jsonify({"success": False, "error": str(e), "found": {}})

@document_bp.route("/api/documents/batch_item_prices", methods=["POST"])
def get_batch_item_prices_endpoint():
    data = request.json or {}
    try:
        res = one_c.execute("get_batch_item_prices", data)
        return jsonify({
            "success": True,
            "prices_by_code": res.get("prices_by_code", {}),
            "prices_by_name": res.get("prices_by_name", {})
        })
    except Exception as e:
        print_server_error("/api/documents/batch_item_prices", e, data)
        return jsonify({"success": False, "error": str(e), "prices_by_code": {}, "prices_by_name": {}})

@document_bp.route("/api/documents/download_excel_template", methods=["GET"])
def download_excel_template_endpoint():
    try:
        template_path = os.path.join(APP_DIR, "static", "templates", "sablon_qiymet_yukleme.xlsx")
        if not os.path.exists(template_path):
            os.makedirs(os.path.dirname(template_path), exist_ok=True)
            import openpyxl
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Qiymətlər"
            ws.append(["Код / Артикул", "Наименование товара (Məhsulun adı)", "Цена (Yeni Qiymət)"])
            ws.append(["00000000123", "Çörək kəpəkli 500 qr (Nümunə)", 0.65])
            ws.append(["7433-RB", "Yağ kərə 82.5% 200 qr (Nümunə)", 4.80])
            ws.append(["8078306", "Süd pasterizə 1L 3.2% (Nümunə)", 2.10])
            wb.save(template_path)
            
        return send_file(
            template_path,
            as_attachment=True,
            download_name="sablon_qiymet_yukleme.xlsx",
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    except Exception as e:
        print_server_error("/api/documents/download_excel_template", e, {})
        return jsonify({"success": False, "error": str(e)})

@document_bp.route("/api/documents/parse_excel_file", methods=["POST"])
def parse_excel_file_endpoint():
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "error": "Fayl seçilməyib"})

        file = request.files["file"]
        if not file.filename:
            return jsonify({"success": False, "error": "Boş fayl adı"})

        file_bytes = file.read()
        if not file_bytes:
            return jsonify({"success": False, "error": "Faylın içi boşdur"})

        raw_rows = []
        parse_err = None

        # 1. Try reading as .xlsx via openpyxl
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
            sheet = wb.active
            for row in sheet.iter_rows(values_only=True):
                if row and any(v is not None and str(v).strip() for v in row):
                    raw_rows.append([str(v).strip() if v is not None else "" for v in row])
        except Exception as e_xlsx:
            parse_err = str(e_xlsx)

        # 2. If failed, try reading as .xls via xlrd
        if not raw_rows:
            try:
                import xlrd
                wb = xlrd.open_workbook(file_contents=file_bytes)
                sheet = wb.sheet_by_index(0)
                for r in range(sheet.nrows):
                    row_vals = sheet.row_values(r)
                    if any(v is not None and str(v).strip() for v in row_vals):
                        raw_rows.append([str(v).strip() if v is not None else "" for v in row_vals])
            except Exception as e_xls:
                parse_err = str(e_xls)

        # 3. If failed, try reading as text CSV / TSV / HTML table
        if not raw_rows:
            text = None
            for enc in ["utf-8-sig", "utf-8", "windows-1251", "cp1254", "latin1"]:
                try:
                    text = file_bytes.decode(enc)
                    break
                except Exception:
                    continue
            if text:
                delim = "\t" if "\t" in text else (";" if ";" in text else ",")
                reader = csv.reader(io.StringIO(text), delimiter=delim)
                for r in reader:
                    if r and any(v.strip() for v in r):
                        raw_rows.append([v.strip() for v in r])

        if not raw_rows:
            return jsonify({
                "success": False,
                "error": f"Fayl oxuna bilmədi. Zəhmət olmasa nümunə .xlsx şablonunu yükləyib doldurun. ({parse_err or 'Format uyğun deyil'})"
            })

        # Smart column and header detection
        code_col = 0
        price_col = 1
        start_row = 0

        first_row = [str(c).lower().strip() for c in raw_rows[0]]
        detected_code = -1
        detected_price = -1
        has_header_keywords = False

        for c_idx, val in enumerate(first_row):
            if any(h in val for h in ["код", "code", "kod", "артикул", "artikul", "barkod", "штрихкод"]):
                detected_code = c_idx
                has_header_keywords = True
            if any(h in val for h in ["цен", "qiym", "price", "məbləğ", "mebleg", "стоимость"]):
                detected_price = c_idx
                has_header_keywords = True

        if has_header_keywords and detected_code != -1 and detected_price != -1:
            code_col = detected_code
            price_col = detected_price
            start_row = 1
        elif len(raw_rows[0]) >= 3:
            try:
                sample_row = raw_rows[1] if len(raw_rows) > 1 else raw_rows[0]
                test_p = str(sample_row[-1]).replace(",", ".").replace(" ", "").replace("\xa0", "")
                float(test_p)
                code_col = 0
                price_col = len(sample_row) - 1
                if any(h in first_row[0] for h in ["код", "code", "kod", "артикул", "№", "nomer"]):
                    start_row = 1
            except Exception:
                code_col = 0
                price_col = 1
        else:
            code_col = 0
            price_col = 1
            try:
                float(str(first_row[1]).replace(",", ".").replace(" ", ""))
            except Exception:
                start_row = 1

        rows = []
        for r in raw_rows[start_row:]:
            if len(r) <= max(code_col, price_col):
                continue
            c_val = str(r[code_col]).strip()
            if c_val.endswith(".0") and c_val[:-2].isdigit():
                c_val = c_val[:-2]

            if not c_val or c_val.lower() in ["код", "code", "kod", "артикул"]:
                continue

            p_str = str(r[price_col]).replace(",", ".").replace(" ", "").replace("\xa0", "").strip()
            try:
                p_val = float(p_str)
                if p_val >= 0:
                    rows.append({"code": c_val, "price": p_val})
            except Exception:
                continue

        if not rows:
            return jsonify({
                "success": False,
                "error": "Faylda oxunacaq qiymət sətri tapılmadı. Sütunların uyğunluğunu və ya nümunə şablonu yoxlayın."
            })

        return jsonify({
            "success": True,
            "rows": rows,
            "total": len(rows)
        })
    except Exception as e:
        print_server_error("/api/documents/parse_excel_file", e, {})
        return jsonify({"success": False, "error": str(e)})
