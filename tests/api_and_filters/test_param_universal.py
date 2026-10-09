# -*- coding: utf-8 -*-
import win32com.client
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')
c = win32com.client.Dispatch('V83.COMConnector').Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')

def run_universal_sales(c, d1, d2, kontragent="", agent="", nomenklatura="", portfolio="", limit=100):
    query = c.NewObject("Запрос")
    
    where_clauses = ["ПродажиОбороты.КоличествоОборот <> 0"]
    
    if kontragent:
        where_clauses.append('ПродажиОбороты.Контрагент.Наименование ПОДОБНО &KontragentPattern')
        query.УстановитьПараметр("KontragentPattern", f"%{kontragent}%")
        
    if agent:
        where_clauses.append('ПродажиОбороты.ДоговорКонтрагента.Агент.Наименование ПОДОБНО &AgentPattern')
        query.УстановитьПараметр("AgentPattern", f"%{agent}%")
        
    if nomenklatura:
        where_clauses.append('(ПродажиОбороты.Номенклатура.Наименование ПОДОБНО &NomPattern ИЛИ ПродажиОбороты.Номенклатура.Артикул ПОДОБНО &NomPattern)')
        query.УстановитьПараметр("NomPattern", f"%{nomenklatura}%")
        
    if portfolio:
        where_clauses.append('ПродажиОбороты.ДоговорКонтрагента.Портфель.Наименование ПОДОБНО &PortPattern')
        query.УстановитьПараметр("PortPattern", f"%{portfolio}%")
        
    where_sql = " AND ".join(where_clauses)
    
    limit_sql = f"ПЕРВЫЕ {limit}" if limit else ""
    
    sql = f"""
    ВЫБРАТЬ {limit_sql}
        ПродажиОбороты.Контрагент КАК Kontragent,
        ПродажиОбороты.Контрагент.Код КАК KontragentCode,
        ПродажиОбороты.ДоговорКонтрагента.Агент КАК Agent,
        ПродажиОбороты.ДоговорКонтрагента.Портфель КАК Portfolio,
        ПродажиОбороты.Номенклатура КАК Nomenklatura,
        ПродажиОбороты.Номенклатура.Артикул КАК Artikul,
        ПродажиОбороты.КоличествоОборот КАК Qty,
        ВЫБОР 
            КОГДА ПродажиОбороты.КоличествоОборот <> 0 
                ТОГДА ПродажиОбороты.СтоимостьБезСкидокОборот / ПродажиОбороты.КоличествоОборот 
            ИНАЧЕ 0 
        КОНЕЦ КАК UnitPrice,
        ПродажиОбороты.СтоимостьБезСкидокОборот КАК SumGross,
        ПродажиОбороты.СтоимостьБезСкидокОборот - ПродажиОбороты.СтоимостьОборот КАК SumDiscount,
        ВЫБОР 
            КОГДА ПродажиОбороты.СтоимостьБезСкидокОборот <> 0 
                ТОГДА (ПродажиОбороты.СтоимостьБезСкидокОборот - ПродажиОбороты.СтоимостьОборот) / ПродажиОбороты.СтоимостьБезСкидокОборот * 100 
            ИНАЧЕ 0 
        КОНЕЦ КАК PctDiscount,
        ПродажиОбороты.СтоимостьОборот КАК SumNet
    ИЗ
        РегистрНакопления.Продажи.Обороты(&НачалоПериода, &КонецПериода, Авто, ) КАК ПродажиОбороты
    ГДЕ
        {where_sql}
    УПОРЯДОЧИТЬ ПО
        Kontragent,
        Nomenklatura
    """
    
    query.Текст = sql
    query.УстановитьПараметр("НачалоПериода", d1)
    query.УстановитьПараметр("КонецПериода", d2)
    
    res = query.Выполнить().Выгрузить()
    print(f"Query returned {res.Количество()} rows for agent='{agent}', kontragent='{kontragent}'")
    return res

d1 = datetime(2026, 9, 1, 4, 0, 0)
d2 = datetime(2026, 9, 28, 23, 59, 59)
res = run_universal_sales(c, d1, d2, agent="САФАР", limit=5)
for i in range(res.Количество()):
    row = res.Получить(i)
    print(f"{i+1}. {row.Kontragent.Наименование} | {row.Nomenklatura.Наименование} | Say: {row.Qty} | Qiymət: {round(float(row.UnitPrice), 2)} | Toplam: {round(float(row.SumGross), 2)} | Endirim: {round(float(row.SumDiscount), 2)} ({round(float(row.PctDiscount), 1)}%) | Net: {round(float(row.SumNet), 2)}")
