import win32com.client, pythoncom, json

pythoncom.CoInitialize()
connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

# 1. Search all Reports in 1C
reports = []
for i in range(conn.Метаданные.Отчеты.Количество()):
    md = conn.Метаданные.Отчеты.Получить(i)
    name = md.Имя
    syn = md.Синоним
    if any(w in name.lower() or w in syn.lower() for w in ["склад", "универсальн", "остат"]):
        reports.append((name, syn))

print("Matching reports in 1C:", reports)

# 2. Check if there are Makety (templates) like DCS (СхемаКомпоновкиДанных) for Universal Report or ТоварыНаСкладах
dcs_info = []
for rep_name, _ in reports:
    try:
        md_rep = conn.Метаданные.Отчеты.Найти(rep_name)
        if md_rep:
            for j in range(md_rep.Макеты.Количество()):
                m = md_rep.Макеты.Получить(j)
                dcs_info.append((rep_name, m.Имя, m.Синоним))
    except Exception as e:
        pass

print("Report templates (Makety):", dcs_info)

# 3. Check what happens when a warehouse is filtered in TovaryNaSkladakh
# Let's test filtering one warehouse, e.g. "Anbar Gəncə"
q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ
    Т.Склад.Наименование КАК Wh,
    КОЛИЧЕСТВО(РАЗЛИЧНЫЕ Т.Номенклатура) КАК ItemCount,
    СУММА(Т.КоличествоКонечныйОстаток) КАК EndBal
ИЗ
    РегистрНакопления.ТоварыНаСкладах.ОстаткиИОбороты(ДАТАВРЕМЯ(2026, 9, 1), ДАТАВРЕМЯ(2026, 9, 30, 23, 59, 59), Авто, , ) КАК Т
СГРУППИРОВАТЬ ПО
    Т.Склад.Наименование
УПОРЯДОЧИТЬ ПО
    Wh
"""
res = q.Execute().Choose()
wh_stats = []
while res.Next():
    wh_stats.append({
        "wh": str(res.Wh),
        "items": int(res.ItemCount),
        "bal": float(res.EndBal or 0)
    })

print(f"Total warehouses with balances: {len(wh_stats)}")
with open("wh_schema_investigation.json", "w", encoding="utf-8") as f:
    json.dump({
        "reports": reports,
        "dcs_info": dcs_info,
        "wh_stats": wh_stats
    }, f, ensure_ascii=False, indent=2)

print("Saved wh_schema_investigation.json successfully!")
