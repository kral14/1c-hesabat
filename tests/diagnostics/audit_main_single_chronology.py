import sys, json, base64, gzip, zlib, gc
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
import database, pythoncom, win32com.client
from services.audit_service import unpack_version_snapshot
sys.stdout.reconfigure(encoding='utf-8')
b=database.get_active_base() or {}
assert (b.get('server','').lower(),b.get('ref','').lower())==('aztrade3','aztrade2023'), 'Unexpected database'
pythoncom.CoInitialize()
connector=win32com.client.Dispatch('V83.COMConnector')
conn=connector.Connect('Srvr="'+b['server']+'";Ref="'+b['ref']+'";Usr="'+b['user']+'";Pwd="'+b['password']+'";')
q=conn.NewObject('Запрос');q.SetParameter('N','C0001047285');q.SetParameter('Alt','С0001047285')
q.Text='ВЫБРАТЬ Т.Ссылка КАК Ref, Т.Номер КАК Number ИЗ Документ.ВозвратТоваровОтПокупателя КАК Т ГДЕ Т.Номер = &N ИЛИ Т.Номер = &Alt'
r=q.Execute().Choose();assert r.Next(),'Target not found';ref=r.Ref;number=str(r.Number).strip();assert not r.Next(),'Ambiguous target'

import datetime
from services.documents.base import format_1c_datetime
for meta in conn.Метаданные.РегистрыСведений:
    name=str(meta.Имя)
    if 'Верси' in name:
        print('VERSION_REGISTER',name,'fields',[str(x.Имя) for group in (meta.Измерения,meta.Ресурсы,meta.Реквизиты) for x in group],flush=True)
log=conn.NewObject('ТаблицаЗначений');filt=conn.NewObject('Структура');filt.Вставить('Данные',ref)
filt.Вставить('ДатаНачала',datetime.datetime(2026,10,11))
filt.Вставить('ДатаОкончания',datetime.datetime(2026,10,13,23,59,59))
try:
    conn.ВыгрузитьЖурналРегистрации(log,filt,'','',100)
    print('EVENT_COUNT',log.Количество(),flush=True)
    for i in range(log.Количество()):
        row=log.Получить(i)
        print(json.dumps({'at':format_1c_datetime(row.Дата),'event':str(row.Событие),'user':str(row.ИмяПользователя),'comment':str(row.Комментарий)},ensure_ascii=False),flush=True)
except Exception as error: print('EVENT_ERROR',str(error),flush=True)
meta=group=row=ref=r=q=log=filt=conn=connector=None;gc.collect();pythoncom.CoUninitialize()
