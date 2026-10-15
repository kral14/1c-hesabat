const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const elements=new Map();
const c=vm.createContext({console,window:{},document:{addEventListener(){},getElementById(id){return elements.get(id)||null;}}});
c.window.addEventListener=()=>{};
vm.runInContext(fs.readFileSync('static/js/audit_journal.js','utf8')+';globalThis.audit=AuditJournal;',c);
const a=c.audit;
const item=(code,total,discount=0)=>({code,name:code,qty:1,price:total,total,discount_manual:discount});
const source={raw_versions:[
 {version:5,amount:123.73,items:[item('A',8.48),item('B',79.30),item('C',35.95)]},
 {version:6,amount:87.78,items:[item('A',8.48),item('B',79.30)]},
 {version:7,amount:83.82,items:[item('A',8.48),item('B',75.34,5)]}
]};
a.normalizeAuditData(source);
const vers=a.currentDiffData.normalizedVersions;
assert.equal(vers[1].removedCount,1);
assert.equal(vers[2].removedCount,0);
assert.equal(vers[2].modifiedCount,1);
assert.equal(vers[2].items.length,2);
assert.ok(!vers[2].items.some(it=>it.code==='C'));
const clean=a.getCleanFinalVersion(vers);
assert.equal(clean.items.length,2);
assert.equal(clean.amount,83.82);
assert.ok(clean.items.every(it=>it.changedFields.length===0 && it.statusType==='unchanged'));
assert.equal(vers[2].modifiedCount,1,'clean view must not mutate historical differences');
for(const id of ['docWinVersionButtons','docWinHeaderTitle','docWinVersionMeta','docWinBody'])elements.set(id,{innerHTML:'',textContent:''});
a.selectedVersionIdx=vers.length;a.renderDocVersionWindow();
assert.ok(elements.get('docWinVersionButtons').innerHTML.includes('Son halı'));
a.normalizeAuditData({raw_versions:[{version:1,items:[item('A',10)]},{version:2,items:[]},{version:3,items:[item('A',10)]}]});
const restored=a.currentDiffData.normalizedVersions;
assert.equal(restored[2].removedCount,0);
assert.equal(restored[2].addedCount,1,'re-adding an item after empty document is a new addition');
console.log('Version removal, adjacent changes, clean final state and re-addition checks passed.');

const creationEvent={event:'_$Data$_.New',date:'11.10.2026 15:55:31',user:'Фон'};
a.normalizeAuditData({event_timeline:[creationEvent],raw_versions:[
 {version:1,change_date:'12.10.2026 08:43:54',items:[item('A',10,15)]},
 {version:2,change_date:'12.10.2026 18:07:37',items:[item('A',10,15)]}
]});
const later=a.currentDiffData.normalizedVersions;
assert.ok(a.currentDiffData.initialCreation);
assert.equal(later[0].isInitial,false);
assert.ok(later[0].verLabel.includes('Dəyişiklik'));
assert.equal(later[1].modifiedCount,0,'missing baseline must not invent a percent change');
elements.set('docWinBodyContent',{innerHTML:''});
a.selectedVersionIdx=-1;a.renderDocVersionWindow();
assert.ok(elements.get('docWinBodyContent').innerHTML.includes('ilkin dəyərlər məlum deyil'));
assert.ok(!elements.get('docWinBodyContent').innerHTML.includes('15.00%'));
assert.ok(elements.get('docWinBodyContent').innerHTML.includes('Фон'));
assert.ok(elements.get('docWinBodyContent').innerHTML.includes('11.10.2026 15:55:31'));
a.normalizeAuditData({event_timeline:[creationEvent],raw_versions:[{version:1,change_date:creationEvent.date,items:[item('A',10)]},{version:2,change_date:'12.10.2026 08:43:54',items:[item('A',8.5,15)]}]});
assert.equal(a.currentDiffData.initialCreation,null);
assert.equal(a.currentDiffData.normalizedVersions[0].isInitial,true);
assert.equal(a.currentDiffData.normalizedVersions[1].modifiedCount,1);
console.log('Creation event, missing initial snapshot and real initial snapshot classification checks passed.');

a.normalizeAuditData({event_timeline_scoped:true,event_timeline:[],raw_versions:[{version:1,change_date:'01.01.2020 12:00:00',items:[]}]});
assert.equal(a.currentDiffData.normalizedTimeline.length,0,'no out-of-period synthetic events in a scoped Audit job');
