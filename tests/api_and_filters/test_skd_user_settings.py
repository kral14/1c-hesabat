# -*- coding: utf-8 -*-
import win32com.client
import sys
import datetime

sys.stdout.reconfigure(encoding='utf-8')
c = win32com.client.Dispatch('V83.COMConnector').Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

epf_path = r"C:\Users\nesib\.gemini\antigravity-ide\scratch\1c_reporter\epf_cache\sales_report.epf"
rep = c.ВнешниеОтчеты.Создать(epf_path)
schema = rep.СхемаКомпоновкиДанных

# Load setting gunay gundelik
q = c.NewObject("Запрос")
q.Text = 'ВЫБРАТЬ ПЕРВЫЕ 1 Т.Ссылка КАК Ref ИЗ Справочник.СохраненныеНастройки КАК Т ГДЕ Т.Наименование ПОДОБНО "%gunay gundelik%"'
res = q.Execute().Choose()
res.Next()
setting_ref = res.Ref

builder = c.NewObject("КомпоновщикНастроекКомпоновкиДанных")
builder.Инициализировать(c.NewObject("ИсточникДоступныхНастроекКомпоновкиДанных", schema))
loaded = c.ХранилищеНастроекКомпоновкиДанных.Загрузить(setting_ref)
builder.ЗагрузитьНастройки(loaded)

settings = builder.ПолучитьНастройки()

p_start = settings.ПараметрыДанных.Элементы.Найти("НачалоПериода")
print("Initial value type of НачалоПериода in settings:", type(p_start.Значение), p_start.Значение)

# Let's inspect builder.ПользовательскиеНастройки
u_settings = builder.ПользовательскиеНастройки
print(f"Total elements in ПользовательскиеНастройки: {u_settings.Элементы.Количество()}")
for i in range(u_settings.Элементы.Количество()):
    el = u_settings.Элементы.Получить(i)
    try:
        print(f" - [{i}] {el.Параметр}: val={el.Значение}, use={el.Использование}")
    except Exception:
        pass
