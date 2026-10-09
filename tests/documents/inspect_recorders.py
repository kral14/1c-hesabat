# -*- coding: utf-8 -*-
import win32com.client

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

reg_md = conn.Metadata.AccumulationRegisters.Find("ТоварыНаСкладах")
print(f"Register: {reg_md.Name}")
print("Recorders (Регистраторы):")
recorders = getattr(reg_md, "Recorders", None) or getattr(reg_md, "Registrator", None) or getattr(reg_md, "Регистраторы", None)
if recorders is not None:
    print(f"Recorders count: {recorders.Count()}")
    for i in range(recorders.Count()):
        doc_md = recorders.Get(i)
        print(f" - {doc_md.Name}")
else:
    print("Trying query on distinct document types in register...")
    q = conn.NewObject("Запрос")
    q.Text = "ВЫБРАТЬ РАЗЛИЧНЫЕ ТИПЗНАЧЕНИЯ(Т.Регистратор) КАК DocType ИЗ РегистрНакопления.ТоварыНаСкладах КАК Т"
    res = q.Execute().Choose()
    while res.Next():
        print(f" - {res.DocType}")

conn = None
connector = None
