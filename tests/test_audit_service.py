# -*- coding: utf-8 -*-
"""
tests/test_audit_service.py
Integration tests for Audit Journal (offline mode & data structure verification).
"""
import unittest
import offline_service

class TestAuditService(unittest.TestCase):
    def test_audit_list_all_documents(self):
        res = offline_service.get_audit_list({"limit": 50})
        self.assertIn("items", res)
        self.assertIn("total_count", res)
        self.assertGreater(len(res["items"]), 0, "Audit list should not be empty")

        first_item = res["items"][0]
        self.assertIn("number", first_item)
        self.assertIn("date", first_item)
        self.assertIn("doc_type", first_item)
        self.assertIn("amount", first_item)
        self.assertIn("last_author", first_item)
        self.assertIn("version_count", first_item)
        print(f"OK: Audit list returned {len(res['items'])} items. First doc: {first_item['doc_type']} No.{first_item['number']}")

    def test_audit_list_filtered_by_type(self):
        res_real = offline_service.get_audit_list({"doc_type": "РеализацияТоваровУслуг", "limit": 10})
        for it in res_real["items"]:
            self.assertEqual(it["doc_type"], "РеализацияТоваровУслуг")

        res_vozvrat = offline_service.get_audit_list({"doc_type": "ВозвратТоваровОтПокупателя", "limit": 10})
        for it in res_vozvrat["items"]:
            self.assertEqual(it["doc_type"], "ВозвратТоваровОтПокупателя")
        print("OK: Document type filtering works accurately.")

    def test_audit_diff_details(self):
        list_res = offline_service.get_audit_list({"limit": 5})
        doc = list_res["items"][0]

        diff_res = offline_service.get_audit_diff({
            "doc_type": doc["doc_type"],
            "number": doc["number"]
        })

        self.assertEqual(diff_res["number"], doc["number"])
        self.assertGreaterEqual(diff_res["total_versions"], 1)
        self.assertGreaterEqual(len(diff_res["versions"]), 1)
        self.assertGreaterEqual(len(diff_res["event_timeline"]), 1)

        v1 = diff_res["versions"][0]
        self.assertIn("field_diffs", v1)
        self.assertIn("item_diffs", v1)
        self.assertIn("added", v1["item_diffs"])
        print(f"OK: Audit diff for No.{doc['number']} returned {diff_res['total_versions']} versions, {len(diff_res['event_timeline'])} timeline events.")

if __name__ == "__main__":
    unittest.main()
