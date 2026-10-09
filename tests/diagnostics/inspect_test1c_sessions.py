"""Read-only administration inventory restricted to Aztrade_test3 on Test1C."""
import json
import sys
import gc
import pythoncom
import win32com.client

sys.stdout.reconfigure(encoding='utf-8')
pythoncom.CoInitialize()
connector = agent = None
cluster = base = session = None
cleanup = '--cleanup-detached' in sys.argv
failed = False
try:
    connector = win32com.client.Dispatch('V83.COMConnector')
    agent = connector.ConnectAgent('Test1C:1540')
    found = False
    for cluster in agent.GetClusters():
        agent.Authenticate(cluster, '', '')
        for base in agent.GetInfoBases(cluster):
            if str(base.Name).lower() != 'aztrade_test3':
                continue
            found = True
            print('Target: Test1C / Aztrade_test3', flush=True)
            for session in agent.GetInfoBaseSessions(cluster, base):
                if cleanup:
                    if (int(session.SessionID) in {13, 14, 15}
                            and str(session.UserName) == 'Nesib'
                            and str(session.AppID) == 'COMConnection'
                            and str(session.Host).upper() == 'COMP-5'
                            and session.Connection is None):
                        agent.TerminateSession(cluster, session)
                        print('Terminated detached test session ' + str(session.SessionID), flush=True)
                    continue
                row = {}
                for field in ['SessionID', 'UserName', 'AppID', 'Host', 'StartedAt',
                              'LastActiveAt', 'Hibernate', 'Connection']:
                    try:
                        row[field] = str(getattr(session, field))
                    except Exception:
                        row[field] = '(unavailable)'
                print(json.dumps(row, ensure_ascii=False), flush=True)
    if not found:
        print('Target database was not found in the administration inventory.')
except Exception as exc:
    print('Administration access failed: ' + str(exc), flush=True)
    failed = True
finally:
    session = base = cluster = None
    agent = connector = None
    gc.collect()
    pythoncom.CoUninitialize()
sys.exit(1 if failed else 0)
