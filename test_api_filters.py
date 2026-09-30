import urllib.request, json, time, sys
sys.stdout.reconfigure(encoding='utf-8')

time.sleep(1)

base_payload = {
    "server": "Test1C",
    "base": "Aztrade_test3",
    "user": "Nesib",
    "pwd": "15963",
    "start_date": "2026-09-01",
    "end_date": "2026-09-30",
    "price_type": "20",
    "row_groupings": [{"field": "Склад"}, {"field": "Номенклатура"}],
    "indicators": {
        "qtyStart": True,
        "qtyIn": True,
        "qtyOut": True,
        "qtyEnd": True,
        "qtyTurnover": True,
        "showPrice": True,
        "showSum": True
    },
    "filters": []
}

def post_json(payload):
    req = urllib.request.Request(
        "http://127.0.0.1:5050/api/universal_report",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

# Test 1: Single warehouse 'Anbar Gəncə'
p1 = dict(base_payload)
p1["filters"] = [{"active": True, "field": "Склад", "comparison": "equal", "value": "Anbar Gəncə"}]
res1 = post_json(p1)
print("Test 1 (Single Wh 'Anbar Gəncə'): success =", res1.get("success"), "| items =", res1.get("total_count"), "| end_bal =", res1.get("totals", {}).get("end_bal"))

# Test 2: Multi-warehouse 'Anbar Gəncə; Anbar Müvəqqəti Gəncə'
p2 = dict(base_payload)
p2["filters"] = [{"active": True, "field": "Склад", "comparison": "in_list", "value": "Anbar Gəncə; Anbar Müvəqqəti Gəncə"}]
res2 = post_json(p2)
print("Test 2 (Multi-Wh semicolon): success =", res2.get("success"), "| items =", res2.get("total_count"), "| end_bal =", res2.get("totals", {}).get("end_bal"))

# Test 3: Multi-product '01 MONDELEZ; 07 JACOBS' under 'Anbar Gəncə'
p3 = dict(base_payload)
p3["filters"] = [
    {"active": True, "field": "Склад", "comparison": "equal", "value": "Anbar Gəncə"},
    {"active": True, "field": "Номенклатура", "comparison": "in_list", "value": "01 MONDELEZ; 07 JACOBS"}
]
res3 = post_json(p3)
print("Test 3 (Wh + Multi-Nom folders): success =", res3.get("success"), "| items =", res3.get("total_count"), "| end_bal =", res3.get("totals", {}).get("end_bal"))

# Test 4: Warehouse folder '01.Gence VN'
p4 = dict(base_payload)
p4["filters"] = [{"active": True, "field": "Склад", "comparison": "in_list", "value": "01.Gence VN"}]
res4 = post_json(p4)
print("Test 4 (Wh folder '01.Gence VN'): success =", res4.get("success"), "| items =", res4.get("total_count"), "| end_bal =", res4.get("totals", {}).get("end_bal"))
