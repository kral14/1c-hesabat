# -*- coding: utf-8 -*-
import win32com.client
import sys
import datetime
import os

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

print("Connected to aztrade2023.")

# 1. Get gunay gundelik setting
q = conn.NewObject("Запрос")
q.Text = 'ВЫБРАТЬ Т.Ссылка КАК Ref ИЗ Справочник.СохраненныеНастройки КАК Т ГДЕ Т.Наименование = "gunay gundelik"'
res = q.Execute().Choose()
if not res.Next():
    print("gunay gundelik not found!")
    sys.exit(1)

setting_ref = res.Ref
setting_obj = setting_ref.ПолучитьОбъект()
stored_data = setting_obj.ХранилищеНастроек.Получить()
print("Stored data keys:")
for item in stored_data:
    print(f" - {item.Ключ}: {type(item.Значение)}")

skd_settings = stored_data.НастройкиКомпоновщика
print("\nFilters (Отбор) in gunay gundelik stored setting:")
for i in range(skd_settings.Отбор.Элементы.Количество()):
    el = skd_settings.Отбор.Элементы.Получить(i)
    try:
        print(f" Filter {i}: Left='{el.ЛевоеЗначение}', Comp='{el.ВидСравнения}', Right='{el.ПравоеЗначение}', Use={el.Использование}")
    except Exception as e:
        print(f" Filter {i}: {e}")

# 2. Check cached EPF in 1c_reporter/epf_cache
cache_epf = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\1c_reporter\epf_cache\sales_report.epf"
print(f"\nChecking cache epf exists: {os.path.exists(cache_epf)}")
if os.path.exists(cache_epf):
    print(f"Cache epf size: {os.path.getsize(cache_epf)} bytes")

rep = conn.ВнешниеОтчеты.Создать(cache_epf)
schema = rep.СхемаКомпоновкиДанных

# Test loading settings
try:
    rep.КомпоновщикНастроек.ЗагрузитьНастройки(skd_settings)
    print("SUCCESS: rep.КомпоновщикНастроек.ЗагрузитьНастройки(skd_settings)")
except Exception as e:
    print(f"FAILED to load settings: {e}")

# Inspect current settings filters
cur_filters = rep.КомпоновщикНастроек.Настройки.Отбор
print(f"Current settings filters count: {cur_filters.Элементы.Количество()}")

# Test running report for both 00:00:00 and 23:59:59
for end_hour, end_min, end_sec in [(0, 0, 0), (23, 59, 59)]:
    dt_start = datetime.datetime(2026, 9, 1, 4, 0, 0)
    dt_end = datetime.datetime(2026, 9, 28, 4 + end_hour, end_min, end_sec)

    cur_s = rep.КомпоновщикНастроек.Настройки
    p_start = conn.NewObject("ПараметрКомпоновкиДанных", "НачалоПериода")
    p_end = conn.NewObject("ПараметрКомпоновкиДанных", "КонецПериода")
    cur_s.ПараметрыДанных.УстановитьЗначениеПараметра(p_start, dt_start)
    cur_s.ПараметрыДанных.УстановитьЗначениеПараметра(p_end, dt_end)

    layout_b = conn.NewObject("КомпоновщикМакетаКомпоновкиДанных")
    layout = layout_b.Выполнить(schema, cur_s)
    proc = conn.NewObject("ПроцессорКомпоновкиДанных")
    proc.Инициализировать(layout)
    out_proc = conn.NewObject("ПроцессорВыводаРезультатаКомпоновкиДанныхВТабличныйДокумент")
    tab = conn.NewObject("ТабличныйДокумент")
    out_proc.УстановитьДокумент(tab)
    out_proc.Вывести(proc)

    print(f"\nResult with End Time {end_hour:02d}:{end_min:02d}:{end_sec:02d}:")
    for r in range(10, min(14, tab.ВысотаТаблицы + 1)):
        row_txt = [tab.Область(r, c).Текст.strip() for c in range(1, 8)]
        print(f" Sətir {r}: {' | '.join(row_txt)}")
