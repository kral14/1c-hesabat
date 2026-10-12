const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({window:{},console});
vm.runInContext(fs.readFileSync('static/js/c1_filter_component.js','utf8'),context);
const filter = context.window.C1FilterComponent;
for (const key of ['posted','deleted','pogruzka_duplicate']) {
  assert.equal(JSON.stringify(filter.getOperatorsForField({key,type:'text'})),JSON.stringify(['Равно','Не равно']));
}
for (const key of ['kontragent','portfolio','nomenclature']) {
  const operators = filter.getOperatorsForField({key,type:'text'});
  assert.ok(operators.includes('Содержит'));
  assert.ok(!operators.some(op=>op.startsWith('Интервал')));
  assert.ok(!operators.includes('Больше'));
  assert.ok(!operators.includes('В группе из списка'));
}
for (const type of ['date','number']) {
  const operators = filter.getOperatorsForField({key:type,type});
  assert.ok(operators.includes('Интервал (>=, <=)'));
  assert.ok(!operators.includes('Содержит'));
}
assert.ok(!filter.getOperatorsForField({key:'vms_status',type:'select'}).includes('Меньше'));
console.log('Field-specific filter operator checks passed.');
