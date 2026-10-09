# -*- coding: utf-8 -*-
import sys
import queue
import win32com.client

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, r"c:\Users\nesib\.gemini\antigravity-ide\scratch\1c_reporter")

from services.catalog_handlers import handle_catalog_data

conn = win32com.client.Dispatch("V83.COMConnector").Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

# Test Oreo:
payload1 = {
    "catalog": "Номенклатура",
    "locate_code": "MDL4076448",
    "search": "Печенье ОРЕО с какао и кремовой нач 228 гр"
}
q1 = queue.Queue()
handle_catalog_data(conn, payload1, "key", q1)
ok1, res1 = q1.get()
print("Oreo Test 1 (with search):")
print("  target_folder:", res1.get("target_folder"))
print("  target_code:", res1.get("target_code"))
print("  parent_folder:", res1.get("parent_folder"))
print("  items count:", len(res1.get("items", [])))
for it in res1.get("items", []):
    print("   -", it["code"], it["name"])

# Test Oreo clear search
payload2 = {
    "catalog": "Номенклатура",
    "folder": res1.get("target_folder"),
    "search": ""
}
q2 = queue.Queue()
handle_catalog_data(conn, payload2, "key", q2)
ok2, res2 = q2.get()
print("\nOreo Test 2 (clear search in folder):")
print("  folder:", res2.get("folder"))
print("  items count:", len(res2.get("items", [])))
print(f"  First 3 items:")
for it in res2.get("items", [])[:3]:
    print("   -", it["code"], it["name"])
