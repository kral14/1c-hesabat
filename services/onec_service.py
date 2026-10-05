# -*- coding: utf-8 -*-
import os
import sys
import time
import queue
import threading
import atexit
import win32com.client
import pythoncom
import database
import offline_service
import virtual_1c
from services.common import print_server_error
from services.catalog_handlers import CATALOG_HANDLERS
from services.report_handlers import REPORT_HANDLERS
from services.document_handlers import DOCUMENT_HANDLERS

class OneCService(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.req_q = queue.Queue()
        self.connections = {}
        self.start()

    def run(self):
        connector = None
        has_com = False
        try:
            pythoncom.CoInitialize()
            connector = win32com.client.Dispatch("V83.COMConnector")
            has_com = True
            print("1C Dedicated STA Worker Thread Ready.", flush=True)
        except Exception as e_com:
            print(f"⚠️ [1C COM CONNECTOR TAPILMADI] {e_com}", flush=True)
            if offline_service.is_offline_db_ready():
                print("🟢 [VIRTUAL 1C AKTİV EDİLDİ] Sistem 'data/offline_1c_data.db' SQLite bazasına Virtual 1C:Enterprise kimi bağlandı!", flush=True)
                connector = virtual_1c.Virtual1CConnector()
            else:
                print("❌ [OFFLINE BAZA YOXDUR] 'data/offline_1c_data.db' faylı tapılmadı.", flush=True)

        while True:
            action, payload, resp_q = self.req_q.get()
            if action == "shutdown":
                print("1C Worker shutting down: releasing COM sessions...", flush=True)
                for k in list(self.connections.keys()):
                    self.connections[k] = None
                self.connections.clear()
                connector = None
                try:
                    pythoncom.CoUninitialize()
                except Exception:
                    pass
                resp_q.put((True, "Closed"))
                break

            # Offline route detection
            active_base = database.get_active_base() or {}
            base_ref = payload.get("ref") or active_base.get("ref") or ""
            is_real_com = has_com and (connector is not None) and not isinstance(connector, virtual_1c.Virtual1CConnector)
            use_offline = (not is_real_com) or payload.get("force_offline") or ("offline" in str(base_ref).lower())

            if use_offline and offline_service.is_offline_db_ready():
                try:
                    if action == "ping":
                        resp_q.put((True, "pong"))
                    elif action == "get_users":
                        resp_q.put((True, offline_service.get_users()))
                    elif action == "get_portfolios":
                        resp_q.put((True, offline_service.get_portfolios()))
                    elif action == "get_agents":
                        resp_q.put((True, offline_service.get_agents()))
                    elif action == "search_kontragents":
                        resp_q.put((True, offline_service.search_kontragents(payload.get("query", ""))))
                    elif action in ["search_nomenklatura", "search_nomenclature"]:
                        resp_q.put((True, offline_service.search_nomenklatura(payload.get("query", ""))))
                    elif action == "get_all_price_types":
                        resp_q.put((True, offline_service.get_all_price_types()))
                    elif action == "get_documents_list":
                        resp_q.put((True, offline_service.get_documents_list(payload)))
                    elif action in ["get_price_document", "get_document_details"]:
                        resp_q.put((True, offline_service.get_document_details(payload)))
                    elif action == "save_price_document":
                        resp_q.put((True, offline_service.save_price_document(payload)))
                    elif action == "resolve_nomenclature_batch":
                        resp_q.put((True, offline_service.resolve_nomenclature_batch(payload)))
                    elif action == "get_batch_item_prices":
                        resp_q.put((True, offline_service.get_batch_item_prices(payload)))
                    elif action == "get_nomenclature_card":
                        resp_q.put((True, offline_service.get_nomenclature_card(payload)))
                    elif action == "get_nomenclature_stock":
                        resp_q.put((True, offline_service.get_nomenclature_stock(payload)))
                    elif action == "catalog_data":
                        resp_q.put((True, offline_service.catalog_data(payload)))
                    elif action == "get_portfolio_catalog_filters":
                        resp_q.put((True, offline_service.get_portfolio_catalog_filters()))
                    elif action == "get_portfolio_catalog_items":
                        resp_q.put((True, offline_service.get_portfolio_catalog_items(payload)))
                    elif action == "get_reports":
                        resp_q.put((True, {
                            "user_reports": [
                                {
                                    "setting_name": "Satış Hesabatı (Universal)",
                                    "object_name": "Отчет.Продажи",
                                    "description": "Offline Satış Dövriyyəsi",
                                    "is_direct": True
                                },
                                {
                                    "setting_name": "Qiymət Təyini Jurnalı",
                                    "object_name": "Документ.УстановкаЦенНоменклатуры",
                                    "description": "Offline Qiymət Sənədləri"
                                }
                            ],
                            "warehouse_reports": [
                                {
                                    "setting_name": "Anbar Qalıqları Hesabatı",
                                    "object_name": "Отчет.ТоварыНаСкладах",
                                    "description": "Offline Anbar Qalıqları"
                                }
                            ]
                        }))
                    elif action in ["generate", "direct_calculate"]:
                        resp_q.put((True, {"headers": [], "rows": [], "total_count": 0, "excel_file": ""}))
                    elif action == "universal_sales":
                        resp_q.put((True, offline_service.universal_sales(payload)))
                    elif action == "universal_report":
                        resp_q.put((True, offline_service.universal_report(payload)))
                    else:
                        resp_q.put((False, RuntimeError(f"Offline rejimdə '{action}' dəstəklənmir")))
                except Exception as e_off:
                    print_server_error(f"OneCService.offline [{action}]", e_off, payload)
                    resp_q.put((False, e_off))
                continue

            if connector is None:
                resp_q.put((False, RuntimeError("Bu kompüterdə 1C COMConnector quraşdırılmayıb və offline baza tapılmadı.")))
                continue

            try:
                active_base = database.get_active_base() or {}
                server = payload.get("server") or active_base.get("server") or "Test1C"
                base = payload.get("ref") or active_base.get("ref") or "Aztrade_test3"
                user = payload.get("user") or active_base.get("user") or "Nesib"
                pwd = payload.get("password") or active_base.get("password") or "15963"
                if str(user).strip().lower() in ["nesib admin", "nesibadmin", "nəsib"]:
                    user = "Nesib"
                key = f"{server.lower()}_{base.lower()}_{user.lower()}_{pwd}"

                conn = self.connections.get(key)
                if conn is not None:
                    # Check connection liveness using valid COMConnector method String(1)
                    try:
                        _ = conn.String(1)
                    except Exception as e_hb:
                        print(f"🔄 [1C SESSIYA BƏRPASI] COM sessiyası qırılıb ({e_hb}), yenidən qoşulur...", flush=True)
                        self.connections.pop(key, None)
                        conn = None

                if conn is None:
                    # Release previous connection to prevent 1C license exhaustion (1 concurrent license limit)
                    for old_key in list(self.connections.keys()):
                        if old_key != key:
                            print(f"🔄 [1C BAZA DƏYİŞDİ] Köhnə COM sessiya azad edilir: {old_key} -> Yeni: {key}", flush=True)
                            self.connections[old_key] = None
                            self.connections.pop(old_key, None)

                    t0 = time.time()
                    conn_str = f'Srvr="{server}";Ref="{base}";Usr="{user}";Pwd="{pwd}";'
                    conn = connector.Connect(conn_str)
                    self.connections[key] = conn
                    print(f"1C Session connected to [{server} / {base} / {user}] in {time.time() - t0:.2f} s", flush=True)

                # Dispatch Action
                payload = dict(payload, _resolved_user=user)
                if action == "ping":
                    _ = conn.String(1)
                    resp_q.put((True, "pong"))
                elif action in CATALOG_HANDLERS:
                    CATALOG_HANDLERS[action](conn, payload, key, resp_q)
                elif action in REPORT_HANDLERS:
                    if action == "generate":
                        REPORT_HANDLERS[action](conn, payload, key, resp_q, req_q=self.req_q)
                    else:
                        REPORT_HANDLERS[action](conn, payload, key, resp_q)
                elif action in DOCUMENT_HANDLERS:
                    DOCUMENT_HANDLERS[action](conn, payload, key, resp_q)
                else:
                    raise ValueError(f"1C naməlum əməliyyat (Unknown Action): {action}")

            except Exception as e:
                err_str = str(e)
                if any(k in err_str for k in ["Сеанс отсутствует", "ClusterDistribImpl", "Соединение разорвано"]):
                    print(f"⚠️ [1C BİLDİRİŞ] 1C sessiyası server tərəfindən bağlanıb, avtomatik bərpa edilir...", flush=True)
                    try:
                        self.connections.pop(key, None)
                    except Exception:
                        pass
                else:
                    print_server_error(f"OneCService.run [Action: {action}]", e, payload)
                resp_q.put((False, e))

    def execute(self, action, payload, retry=1):
        for attempt in range(retry + 1):
            resp_q = queue.Queue()
            self.req_q.put((action, payload, resp_q))
            ok, result = resp_q.get()
            if ok:
                return result
            err_str = str(result)
            if "Не обнаружено свободной лицензии" in err_str:
                print("⚠️ [1C LİSENZİYA MƏŞĞUL] Lisenziya limiti tam doludur, təkrar gözlənilmir.", flush=True)
                raise result
            if attempt < retry and any(k in err_str for k in ["Сеанс отсутствует", "ClusterDistribImpl", "Соединение разорвано"]):
                print(f"⚠️ [1C BİLDİRİŞ] 1C sessiyası qırıldı, avtomatik yenidən qoşulur və '{action}' təkrar icra edilir (cəhd {attempt + 1})...", flush=True)
                time.sleep(0.5)
                continue
            print_server_error(f"OneCService.execute [Action: {action}]", result, payload)
            if isinstance(result, BaseException):
                raise result
            raise RuntimeError(str(result))

    def close_all(self):
        try:
            resp_q = queue.Queue()
            self.req_q.put(("shutdown", {}, resp_q))
            resp_q.get(timeout=2.0)
        except Exception:
            pass

one_c = OneCService()
service = one_c
atexit.register(one_c.close_all)
