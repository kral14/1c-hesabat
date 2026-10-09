# -*- coding: utf-8 -*-
import win32com.client
import sys
import datetime

sys.stdout.reconfigure(encoding='utf-8')
c = win32com.client.Dispatch('V83.COMConnector').Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

# Check all sales to OBA in September 2026
q = c.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ ПЕРВЫЕ 20
    Продажи.Период КАК Period,
    Продажи.Контрагент.Наименование КАК Kontragent,
    Продажи.Номенклатура.Наименование КАК Nom,
    Продажи.Количество КАК Qty,
    Продажи.Стоимость КАК SumNet
ИЗ
    РегистрНакопления.Продажи КАК Продажи
ГДЕ
    Продажи.Период МЕЖДУ &D1 И &D2
    И (Продажи.Контрагент.Наименование ПОДОБНО "%OBA%" ИЛИ Продажи.Контрагент.Код ПОДОБНО "%17811%")
УПОРЯДОЧИТЬ ПО
    Period УБЫВ
"""
q.SetParameter("D1", datetime.datetime(2026, 9, 1, 0, 0, 0))
q.SetParameter("D2", datetime.datetime(2026, 9, 28, 23, 59, 59))
res = q.Execute().Choose()

print("Sales to OBA in September 2026:")
count = 0
while res.Next():
    count += 1
    print(f"{count}. {res.Period}: {res.Kontragent} | {res.Nom} | {res.Qty} ədəd, {res.SumNet} AZN")
if count == 0:
    print("NO SALES TO OBA IN SEPTEMBER 2026!")

# When was the LAST sale of Barni to OBA?
q2 = c.NewObject("Запрос")
q2.Text = """
ВЫБРАТЬ ПЕРВЫЕ 5
    Продажи.Период КАК Period,
    Продажи.Контрагент.Наименование КАК Kontragent,
    Продажи.Номенклатура.Наименование КАК Nom,
    Продажи.Количество КАК Qty,
    Продажи.Стоимость КАК SumNet
ИЗ
    РегистрНакопления.Продажи КАК Продажи
ГДЕ
    (Продажи.Контрагент.Наименование ПОДОБНО "%OBA%" ИЛИ Продажи.Контрагент.Код ПОДОБНО "%17811%")
    И Продажи.Номенклатура.Наименование ПОДОБНО "%Барни%"
УПОРЯДОЧИТЬ ПО
    Period УБЫВ
"""
res2 = q2.Execute().Choose()
print("\nLast sales of Barni to OBA in Test1C history:")
while res2.Next():
    print(f" - {res2.Period}: {res2.Kontragent} | {res2.Nom} | {res2.Qty} ədəd, {res2.SumNet} AZN")
