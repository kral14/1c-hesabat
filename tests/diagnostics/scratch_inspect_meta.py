import win32com.client

conn_str = 'Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";'
v8 = win32com.client.Dispatch('V83.COMConnector')
conn = v8.Connect(conn_str)

lines = []
lines.append("=== KONTRAGENT REKVIZITY ===")
for a in conn.Метаданные.Справочники.Контрагенты.Реквизиты:
    lines.append(f"{a.Имя} ({a.Синоним})")

lines.append("\n=== KONTRAGENT STD REKVIZITY ===")
for a in conn.Метаданные.Справочники.Контрагенты.СтандартныеРеквизиты:
    lines.append(f"{a.Имя} ({a.Синоним})")

lines.append("\n=== DOGOVORY REKVIZITY ===")
for a in conn.Метаданные.Справочники.ДоговорыКонтрагентов.Реквизиты:
    lines.append(f"{a.Имя} ({a.Синоним})")

lines.append("\n=== REALIZ REKVIZITY ===")
for a in conn.Метаданные.Документы.РеализацияТоваровУслуг.Реквизиты:
    lines.append(f"{a.Имя} ({a.Синоним})")

lines.append("\n=== VOZVRAT REKVIZITY ===")
for a in conn.Метаданные.Документы.ВозвратТоваровОтПокупателя.Реквизиты:
    lines.append(f"{a.Имя} ({a.Синоним})")

# Sample query to inspect a Kontragent record with parent / golovnoy
q = conn.NewObject("Запрос")
q.Text = """
ВЫБРАТЬ ПЕРВЫЕ 5
    К.Ссылка КАК Ref,
    К.Наименование КАК Name,
    К.Код КАК Code,
    К.Родитель.Наименование КАК ParentName,
    К.ГоловнойКонтрагент.Наименование КАК GolovnoyName
ИЗ
    Справочник.Контрагенты КАК К
ГДЕ
    НЕ К.ЭтоГруппа
"""
try:
    res = q.Execute().Choose()
    lines.append("\n=== SAMPLE KONTRAGENTS ===")
    while res.Next():
        lines.append(f"Name: {res.Name}, Parent: {res.ParentName}, Golovnoy: {res.GolovnoyName}")
except Exception as e:
    lines.append(f"\nQUERY ERROR with Golovnoy: {e}")

# Sample query for Realization Agent
q_ag = conn.NewObject("Запрос")
q_ag.Text = """
ВЫБРАТЬ ПЕРВЫЕ 5
    Р.Номер КАК DocNum,
    Р.Контрагент.Наименование КАК Client,
    Р.ДоговорКонтрагента.Агент.Наименование КАК DogovorAgent,
    Р.Подразделение.Наименование КАК Podrazdelenie,
    Р.Ответственный.Наименование КАК Responsible
ИЗ
    Документ.РеализацияТоваровУслуг КАК Р
"""
try:
    res_ag = q_ag.Execute().Choose()
    lines.append("\n=== SAMPLE REALIZATION AGENT ===")
    while res_ag.Next():
        lines.append(f"Doc: {res_ag.DocNum}, Client: {res_ag.Client}, DogovorAgent: {res_ag.DogovorAgent}, Podraz: {res_ag.Podrazdelenie}, Resp: {res_ag.Responsible}")
except Exception as e:
    lines.append(f"\nREALIZ AGENT ERROR: {e}")

with open("meta_output.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print("DONE writing meta_output.txt")
