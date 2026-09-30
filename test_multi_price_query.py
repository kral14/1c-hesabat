# -*- coding: utf-8 -*-
import sys, json
sys.stdout.reconfigure(encoding='utf-8')
import win32com.client, pythoncom, datetime

pythoncom.CoInitialize()
connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

dt_start = datetime.datetime(2026, 9, 1, 0, 0, 0)
dt_end = datetime.datetime(2026, 9, 30, 23, 59, 59)

price_types = ["20", "Себестоимость", "10"]

select_parts = []
join_parts = []
params = {}

has_cost = False
for idx, pt in enumerate(price_types):
    if pt.lower() in ("cost", "себестоимость"):
        has_cost = True
        select_parts.append(f"ЕСТЬNULL(Партии.CostPrice, 0) КАК UnitPrice_{idx}")
    else:
        select_parts.append(f"ЕСТЬNULL(Цены_{idx}.Цена, 0) КАК UnitPrice_{idx}")
        join_parts.append(f"""
        ЛЕВОЕ СОЕДИНЕНИЕ РегистрСведений.ЦеныНоменклатуры.СрезПоследних(&КонецПериода, ТипЦен.Наименование = &PriceType_{idx}) КАК Цены_{idx}
        ПО Т.Номенклатура = Цены_{idx}.Номенклатура
        """)
        params[f"PriceType_{idx}"] = pt

if has_cost:
    join_parts.append("""
    ЛЕВОЕ СОЕДИНЕНИЕ (
        ВЫБРАТЬ
            П.Номенклатура КАК Номенклатура,
            П.Склад КАК Склад,
            ВЫБОР КОГДА СУММА(П.КоличествоОстаток) <> 0 
                 ТОГДА СУММА(П.СтоимостьОстаток) / СУММА(П.КоличествоОстаток) 
                 ИНАЧЕ 0 
            КОНЕЦ КАК CostPrice
        ИЗ
            РегистрНакопления.ПартииТоваровНаСкладах.Остатки(&КонецПериода, ) КАК П
        СГРУППИРОВАТЬ ПО
            П.Номенклатура,
            П.Склад
    ) КАК Партии
    ПО Т.Номенклатура = Партии.Номенклатура И Т.Склад = Партии.Склад
    """)

q_text = f"""
ВЫБРАТЬ ПЕРВЫЕ 10
    Т.Склад.Наименование КАК Warehouse,
    Т.Номенклатура.Наименование КАК Item,
    {', '.join(select_parts)},
    Т.КоличествоКонечныйОстаток КАК EndBal
ИЗ
    РегистрНакопления.ТоварыНаСкладах.ОстаткиИОбороты(&НачалоПериода, &КонецПериода, , , ) КАК Т
    {' '.join(join_parts)}
"""

q = conn.NewObject("Запрос")
q.Text = q_text
q.SetParameter("НачалоПериода", dt_start)
q.SetParameter("КонецПериода", dt_end)
for k, v in params.items():
    q.SetParameter(k, v)

res = q.Execute().Choose()
print("Query executed successfully! Sample results:")
while res.Next():
    prices = [getattr(res, f"UnitPrice_{i}") for i in range(len(price_types))]
    print(f"Item: {res.Item[:30]} | Bal: {res.EndBal} | Prices: {prices}")
