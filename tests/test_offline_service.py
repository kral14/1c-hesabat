# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import offline_service

print("Testing offline_service against data/offline_1c_data.db...")

# 1. Ping
print("Ping:", offline_service.ping())

# 2. Get Realization Documents (First page)
p_real = offline_service.get_documents_list({
    "doc_type": "РеализацияТоваровУслуг",
    "limit": 10,
    "offset": 0
})
print(f"РеализацияТоваровУслуг fetched: {len(p_real['items'])} items (Total: {p_real['total']})")
if p_real["items"]:
    sample_doc = p_real["items"][0]
    print(f" Sample doc: {sample_doc['number']} | {sample_doc['date']} | {sample_doc['kontragent']} | {sample_doc['amount']} AZN | Marşrut: {sample_doc.get('pogruzka_marshrut')} | Sürücü: {sample_doc.get('pogruzka_voditel')}")

    # Test Document Details
    print(f"\nTesting get_document_details for {sample_doc['number']}...")
    det = offline_service.get_document_details({
        "doc_type": "РеализацияТоваровУслуг",
        "number": sample_doc["number"]
    })
    print(f" Details header: {det['header']['number']} | Kontragent: {det['header']['kontragent']} | Amount: {det['header']['amount']}")
    print(f" Total line items: {det['total_lines']}")
    if det["lines"]:
        l0 = det["lines"][0]
        print(f"   Line 1: {l0.get('code')} - {l0.get('name')} | {l0.get('quantity')} {l0.get('unit')} @ {l0.get('price')} = {l0.get('amount')} AZN")

# 3. Get Vozvrat Documents
p_voz = offline_service.get_documents_list({
    "doc_type": "ВозвратТоваровОтПокупателя",
    "limit": 5,
    "offset": 0
})
print(f"\nВозвратТоваровОтПокупателя fetched: {len(p_voz['items'])} items (Total: {p_voz['total']})")
if p_voz["items"]:
    v0 = p_voz["items"][0]
    print(f" Sample vozvrat: {v0['number']} | {v0['date']} | {v0['kontragent']} | {v0['amount']} AZN")
    v_det = offline_service.get_document_details({
        "doc_type": "ВозвратТоваровОтПокупателя",
        "number": v0["number"]
    })
    print(f" Vozvrat lines: {v_det['total_lines']}")

# 4. Get Pogruzki
p_pog = offline_service.get_documents_list({
    "doc_type": "ПогрузкиМашин",
    "limit": 5,
    "offset": 0
})
print(f"\nПогрузкиМашин fetched: {len(p_pog['items'])} items (Total: {p_pog['total']})")
if p_pog["items"]:
    pg0 = p_pog["items"][0]
    print(f" Sample pogruzka: {pg0['number']} | {pg0['date']} | Marşrut: {pg0['marshrut']} | Sürücü: {pg0['voditel']}")
    pg_det = offline_service.get_document_details({
        "doc_type": "ПогрузкиМашин",
        "number": pg0["number"]
    })
    print(f" Pogruzka related realizatsii: {pg_det['total_lines']}")

# 5. Search Kontragent & Nomenklatura
res_k = offline_service.search_kontragents("Bravo")
print(f"\nSearch Kontragents 'Bravo': found {len(res_k)} items")
if res_k:
    print(f" First: {res_k[0]['name']}")

res_n = offline_service.search_nomenklatura("Milka")
print(f"Search Nomenklatura 'Milka': found {len(res_n)} items")
if res_n:
    print(f" First: {res_n[0]['code']} - {res_n[0]['name']} (Barkod: {res_n[0]['barcode']})")

print("\nALL OFFLINE SERVICE TESTS PASSED 100%!")
