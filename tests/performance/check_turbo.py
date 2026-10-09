# -*- coding: utf-8 -*-
import sys
import win32com.client

sys.stdout.reconfigure(encoding="utf-8")
conn = win32com.client.Dispatch("V83.COMConnector").Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ
    Т.Код КАК Code,
    Т.Наименование КАК Name,
    Т.Родитель.Наименование КАК ParentName,
    Т.Родитель.Родитель.Наименование КАК GrandParent
ИЗ
    Справочник.Номенклатура КАК Т
ГДЕ
    НЕ Т.ПометкаУдаления
    И (Т.Код = "MDL4861516" ИЛИ Т.Наименование ПОДОБНО "%DIROL TURBO%")
"""
res = q.Execute().Choose()
while res.Next():
    print(f"Code: {res.Code} | Name: {res.Name} | Parent: {res.ParentName} | GrandParent: {res.GrandParent}")

# Now check all items in that parent
q2 = conn.NewObject("Запрос")
q2.SetParameter("Parent", "Turbo")
q2.Text = """
ВЫБРАТЬ
    Т.Код КАК Code,
    Т.Наименование КАК Name,
    Т.ЭтоГруппа КАК IsFolder
ИЗ
    Справочник.Номенклатура КАК Т
ГДЕ
    НЕ Т.ПометкаУдаления
    И Т.Родитель.Наименование = &Parent
"""
res2 = q2.Execute().Choose()
items_in_turbo = []
while res2.Next():
    items_in_turbo.append((str(res2.Code), str(res2.Name), bool(res2.IsFolder)))

print(f"\nTotal items in Turbo folder: {len(items_in_turbo)}")
for it in items_in_turbo:
    print(f"  {it[0]} - {it[1]} (is_folder={it[2]})")
