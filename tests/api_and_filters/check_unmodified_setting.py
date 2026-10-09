# -*- coding: utf-8 -*-
import win32com.client
import sys
import datetime

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

# Let's inspect the exact dates saved inside the setting itself!
print("--- SAVED DATES INSIDE THE SETTING ITSELF ---")
for i in range(skd_settings.ПараметрыДанных.Элементы.Количество()):
    el = skd_settings.ПараметрыДанных.Элементы.Получить(i)
    try:
        p_name = str(el.Параметр)
        val = el.Значение
        print(f"Param '{p_name}': val='{val}' ({type(val)}), use={el.Использование}")
    except Exception as e:
        print(f"Param {i}: {e}")

# What if we run the report with the EXACT saved parameters without overriding them?
rep.КомпоновщикНастроек.ЗагрузитьНастройки(skd_settings)
cur_s = rep.КомпоновщикНастроек.Настройки

layout_b = conn.NewObject("КомпоновщикМакетаКомпоновкиДанных")
layout = layout_b.Выполнить(schema, cur_s)
proc = conn.NewObject("ПроцессорКомпоновкиДанных")
proc.Инициализировать(layout)
out_proc = conn.NewObject("ПроцессорВыводаРезультатаКомпоновкиДанныхВТабличныйДокумент")
tab = conn.NewObject("ТабличныйДокумент")
out_proc.УстановитьДокумент(tab)
out_proc.Вывести(proc)

print("\n--- RESULTS USING UNMODIFIED SAVED SETTINGS ---")
print(f"Row 4: {tab.Область(4, 1).Текст} | {tab.Область(4, 2).Текст}")
print(f"Row 5: {tab.Область(5, 1).Текст} | {tab.Область(5, 2).Текст}")
for r in range(10, min(15, tab.ВысотаТаблицы + 1)):
    row_txt = [tab.Область(r, c).Текст.strip() for c in range(1, 8)]
    print(f"Row {r}: {' | '.join(row_txt)}")

for r in range(tab.ВысотаТаблицы - 3, tab.ВысотаТаблицы + 1):
    if "Итого" in tab.Область(r, 1).Текст:
        row_txt = [tab.Область(r, c).Текст.strip() for c in range(1, 8)]
        print(f"ИТОГО: {' | '.join(row_txt)}")
