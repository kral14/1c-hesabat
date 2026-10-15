# -*- coding: utf-8 -*-
import os
import sys
import time
import queue
import threading
import atexit
import hashlib
import datetime
from services.action_queue import ActionQueue
from services.onec_result_queue import ResultQueue
from services.documents.base import parse_query_datetime
import win32com.client
import pythoncom
import database
import offline_service
import virtual_1c
from services.common import print_server_error
from services.catalog_handlers import CATALOG_HANDLERS
from services.report_handlers import REPORT_HANDLERS
from services.document_handlers import DOCUMENT_HANDLERS
from services.order_analysis_service import ORDER_ANALYSIS_HANDLERS

class OneCService(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.req_q = ActionQueue()
        self.connections = {}
        self.connection_details = {}
        self.busy = False
        self.connection_generation = 0
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
            self.busy = False
            action, payload, resp_q = self.req_q.get()
            self.busy = True
            deadline = payload.pop('_queue_deadline', None)
            if deadline is not None and time.monotonic() >= deadline:
                resp_q.put((False, TimeoutError('Sorğu növbədə gözləyərkən vaxtı bitdi.')))
                continue
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

            callback = getattr(self, 'on_action_start', None)
            job_id = payload.pop('_job_id', None)
            self.current_action = action
            self.action_started = time.monotonic()
            if callback and job_id:
                try: callback(job_id)
                except Exception as error:
                    resp_q.put((False, error))
                    continue
            # Offline route detection
            active_base = database.get_active_base() or {}
            base_ref = payload.get("ref") or active_base.get("ref") or ""
            is_real_com = has_com and (connector is not None) and not isinstance(connector, virtual_1c.Virtual1CConnector)
            use_offline = (not is_real_com) or payload.get("force_offline") or ("offline" in str(base_ref).lower())

            if use_offline and offline_service.is_offline_db_ready():
                try:
                    if action == "connection_probe":
                        resp_q.put((True, {"connected": True, "offline": True}))
                    elif action == "ping":
                        resp_q.put((True, "pong"))
                    elif action == "get_users":
                        resp_q.put((True, offline_service.get_users()))
                    elif action == "get_portfolios":
                        resp_q.put((True, offline_service.get_portfolios()))
                    elif action == "get_agents":
                        resp_q.put((True, offline_service.get_agents()))
                    elif action == "search_kontragents":
                        resp_q.put((True, offline_service.search_kontragents(payload.get("query", ""), is_head=payload.get("is_head", False))))
                    elif action in ["search_nomenklatura", "search_nomenclature"]:
                        resp_q.put((True, offline_service.search_nomenklatura(payload.get("query", ""))))
                    elif action == "get_all_price_types":
                        resp_q.put((True, offline_service.get_all_price_types()))
                    elif action == "get_documents_list":
                        if payload.get("navigation_edge") or payload.get("sort_rules"):
                            raise ValueError("Server sıralaması və sürətli Home/End offline rejimdə hələ dəstəklənmir. Sıralama qaydalarını söndürüb bütün məlumat rejimini seçin.")
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
                    elif action == "get_kontragent_card":
                        resp_q.put((True, offline_service.get_kontragent_card(payload)))
                    elif action == "get_nomenclature_stock":
                        resp_q.put((True, offline_service.get_nomenclature_stock(payload)))
                    elif action == "catalog_data":
                        resp_q.put((True, offline_service.catalog_data(payload)))
                    elif action == "get_audit_list":
                        import importlib
                        importlib.reload(offline_service)
                        resp_q.put((True, offline_service.get_audit_list(payload)))
                    elif action == "get_audit_diff":
                        import importlib
                        importlib.reload(offline_service)
                        resp_q.put((True, offline_service.get_audit_diff(payload)))
                    elif action == 'get_audit_events':
                        first = parse_query_datetime(payload.get('date_from'))
                        last = parse_query_datetime(payload.get('date_to'), is_end=True)
                        cursor = parse_query_datetime(payload.get('cursor')) or first
                        if not first or not last or not cursor or cursor < first or cursor > last:
                            raise ValueError('Audit üçün düzgün tarix aralığı seçin.')
                        end = min(last, cursor.replace(hour=23,minute=59,second=59,microsecond=0))
                        history = offline_service.get_audit_diff(payload).get('event_timeline', [])
                        events = []
                        for event in history:
                            stamp = parse_query_datetime(event.get('date') or event.get('datetime'))
                            if stamp and cursor <= stamp <= end: events.append(event)
                        following = end + datetime.timedelta(seconds=1)
                        resp_q.put((True, {'events':events, 'next_cursor':following.strftime('%Y-%m-%d %H:%M:%S') if following <= last else '',
                            'scanned_to':end.strftime('%d.%m.%Y %H:%M:%S')}))
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
                    elif action == "order_analysis":
                        import importlib
                        import services.order_analysis_service
                        importlib.reload(services.order_analysis_service)
                        resp_q.put((True, services.order_analysis_service.handle_order_analysis_offline(payload)))
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
                pwd = str(payload.get('password') or '') if 'password' in payload else (active_base.get('password') or '15963')
                if str(user).strip().lower() in ["nesib admin", "nesibadmin", "nəsib"]:
                    user = "Nesib"
                key = f"{server.lower()}_{base.lower()}_{user.lower()}_{hashlib.sha256(pwd.encode()).hexdigest()}"

                if payload.pop('_reset_connection', False):
                    self.connections.pop(key, None)
                conn = self.connections.get(key)
                if conn is not None:
                    # Check connection liveness using valid COMConnector method String(1)
                    try:
                        if action == 'ping' or payload.get('_login'):
                            probe = conn.NewObject('Запрос')
                            probe.Text = 'ВЫБРАТЬ 1 КАК Alive'
                            try: probe.Execute()
                            finally: probe = None
                        else:
                            _ = conn.String(1)
                    except Exception as e_hb:
                        print(f"🔄 [1C SESSIYA BƏRPASI] COM sessiyası qırılıb ({e_hb}), yenidən qoşulur...", flush=True)
                        self.connections.pop(key, None)
                        conn = None

                if action == 'connection_probe':
                    if conn is None:
                        resp_q.put((True, {'connected': False, 'error': '1C sessiyası aktiv deyil. Yenidən qoşulun.'}))
                        continue
                    try:
                        probe = conn.NewObject('Запрос')
                        probe.Text = 'ВЫБРАТЬ 1 КАК Alive'
                        probe.Execute()
                    except Exception:
                        self.connections.pop(key, None)
                        raise
                    finally:
                        probe = None
                    resp_q.put((True, {'connected': True}))
                    continue

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
                    self.connection_generation += 1
                    self.connection_details[key] = dict(server=str(server), ref=str(base), user=str(user), connected_at=time.time(), generation=self.connection_generation)
                    print(f"1C Session connected to [{server} / {base} / {user}] in {time.time() - t0:.2f} s", flush=True)

                # Dispatch Action
                from services.onec_dates import CalendarConnection
                conn = CalendarConnection(conn)
                payload = dict(payload, _resolved_user=user)
                if action == "ping":
                    probe = conn.NewObject('Запрос')
                    probe.Text = 'ВЫБРАТЬ 1 КАК Alive'
                    probe.Execute()
                    probe = None
                    resp_q.put((True, "pong"))
                elif action in CATALOG_HANDLERS:
                    if action in ["user_accounts", "change_user_password"]:
                        import importlib
                        import services.user_passwords
                        importlib.reload(services.user_passwords)
                        if action == "user_accounts":
                            services.user_passwords.list_accounts(conn, payload, key, resp_q)
                        else:
                            services.user_passwords.change_password(conn, payload, key, resp_q)
                    else:
                        CATALOG_HANDLERS[action](conn, payload, key, resp_q)
                elif action in REPORT_HANDLERS:
                    if action == "generate":
                        REPORT_HANDLERS[action](conn, payload, key, resp_q, req_q=self.req_q)
                    else:
                        REPORT_HANDLERS[action](conn, payload, key, resp_q)
                elif action in DOCUMENT_HANDLERS:
                    if action in ["get_audit_list", "get_audit_diff", "get_audit_events"]:
                        import importlib
                        import services.audit_service
                        importlib.reload(services.audit_service)
                        if action == "get_audit_list":
                            resp_q.put((True, services.audit_service.get_audit_list(conn, payload)))
                        elif action == 'get_audit_events':
                            resp_q.put((True, services.audit_service.get_audit_event_page(conn,payload)))
                        else:
                            resp_q.put((True, services.audit_service.get_document_version_diff(conn, payload)))
                    else:
                        DOCUMENT_HANDLERS[action](conn, payload, key, resp_q)
                elif action in ORDER_ANALYSIS_HANDLERS:
                    import importlib
                    import services.order_analysis_service
                    importlib.reload(services.order_analysis_service)
                    services.order_analysis_service.ORDER_ANALYSIS_HANDLERS[action](conn, payload, key, resp_q)
                elif action in ["get_nomenclature_card", "get_kontragent_card"]:
                    if action == "get_nomenclature_card":
                        resp_q.put((True, offline_service.get_nomenclature_card(payload)))
                    else:
                        resp_q.put((True, offline_service.get_kontragent_card(payload)))
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

    def execute(self, action, payload, retry=2, timeout=None):
        for attempt in range(retry + 1):
            resp_q = ResultQueue()
            queued_payload = dict(payload)
            if timeout is not None: queued_payload['_queue_deadline'] = time.monotonic() + timeout
            self.req_q.put((action, queued_payload, resp_q))
            try:
                ok, result = resp_q.get(timeout=timeout)
            except queue.Empty:
                raise TimeoutError('1C sorğusu vaxtında cavab vermədi. Serverdə davam edən sorğu bitdikdən sonra yenidən yoxlayın.')
            if ok:
                return result
            err_str = str(result)
            if "Не обнаружено свободной лицензии" in err_str:
                if attempt < retry:
                    print(f"⏳ [1C LİSENZİYA GÖZLƏNİLİR] 1C sessiyasının azad olunması gözlənilir, 2.5s sonra yenidən yoxlanılır (cəhd {attempt + 1}/{retry + 1})...", flush=True)
                    time.sleep(2.5)
                    continue
                print("⚠️ [1C LİSENZİYA MƏŞĞUL] Lisenziya limiti tam doludur.", flush=True)
                raise result
            if attempt < retry and any(k in err_str for k in ["Сеанс отсутствует", "ClusterDistribImpl", "Соединение разорвано"]):
                print(f"⚠️ [1C BİLDİRİŞ] 1C sessiyası qırıldı, avtomatik yenidən qoşulur və '{action}' təkrar icra edilir (cəhd {attempt + 1})...", flush=True)
                # COM references must be released on the owning STA worker, not an HTTP thread.
                payload = dict(payload, _reset_connection=True)
                time.sleep(1.0)
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
