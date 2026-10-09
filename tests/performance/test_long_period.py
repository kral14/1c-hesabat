# -*- coding: utf-8 -*-
import win32com.client
import sys
import datetime
import time

sys.stdout.reconfigure(encoding='utf-8')
c = win32com.client.Dispatch('V83.COMConnector').Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

print("=== 1. Testing Universal Sales Query for 6 Months (2026-03-01 to 2026-09-28) ===")
t0 = time.time()
q = c.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ ПЕРВЫЕ 10
    Продажи.Контрагент.Наименование КАК Kontragent,
    СУММА(Продажи.КоличествоОборот) КАК Qty,
    СУММА(Продажи.СтоимостьОборот) КАК SumNet
ИЗ
    РегистрНакопления.Продажи.Обороты(&D1, &D2, Авто, ) КАК Продажи
СГРУППИРОВАТЬ ПО
    Продажи.Контрагент.Наименование
"""
q.SetParameter("D1", datetime.datetime(2026, 3, 1, 4, 0, 0))
q.SetParameter("D2", datetime.datetime(2026, 9, 28, 23, 59, 59))
res = q.Execute().Choose()
print(f"Executed in {time.time() - t0:.2f} s. Rows:")
while res.Next():
    print(f" - {res.Kontragent}: {res.Qty} ədəd, {res.SumNet} AZN")

print("\n=== 2. Testing Direct Portfolio Calculation for 6 Months ===")
t0 = time.time()
q_calc = c.NewObject("Запрос")
q_calc.Text = """
ВЫБРАТЬ ПЕРВЫЕ 5
    Договоры.Портфель.Наименование КАК Portfolio,
    СУММА(Взаиморасчеты.СуммаВзаиморасчетовНачальныйОстаток) КАК НачОстаток,
    СУММА(Взаиморасчеты.СуммаВзаиморасчетовПриход) КАК Продажа,
    СУММА(Взаиморасчеты.СуммаВзаиморасчетовРасход) КАК Оплата,
    СУММА(Взаиморасчеты.СуммаВзаиморасчетовКонечныйОстаток) КАК КонОстаток
ИЗ
    РегистрНакопления.ВзаиморасчетыСКонтрагентами.ОстаткиИОбороты(
        &D1, &D2, Авто, , ДоговорКонтрагента.ВидДоговора = ЗНАЧЕНИЕ(Перечисление.ВидыДоговоровКонтрагентов.СПокупателем)
    ) КАК Взаиморасчеты
    ВНУТРЕННЕЕ СОЕДИНЕНИЕ Справочник.ДоговорыКонтрагентов КАК Договоры ПО Взаиморасчеты.ДоговорКонтрагента = Договоры.Ссылка
ГДЕ
    НЕ Договоры.Портфель ЕСТЬ NULL
СГРУППИРОВАТЬ ПО
    Договоры.Портфель.Наименование
"""
q_calc.SetParameter("D1", datetime.datetime(2026, 3, 1, 4, 0, 0))
q_calc.SetParameter("D2", datetime.datetime(2026, 9, 28, 23, 59, 59))
res = q_calc.Execute().Choose()
print(f"Portfolio calculation executed in {time.time() - t0:.2f} s. Rows:")
while res.Next():
    print(f" - {res.Portfolio}: Нач={res.НачОстаток}, Продажа={res.Продажа}, Оплата={res.Оплата}, Кон={res.КонОстаток}")
