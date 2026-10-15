const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({console,window:{},document:{},alert(){},addEventListener(){}});
ctx.window=ctx;
vm.runInContext(fs.readFileSync('static/js/c1_dates.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('static/js/c1_filter_component.js','utf8')+';globalThis.f=C1FilterComponent',ctx);
const f=ctx.f;
let cases=0;
const rule=(fieldKey,operator,value,extra={})=>({fieldKey,operator,value,...extra});
const values=['Alpha','Beta','Alpha extra','',null];
const expected={
  'Равно':[0], 'Не равно':[1,2,3,4], 'В списке':[0,1], 'Не в списке':[2,3,4],
  'В группе из списка':[0,1], 'Содержит':[0,2], 'Не содержит':[1,3,4], 'Начинается с':[0,2],
  'Заполнено':[0,1,2], 'Не заполнено':[3,4]
};
for(const field of f.MASTER_1C_FIELDS.filter(v=>v.type==='text' && !['number','nomenclature'].includes(v.key))){
  for(const op of f.getOperatorsForField(field)){
    if(!expected[op])continue;
    const target=['В списке','Не в списке','В группе из списка'].includes(op)?'Alpha; Beta':'Alpha';
    const actual=values.flatMap((value,i)=>f.matchesCondition({[field.key]:value},rule(field.key,op,target))?[i]:[]);
    assert.deepEqual(actual,expected[op],field.key+' / '+op);cases++;
  }
}
for(const key of ['amount','realization_count']){
  const data=[0,1.5,3];
  const checks=[['Равно','1,5',[1]],['Не равно','1.5',[0,2]],['Больше','1.5',[2]],['Меньше','1.5',[0]],['Больше или равно','1.5',[1,2]],['Меньше или равно','1.5',[0,1]],['Заполнено','',[1,2]],['Не заполнено','',[0]]];
  for(const [op,value,expected]of checks){
    assert.deepEqual(data.flatMap((v,i)=>f.matchesCondition({[key]:v},rule(key,op,value))?[i]:[]),expected,key+' / '+op);cases++;
  }
}
for(const key of ['posted','deleted','pogruzka_duplicate','pogruzka_active_duplicate']){
  for(const op of ['Равно','Не равно']){
    assert.equal(f.matchesCondition({[key]:true,active_pogruzka_count:2},rule(key,op,'Да')),op==='Равно');cases++;
  }
}
assert.equal(f.matchesCondition({vms_status:'Подтвержден ВМС'},rule('vms_status','В списке','Выгружен; Подтвержден WMS')),true);cases++;
assert.equal(f.matchesCondition({vms_status:'Выгружен'},rule('vms_status','Не в списке','Выгружен; Подтвержден WMS')),false);cases++;
assert.equal(f.matchesCondition({vms_status:'Выгружен'},rule('comment','Заполнено','')),false);cases++;
assert.equal(f.matchesCondition({comment:'0014'},rule('comment','Равно','14')),false);cases++;
assert.equal(f.matchesCondition({date:'12.10.2026 09:00:00'},rule('date','Равно','12.10.2026 00:00:00')),false);cases++;
for(const [op,expected]of [['Равно',false],['Содержит',true],['Начинается с',true]]){
  assert.equal(f.matchesCondition({nom_keys:['Product extra|S01']},rule('nomenclature',op,'Product')),expected);cases++;
}
console.log(`Frontend comparison matrix passed: ${cases} field/operator cases`);

assert.equal(f.matchesCondition({date:'01.01.0001 00:00:00'},rule('date','Не заполнено','')),true);
assert.equal(f.matchesCondition({date:'01.01.0001 00:00:00'},rule('date','Заполнено','')),false);
