"""Read-only classification matrix; strictly one existing test session."""
import json
import time
from datetime import datetime,timedelta
from pathlib import Path
import database
from services.onec_gateway import OneCGateway
from services.onec_dates import parse_calendar_date


def main():
    base=database.get_active_base() or {}
    assert (str(base.get('server','')).lower(),str(base.get('ref','')).lower())==('test1c','aztrade_test3'),'Test database required'
    gateway=OneCGateway(auto_start=False)
    initial=gateway.status(refresh=True)
    tokens=initial.get('session_tokens')
    assert tokens and initial.get('session_count')==1,'One existing session required'
    def call(action,payload):
        state=gateway.status(refresh=True)
        deadline=time.monotonic()+10
        while state.get('session_tokens')==tokens and (state.get('busy') or state.get('queued')) and time.monotonic()<deadline:
            time.sleep(.5)
            state=gateway.status(refresh=True)
        assert state.get('session_tokens')==tokens and not state.get('busy') and not state.get('queued'),'Session changed or busy' 
        for c in state.get('connections') or []:
            assert (c['server'].lower(),c['ref'].lower())==('test1c','aztrade_test3'),'Main database refused'
        return gateway.execute(action,{**base,**payload},retry=0,timeout=25)
    assert call('connection_probe',{}).get('connected'),'Existing test connection required'
    doc='РеализацияТоваровУслуг'
    def read(period,filters=None,limit=501):
        result=call('get_documents_list',dict(doc_type=doc,limit=limit,offset=0,filters=filters or [],**period))
        return result['items']
    seed=read(dict(date_from='2026-07-01',date_to='2026-07-31'),limit=1)
    if not seed: seed=read(dict(date_from='2026-01-01',date_to='2026-12-31'),limit=1)
    assert seed,'No test documents available'
    when=parse_calendar_date(seed[0]['date'])
    baseline=None
    for start,end in ((when.replace(hour=0,minute=0,second=0),when.replace(hour=23,minute=59,second=59)),
                      (when.replace(minute=0,second=0),when.replace(minute=59,second=59)),
                      (when.replace(second=0),when.replace(second=59)),(when,when)):
        period=dict(date_from=start.strftime('%Y-%m-%d %H:%M:%S'),date_to=end.strftime('%Y-%m-%d %H:%M:%S'))
        baseline=read(period)
        if len(baseline)<501: break
    assert baseline and len(baseline)<501,'Cannot establish a complete bounded baseline'
    # Enlarge the complete scope where possible; never compare truncated pages.
    for days in (7,30,90):
        candidate=dict(date_from=(when-timedelta(days=days-1)).replace(hour=0,minute=0,second=0).strftime('%Y-%m-%d %H:%M:%S'),
                       date_to=when.replace(hour=23,minute=59,second=59).strftime('%Y-%m-%d %H:%M:%S'))
        rows=read(candidate)
        if len(rows)<501 and len(rows)>len(baseline): baseline,period=rows,candidate

    ids=lambda rows:{row['number'] for row in rows}
    universe=ids(baseline)
    report=dict(database='Test1C / Aztrade_test3',period=period,baseline_count=len(universe),cases=[],session_preserved=False)
    path=Path('tests/artifacts/agent_filters_existing_session.json')
    def save():
        report['session_preserved']=gateway.status(refresh=True).get('session_tokens')==tokens
        path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    for field,catalog,preferred in [('agent_sales_type','ВидыРеализации','GR'),('agent_sales_group','ГруппыРеализации','Region MT')]:
        catalog_rows=call('catalog_data',dict(catalog=catalog)).get('items') or []
        values=[str(row.get('name') or row.get('Name') or '').strip() for row in catalog_rows]
        values=[v for v in values if v]
        assert values,'Classification catalog empty'
        preferred_value=next((v for v in values if v.casefold()==preferred.casefold()),values[0])
        target=None
        for candidate in [preferred_value]+[v for v in values if v!=preferred_value]:
            if read(period,[dict(fieldKey=field,enabled=True,operator='Равно',value=candidate)],limit=1):
                target=candidate
                break
        assert target is not None,field+': no positive fixture found'

        second=next((v for v in values if v!=target),'__NO_MATCH__')
        results={}
        for op in ('Равно','Не равно','В списке','Не в списке','Заполнено','Не заполнено'):
            rule=dict(fieldKey=field,enabled=True,operator=op,value=target+'; '+second if 'списке' in op else target)
            try:
                found=ids(read(period,[rule]));assert found<=universe,'Returned rows outside baseline'
                results[op]=found
                record=dict(field=field,operator=op,rows=len(found),status='query_ok')
            except Exception as error:
                record=dict(field=field,operator=op,status='fail',error=str(error)[:1000])
                report['cases'].append(record);save();print(json.dumps(record,ensure_ascii=True),flush=True);raise
            report['cases'].append(record);save();print(json.dumps(record,ensure_ascii=True),flush=True)
        for positive,negative in [('Равно','Не равно'),('В списке','Не в списке'),('Заполнено','Не заполнено')]:
            assert not results[positive]&results[negative],field+': overlapping complements'
            assert results[positive]|results[negative]==universe,field+': incomplete complements'
        assert results['Равно']<=results['В списке']<=results['Заполнено'],'Positive membership mismatch'
        for record in report['cases']:
            if record['field']==field:record['status']='pass'
        save()
    print(json.dumps(dict(passed=len(report['cases']),baseline=len(universe),session_preserved=report['session_preserved']),ensure_ascii=True),flush=True)

if __name__=='__main__':main()
