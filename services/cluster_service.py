# -*- coding: utf-8 -*-
"""
1C Cluster Administration Service.
Directly connects to 1C Cluster Agent (ragent port 1540) via V83.COMConnector.
DOES NOT consume a client license.
Allows listing active sessions and terminating hanging/detached sessions.
"""
import sys
import gc
import datetime
import pythoncom
import win32com.client

CLUSTER_HOST = "Test1C:1540"

def get_cluster_sessions(server_agent="Test1C:1540", target_base="aztrade_test3"):
    """
    Returns list of active sessions in the specified infobase.
    Does not consume a 1C client license.
    """
    pythoncom.CoInitialize()
    sessions = []
    connector = None
    agent = None
    try:
        connector = win32com.client.Dispatch("V83.COMConnector")
        agent = connector.ConnectAgent(server_agent)
        for cluster in agent.GetClusters():
            try:
                agent.Authenticate(cluster, "", "")
            except Exception:
                pass
            for base in agent.GetInfoBases(cluster):
                if str(base.Name).lower() != target_base.lower():
                    continue
                for s in agent.GetInfoBaseSessions(cluster, base):
                    is_hanging = (s.Connection is None)
                    s_id = str(getattr(s, "SessionID", ""))
                    u_name = str(getattr(s, "UserName", ""))
                    app_id = str(getattr(s, "AppID", ""))
                    host_name = str(getattr(s, "Host", ""))
                    started_at = str(getattr(s, "StartedAt", ""))
                    last_active = str(getattr(s, "LastActiveAt", ""))
                    conn_str = str(getattr(s, "Connection", ""))

                    sessions.append({
                        "session_id": s_id,
                        "user_name": u_name,
                        "app_id": app_id,
                        "host": host_name,
                        "started_at": started_at,
                        "last_active": last_active,
                        "is_hanging": is_hanging,
                        "connection": conn_str
                    })
    except Exception as e:
        print(f"[CLUSTER SERVICE] Sessiyalari oxumaq alinmadi: {e}", flush=True)
    finally:
        agent = None
        connector = None
        gc.collect()
        pythoncom.CoUninitialize()
    return sessions

def terminate_cluster_session(session_id, server_agent="Test1C:1540", target_base="aztrade_test3"):
    """
    Terminates a specific session by its session_id.
    """
    pythoncom.CoInitialize()
    success = False
    error_msg = None
    connector = None
    agent = None
    try:
        connector = win32com.client.Dispatch("V83.COMConnector")
        agent = connector.ConnectAgent(server_agent)
        for cluster in agent.GetClusters():
            try:
                agent.Authenticate(cluster, "", "")
            except Exception:
                pass
            for base in agent.GetInfoBases(cluster):
                if str(base.Name).lower() != target_base.lower():
                    continue
                for s in agent.GetInfoBaseSessions(cluster, base):
                    if str(getattr(s, "SessionID", "")).strip() == str(session_id).strip():
                        agent.TerminateSession(cluster, s)
                        print(f"[OK] [CLUSTER SERVICE] Sessiya {session_id} ugurla sonlandirildi.", flush=True)
                        success = True
                        break
                if success:
                    break
            if success:
                break
        if not success and not error_msg:
            error_msg = f"Sessiya {session_id} tapilmadi."
    except Exception as e:
        error_msg = str(e)
        print(f"[ERROR] [CLUSTER SERVICE] Sessiya {session_id} sonlandirilarken xeta: {e}", flush=True)
    finally:
        agent = None
        connector = None
        gc.collect()
        pythoncom.CoUninitialize()
    return success, error_msg

def auto_cleanup_hanging_sessions(server_agent="Test1C:1540", target_base="aztrade_test3"):
    """
    Automatically terminates orphaned COM sessions (Connection is None)
    which block client licenses.
    """
    pythoncom.CoInitialize()
    cleaned = 0
    connector = None
    agent = None
    try:
        connector = win32com.client.Dispatch("V83.COMConnector")
        agent = connector.ConnectAgent(server_agent)
        for cluster in agent.GetClusters():
            try:
                agent.Authenticate(cluster, "", "")
            except Exception:
                pass
            for base in agent.GetInfoBases(cluster):
                if str(base.Name).lower() != target_base.lower():
                    continue
                for s in agent.GetInfoBaseSessions(cluster, base):
                    is_com = str(getattr(s, "AppID", "")) == "COMConnection"
                    is_hanging = (s.Connection is None)
                    if is_com and is_hanging:
                        s_id = str(getattr(s, "SessionID", ""))
                        u_name = str(getattr(s, "UserName", ""))
                        try:
                            agent.TerminateSession(cluster, s)
                            print(f"[CLEANUP] Asili qalmis COM sessiyasi sonlandirildi: ID={s_id}, User={u_name}", flush=True)
                            cleaned += 1
                        except Exception as e_term:
                            print(f"[CLEANUP] Sessiya {s_id} sonlandirmaq alinmadi: {e_term}", flush=True)
    except Exception as e:
        print(f"[CLUSTER SERVICE] Avto-temizleme xetasi: {e}", flush=True)
    finally:
        agent = None
        connector = None
        gc.collect()
        pythoncom.CoUninitialize()
    return cleaned

def terminate_all_com_sessions(server_agent="Test1C:1540", target_base="aztrade_test3"):
    """
    Terminates all COMConnection sessions for the given base.
    """
    pythoncom.CoInitialize()
    cleaned = 0
    connector = None
    agent = None
    try:
        connector = win32com.client.Dispatch("V83.COMConnector")
        agent = connector.ConnectAgent(server_agent)
        for cluster in agent.GetClusters():
            try:
                agent.Authenticate(cluster, "", "")
            except Exception:
                pass
            for base in agent.GetInfoBases(cluster):
                if str(base.Name).lower() != target_base.lower():
                    continue
                for s in agent.GetInfoBaseSessions(cluster, base):
                    if str(getattr(s, "AppID", "")) == "COMConnection":
                        s_id = str(getattr(s, "SessionID", ""))
                        try:
                            agent.TerminateSession(cluster, s)
                            print(f"[CLEANUP] COM sessiyasi sonlandirildi: ID={s_id}", flush=True)
                            cleaned += 1
                        except Exception as e_term:
                            print(f"[CLEANUP] Sessiya {s_id} sonlandirmaq alinmadi: {e_term}", flush=True)
    except Exception as e:
        print(f"[CLUSTER SERVICE] Toplu temizleme xetasi: {e}", flush=True)
    finally:
        agent = None
        connector = None
        gc.collect()
        pythoncom.CoUninitialize()
    return cleaned

def format_sessions_table(sessions):
    """
    Returns a formatted string table of sessions.
    Safe for Windows cp1251/cp1252/cp1254 consoles.
    """
    if not sessions:
        return "  (Aktiv sessiya yoxdur. Butun lisenziyalar serbestdir.)"
    
    header = f"{'ID':<6} | {'Istifadeci':<18} | {'Tetbiq':<16} | {'Komputer (Host)':<16} | {'Status'}"
    sep = "-" * len(header)
    lines = [sep, header, sep]
    for s in sessions:
        status = "ASILI (Qopmus)" if s.get("is_hanging") else "Aktiv"
        line = f"{s.get('session_id', ''):<6} | {s.get('user_name', ''):<18} | {s.get('app_id', ''):<16} | {s.get('host', ''):<16} | {status}"
        lines.append(line)
    lines.append(sep)
    return "\n".join(lines)

