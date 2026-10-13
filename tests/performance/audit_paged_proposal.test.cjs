const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({console,window:{},AbortController,setTimeout:()=>1,clearTimeout(){},alert:message=>{throw Error(message)},document:{getElementById:()=>({textContent:''}),addEventListener(){}}});
c.window=c;c.SessionManager={getCredentials:()=>({server:'Test1C',ref:'Aztrade_test3'})};
vm.runInContext(fs.readFileSync('static/js/audit_journal.js','utf8')+';globalThis.audit=AuditJournal;',c);
(async()=>{
 const a=c.audit;a.buildListPayload=()=>({date_from:'2026-10-06',date_to:'2026-10-07 23:59:59'});
 let release,requests=[],updates=[];
 a.populateDiffData=data=>updates.push(data);
 c.fetch=(url,options)=>{
  requests.push({url,body:JSON.parse(options.body)});
  if(url==='/api/audit/details')return new Promise(resolve=>release=()=>resolve({json:async()=>({success:true,raw_versions:[]})}));
  const page=requests.length===2 ? {events:Array(120).fill({event:'A'}),next_cursor:'2026-10-07 00:00:00',scanned_to:'06.10.2026'} : {events:Array(130).fill({event:'B'}),next_cursor:'',scanned_to:'07.10.2026'};
  return Promise.resolve({json:async()=>({success:true,...page})});
 };
 const first=a.loadDiff('ВозвратТоваровОтПокупателя','C001');
 const second=a.loadDiff('ВозвратТоваровОтПокупателя','C001');
 assert.equal(first,second);assert.equal(requests.length,1,'F5 must not append an extra COM job');
 release();await first;
 assert.equal(requests[0].body.include_events,false);
 assert.equal(requests.length,3);assert.equal(updates.at(-1).event_timeline.length,250);
 assert.equal(a._loadingDetails,false);
 console.log('Proposed UI: F5 guard, separate snapshots, sequential pages and 250 events passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
