const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({console,window:{},document:{getElementById:()=>null},localStorage:{getItem:()=>null},alert(){}});
ctx.window=ctx;ctx.addEventListener=()=>{};
vm.runInContext(fs.readFileSync('static/js/c1_dates.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('static/js/c1_filter_component.js','utf8')+';globalThis.f=C1FilterComponent;',ctx);
const f=ctx.f;
f.contextKey='РеализацияТоваровУслуг';
f.availableFields=f.loadPersistedAvailableFields([{key:'agent',label:'Агент',type:'text'}]);
for(const key of ['agent_sales_type','agent_sales_group']){
  assert.ok(f.availableFields.some(field=>field.key===key));
  assert.equal(f.isFieldInCurrentDoc(key),true);
  assert.deepEqual(Array.from(f.getOperatorsForField({key})),['Равно','Не равно','В списке','Не в списке','Заполнено','Не заполнено']);
}
const tree=f.getAvailableFieldTree();
const agent=tree.find(node=>node.id==='agent');
assert.equal(agent.children.length,2);
console.log('Agent field tree and reference comparisons passed.');
