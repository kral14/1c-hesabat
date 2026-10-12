/* List sorting and conditional formatting, shared with the filter dialog. */
const ListAppearance = {
  supportedSort: new Set(['date','number','amount','kontragent','kontragent_code','golovnoy_kontragent','agent','portfolio','warehouse','deal','contract','contract_price_type','responsible','comment','vms_status','obrabotka_number','marshrut','voditel','posted','deleted']),
  load(context) {
    try { const data=JSON.parse(localStorage.getItem('uj_appearance_'+context)||'{}');
      return {sort:Array.isArray(data.sort)?data.sort:[],rules:Array.isArray(data.rules)?data.rules:[]};
    } catch (_) { return {sort:[],rules:[]}; }
  },
  open(context, fields) { this.context=context; this.fields=fields; this.draft=this.load(context);this.editingIndex=null;this.selectedRule=0; },
  commit() { const result=JSON.parse(JSON.stringify(this.draft));
    localStorage.setItem('uj_appearance_'+this.context,JSON.stringify(result)); return result; },
  esc(value) { return C1FilterComponent.escapeHtml(String(value??'')); },
  options(value, sorting=false) { return this.fields.filter(f=>!sorting||this.supportedSort.has(f.key)).map(f=>
    `<option value="${this.esc(f.key)}" ${f.key===value?'selected':''}>${this.esc(f.label)}</option>`).join(''); },
  edit(kind,index,key,value) { this.draft[kind][index][key]=value; },
  move(kind,index,direction) { const target=index+direction;
    if(target<0||target>=this.draft[kind].length)return;
    [this.draft[kind][index],this.draft[kind][target]]=[this.draft[kind][target],this.draft[kind][index]];
    this.render(kind==='sort'?'sort':'style'); },
  remove(kind,index) { this.draft[kind].splice(index,1); this.render(kind==='sort'?'sort':'style'); },
  add(kind) { const field=this.fields.find(f=>this.supportedSort.has(f.key))?.key||'date';
    this.draft[kind].push(kind==='sort'?{field,ascending:true,enabled:true}:
      {name:'Цвет фона',enabled:true,conditions:[],targets:[],color:'#111111',background:'#f0fff0',bold:false,italic:false,useColor:false,useBackground:true,useFont:false});
    this.render(kind==='sort'?'sort':'style'); },
  addCondition(index) { const field=this.fields[0];this.draft.rules[index].conditions.push({fieldKey:field?.key||'date',operator:'Равно',value:field?.type==='boolean'?'Да':'',enabled:true}); this.render('style'); },
  changeCondition(index,ci,key,value) { const condition=this.draft.rules[index].conditions[ci]; condition[key]=value;
    if(key==='fieldKey') {condition.operator='Равно';condition.value=this.fields.find(f=>f.key===value)?.type==='boolean'?'Да':'';delete condition.valueFrom;delete condition.valueTo;this.render('style');}
    if(key==='operator')this.render('style'); },
  removeCondition(index,ci) {this.draft.rules[index].conditions.splice(ci,1);this.render('style');},
  render(tab) {
    if(this.editingIndex!==null && this.editingIndex!==undefined && tab==='style'){this.renderEditor();return;}
    const body=document.getElementById('ujFilterTabBodyOther'); if(!body||!this.draft)return;
    body.style.alignItems='stretch';body.style.justifyContent='flex-start';body.style.overflow='auto';
    const kind=tab==='sort'?'sort':'rules';
    if(tab==='style'){this.renderRules(body);return;}
    let html=`<div style="padding:6px;background:#ece9d8"><button type="button" onclick="ListAppearance.add('${kind}')">➕ Добавить</button> <span>${tab==='sort'?'Порядок строк задаёт приоритет сортировки.':'Условия внутри правила объединяются через И. Пустой отбор применяется ко всем строкам.'}</span></div>`;
    if(tab==='sort') {
      html+='<table class="c1-appearance-table"><thead><tr><th>Использовать</th><th>Поле</th><th>Направление</th><th>Порядок</th></tr></thead><tbody>';
      this.draft.sort.forEach((rule,i)=>{html+=`<tr><td><input type="checkbox" ${rule.enabled!==false?'checked':''} onchange="ListAppearance.edit('sort',${i},'enabled',this.checked)"></td><td><select onchange="ListAppearance.edit('sort',${i},'field',this.value)">${this.options(rule.field,true)}</select></td><td><select onchange="ListAppearance.edit('sort',${i},'ascending',this.value==='asc')"><option value="asc" ${rule.ascending?'selected':''}>По возрастанию</option><option value="desc" ${!rule.ascending?'selected':''}>По убыванию</option></select></td><td>${this.actions('sort',i)}</td></tr>`;});
      html+='</tbody></table>';
    }
    body.innerHTML=html;
  },
  actions(kind,index) {return `<button type="button" aria-label="Вверх" onclick="ListAppearance.move('${kind}',${index},-1)">↑</button><button type="button" aria-label="Вниз" onclick="ListAppearance.move('${kind}',${index},1)">↓</button><button type="button" aria-label="Удалить правило" onclick="ListAppearance.remove('${kind}',${index})">✕</button>`;},
  renderRules(body) {
    this.selectedRule=Math.min(this.selectedRule||0,Math.max(0,this.draft.rules.length-1));
    let html=`<div class="appearance-toolbar"><button onclick="ListAppearance.add('rules');ListAppearance.openEditor(ListAppearance.draft.rules.length-1)">🟢 Добавить</button><button aria-label="Удалить оформление" onclick="ListAppearance.remove('rules',ListAppearance.selectedRule)">❌</button><button onclick="ListAppearance.move('rules',ListAppearance.selectedRule,-1);ListAppearance.selectedRule=Math.max(0,ListAppearance.selectedRule-1)">⬆</button><button onclick="ListAppearance.move('rules',ListAppearance.selectedRule,1);ListAppearance.selectedRule=Math.min(ListAppearance.draft.rules.length-1,ListAppearance.selectedRule+1)">⬇</button></div><table class="c1-appearance-table appearance-rule-list"><thead><tr><th style="width:28px"></th><th>Оформление</th><th>Условие</th><th>Оформляемые поля</th></tr></thead><tbody>`;
    this.draft.rules.forEach((rule,i)=>{
      const conditions=(rule.conditions||[]).map(c=>`${this.fields.find(f=>f.key===c.fieldKey)?.label||c.fieldKey} ${c.operator} "${c.value||[c.valueFrom,c.valueTo].filter(Boolean).join(' — ')}"`).join('; ');
      const targets=rule.targets?.length?rule.targets.map(key=>this.fields.find(f=>f.key===key)?.label||key).join(', '):'<Все поля>';
      html+=`<tr class="${i===this.selectedRule?'appearance-selected':''}" onclick="ListAppearance.selectedRule=${i};ListAppearance.render('style')" ondblclick="ListAppearance.openEditor(${i})"><td><input type="checkbox" ${rule.enabled!==false?'checked':''} onclick="event.stopPropagation()" onchange="ListAppearance.edit('rules',${i},'enabled',this.checked)"></td><td>${this.esc(rule.name)}</td><td>${this.esc(conditions||'<Без условия>')}</td><td>${this.esc(targets)}</td></tr>`;
    });body.innerHTML=html+'</tbody></table>';
  },
  openEditor(index) {
    if(!this.draft.rules[index])return;
    this.selectedRule=index;this.editingIndex=index;this.editorBackup=JSON.parse(JSON.stringify(this.draft.rules[index]));this.editorTab='format';
    let dialog=document.getElementById('appearanceRuleEditor');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='appearanceRuleEditor';dialog.className='appearance-editor';document.body.appendChild(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();this.closeEditor(false);});}
    this.renderEditor();dialog.showModal();
  },
  closeEditor(save) {
    if(!save)this.draft.rules[this.editingIndex]=this.editorBackup;
    this.editingIndex=null;document.getElementById('appearanceRuleEditor').close();this.render('style');
  },
  setParameter(key,value) {this.draft.rules[this.editingIndex][key]=value;},
  renderEditor() {
    const i=this.editingIndex,r=this.draft.rules[i],dialog=document.getElementById('appearanceRuleEditor');if(!dialog||!r)return;
    const input=(key,value,type='text')=>`<input type="${type}" aria-label="${key}" value="${this.esc(value)}" oninput="ListAppearance.setParameter('${key}',this.value)">`;
    let html='<div class="appearance-title">Редактирование элемента условного оформления <button aria-label="Закрыть редактор" onclick="ListAppearance.closeEditor(false)">✕</button></div><div class="appearance-editor-content"><div class="appearance-tabs">';
    for(const [key,label] of [['format','Оформление'],['condition','Условие'],['fields','Оформляемые поля']])html+=`<button class="${this.editorTab===key?'active':''}" onclick="ListAppearance.editorTab='${key}';ListAppearance.renderEditor()">${label}</button>`;
    html+='</div><div class="appearance-editor-page">';
    if(this.editorTab==='format'){
      const params=[['useBackground','Цвет фона',input('background',r.background,'color')],['useColor','Цвет текста',input('color',r.color,'color')],['useFont','Шрифт',`<label><input type="checkbox" ${r.bold?'checked':''} onchange="ListAppearance.setParameter('bold',this.checked)">Жирный</label> <label><input type="checkbox" ${r.italic?'checked':''} onchange="ListAppearance.setParameter('italic',this.checked)">Курсив</label> ${input('fontSize',r.fontSize||12,'number')}`],['useAlign','Горизонтальное положение',`<select onchange="ListAppearance.setParameter('align',this.value)">${[['left','Прижать влево'],['center','По центру'],['right','Прижать вправо']].map(([v,label])=>`<option value="${v}" ${(r.align||'left')===v?'selected':''}>${label}</option>`).join('')}</select>`],['useNegative','Выделять отрицательные','Красным цветом'],['useEmpty','Отметка незаполненного','—'],['useText','Текст',input('text',r.text||'')],['useVisibility','Видимость',`<select onchange="ListAppearance.setParameter('visible',this.value==='true')"><option value="true" ${r.visible!==false?'selected':''}>Да</option><option value="false" ${r.visible===false?'selected':''}>Нет</option></select>`]];
      params.splice(4,0,['useFormat','Формат',input('format',r.format||'')]);
      for(const [flag,label,key] of [['useAvailable','Доступность','available'],['useDisplay','Отображать','display']])params.push([flag,label,`<select onchange="ListAppearance.setParameter('${key}',this.value==='true')"><option value="true" ${r[key]!==false?'selected':''}>Да</option><option value="false" ${r[key]===false?'selected':''}>Нет</option></select>`]);
      html+='<table class="c1-appearance-table"><thead><tr><th style="width:28px"></th><th>Параметр</th><th>Значение</th></tr></thead><tbody>';
      for(const [key,label,value] of params){const enabled=r[key]===true||r[key]===undefined&&['useBackground','useColor','useFont'].includes(key);html+=`<tr><td><input type="checkbox" aria-label="Использовать: ${label}" ${enabled?'checked':''} onchange="ListAppearance.setParameter('${key}',this.checked)"></td><td>${label}</td><td>${value}</td></tr>`;}
      html+='</tbody></table>';
    }else if(this.editorTab==='fields'){
      html+='<p>Не выбрано — &lt;Все поля&gt;</p><select multiple aria-label="Оформляемые поля" class="appearance-field-select" onchange="ListAppearance.setParameter(\'targets\',Array.from(this.selectedOptions).map(o=>o.value))">'+this.fields.map(f=>`<option value="${this.esc(f.key)}" ${(r.targets||[]).includes(f.key)?'selected':''}>${this.esc(f.label)}</option>`).join('')+'</select>';
    }else{
      html+=`<div class="appearance-toolbar"><button onclick="ListAppearance.addCondition(${i})">🟢 Добавить</button><span>Условия соединяются через И</span></div><table class="c1-appearance-table"><thead><tr><th>Поле</th><th>Вид сравнения</th><th>Значение</th><th></th></tr></thead><tbody>`;
      (r.conditions||[]).forEach((c,ci)=>{
        const f=this.fields.find(f=>f.key===c.fieldKey)||{key:c.fieldKey},handler=key=>`ListAppearance.changeCondition(${i},${ci},'${key}',this.value)`;
        let value=`<input aria-label="Значение условия" value="${this.esc(c.value)}" oninput="${handler('value')}">`;
        if(f.type==='boolean')value=`<select onchange="${handler('value')}">${['Да','Нет'].map(v=>`<option ${v===c.value?'selected':''}>${v}</option>`).join('')}</select>`;
        if(c.operator.startsWith('Интервал'))value=`<input placeholder="От" value="${this.esc(c.valueFrom)}" oninput="${handler('valueFrom')}"> — <input placeholder="До" value="${this.esc(c.valueTo)}" oninput="${handler('valueTo')}">`;
        if(['Заполнено','Не заполнено'].includes(c.operator))value='';
        html+=`<tr><td><select onchange="${handler('fieldKey')}">${this.options(c.fieldKey)}</select></td><td><select onchange="${handler('operator')}">${C1FilterComponent.getOperatorsForField(f).map(op=>`<option ${op===c.operator?'selected':''}>${this.esc(op)}</option>`).join('')}</select></td><td>${value}</td><td><button onclick="ListAppearance.removeCondition(${i},${ci})">✕</button></td></tr>`;
      });html+='</tbody></table>';
    }
    dialog.innerHTML=html+'</div><div class="appearance-editor-footer"><button onclick="ListAppearance.closeEditor(true)">OK</button><button onclick="ListAppearance.closeEditor(false)">Отмена</button><button title="Для применения отметьте параметр, настройте значение, условие и оформляемые поля.">?</button></div></div>';
  },
  formatting(row,key,settings) {
    const style={};
    if(!row)return style;
    for(const rule of settings?.rules||[]) {
      if(rule.enabled===false || (rule.targets?.length&&!rule.targets.includes(key)))continue;
      if(!(rule.conditions||[]).every(c=>C1FilterComponent.matchesCondition(row,c)))continue;
      if(rule.useColor!==false&&/^#[0-9a-f]{6}$/i.test(rule.color))style.color=rule.color;
      if(rule.useBackground!==false&&/^#[0-9a-f]{6}$/i.test(rule.background))style.background=rule.background;
      if(rule.useFont!==false){style.fontWeight=rule.bold?'bold':'normal';style.fontStyle=rule.italic?'italic':'normal';if(rule.fontSize&&Number(rule.fontSize)>=6&&Number(rule.fontSize)<=32)style.fontSize=Number(rule.fontSize)+'px';}
      if(rule.useAlign&&['left','center','right'].includes(rule.align))style.textAlign=rule.align;
      if(rule.useNegative&&Number(row[key])<0)style.color='#c00000';
      if(rule.useVisibility&&rule.visible===false)style.visibility='hidden';
      if(rule.useDisplay&&rule.display===false)style.visibility='hidden';
      if(rule.useAvailable&&rule.available===false){style.opacity='.55';style.pointerEvents='none';}
      if(rule.useFormat&&typeof row[key]==='number'&&/^0(?:\.0{1,10})?$/.test(rule.format||''))style.text=row[key].toFixed((rule.format.split('.')[1]||'').length);
      if(rule.useText)style.text=String(rule.text||'');
      if(rule.useEmpty&&(row[key]===undefined||row[key]===null||row[key]===''))style.text='—';
    }
    return style;
  }
};

// Keep existing filter apply/preset workflows and pass list settings alongside them.
const originalFilterOpen=C1FilterComponent.open;
C1FilterComponent.open=function(options={}) {
  ListAppearance.open(options.docType||options.contextKey||'default',options.availableFields||[]);
  const callback=options.onApply;
  return originalFilterOpen.call(this,{...options,onApply:(filters,name)=>{
    const appearance=ListAppearance.commit();if(callback)callback(filters,name,appearance);
  }});
};
