# -*- coding: utf-8 -*-
import sys
import win32com.client

sys.stdout.reconfigure(encoding="utf-8")
conn = win32com.client.Dispatch("V83.COMConnector").Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

q = conn.NewObject("Запрос")
q.SetParameter("Parent", "MDLZ_DIROL")
q.Text = """
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
res = q.Execute().Choose()
items = []
while res.Next():
    items.append((str(res.Code), str(res.Name), bool(res.IsFolder)))

print("Items and groups under MDLZ_DIROL:", len(items))
for it in items:
    print(f"  {'[GROUP]' if it[2] else '[ITEM]'} {it[0]} - {it[1]}")
