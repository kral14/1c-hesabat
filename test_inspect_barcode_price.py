# -*- coding: utf-8 -*-
import sys, json
sys.stdout.reconfigure(encoding='utf-8')
import win32com.client, pythoncom

pythoncom.CoInitialize()
connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')
meta = conn.Метаданные

output = {}

# 1. Inspect РегистрСведений.Штрихкоды
has_barcode = meta.РегистрыСведений.Найти("Штрихкоды") is not None
output["has_barcode"] = has_barcode

if has_barcode:
    reg_md = meta.РегистрыСведений.Найти("Штрихкоды")
    dims = [reg_md.Измерения.Получить(i).Имя for i in range(reg_md.Измерения.Количество())]
    res_list = [reg_md.Ресурсы.Получить(i).Имя for i in range(reg_md.Ресурсы.Количество())]
    attrs = [reg_md.Реквизиты.Получить(i).Имя for i in range(reg_md.Реквизиты.Количество())]
    output["dims"] = dims
    output["resources"] = res_list
    output["attributes"] = attrs

    q = conn.NewObject("Запрос")
    q.Text = """
    ВЫБРАТЬ ПЕРВЫЕ 20
        Т.Владелец.Наименование КАК Owner,
        Т.Штрихкод КАК Barcode,
        Т.ТипШтрихкода.Наименование КАК BarcodeType,
        Т.ЕдиницаИзмерения.Наименование КАК Unit,
        Т.ЕдиницаИзмерения.Коэффициент КАК Ratio,
        Т.ХарактеристикаНоменклатуры.Наименование КАК Charact,
        Т.Качество.Наименование КАК Quality
    ИЗ
        РегистрСведений.Штрихкоды КАК Т
    """
    res = q.Execute().Choose()
    rows = []
    while res.Next():
        rows.append({
            "owner": str(res.Owner),
            "barcode": str(res.Barcode),
            "type": str(res.BarcodeType),
            "unit": str(res.Unit),
            "ratio": float(res.Ratio or 1),
            "quality": str(res.Quality)
        })
    output["sample_barcodes"] = rows

# 2. Inspect Справочник.ТипыЦенНоменклатуры
qp = conn.NewObject("Запрос")
qp.Text = """
ВЫБРАТЬ
    Т.Код КАК Code,
    Т.Наименование КАК Name,
    Т.ВалютаЦены.Наименование КАК Currency
ИЗ
    Справочник.ТипыЦенНоменклатуры КАК Т
УПОРЯДОЧИТЬ ПО
    Т.Наименование
"""
resp = qp.Execute().Choose()
price_types = []
while resp.Next():
    price_types.append({
        "code": str(resp.Code),
        "name": str(resp.Name),
        "currency": str(resp.Currency)
    })
output["price_types"] = price_types

# Also check ЕдиницыИзмерения / КлассификаторЕдиницИзмерения
qu = conn.NewObject("Запрос")
qu.Text = """
ВЫБРАТЬ ПЕРВЫЕ 50 РАЗЛИЧНЫЕ
    Т.ЕдиницаИзмерения.Наименование КАК UnitName,
    Т.ЕдиницаИзмерения.Коэффициент КАК Ratio
ИЗ
    РегистрСведений.Штрихкоды КАК Т
"""
ru = qu.Execute().Choose()
units = []
while ru.Next():
    units.append({"unit": str(ru.UnitName), "ratio": float(ru.Ratio or 1)})
output["units_in_barcodes"] = units

with open("barcode_price_info.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print("SUCCESS")
