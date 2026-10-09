# -*- coding: utf-8 -*-
import threading
import queue
import time
import win32com.client
import pythoncom
import sys

sys.stdout.reconfigure(encoding='utf-8')

class OneCWorker(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.req_q = queue.Queue()
        self.ready_event = threading.Event()
        self.conn = None

    def run(self):
        pythoncom.CoInitialize()
        print("1C Worker Thread starting...")
        t0 = time.time()
        connector = win32com.client.Dispatch("V83.COMConnector")
        self.conn = connector.Connect('Srvr="aztrade3";Ref="aztrade2023";Usr="Nesib";Pwd="15963";')
        print(f"1C Permanent Connection established in {time.time() - t0:.2f} s")
        self.ready_event.set()

        while True:
            func, args, resp_q = self.req_q.get()
            try:
                res = func(self.conn, *args)
                resp_q.put((True, res))
            except Exception as e:
                resp_q.put((False, e))

    def execute(self, func, *args):
        self.ready_event.wait()
        resp_q = queue.Queue()
        self.req_q.put((func, args, resp_q))
        ok, val = resp_q.get()
        if not ok:
            raise val
        return val

worker = OneCWorker()
worker.start()

# Test 1: First query
def q_users(conn):
    q = conn.NewObject("Запрос")
    q.Text = "ВЫБРАТЬ ПЕРВЫЕ 50 Т.Наименование КАК Name ИЗ Справочник.Пользователи КАК Т"
    res = q.Execute().Choose()
    names = []
    while res.Next():
        names.append(str(res.Name))
    return names

t_start = time.time()
users = worker.execute(q_users)
print(f"Sorğu 1 icra vaxtı: {time.time() - t_start:.3f} saniyə ({len(users)} istifadəçi tapıldı)")

# Test 2: Second query immediately
t_start2 = time.time()
users2 = worker.execute(q_users)
print(f"Sorğu 2 icra vaxtı: {time.time() - t_start2:.3f} saniyə!")
