# -*- coding: utf-8 -*-
import win32com.client
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch('V83.COMConnector')
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

# Find binary for Ведомость по остаткам и движению товаров КОР БЛ ШТ
q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ
    Т.Наименование КАК Name,
    Т.ХранилищеВнешнейОбработки КАК Bin
ИЗ
    Справочник.ВнешниеОбработки КАК Т
ГДЕ
    Т.Наименование ПОДОБНО "%Ведомость по остаткам и движению товаров%"
    ИЛИ Т.Наименование = "Товары на складах"
"""
res = q.Execute().Choose()
while res.Next():
    print(f"Report: {res.Name}")
    try:
        bin_data = res.Bin.Получить()
        p = os.path.join(r"C:\Users\nesib\.gemini\antigravity-ide\scratch\1c_reporter", "temp_wh.epf")
        bin_data.Записать(p)
        wh_rep = conn.ВнешниеОтчеты.Создать(p)
        meta = wh_rep.Метаданные()
        print(f" -> Internal name: '{meta.Имя}', Synonym: '{meta.Синоним}'")
        try:
            schema = wh_rep.СхемаКомпоновкиДанных
            print(" -> Has СКД!")
        except:
            print(" -> Uses UniversalReport or Form")
    except Exception as e:
        print(f" -> Error: {e}")
