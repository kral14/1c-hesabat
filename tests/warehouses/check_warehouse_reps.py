# -*- coding: utf-8 -*-
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch('V83.COMConnector')
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

reps = ['ВедомостьПоОстаткамИДвижениюТоваровКоробкиШтукиБлоки', 'ВедомостьПоОстаткамИДвижениюТоваров', 'ДвижениеТоваровСЦеной']
for rep_name in reps:
    meta = conn.Метаданные.Отчеты.Найти(rep_name)
    if meta:
        print(f"Internal report: {meta.Имя} -> {meta.Синоним}")
    else:
        print(f"Not internal: {rep_name}")

# Also check Справочник.ВнешниеОбработки for anything with "Коробки" or "Остатк"
q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ
    Т.Наименование КАК Name,
    Т.ВидОбработки КАК Type
ИЗ
    Справочник.ВнешниеОбработки КАК Т
ГДЕ
    Т.Наименование ПОДОБНО "%Коробк%"
    ИЛИ Т.Наименование ПОДОБНО "%Остатк%"
    ИЛИ Т.Наименование ПОДОБНО "%склад%"
"""
res = q.Execute().Choose()
print("\nExternal matching warehouse/stock:")
while res.Next():
    print(f" * {res.Name}")
