# -*- coding: utf-8 -*-
"""
tests/test_order_analysis.py
============================
Müştəri Sifarişləri Analizi (Заказ покупателя анализ) hesabatının
avtomatlaşdırılmış inteqrasiya və API testi.
"""

import os
import sys
import json
import unittest

app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, app_dir)

from app import app


class TestOrderAnalysisReport(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_01_generate_order_analysis(self):
        print("\n--- TEST: Sifariş Analizi Hesabatının Formalaşdırılması ---", flush=True)
        payload = {
            "start_date": "01.08.2026",
            "end_date": "30.09.2026",
            "groupings": ["Контрагент", "Номенклатура"],
            "indicators": {
                "quantity": True,
                "price": True,
                "sum": True,
                "vat_sum": False
            },
            "filters": [],
            "posted_only": False
        }

        resp = self.client.post("/api/order_analysis/generate",
                                data=json.dumps(payload),
                                content_type="application/json")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        print("Response success:", data.get("success"))
        self.assertTrue(data.get("success"), f"Generation failed: {data.get('error')}")

        totals = data.get("totals", {})
        print(f"Total Qty: {totals.get('qty')}, Total Sum: {totals.get('sum')} AZN")
        print(f"Stores count: {data.get('stores_count')}, Items count: {data.get('items_count')}, Rows: {len(data.get('rows', []))}")

        self.assertGreater(len(data.get("rows", [])), 0, "Should return order rows")
        self.assertGreater(totals.get("qty", 0), 0, "Total quantity should be > 0")
        self.assertGreater(totals.get("sum", 0), 0, "Total sum should be > 0")

        # Test Excel export
        print("--- TEST: Excel İxracı ---", flush=True)
        export_resp = self.client.post("/api/order_analysis/export_excel",
                                       data=json.dumps({"report_data": data}),
                                       content_type="application/json")
        self.assertEqual(export_resp.status_code, 200)
        exp_data = export_resp.get_json()
        self.assertTrue(exp_data.get("success"))

        # Test Excel download
        dl_resp = self.client.get("/api/order_analysis/download_excel")
        self.assertEqual(dl_resp.status_code, 200)
        self.assertGreater(len(dl_resp.data), 1000, "Excel file should not be empty")
        print("✅ Excel faylı uğurla yaradıldı və endirildi.")


if __name__ == "__main__":
    unittest.main()
