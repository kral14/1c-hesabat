# -*- coding: utf-8 -*-
import time
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')

t0 = time.time()
connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')
t1 = time.time()
print(f"İlkin 1C qoşulma vaxtı (Handshake): {t1 - t0:.2f} saniyə")

t2 = time.time()
q = conn.NewObject("Запрос")
q.Text = "ВЫБРАТЬ ПЕРВЫЕ 20 Т.Наименование ИЗ Справочник.Пользователи КАК Т"
res = q.Execute().Choose()
while res.Next():
    pass
t3 = time.time()
print(f"Hazır qoşulma üzərindən sorğu vaxtı: {t3 - t2:.3f} saniyə!")
