# -*- coding: utf-8 -*-
import time
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

# Test Query 1 (current slow query)
t0 = time.time()
q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ РАЗЛИЧНЫЕ
    Т.Ссылка.Наименование КАК SettingName,
    Т.Ссылка.НастраиваемыйОбъект КАК ObjectName,
    Т.Ссылка.Описание КАК Description,
    Т.Пользователь.Наименование КАК UserName
ИЗ
    Справочник.СохраненныеНастройки.Пользователи КАК Т
ГДЕ
    (Т.Пользователь.Наименование ПОДОБНО "%Nesib%"
     ИЛИ Т.Пользователь.Код ПОДОБНО "%Nesib%")
"""
res = q.Execute().Choose()
while res.Next(): pass
t1 = time.time()
print(f"Query 1 (through tabular section with dots): {t1 - t0:.2f} s")

# Test Query 2 (Optimized: Find user ref first, then query by user ref without joins!)
t2 = time.time()
q_u = conn.NewObject("Запрос")
q_u.Text = "ВЫБРАТЬ Ссылка ИЗ Справочник.Пользователи ГДЕ Код = 'Nesib' ИЛИ Наименование ПОДОБНО '%Nesib%'"
u_res = q_u.Execute().Choose()
u_ref = None
if u_res.Next():
    u_ref = u_res.Ссылка

q2 = conn.NewObject("Запрос")
q2.Text = """
ВЫБРАТЬ
    Т.Ссылка.Наименование КАК SettingName,
    Т.Ссылка.НастраиваемыйОбъект КАК ObjectName
ИЗ
    Справочник.СохраненныеНастройки.Пользователи КАК Т
ГДЕ
    Т.Пользователь = &UserRef
"""
q2.УстановитьПараметр("UserRef", u_ref)
res2 = q2.Execute().Choose()
while res2.Next(): pass
t3 = time.time()
print(f"Query 2 (Direct User Ref index lookup): {t3 - t2:.2f} s")
