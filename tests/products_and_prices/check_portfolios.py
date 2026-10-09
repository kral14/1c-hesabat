# -*- coding: utf-8 -*-
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

# 1. Inspect Portfolios list
q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ РАЗЛИЧНЫЕ
    Т.Портфель КАК Portfolio
ИЗ
    Справочник.ДоговорыКонтрагентов КАК Т
ГДЕ
    НЕ Т.Портфель ЕСТЬ NULL
    И Т.Портфель <> ЗНАЧЕНИЕ(Справочник.НоменклатурныеГруппы.ПустаяСсылка)
"""
try:
    res = q.Execute().Choose()
    portfolios = []
    while res.Next():
        p_name = str(res.Portfolio).strip()
        if p_name:
            portfolios.append(p_name)
    print(f"Total Portfolios found: {len(portfolios)}")
    for p in sorted(portfolios)[:15]:
        print(" -", p)
except Exception as e:
    print("Error querying portfolios:", e)
    # Check type of ДоговорКонтрагента.Портфель
    meta_dog = conn.Метаданные.Справочники.ДоговорыКонтрагентов
    for i in range(meta_dog.Реквизиты.Количество()):
        req = meta_dog.Реквизиты.Получить(i)
        if "портфель" in req.Имя.lower():
            print(f"Portfolio attribute: {req.Имя}, Type: {conn.String(req.Тип)}")
