# -*- coding: utf-8 -*-
import sys, json
sys.stdout.reconfigure(encoding='utf-8')
import win32com.client, pythoncom

pythoncom.CoInitialize()
connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ
    Т.Владелец.Наименование КАК ItemName,
    Т.Штрихкод КАК Barcode,
    Т.ЕдиницаИзмерения.Наименование КАК UnitName,
    Т.ЕдиницаИзмерения.Коэффициент КАК Ratio
ИЗ
    РегистрСведений.Штрихкоды КАК Т
ГДЕ
    НЕ Т.Штрихкод ЕСТЬ NULL И Т.Штрихкод <> ""
"""
res = q.Execute().Choose()
barcodes_map = {}
count = 0
while res.Next():
    count += 1
    item_name = str(res.ItemName or "").strip()
    bc = str(res.Barcode or "").strip()
    uname = str(res.UnitName or "").strip().lower()
    ratio = float(res.Ratio or 1)

    if not item_name or not bc:
        continue

    if item_name not in barcodes_map:
        barcodes_map[item_name] = {"unit": "", "box": "", "block": ""}

    # Classification
    if "blok" in uname or "блок" in uname or "упак" in uname:
        if not barcodes_map[item_name]["block"]:
            barcodes_map[item_name]["block"] = bc
    elif "qutu" in uname or "кор" in uname or "ящ" in uname or ratio > 1:
        if not barcodes_map[item_name]["box"]:
            barcodes_map[item_name]["box"] = bc
    else: # "əd", "ədəd", "шт", ratio == 1
        if not barcodes_map[item_name]["unit"]:
            barcodes_map[item_name]["unit"] = bc

print(f"Total barcode records read: {count}")
print(f"Total items with barcodes: {len(barcodes_map)}")
sample_items = list(barcodes_map.keys())[:5]
for s in sample_items:
    print(f"Item: {s[:30]} -> {barcodes_map[s]}")
