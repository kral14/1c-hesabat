# -*- coding: utf-8 -*-
import win32com.client
import sys
import datetime

sys.stdout.reconfigure(encoding='utf-8')
c = win32com.client.Dispatch('V83.COMConnector').Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

# Query April 2026 for OBA and Barni in Test1C
q = c.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ
    ПродажиОбороты.Контрагент.Наименование КАК Kontragent,
    ПродажиОбороты.Номенклатура.Наименование КАК Nom,
    СУММА(ПродажиОбороты.КоличествоОборот) КАК Qty,
    СУММА(ПродажиОбороты.СтоимостьОборот) КАК SumNet
ИЗ
    РегистрНакопления.Продажи.Обороты(&D1, &D2, Авто, ) КАК ПродажиОбороты
ГДЕ
    ПродажиОбороты.Контрагент.Наименование ПОДОБНО "%OBA%"
    И ПродажиОбороты.Номенклатура.Наименование ПОДОБНО "%Барни%"
СГРУППИРОВАТЬ ПО
    ПродажиОбороты.Контрагент.Наименование,
    ПродажиОбороты.Номенклатура.Наименование
"""
q.SetParameter("D1", datetime.datetime(2026, 4, 1, 0, 0, 0))
q.SetParameter("D2", datetime.datetime(2026, 4, 30, 23, 59, 59))
res = q.Execute().Choose()
print("April 2026 results in Test1C:")
while res.Next():
    print(f" - {res.Kontragent} | {res.Nom} | {res.Qty} ədəd, {res.SumNet} AZN")
