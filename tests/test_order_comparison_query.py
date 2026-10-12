# -*- coding: utf-8 -*-
import os
import sys
import datetime

app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, app_dir)

import pythoncom
import win32com.client

def test_query():
    print("Testing 1C Order vs Realization vs Return Query...")
    pythoncom.CoInitialize()
    connector = win32com.client.Dispatch("V83.COMConnector")
    conn = connector.Connect("Srvr=\"Test1C\";Ref=\"Aztrade_test3\";Usr=\"Nesib\";Pwd=\"15963\";")
    print("Connected to Test1C successfully!")

    # Check warehouse attribute in Vozvrat
    ret_attrs = set(str(a.Имя) for a in conn.Метаданные.Документы.ВозвратТоваровОтПокупателя.Реквизиты)
    wh_ret = "Возвр.Ссылка.Склад" if "Склад" in ret_attrs else ("Возвр.Ссылка.СкладОрдер" if "СкладОрдер" in ret_attrs else "ЗНАЧЕНИЕ(Справочник.Склады.ПустаяСсылка)")
    print(f"Vozvrat warehouse attribute: {wh_ret}")

    query = conn.NewObject("Запрос")
    dt_from = datetime.datetime(2026, 8, 1, 0, 0, 0)
    dt_to = datetime.datetime(2026, 9, 30, 23, 59, 59)
    query.SetParameter("DateFrom", dt_from)
    query.SetParameter("DateTo", dt_to)

    query.Text = f"""
    ВЫБРАТЬ
        НАЧАЛОПЕРИОДА(Заказ.Ссылка.Дата, ДЕНЬ) КАК DocDate,
        Заказ.Ссылка.ДоговорКонтрагента.Портфель КАК Portfolio,
        Заказ.Ссылка.ДоговорКонтрагента.Агент КАК Agent,
        Заказ.Ссылка.СкладГруппа КАК Warehouse,
        Заказ.Ссылка.Контрагент КАК Kontragent,
        Заказ.Номенклатура КАК Item,
        Заказ.Количество КАК QtyOrder,
        Заказ.Сумма КАК SumOrder,
        0 КАК QtyReal,
        0 КАК SumReal,
        0 КАК QtyRet,
        0 КАК SumRet
    ПОМЕСТИТЬ ИсходныеДанные
    ИЗ
        Документ.ЗаказПокупателя.Товары КАК Заказ
    ГДЕ
        Заказ.Ссылка.ПометкаУдаления = ЛОЖЬ
        И Заказ.Ссылка.Дата МЕЖДУ &DateFrom И &DateTo

    ОБЪЕДИНИТЬ ВСЕ

    ВЫБРАТЬ
        НАЧАЛОПЕРИОДА(Реал.Ссылка.Дата, ДЕНЬ),
        Реал.Ссылка.ДоговорКонтрагента.Портфель,
        Реал.Ссылка.ДоговорКонтрагента.Агент,
        Реал.Ссылка.Склад,
        Реал.Ссылка.Контрагент,
        Реал.Номенклатура,
        0,
        0,
        Реал.Количество,
        Реал.Сумма,
        0,
        0
    ИЗ
        Документ.РеализацияТоваровУслуг.Товары КАК Реал
    ГДЕ
        Реал.Ссылка.ПометкаУдаления = ЛОЖЬ
        И Реал.Ссылка.Дата МЕЖДУ &DateFrom И &DateTo

    ОБЪЕДИНИТЬ ВСЕ

    ВЫБРАТЬ
        НАЧАЛОПЕРИОДА(Возвр.Ссылка.Дата, ДЕНЬ),
        Возвр.Ссылка.ДоговорКонтрагента.Портфель,
        Возвр.Ссылка.ДоговорКонтрагента.Агент,
        {wh_ret},
        Возвр.Ссылка.Контрагент,
        Возвр.Номенклатура,
        0,
        0,
        0,
        0,
        Возвр.Количество,
        Возвр.Сумма
    ИЗ
        Документ.ВозвратТоваровОтПокупателя.Товары КАК Возвр
    ГДЕ
        Возвр.Ссылка.ПометкаУдаления = ЛОЖЬ
        И Возвр.Ссылка.Дата МЕЖДУ &DateFrom И &DateTo
    ;

    ////////////////////////////////////////////////////////////////////////////////
    ВЫБРАТЬ
        Д.Kontragent.Наименование КАК KontragentName,
        Д.Kontragent.Код КАК KontragentCode,
        Д.Item.Наименование КАК ItemName,
        Д.Item.Код КАК ItemCode,
        Д.Item.Артикул КАК ItemArticle,
        ЕСТЬNULL(ШтрихкодТаб.Штрихкод, "") КАК Barcode,
        ЕСТЬNULL(Д.Item.БазоваяЕдиницаИзмерения.Наименование, "əd") КАК Unit,
        СУММА(Д.QtyOrder) КАК QtyOrder,
        СУММА(Д.SumOrder) КАК SumOrder,
        СУММА(Д.QtyReal) КАК QtyReal,
        СУММА(Д.SumReal) КАК SumReal,
        СУММА(Д.QtyRet) КАК QtyRet,
        СУММА(Д.SumRet) КАК SumRet,
        СУММА(Д.QtyOrder) - СУММА(Д.QtyReal) КАК QtyDiff,
        СУММА(Д.QtyReal) - СУММА(Д.QtyRet) КАК QtyNet,
        СУММА(Д.SumReal) - СУММА(Д.SumRet) КАК SumNet
    ИЗ
        ИсходныеДанные КАК Д
        ЛЕВОЕ СОЕДИНЕНИЕ (
            ВЫБРАТЬ
                Ш.Владелец КАК ItemRef,
                МАКСИМУМ(Ш.Штрихкод) КАК Штрихкод
            ИЗ
                РегистрСведений.Штрихкоды КАК Ш
            СГРУППИРОВАТЬ ПО
                Ш.Владелец
        ) КАК ШтрихкодТаб
        ПО Д.Item = ШтрихкодТаб.ItemRef
    СГРУППИРОВАТЬ ПО
        Д.Kontragent.Наименование,
        Д.Kontragent.Код,
        Д.Item.Наименование,
        Д.Item.Код,
        Д.Item.Артикул,
        ШтрихкодТаб.Штрихкод,
        Д.Item.БазоваяЕдиницаИзмерения.Наименование
    ИТОГИ
        МАКСИМУМ(KontragentCode),
        МАКСИМУМ(ItemCode),
        МАКСИМУМ(ItemArticle),
        МАКСИМУМ(Barcode),
        МАКСИМУМ(Unit),
        СУММА(QtyOrder),
        СУММА(SumOrder),
        СУММА(QtyReal),
        СУММА(SumReal),
        СУММА(QtyRet),
        СУММА(SumRet),
        СУММА(QtyDiff),
        СУММА(QtyNet),
        СУММА(SumNet)
    ПО
        ОБЩИЕ,
        KontragentName,
        ItemName
    """

    res = query.Выполнить()
    print("Query executed successfully without any errors!")
    sel = res.Выбрать(conn.ОбходРезультатаЗапроса.ПоГруппировкам)
    if sel.Следующий():
        print(f"Grand Totals -> QtyOrder: {sel.QtyOrder}, QtyReal: {sel.QtyReal}, QtyDiff: {sel.QtyDiff}, QtyRet: {sel.QtyRet}, QtyNet: {sel.QtyNet}")
        sel_k = sel.Выбрать(conn.ОбходРезультатаЗапроса.ПоГруппировкам)
        count = 0
        while sel_k.Следующий():
            count += 1
            if count <= 2:
                print(f"  Store: {sel_k.KontragentName} (Code: {sel_k.KontragentCode}) | Order: {sel_k.QtyOrder}")
                sel_item = sel_k.Выбрать(conn.ОбходРезультатаЗапроса.ПоГруппировкам)
                i_count = 0
                while sel_item.Следующий():
                    i_count += 1
                    if i_count <= 2:
                        print(f"    Item: {sel_item.ItemName} | Code: {sel_item.ItemCode} | Article: {sel_item.ItemArticle} | Barcode: {sel_item.Barcode} | Unit: {sel_item.Unit}")
        print(f"Total Stores found: {count}")

if __name__ == "__main__":
    test_query()
