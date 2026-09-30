import win32com.client, pythoncom, sys
sys.stdout.reconfigure(encoding='utf-8')

pythoncom.CoInitialize()
conn = win32com.client.Dispatch("V83.COMConnector").Connect('Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";')

# Search for settings registers
found_regs = []
for reg in conn.Метаданные.РегистрыСведений:
    name = reg.Имя
    if "настройк" in name.lower() or "вариант" in name.lower():
        found_regs.append(name)

print("Found settings information registers in 1C:", found_regs)

# Search for report variants or settings in report metadata
rep_md = conn.Метаданные.Отчеты.ВедомостьТоварыНаСкладах
print("Report metadata:", rep_md.Имя)
