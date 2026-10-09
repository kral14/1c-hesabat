# -*- coding: utf-8 -*-
import win32com.client
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

epf_path = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\1c_reporter\epf_cache\sales_report.epf"
if not os.path.exists(epf_path):
    epf_path = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\report.epf"

rep = conn.ВнешниеОтчеты.Создать(epf_path)
schema = rep.СхемаКомпоновкиДанных

# Read queries from schema.НаборыДанных
for i in range(schema.НаборыДанных.Количество()):
    ds = schema.НаборыДанных.Получить(i)
    print(f"\n--- Data Set {i}: {ds.Имя} ---")
    try:
        query_text = str(ds.Запрос)
        print("Query length in chars:", len(query_text))
        with open(r"C:\Users\nesib\.gemini\antigravity-ide\scratch\skd_query.txt", "w", encoding="utf-8") as f:
            f.write(query_text)
        print("Saved complete query to scratch/skd_query.txt")
        print("\nQuery preview (first 1000 characters):")
        print(query_text[:1000])
    except Exception as e:
        print("Not a query dataset or error:", e)

# Read calculated fields (ВычисляемыеПоля)
print("\n--- Calculated Fields (Вычисляемые поля) ---")
for i in range(schema.ВычисляемыеПоля.Количество()):
    cf = schema.ВычисляемыеПоля.Получить(i)
    print(f" * Field: '{cf.ПутьКДанным}' -> Expression: '{cf.Выражение}' (Title: '{cf.Заголовок}')")

# Read resource fields (ПоляИтогов)
print("\n--- Resource Fields (Ресурсы - necə cəmlənir və hesablanır) ---")
for i in range(schema.ПоляИтогов.Количество()):
    rf = schema.ПоляИтогов.Получить(i)
    print(f" * Resource: '{rf.ПутьКДанным}' -> Expression: '{rf.Выражение}'")
