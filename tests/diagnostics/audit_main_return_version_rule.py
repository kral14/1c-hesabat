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


settings=conn.NewObject('Запрос')
settings.SetParameter('TargetType','%ВозвратТоваровОтПокупателя%')
settings.Text='ВЫБРАТЬ Т.ТипОбъекта КАК ObjType, ПРЕДСТАВЛЕНИЕ(Т.Вариант) КАК Mode ИЗ РегистрСведений.НастройкаВерсионированияОбъектов КАК Т ГДЕ ПОДСТРОКА(Т.ТипОбъекта, 1, 200) ПОДОБНО &TargetType'
result=settings.Execute().Choose()
found=False
while result.Next():
    found=True
    print('RETURN_VERSION_MODE',str(result.ObjType),str(result.Mode),flush=True)
if not found: print('RETURN_VERSION_MODE: no explicit settings row',flush=True)
result=settings=ref=r=q=conn=connector=None;gc.collect();pythoncom.CoUninitialize()
