"""Read-only list of existing sessions in the authorized test infobase."""
import sys
import gc
import json
import pythoncom
import win32com.client

sys.stdout.reconfigure(encoding='utf-8')
pythoncom.CoInitialize()
connector = agent = cluster = base = session = None
try:
    connector = win32com.client.Dispatch('V83.COMConnector')
    agent = connector.ConnectAgent('Test1C:1540')
    found = False
    for cluster in agent.GetClusters():
        agent.Authenticate(cluster, '', '')
        for base in agent.GetInfoBases(cluster):
            if str(base.Name).casefold() != 'aztrade_test3':
                continue
            found = True
            print('Test1C / Aztrade_test3', flush=True)
            for session in agent.GetInfoBaseSessions(cluster, base):
                print(json.dumps({field: str(getattr(session, field)) for field in
                    ('SessionID', 'UserName', 'AppID', 'Host', 'StartedAt', 'LastActiveAt')}, ensure_ascii=False), flush=True)
    if not found:
        print('Test infobase not found')
finally:
    session = base = cluster = agent = connector = None
    gc.collect()
    pythoncom.CoUninitialize()
