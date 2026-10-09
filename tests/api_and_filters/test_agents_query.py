# -*- coding: utf-8 -*-
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')
c = win32com.client.Dispatch('V83.COMConnector').Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

q = c.NewObject("Запрос")
q.Текст = """
ВЫБРАТЬ РАЗЛИЧНЫЕ
    Договоры.Агент.Наименование КАК AgentName
ИЗ
    Справочник.ДоговорыКонтрагентов КАК Договоры
ГДЕ
    НЕ Договоры.Агент ЕСТЬ NULL 
    И Договоры.Агент <> ЗНАЧЕНИЕ(Справочник.ФизическиеЛица.ПустаяСсылка)
УПОРЯДОЧИТЬ ПО
    AgentName
"""
res = q.Выполнить().Выгрузить()
print(f"Total distinct agents: {res.Количество()}")
for i in range(min(10, res.Количество())):
    row = res.Получить(i)
    print(" - Agent:", row.AgentName)
