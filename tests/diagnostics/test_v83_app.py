# -*- coding: utf-8 -*-
import win32com.client
import sys

sys.stdout.reconfigure(encoding='utf-8')

print("Testing V83.Application with WA (Windows Authentication)...")
try:
    v8 = win32com.client.Dispatch("V83.Application")
    # Init with hidden window
    v8.Visible = False
    connected = v8.Connect('Srvr="Test1C";Ref="Aztrade_test3";')
    print("V83.Application Connect result:", connected)
    if connected:
        print("Logged in as:", v8.UserName())
        v8.Exit(False)
except Exception as e:
    print("V83.Application error:", e)
