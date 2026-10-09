# -*- coding: utf-8 -*-
import win32com.client
import sys
import datetime
import os

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

cache_epf = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\1c_reporter\epf_cache\sales_report.epf"
rep = conn.ВнешниеОтчеты.Создать(cache_epf)
schema = rep.СхемаКомпоновкиДанных

q = conn.NewObject("Запрос")
q.Text = 'ВЫБРАТЬ Т.Ссылка КАК Ref ИЗ Справочник.СохраненныеНастройки КАК Т ГДЕ Т.Наименование = "gunay gundelik"'
res = q.Execute().Choose()
res.Next()
setting_obj = res.Ref.ПолучитьОбъект()
stored_data = setting_obj.ХранилищеНастроек.Получить()
skd_settings = stored_data.НастройкиКомпоновщика

rep.КомпоновщикНастроек.ЗагрузитьНастройки(skd_settings)
cur_s = rep.КомпоновщикНастроек.Настройки

p_start = conn.NewObject("ПараметрКомпоновкиДанных", "НачалоПериода")
p_end = conn.NewObject("ПараметрКомпоновкиДанных", "КонецПериода")
cur_s.ПараметрыДанных.УстановитьЗначениеПараметра(p_start, datetime.datetime(2026, 9, 1, 4, 0, 0))
cur_s.ПараметрыДанных.УстановитьЗначениеПараметра(p_end, datetime.datetime(2026, 9, 28, 4, 0, 0))

layout_b = conn.NewObject("КомпоновщикМакетаКомпоновкиДанных")
layout = layout_b.Выполнить(schema, cur_s)
proc = conn.NewObject("ПроцессорКомпоновкиДанных")
proc.Инициализировать(layout)
out_proc = conn.NewObject("ПроцессорВыводаРезультатаКомпоновкиДанныхВТабличныйДокумент")
tab = conn.NewObject("ТабличныйДокумент")
out_proc.УстановитьДокумент(tab)
out_proc.Вывести(proc)

print(f"Table dimensions: Height={tab.ВысотаТаблицы}, Width={tab.ШиринаТаблицы}")
for r in range(1, tab.ВысотаТаблицы + 1):
    vals = []
    for c in range(1, tab.ШиринаТаблицы + 1):
        txt = tab.Область(r, c).Текст.strip()
        vals.append(txt if txt else "")
    # Only print rows that have at least one cell with content
    if any(vals):
        print(f"R{r:02d}: " + " | ".join(vals))
