# -*- coding: utf-8 -*-
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

epf_path = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\1c_reporter\epf_cache\sales_report.epf"
rep = conn.ВнешниеОтчеты.Создать(epf_path)
schema = rep.СхемаКомпоновкиДанных

q = conn.NewObject("Запрос")
q.Text = 'ВЫБРАТЬ Т.Ссылка КАК Ref ИЗ Справочник.СохраненныеНастройки КАК Т ГДЕ Т.Наименование = "gunay gundelik"'
res = q.Execute().Choose()
res.Next()
setting_obj = res.Ref.ПолучитьОбъект()
skd_settings = setting_obj.ХранилищеНастроек.Получить().НастройкиКомпоновщика
rep.КомпоновщикНастроек.ЗагрузитьНастройки(skd_settings)
cur_s = rep.КомпоновщикНастроек.Настройки

builder = conn.NewObject("КомпоновщикМакетаКомпоновкиДанных")
layout = builder.Выполнить(schema, cur_s)
proc = conn.NewObject("ПроцессорКомпоновкиДанных")
proc.Инициализировать(layout)
out_proc = conn.NewObject("ПроцессорВыводаРезультатаКомпоновкиДанныхВТабличныйДокумент")
tab_doc = conn.NewObject("ТабличныйДокумент")
out_proc.УстановитьДокумент(tab_doc)
out_proc.Вывести(proc)

# Locate the actual column titles row (the row containing Нач. остаток / Конечный остаток)
header_row_idx = 10
for r in range(1, min(16, tab_doc.ВысотаТаблицы + 1)):
    # Check across row
    row_texts = [tab_doc.Область(r, c).Текст.strip().lower() for c in range(1, tab_doc.ШиринаТаблицы + 1)]
    if any("остаток" in t or "продажа" in t or "количество" in t or "сумма" in t for t in row_texts):
        # Found the header row with column names
        header_row_idx = r
        break

print(f"Detected header row index: {header_row_idx}")
headers = []
for c in range(1, tab_doc.ШиринаТаблицы + 1):
    h = tab_doc.Область(header_row_idx, c).Текст.strip()
    if not h and header_row_idx > 1:
        h = tab_doc.Область(header_row_idx - 1, c).Текст.strip()
    headers.append(h or f"Sütun {c}")

print("Clean Headers:", headers)

rows = []
for r in range(header_row_idx + 1, tab_doc.ВысотаТаблицы + 1):
    c1 = tab_doc.Область(r, 1).Текст.strip()
    if not c1: continue
    cells = [tab_doc.Область(r, c).Текст.strip() or "-" for c in range(1, len(headers) + 1)]
    is_tot = "итого" in c1.lower() or "yekun" in c1.lower()
    rows.append({"name": c1, "cells": cells, "is_total": is_tot})

print(f"Data rows count: {len(rows)}")
for rw in rows[:5]:
    print(" -", rw["cells"])
if rows and rows[-1]["is_total"]:
    print(" - YEKUN:", rows[-1]["cells"])
