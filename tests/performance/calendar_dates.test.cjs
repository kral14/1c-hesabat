const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
if(!process.env.C1_DATE_CHILD){
 for(const tz of ['UTC','Asia/Baku','America/New_York']){
  const result=spawnSync(process.execPath,[__filename],{env:{...process.env,TZ:tz,C1_DATE_CHILD:'1'},encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
 }
 console.log('Calendar component passed in UTC, Asia/Baku and America/New_York.');
}else{
 const dates=require(path.resolve('static/js/c1_dates.js'));
 for(const value of ['12.10.2026','2026-10-12','12/10/2026']){
  assert.equal(dates.toBackend(value),'2026-10-12 00:00:00');
  assert.equal(dates.toBackend(value,true),'2026-10-12 23:59:59');
  assert.equal(dates.dateOnly(value),'12.10.2026');
 }
 assert.equal(dates.toBackend('2026-10-12 03:05',true),'2026-10-12 03:05:59');
 assert.equal(dates.toBackend('31.12.2026',true),'2026-12-31 23:59:59');
 assert.equal(dates.toBackend('01.01.2027'),'2027-01-01 00:00:00');
 assert.equal(dates.parse('31.02.2026'),null);
 assert.equal(dates.parse('2026-10-12T00:00:00Z'),null);
}
