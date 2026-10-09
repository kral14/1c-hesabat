import win32com.client, pythoncom, json

pythoncom.CoInitialize()
connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

# 1. Check if Справочник.Склады has hierarchy (ЭтоГруппа)
md_wh = conn.Метаданные.Справочники.Склады
print("Склады Hierarchical:", md_wh.Иерархический)

# 2. Check all warehouses in Справочник.Склады
q_wh = conn.NewObject("Запрос")
q_wh.Text = """
ВЫБРАТЬ
    Т.Ссылка КАК Ref,
    Т.Код КАК Code,
    Т.Наименование КАК Name,
    Т.ЭтоГруппа КАК IsFolder
ИЗ
    Справочник.Склады КАК Т
ГДЕ
    НЕ Т.ПометкаУдаления
УПОРЯДОЧИТЬ ПО
    Name
"""
res_wh = q_wh.Execute().Choose()
all_whs = []
while res_wh.Next():
    all_whs.append({
        "name": str(res_wh.Name).strip(),
        "code": str(res_wh.Code).strip(),
        "is_folder": bool(res_wh.IsFolder)
    })

print(f"Total warehouses: {len(all_whs)}")
folders_wh = [w for w in all_whs if w["is_folder"]]
print(f"Total warehouse folders count: {len(folders_wh)}")

# 3. Test multiple warehouse filter with semicolon: 'Anbar Gəncə; Anbar Müvəqqəti Gəncə'
wh_list_test = ["Anbar Gəncə", "Anbar Müvəqqəti Gəncə"]
q_test = conn.NewObject("Запрос")
q_test.Text = """
ВЫБРАТЬ
    Т.Склад.Наименование КАК Wh,
    КОЛИЧЕСТВО(РАЗЛИЧНЫЕ Т.Номенклатура) КАК ItemCount,
    СУММА(Т.КоличествоКонечныйОстаток) КАК EndBal
ИЗ
    РегистрНакопления.ТоварыНаСкладах.ОстаткиИОбороты(ДАТАВРЕМЯ(2026, 9, 1), ДАТАВРЕМЯ(2026, 9, 30, 23, 59, 59), Авто, , ) КАК Т
ГДЕ
    Т.Склад.Наименование В (&WhList)
СГРУППИРОВАТЬ ПО
    Т.Склад.Наименование
"""
# Test passing Array or СписокЗначений to &WhList
vt_list = conn.NewObject("СписокЗначений")
for w in wh_list_test:
    vt_list.Добавить(w)

q_test.SetParameter("WhList", vt_list)
res_test = q_test.Execute().Choose()
test_results = []
while res_test.Next():
    test_results.append((str(res_test.Wh), int(res_test.ItemCount), float(res_test.EndBal or 0)))

with open("wh_multi_test.json", "w", encoding="utf-8") as f:
    json.dump({
        "all_whs": all_whs,
        "test_results": test_results
    }, f, ensure_ascii=False, indent=2)

print("Saved wh_multi_test.json successfully!")
