# -*- coding: utf-8 -*-
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')

connector = win32com.client.Dispatch("V83.COMConnector")
conn = connector.Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')
print("Connected to Test1C successfully!")

q = conn.NewObject("Запрос")
q.Text = "ВЫБРАТЬ ПЕРВЫЕ 10 Т.Наименование КАК Name, Т.Код КАК Code ИЗ Справочник.Пользователи КАК Т ГДЕ НЕ Т.ПометкаУдаления УПОРЯДОЧИТЬ ПО Name"
res = q.Execute().Choose()
print("Users from Справочник.Пользователи:")
while res.Next():
    print(f" - {res.Name} (Code: {res.Code})")
