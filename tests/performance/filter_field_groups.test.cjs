const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const list={innerHTML:'',querySelector:()=>null};
const ctx=vm.createContext({console,window:{},document:{getElementById:id=>id==='ujAddAvailFieldList'?list:null},localStorage:{getItem:()=>null},alert(){}});
ctx.window=ctx;ctx.addEventListener=()=>{};
ctx.C1I18n={getLanguage:()=> 'az',translateColumn:(key,label)=>label,translatePhrase:label=>label,t:key=>key==='filter.already_added'?'Artıq siyahıdadır':key};
vm.runInContext(fs.readFileSync('static/js/c1_filter_component.js','utf8')+';globalThis.f=C1FilterComponent;',ctx);
ctx.f.contextKey='СписаниеТоваров';
assert.equal(ctx.f.isFieldInCurrentDoc('nomenclature'),true);
ctx.f.availableFields=[{key:'nomenclature'}];
const originalGetAllKnownFields=ctx.f.getAllKnownFields;
ctx.f.getAllKnownFields=()=>[
 {key:'organization',label:'Организация',category:'Основные',type:'text'},
 {key:'nomenclature',label:'Номенклатура',category:'Номенклатура',type:'text'},
 {key:'division',label:'Подразделение',category:'Основные',type:'text'}
];
ctx.f.renderAddAvailableFieldList();
assert.equal((list.innerHTML.match(/class="c1-field-group"/g)||[]).length,2);
assert.ok(list.innerHTML.indexOf('Bölmə')<list.innerHTML.indexOf('ujAddAvailItem_nomenclature'),'fields in same group stay together');
assert.ok(!/[А-Яа-яЁё]/.test(list.innerHTML.replace(/<[^>]*>/g,'')),'AZ labels and categories must be translated');
assert.ok(!list.innerHTML.includes('filter.already_added'));
assert.ok(list.innerHTML.includes('checked'));
const nom=list.innerHTML.slice(list.innerHTML.indexOf('id="ujAddAvailItem_nomenclature"'));
assert.ok(nom.includes('Dəstəklənir'));
ctx.f.renderAddAvailableFieldList('bölmə');
assert.ok(list.innerHTML.includes('ujAddAvailItem_division'));
assert.ok(!list.innerHTML.includes('ujAddAvailItem_nomenclature'));
ctx.f.contextKey='UnknownDocument';assert.equal(ctx.f.isFieldInCurrentDoc('nomenclature'),false);
console.log('Grouped field picker: AZ labels, category grouping, search and write-off nomenclature passed.');

// Old aliases and saved duplicates must remain usable without duplicate choices.
const saved=ctx.f.uniqueFields([{key:'wms_status',label:'old'}, {key:'vms_status',label:'new'}, {key:'vms_status',label:'again'}]);
assert.equal(saved.length,1);
assert.equal(saved[0].key,'vms_status');
assert.equal(ctx.f.uniqueFields([{key:'marshrut'},{key:'pogruzka_marshrut'},{key:'voditel'},{key:'pogruzka_voditel'}]).length,4,'direct and linked-document fields are distinct');
ctx.f.getAllKnownFields=originalGetAllKnownFields;
const known=ctx.f.getAllKnownFields();
assert.equal(known.filter(f=>f.key==='vms_status').length,1);
assert.equal(known.filter(f=>f.key==='wms_status').length,0);
ctx.f.contextKey='РеализацияТоваровУслуг';
assert.equal(ctx.f.isFieldInCurrentDoc('pogruzka_marshrut'),true);
assert.equal(ctx.f.isFieldInCurrentDoc('marshrut'),false);
ctx.f.contextKey='ПогрузкиМашин';
assert.equal(ctx.f.isFieldInCurrentDoc('marshrut'),true);
assert.equal(ctx.f.isFieldInCurrentDoc('pogruzka_marshrut'),false);
ctx.f.renderAddAvailableFieldList();
assert.ok(list.innerHTML.includes('Satışa bağlı yükləmə'));
assert.ok(list.innerHTML.includes('Yükləmə sənədi'));
console.log('Aliases deduplicated; direct and sale-linked loading fields stay distinct by document.');
