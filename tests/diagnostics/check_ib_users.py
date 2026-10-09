# -*- coding: utf-8 -*-
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

ib_users = conn.ПользователиИнформационнойБазы.ПолучитьПользователей()
print(f"Total IB users: {ib_users.Количество()}")
found = []
for i in range(ib_users.Количество()):
    u = ib_users.Получить(i)
    name = str(u.Имя)
    full_name = str(u.ПолноеИмя)
    if any(k in (name + " " + full_name).lower() for k in ["nesib", "nasib", "keleshov"]):
        print(f"Login (Имя): '{name}' | Full: '{full_name}'")
