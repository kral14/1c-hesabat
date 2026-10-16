const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const inputs=new Map();const ctx=vm.createContext({console,window:{},document:{getElementById:id=>inputs.get(id)||null},alert(){}});
ctx.window=ctx;ctx.addEventListener=()=>{};
vm.runInContext(fs.readFileSync('static/js/c1_dates.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('static/js/c1_filter_component.js','utf8')+';globalThis.f=C1FilterComponent;',ctx);
const f=ctx.f;f.setCritEnabled=(idx,v)=>f.tempFilterCriteria[idx].enabled=v;f.syncTempFiltersToStorage=()=>{};
f.supportedFilterFields=['number','nomenclature'];f.items=[{organization:'Old loaded value'}];
assert.equal(f.isFieldInCurrentDoc('nomenclature'),true);
assert.equal(f.isFieldInCurrentDoc('organization'),false,'metadata overrides stale loaded values');
f.supportedFilterFields=['vms_status'];assert.equal(f.isFieldInCurrentDoc('wms_status'),true);
f.tempFilterCriteria=[{fieldKey:'kontragent_code'}];
f.applyCatalogSelection(0,{code:'C00001',name:'Store'});assert.equal(f.tempFilterCriteria[0].value,'C00001');
f.tempFilterCriteria=[{fieldKey:'golovnoy_kontragent',operator:'Равно'}];
f.applyCatalogSelection(0,{code:'C00002',name:'Parent'});
assert.equal(f.tempFilterCriteria[0].value,'Parent');assert.equal(f.tempFilterCriteria[0].referenceCode,'C00002');
f.tempFilterCriteria=[{fieldKey:'kontragent_code'}];
f.selectAutocompleteSuggestion(0,'[C00003] Store');assert.equal(f.tempFilterCriteria[0].value,'C00003');
f.tempFilterCriteria=[{fieldKey:'nomenclature'}];
f.selectAutocompleteSuggestion(0,'[S001] Product');assert.equal(f.tempFilterCriteria[0].value,'[S001] Product');
const input={value:'New',classList:{contains:()=>false},dataset:{structuredList:'old'}};
f.tempFilterCriteria=[{fieldKey:'comment',operator:'В списке',structuredFilter:{items:[{value:'Old'}]},referenceCode:'Old'}];
f.onFilterValueInput(0,input,{});
assert.equal(f.tempFilterCriteria[0].value,'New');assert.equal(f.tempFilterCriteria[0].structuredFilter,undefined);
assert.equal(f.tempFilterCriteria[0].referenceCode,undefined);assert.equal(input.dataset.structuredList,undefined);
f.renderFilterAutocompletePopup(0,{},{length:0});
console.log('Metadata support, code/name selection, preserved product codes and edited-list state passed.');

for(const op of ['Интервал (>, <)','Интервал (>=, <=)','Интервал (>=, <)','Интервал (>, <=)']) {
  assert.equal(f.matchesCondition({date:'15.10.2026 09:00:00'},{fieldKey:'date',operator:op,valueFrom:'14.10.2026',valueTo:''}),true,'date lower-only '+op);
  assert.equal(f.matchesCondition({date:'13.10.2026 09:00:00'},{fieldKey:'date',operator:op,valueFrom:'14.10.2026',valueTo:''}),false);
  assert.equal(f.matchesCondition({date:'13.10.2026 09:00:00'},{fieldKey:'date',operator:op,valueFrom:'',valueTo:'14.10.2026'}),true,'date upper-only '+op);
}
const byCode={fieldKey:'nomenclature',operator:'В списке',value:'Same name',structuredFilter:{items:[{value:'Same name',code:'S002',comp:'equal'}]}};
assert.equal(f.matchesCondition({nom_keys:['s001|s001|a|same name']},byCode),false);
assert.equal(f.matchesCondition({nom_keys:['s002|s002|b|same name']},byCode),true);
console.log('Open-ended date intervals and same-name products with different codes passed.');

f.tempFilterCriteria=[{fieldKey:'kontragent_code',operator:'В списке'}];
f.applyValueListSelection(0,{displayStr:'Store',items:[{value:'Store',code:'C001',comp:'equal'}]},null);
assert.equal(f.tempFilterCriteria[0].value,'C001');
assert.equal(f.tempFilterCriteria[0].structuredFilter.items[0].value,'C001');

f.tempFilterCriteria=[{fieldKey:'nomenclature',operator:'Равно'}];
f.applyCatalogSelection(0,{code:'S001',name:'Product'});assert.equal(f.tempFilterCriteria[0].value,'[S001] Product');
f.availableFields=[{key:'vms_status',type:'select',options:['Выгружен','Подтвержден WMS','Есть расхождение']}];f.supportedFilterFields=['vms_status'];
assert.equal(f.validateCriteria([{fieldKey:'vms_status',operator:'Равно',value:'Подтвержден ВМС'}]),true);
assert.equal(f.validateCriteria([{fieldKey:'vms_status',operator:'В списке',value:'Выгружен; Unknown'}]),false);

for(const fieldKey of ['artikul','barcode']) {
  f.tempFilterCriteria=[{fieldKey,operator:'Равно'}];
  f.applyCatalogSelection(0,{name:'Product',code:'S001',artikul:'ART-01',barcode:'0012345'});
  assert.equal(f.tempFilterCriteria[0].value,fieldKey==='artikul'?'ART-01':'0012345');
  f.applyValueListSelection(0,{displayStr:'Product',items:[{value:'Product',code:'S001',artikul:'ART-01',barcode:'0012345',comp:'equal'}]},null);
  assert.equal(f.tempFilterCriteria[0].structuredFilter.items[0].value,fieldKey==='artikul'?'ART-01':'0012345');
}
// Changing supported fields must never hide pre-existing choices from a section.
const journalSource=fs.readFileSync('static/js/universal_journal.js','utf8');
const start=journalSource.indexOf('  getAvailableFields: function()');
const end=journalSource.indexOf('  activeAutocompleteIdx:',start);
vm.runInContext('globalThis.journal = {'+journalSource.slice(start,end)+'};',ctx);
ctx.journal.activeDocType='РеализацияТоваровУслуг';ctx.journal.columns=[];
const previous=ctx.journal.getAvailableFields().map(f=>f.key);
ctx.journal.supportedFilterFields=['number','organization','currency'];
const updated=ctx.journal.getAvailableFields().map(f=>f.key);
assert.ok(previous.every(key=>updated.includes(key)));
assert.ok(updated.includes('organization'));assert.ok(updated.includes('currency'));
console.log('Product attribute selection and preservation of all existing filter choices passed.');
