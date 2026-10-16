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
obj=ref.ПолучитьОбъект();print('Target:',b['server'],b['ref'],number,flush=True)
print('Current:',json.dumps({'amount':float(obj.СуммаДокумента),'count':obj.Товары.Количество(),'rows':[{'code':str(row.Номенклатура.Код).strip(),'qty':float(row.Количество),'total':float(row.Сумма)} for row in obj.Товары]},ensure_ascii=False),flush=True)
qv=conn.NewObject('Запрос');qv.SetParameter('D',ref);qv.Text='ВЫБРАТЬ Т.НомерВерсии КАК V, Т.ВерсияОбъекта КАК Storage ИЗ РегистрСведений.ВерсииОбъектов КАК Т ГДЕ Т.Объект = &D УПОРЯДОЧИТЬ ПО V'
rv=qv.Execute().Choose();summary=[];caches=[{} for _ in range(7)]
while rv.Next():
    storage=rv.Storage;snap=storage.Получить();encoded=conn.XMLСтрока(snap)
    try: raw=base64.b64decode(encoded)
    except Exception: raw=b''
    report={'version':int(rv.V),'type':type(snap).__name__,'xml_or_bytes_prefix':encoded[:100],'bytes_prefix':raw[:20].hex(),'bytes_length':len(raw)}
    print("Stored format:",json.dumps(report,ensure_ascii=False),flush=True)
    decoded=unpack_version_snapshot(conn,storage,*caches)
    report['parsed']={k:decoded.get(k) for k in ('amount','posted','deleted','doc_date')} if decoded else None
    report['items']=[{k:row.get(k) for k in ('code','qty','total','discount_manual')} for row in decoded.get('items',[])] if decoded else []
    summary.append(report);print(json.dumps(report,ensure_ascii=False),flush=True)
Path('tests/artifacts/audit_main_C0001047285_diagnostic.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
rv=storage=snap=obj=ref=r=q=qv=conn=connector=None;gc.collect();pythoncom.CoUninitialize()
