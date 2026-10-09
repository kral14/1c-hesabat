# -*- coding: utf-8 -*-
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')
c = win32com.client.Dispatch('V83.COMConnector').Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

reg = c.Метаданные.РегистрыНакопления.Продажи
print("=== РегистрНакопления.Продажи ===")
print("--- Dimensions (Измерения): ---")
for i in range(reg.Измерения.Количество()):
    dim = reg.Измерения.Получить(i)
    print(f"  {dim.Имя}: {dim.Синоним}")

print("\n--- Resources (Ресурсы): ---")
for i in range(reg.Ресурсы.Количество()):
    res = reg.Ресурсы.Получить(i)
    print(f"  {res.Имя}: {res.Синоним}")

print("\n--- Attributes (Реквизиты): ---")
for i in range(reg.Реквизиты.Количество()):
    attr = reg.Реквизиты.Получить(i)
    print(f"  {attr.Имя}: {attr.Синоним}")

# Also check Document РеализацияТоваровУслуг табличная часть Товары
doc = c.Метаданные.Документы.РеализацияТоваровУслуг
print("\n=== Документ.РеализацияТоваровУслуг.Товары Реквизиты ===")
for i in range(doc.ТабличныеЧасти.Товары.Реквизиты.Количество()):
    col = doc.ТабличныеЧасти.Товары.Реквизиты.Получить(i)
    print(f"  {col.Имя}: {col.Синоним}")
