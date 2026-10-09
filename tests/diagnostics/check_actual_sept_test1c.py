# -*- coding: utf-8 -*-
import win32com.client
import sys
import datetime

sys.stdout.reconfigure(encoding='utf-8')
c = win32com.client.Dispatch('V83.COMConnector').Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

q = c.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ ПЕРВЫЕ 15
    ПродажиОбороты.Период КАК Period,
    ПродажиОбороты.Контрагент.Наименование КАК Kontragent,
    ПродажиОбороты.Номенклатура.Наименование КАК Nom,
    ПродажиОбороты.КоличествоОборот КАК Qty,
    ПродажиОбороты.СтоимостьОборот КАК SumNet
ИЗ
    РегистрНакопления.Продажи.Обороты(&D1, &D2, День, ) КАК ПродажиОбороты
ГДЕ
    ПродажиОбороты.КоличествоОборот <> 0
УПОРЯДОЧИТЬ ПО
    Period УБЫВ
"""
q.SetParameter("D1", datetime.datetime(2026, 9, 1, 0, 0, 0))
q.SetParameter("D2", datetime.datetime(2026, 9, 28, 23, 59, 59))
res = q.Execute().Choose()
print("Actual sales in September 2026 in Test1C (Aztrade_test3):")
count = 0
while res.Next():
    count += 1
    print(f"{count}. {res.Period}: {res.Kontragent} | {res.Nom} | {res.Qty} ədəd, {res.SumNet} AZN")
if count == 0:
    print("NO SALES IN SEPTEMBER 2026 IN TEST1C!")
