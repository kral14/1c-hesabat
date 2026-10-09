# -*- coding: utf-8 -*-
import win32com.client
import sys
import datetime

sys.stdout.reconfigure(encoding='utf-8')

# 1. Check date range of data in Test1C / Aztrade_test3
print("=== Checking Test1C / Aztrade_test3 ===")
c = win32com.client.Dispatch('V83.COMConnector')
try:
    conn = c.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')
    q = conn.NewObject("Запрос")
    q.Text = """
    ВЫБРАТЬ ПЕРВЫЕ 5
        МИНИМУМ(Продажи.Период) КАК MinDate,
        МАКСИМУМ(Продажи.Период) КАК MaxDate,
        КОЛИЧЕСТВО(*) КАК Cnt
    ИЗ
        РегистрНакопления.Продажи КАК Продажи
    """
    res = q.Execute().Choose()
    if res.Next():
        print(f"Test1C Sales Register Date Range: {res.MinDate} to {res.MaxDate}, Total Records: {res.Cnt}")
except Exception as e:
    print("Test1C query error:", e)

# 2. Check OBA Market and Barni in Test1C
try:
    q2 = conn.NewObject("Запрос")
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
        Продажи.Контрагент.Наименование ПОДОБНО "%OBA%"
        ИЛИ Продажи.Номенклатура.Наименование ПОДОБНО "%Барни%"
    """
    res2 = q2.Execute().Choose()
    print("\nOBA / Barni records in Test1C:")
    found = False
    while res2.Next():
        found = True
        print(f" - {res2.Period}: {res2.Kontragent} | {res2.Nom} | {res2.Qty} ədəd, {res2.SumNet} AZN")
    if not found:
        print("No OBA / Barni records found in Test1C!")
except Exception as e:
    print("Error querying OBA/Barni in Test1C:", e)
