# -*- coding: utf-8 -*-
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')
c = win32com.client.Dispatch('V83.COMConnector')

conn_strings = [
    'Srvr="Test1C";Ref="Aztrade_test3";Usr="Nesib";Pwd="15963";',
    'Srvr="Test1C";Ref="Aztrade_test3";',
    'Srvr="Test1C";Ref="Aztrade_test3";Usr="Администратор";Pwd="";',
    'Srvr="Test1C";Ref="Ferrero_TestNEW";Usr="Nesib";Pwd="15963";'
]

for cs in conn_strings:
    try:
        print(f"\nTesting: {cs}")
        conn = c.Connect(cs)
        print(" -> SUCCESS!")
        print("User:", conn.ИмяПользователя())
        break
    except Exception as e:
        err = str(e)
        if "лицензи" in err.lower():
            print(" -> LICENSE ERROR:", err[:200])
        elif "идентификация" in err.lower() or "неправильное" in err.lower():
            print(" -> AUTH ERROR (License OK, bad credentials)")
        else:
            print(" -> ERROR:", err[:200])
