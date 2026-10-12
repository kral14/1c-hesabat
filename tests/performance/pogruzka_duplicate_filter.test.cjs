const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({window:{},console});
vm.runInContext(fs.readFileSync('static/js/c1_filter_component.js','utf8'),context);
const filter = context.window.C1FilterComponent;
const criterion = {fieldKey:'pogruzka_duplicate',operator:'Равно',value:'Да'};
for (const row of [
  {pogruzka_total_count:2,pogruzka_duplicate:true},
  {pogruzka_total_count:2,pogruzka_duplicate:false},
  {pogruzka_total_count:3,pogruzka_duplicate:false}
]) {
  const marker = row.pogruzka_duplicate;
  assert.equal(filter.matchesCondition(row,criterion),true);
  assert.equal(row.pogruzka_duplicate,marker,'filter must not change the active duplicate marker');
}
assert.equal(filter.matchesCondition({pogruzka_total_count:1,pogruzka_duplicate:false},criterion),false);
assert.equal(filter.matchesCondition({pogruzka_total_count:0,pogruzka_duplicate:false},criterion),false);
assert.equal(filter.matchesCondition({pogruzka_total_count:2,pogruzka_duplicate:false},{...criterion,value:'Нет'}),false);
assert.equal(filter.matchesCondition({pogruzka_has_duplicates:true,pogruzka_duplicate:false},criterion),true);
const onlyRed={...criterion,fieldKey:'pogruzka_active_duplicate'};
assert.equal(filter.matchesCondition({pogruzka_total_count:2,active_pogruzka_count:1},onlyRed),false);
assert.equal(filter.matchesCondition({pogruzka_total_count:3,active_pogruzka_count:2},onlyRed),true);
assert.equal(filter.matchesCondition({pogruzka_total_count:2,active_pogruzka_count:0},onlyRed),false);
console.log('Duplicate filter checks passed: deleted documents included, active marker preserved.');
