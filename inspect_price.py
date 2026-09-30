import win32com.client

c = win32com.client.Dispatch("V83.COMConnector")
conn = c.Connect(r'Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')
meta = conn.Metadata

lines = []
has_cn = meta.InformationRegisters.Find("ЦеныНоменклатуры") is not None
lines.append(f"РегистрСведений.ЦеныНоменклатуры: {has_cn}")

has_types = meta.Catalogs.Find("ТипыЦенНоменклатуры") is not None
lines.append(f"Справочник.ТипыЦенНоменклатуры: {has_types}")

if has_types:
    q = conn.NewObject("Запрос")
    q.Text = "ВЫБРАТЬ Ссылка, Наименование ИЗ Справочник.ТипыЦенНоменклатуры"
    res = q.Execute().Choose()
    lines.append("\nAvailable Price Types (Типы цен):")
    while res.Next():
        lines.append(f"  - {res.Наименование}")

# Also check ПартииТоваровНаСкладах (cost price)
has_part = meta.AccumulationRegisters.Find("ПартииТоваровНаСкладах") is not None
lines.append(f"\nРегистрНакопления.ПартииТоваровНаСкладах: {has_part}")

# Also check sample price query from ЦеныНоменклатуры.СрезПоследних
if has_cn:
    q2 = conn.NewObject("Запрос")
    q2.Text = """
    ВЫБРАТЬ ПЕРВЫЕ 5
        Цены.Номенклатура.Наименование КАК Item,
        Цены.ТипЦен.Наименование КАК PriceType,
        Цены.Цена КАК Price,
        Цены.Валюта.Наименование КАК Valyuta
    ИЗ
        РегистрСведений.ЦеныНоменклатуры.СрезПоследних КАК Цены
    """
    try:
        r2 = q2.Execute().Choose()
        lines.append("\nSample Prices (ЦеныНоменклатуры.СрезПоследних):")
        while r2.Next():
            lines.append(f"  - Item: {r2.Item} | Type: {r2.PriceType} | Price: {r2.Price} {r2.Valyuta}")
    except Exception as ex:
        lines.append(f"Error querying ЦеныНоменклатуры: {ex}")

with open("price_analysis.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print("Price inspection complete!")
