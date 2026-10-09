import win32com.client, pythoncom, re, sys
sys.stdout.reconfigure(encoding='utf-8')

pythoncom.CoInitialize()
conn = win32com.client.Dispatch("V83.COMConnector").Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

f_val = "01 MONDELEZ; 07 JACOBS"
n_parts = [w.strip() for w in re.split(r'[;,]', f_val) if w.strip()]
print("Parsed nom parts:", n_parts)

sub_p = []
q = conn.NewObject("Запрос")
p_idx = 0

for part in n_parts:
    try:
        q_chk = conn.NewObject("Запрос")
        q_chk.Text = """
        ВЫБРАТЬ ПЕРВЫЕ 1
            Т.Ссылка КАК Ref,
            Т.ЭтоГруппа КАК IsFolder
        ИЗ
            Справочник.Номенклатура КАК Т
        ГДЕ
            Т.ЭтоГруппа И (Т.Наименование ПОДОБНО &PName ИЛИ Т.Код ПОДОБНО &PName)
        """
        q_chk.SetParameter("PName", f"%{part}%")
        r_chk = q_chk.Execute().Choose()
        if r_chk.Next():
            p_name = f"NomHier_{p_idx}"
            p_idx += 1
            sub_p.append(f"Т.Номенклатура В ИЕРАРХИИ (&{p_name})")
            q.SetParameter(p_name, r_chk.Ref)
        else:
            p_name = f"NomParam_{p_idx}"
            p_idx += 1
            sub_p.append(f"(Т.Номенклатура.Наименование = &{p_name} ИЛИ Т.Номенклатура.Код = &{p_name} ИЛИ Т.Номенклатура.Артикул = &{p_name})")
            q.SetParameter(p_name, part)
    except Exception as e:
        p_name = f"NomParam_{p_idx}"
        p_idx += 1
        sub_p.append(f"(Т.Номенклатура.Наименование = &{p_name} ИЛИ Т.Номенклатура.Код = &{p_name} ИЛИ Т.Номенклатура.Артикул = &{p_name})")
        q.SetParameter(p_name, part)

where_nom = "(" + " ИЛИ ".join(sub_p) + ")"
print("WHERE clause for Nom:", where_nom)

q.Text = f"""
ВЫБРАТЬ
    Т.Склад.Наименование КАК Warehouse,
    КОЛИЧЕСТВО(РАЗЛИЧНЫЕ Т.Номенклатура) КАК ItemCount,
    СУММА(Т.КоличествоКонечныйОстаток) КАК EndBal
ИЗ
    РегистрНакопления.ТоварыНаСкладах.ОстаткиИОбороты(ДАТАВРЕМЯ(2026, 9, 1), ДАТАВРЕМЯ(2026, 9, 30, 23, 59, 59), , , ) КАК Т
ГДЕ
    {where_nom}
СГРУППИРОВАТЬ ПО
    Т.Склад.Наименование
"""

res = q.Execute().Choose()
total_items = 0
while res.Next():
    print(f"Warehouse: {res.Warehouse} | Items: {res.ItemCount} | EndBal: {res.EndBal}")
    total_items += int(res.ItemCount)

print("TOTAL Items returned for 01 MONDELEZ & 07 JACOBS:", total_items)
