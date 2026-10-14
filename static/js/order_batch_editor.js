/* Frontend prototype. No network calls and no 1C writes. */
(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = value => JSON.parse(JSON.stringify(value));
  const money = value => Number(value).toLocaleString('ru-RU', {minimumFractionDigits:2,maximumFractionDigits:2});
  const catalog = [
    {code:'TEST-001',name:'JACOB ICEPR LATTE 250MLX12 · nümunə',unit:'əd',price:2.10},
    {code:'TEST-002',name:'JACOB ICEPR CLASSIC 250MLX12 · nümunə',unit:'əd',price:2.10},
    {code:'TEST-003',name:'NS / Oblepikha Siberica 300 ml · nümunə',unit:'əd',price:15.86},
    {code:'TEST-004',name:'NS / Şampun 500 ml · nümunə',unit:'əd',price:8.48}
  ];
  const editor = window.OrderBatchEditor = {
    orders:[], original:[], selectedProduct:null, dialogMode:null, sourceText:'',
    get el() { return document.getElementById('orderBatchEditorWindow'); },
    get operationEl() { return document.getElementById('obeOperationWindow'); },
    bind() {
      if (this.bound) return;
      this.bound=true;
      for(const root of [this.el,this.operationEl]) {
      root.addEventListener('click', event => {
        const button=event.target.closest('[data-obe-action]');
        if (!button) return;
        const order=this.orders.find(o=>o.id===button.dataset.order);
        const action=button.dataset.obeAction;
        if(action==='save') this.save();
        else if(action==='reset') this.reset();
        else if(action==='delete') this.remove(order,button.dataset.row);
        else if(action==='add') this.showAdd(order);
        else if(action==='add-all') this.showAllocation('add-many');
        else if(action==='replace') this.showAllocation('replace',this.selectedProduct);
        else if(action==='distribute') this.distributeTotal();
        else if(action==='import-codes') this.importCodes();
        else if(action==='upload-excel') document.getElementById('obeExcelFile').click();
        else if(action==='excel-template') {
          const link=document.createElement('a');link.href='/api/orders/preview/excel-template';link.download='magaza_miqdarlari_numune.xlsx';link.click();
        }
        else if(action==='select-all') this.selectDialogRows(true);
        else if(action==='deselect-all') this.selectDialogRows(false);
        else if(action==='product') this.showBatch(button.dataset.code);
        else if(action==='batch') this.showBatch(this.selectedProduct);
        else if(action==='apply-dialog') this.applyDialog();
        else if(action==='cancel-dialog') this.closeOperation();
        else if(action==='demo') this.openDemo();
      });
      root.addEventListener('input', event=>{
        const input=event.target;
        if(input.id==='obeSearch') this.render();
        if(input.dataset.obeQty) this.changeQty(input);
        if(input.id==='obeProductSearch') this.searchProducts(input.value);
        if(input.hasAttribute('data-allocation-qty')) this.allocationSummary();
        if(input.hasAttribute('data-allocation-qty') || input.hasAttribute('data-batch-qty')) this.syncDialogRow(input);
      });
      root.addEventListener('change',event=>{
        if(event.target.id==='obeExcelFile' && event.target.files[0])this.loadExcel(event.target.files[0]);
        if(event.target.matches('[data-allocation-check],[data-batch-check]')) {this.syncDialogRow(event.target);this.updateDialogSelection();}
        if(event.target.hasAttribute('data-dialog-select-all'))this.selectDialogRows(event.target.checked);
      });
      }
    },
    open(journal) {
      if(this.dirty() && !confirm('Pəncərədəki dəyişiklikləri atıb yeni sifarişləri açmaq?')) return;
      this.bind();
      const headers=copy(journal.filteredItems || []);
      this.sourceText=`${journal.startDateStr || 'Bütün dövr'} — ${journal.endDateStr || ''} · Jurnalda göstərilən ${headers.length} sifariş`;
      if(journal.hasMoreDocs) this.sourceText+=' · Sınaqda yalnız hazır yüklənmiş sifariş başlıqları köçürülüb; tam filtr nəticəsinin yüklənməsi növbəti mərhələdir.';
      this.setHeaders(headers);
      this.show();
    },
    setHeaders(headers) {
      this.orders=headers.map((header,index)=>({
        id:`order-${index}`,number:header.number || `TEST-${index+1}`,date:header.date || '14.10.2026 09:00:00',
        store:header.kontragent || 'Sınaq mağazası',warehouse:header.warehouse || '1. Anbar — Sınaq',
        portfolio:header.portfolio || '—',
        storeCode:String(header.kontragent_code || String(header.kontragent || '').match(/[CС]\d+\s*$/i)?.[0]?.trim() || String(header.kontragent || '').match(/^\d+/)?.[0] || `TEST-S${index+1}`),
        posted:Boolean(header.posted),items:catalog.slice(0,3).map((product,row)=>({...product,id:`row-${row}`,qty:[6,12,3][(index+row)%3]}))
      }));
      this.original=copy(this.orders);this.selectedProduct=null;
      document.getElementById('obeSearch').value='';
      this.render();this.status('Sınaq hazırdır. Miqdarları dəyişə, mal əlavə edə və silə bilərsən.');
    },
    openDemo() {
      if(this.dirty() && !confirm('Dəyişiklikləri atıb nümunə sifarişləri açmaq?')) return;
      this.sourceText='Nümunə sifarişlər · 1C-dən alınmayıb';
      this.setHeaders([
        {number:'TEST-000101',kontragent:'MIR MARKET · sınaq',warehouse:'1. Anbar — Sınaq',date:'14.10.2026 09:12:00',posted:true},
        {number:'TEST-000102',kontragent:'ORDUBAD MARKET · sınaq',warehouse:'2. Anbar — Sınaq',date:'14.10.2026 09:25:00',posted:false},
        {number:'TEST-000103',kontragent:'Grand Park Plus · sınaq',warehouse:'1. Anbar — Sınaq',date:'14.10.2026 10:03:00',posted:true}
      ]);
    },
    show() {
      this.el.style.display='flex';
      if(window.MdiManager) MdiManager.activateWindow('orderBatchEditorWindow', {title:window.C1I18n?.getLanguage()==='az'?'Sifarişlər — düzəliş (sınaq)':'Заказы — изменение (тест)',icon:'📝',closeFn:()=>{
        if(this.operationOpen) this.closeOperation();
        this.el.style.display='none';
      }});
    },
    close() {
      if(this.dirty() && !confirm('Saxlanmamış sınaq dəyişiklikləri var. Pəncərəni bağlamaq?')) return;
      if(this.operationOpen) this.closeOperation();
      if(window.MdiManager) MdiManager.closeWindow('orderBatchEditorWindow');
      this.el.style.display='none';
    },
    dirty() {return JSON.stringify(this.orders)!==JSON.stringify(this.original);},
    orderChanged(order) {return JSON.stringify(order)!==JSON.stringify(this.original.find(o=>o.id===order.id));},
    total(order) {return order.items.reduce((sum,row)=>sum+row.qty*row.price,0);},
    status(text) {document.getElementById('obeStatus').textContent=text;},
    render() {
      const query=document.getElementById('obeSearch').value.trim().toLocaleLowerCase();
      const visible=this.orders.filter(order=>!query || [order.number,order.store,order.warehouse,...order.items.map(r=>r.code+' '+r.name)].join(' ').toLocaleLowerCase().includes(query));
      document.getElementById('obeScope').textContent=this.sourceText;
      document.getElementById('obeOrders').innerHTML=visible.map(order=>this.orderHtml(order)).join('') ||
        `<div class="obe-empty">${this.orders.length?'Поиск не дал результатов.':'Нет показанных заказов. Сначала отфильтруйте журнал.'}${!this.orders.length?'<p><button class="btn-1c" data-obe-action="demo">Открыть 3 примера для проверки интерфейса</button></p>':''}</div>`;
    },
    orderHtml(order) {
      const original=this.original.find(o=>o.id===order.id);
      const dirty=this.orderChanged(order);
      return `<section class="obe-order" data-order-card="${order.id}">
        <div class="obe-order-header"><div class="obe-order-heading"><div><strong>Заказ покупателя № ${esc(order.number)}</strong><span class="obe-state ${dirty?'obe-dirty':''}">${dirty?'Изменён':order.posted?'Проведён':'Черновик'}</span></div><button class="btn-1c" data-obe-action="add" data-order="${order.id}">＋ Добавить товар</button></div>
        <div class="obe-order-meta"><span><b>Магазин:</b> ${esc(order.store)}</span><span><b>Склад:</b> ${esc(order.warehouse)}</span><span><b>Портфель:</b> ${esc(order.portfolio)}</span><span><b>Дата:</b> ${esc(order.date)}</span></div></div>
        <div class="obe-table-wrap"><table class="obe-table"><thead><tr><th>№</th><th>Код</th><th>Товар</th><th>Ед.</th><th>Количество</th><th>Цена</th><th>Сумма</th><th></th></tr></thead><tbody>
        ${order.items.map((row,index)=>{
          const old=original?.items.find(r=>r.id===row.id),changed=!old || old.qty!==row.qty;
          return `<tr class="${changed?'obe-changed':''}" data-row="${row.id}"><td>${index+1}</td><td>${esc(row.code)}</td><td><button class="obe-product-button" data-obe-action="product" data-code="${esc(row.code)}" title="Изменить количество этого товара по магазинам">${esc(row.name)}</button>${!old?'<span class="obe-old">Добавлен</span>':''}</td><td>${esc(row.unit)}</td><td><input aria-label="Количество ${esc(row.code)} в заказе ${esc(order.number)}" type="number" min="0.001" step="any" value="${row.qty}" data-obe-qty="1" data-order="${order.id}" data-row="${row.id}">${old && old.qty!==row.qty?`<span class="obe-old">Было: ${old.qty}</span>`:''}</td><td class="obe-num">${money(row.price)}</td><td class="obe-num" data-row-total>${money(row.qty*row.price)}</td><td><button class="obe-delete" data-obe-action="delete" data-order="${order.id}" data-row="${row.id}" title="Удалить товар">✕</button></td></tr>`;
        }).join('') || '<tr><td colspan="8">В заказе нет товаров. Добавьте товар.</td></tr>'}</tbody></table></div>
        <div class="obe-order-footer"><span data-order-count>Товаров: ${order.items.length}</span><strong>Итого: <span data-order-total>${money(this.total(order))}</span> AZN</strong></div>
      </section>`;
    },
    changeQty(input) {
      const qty=Number(input.value),valid=input.value!=='' && Number.isFinite(qty) && qty>0;
      input.setCustomValidity(valid?'':'Miqdar sıfırdan böyük olmalıdır. Silmək üçün ✕ istifadə edin.');
      if(!valid) {this.status('Miqdar düzgün deyil; dəyişiklik tətbiq olunmadı.');return;}
      const order=this.orders.find(o=>o.id===input.dataset.order),row=order.items.find(r=>r.id===input.dataset.row);
      row.qty=qty;this.selectedProduct=row.code;
      const card=input.closest('[data-order-card]');
      input.closest('tr').querySelector('[data-row-total]').textContent=money(qty*row.price);
      input.closest('tr').classList.toggle('obe-changed',this.original.find(o=>o.id===order.id)?.items.find(r=>r.id===row.id)?.qty!==qty);
      card.querySelector('[data-order-total]').textContent=money(this.total(order));
      const badge=card.querySelector('.obe-state');badge.textContent=this.orderChanged(order)?'Изменён':order.posted?'Проведён':'Черновик';badge.classList.toggle('obe-dirty',this.orderChanged(order));
      this.status('Dəyişiklik hazırlanıb. «Записать (тест)» ilə yalnız pəncərədə saxlanacaq.');
    },
    remove(order,rowId) {if(!order)return;order.items=order.items.filter(r=>r.id!==rowId);this.render();this.status('Mal sifarişdən çıxarıldı (sınaq).');},
    reset() {if(this.dirty()&&!confirm('Bütün dəyişiklikləri ilkin vəziyyətə qaytarmaq?'))return;this.orders=copy(this.original);this.render();this.status('İlkin vəziyyət bərpa edildi.');},
    save() {
      for(const input of this.el.querySelectorAll('[data-obe-qty]')) if(!input.reportValidity())return;
      const count=this.orders.filter(order=>this.orderChanged(order)).length;
      this.original=copy(this.orders);this.render();
      this.status(`${count} sifarişin dəyişiklikləri pəncərədə saxlandı. 1C-yə heç nə yazılmadı.`);
    },
    openOperation() {
      this.operationOpen=true;
      this.operationEl.style.display='flex';
      if(window.MdiManager)MdiManager.activateWindow('obeOperationWindow',{
        title:document.getElementById('obeDialogTitle').textContent,icon:'✎',isModal:false,isDialog:false,
        closeFn:()=>{this.operationOpen=false;this.operationEl.style.display='none';}
      });
    },
    closeOperation() {
      this.operationOpen=false;
      if(window.MdiManager)MdiManager.closeWindow('obeOperationWindow');
      this.operationEl.style.display='none';
    },
    showAdd(order) {
      this.dialogMode={type:'add',orderId:order.id};
      document.getElementById('obeDialogTitle').textContent=`Добавить товар · № ${order.number}`;
      document.getElementById('obeDialogBody').innerHTML=`<label>Товар (сınaq kataloqu)<select id="obeAddCode">${catalog.map(p=>`<option value="${p.code}">${esc(p.code+' — '+p.name)}</option>`).join('')}</select></label><label>Количество <input id="obeAddQty" type="number" min="0.001" step="any" value="1"></label>`;
      this.openOperation();
    },
    showBatch(code) {
      const available=catalog.filter(p=>this.orders.some(o=>o.items.some(r=>r.code===p.code)));
      if(!available.length){this.status('Əvvəlcə sifarişə mal əlavə et.');return;}
      this.selectedProduct=available.some(p=>p.code===code)?code:available[0].code;
      this.dialogMode={type:'batch'};
      document.getElementById('obeDialogTitle').textContent='Изменить товар по магазинам';
      document.getElementById('obeDialogBody').innerHTML=`<label>Товар<select id="obeBatchCode">${available.map(p=>`<option value="${p.code}" ${p.code===this.selectedProduct?'selected':''}>${esc(p.code+' — '+p.name)}</option>`).join('')}</select></label><button class="btn-1c" data-obe-action="replace">⇄ Заменить выбранный товар другим</button><p>Отметьте нужные заказы и измените количество напротив каждого магазина.</p><div id="obeBatchRows" class="obe-dialog-scroll"></div>`;
      document.getElementById('obeBatchCode').onchange=event=>{this.selectedProduct=event.target.value;this.renderBatchRows();};
      this.renderBatchRows();this.openOperation();
    },
    renderBatchRows() {
      const rows=this.orders.flatMap(o=>o.items.filter(r=>r.code===this.selectedProduct).map(r=>({id:o.id+':'+r.id,orderId:o.id,rowId:r.id,storeCode:o.storeCode,store:o.store,number:o.number,current:r.qty,qty:r.qty,checked:true})));
      this.createDialogTable(document.getElementById('obeBatchRows'),rows,'batch');
    },
    applyDialog() {
      if(['add-many','replace'].includes(this.dialogMode?.type)) {this.applyAllocation();return;}
      if(this.dialogMode?.type==='add') {
        const input=document.getElementById('obeAddQty');if(!input.reportValidity() || !input.value)return;
        const product=catalog.find(p=>p.code===document.getElementById('obeAddCode').value);
        const order=this.orders.find(o=>o.id===this.dialogMode.orderId),existing=order.items.find(r=>r.code===product.code);
        if(existing)existing.qty+=Number(input.value);else order.items.push({...product,id:`new-${Date.now()}-${order.items.length}`,qty:Number(input.value)});
      }else if(this.dialogMode?.type==='batch') {
        const inputs=Array.from(this.operationEl.querySelectorAll('[data-batch-qty]')).filter(i=>i.closest('tr').querySelector('[data-batch-check]').checked);
        for(const input of inputs)if(input.value && !input.reportValidity())return;
        inputs.forEach(input=>{const row=this.orders.find(o=>o.id===input.dataset.order).items.find(r=>r.id===input.dataset.row);if(input.value)row.qty=Number(input.value);});
      }
      this.closeOperation();this.render();this.status('Seçilmiş dəyişikliklər tətbiq edildi (sınaq).');
    },
    showAllocation(type,sourceCode=null) {
      const batchInputs=Array.from(this.operationEl.querySelectorAll('[data-batch-qty]'));
      const selectedOrders=this.operationOpen && type==='replace' && batchInputs.length ?
        new Set(batchInputs.filter(i=>i.closest('tr').querySelector('[data-batch-check]').checked).map(i=>i.dataset.order)) : null;
      const eligible=this.orders.filter(o=>(!selectedOrders || selectedOrders.has(o.id)) && (type!=='replace' || o.items.some(r=>r.code===sourceCode)));
      if(!eligible.length){this.status('Uyğun sifariş yoxdur.');return;}
      if(this.operationOpen)this.closeOperation();
      this.dialogMode={type,sourceCode,orderIds:eligible.map(o=>o.id)};
      document.getElementById('obeDialogTitle').textContent=type==='replace'?'Заменить товар по магазинам':'Добавить товар в выбранные заказы';
      document.getElementById('obeDialogBody').innerHTML=`
        ${type==='replace'?`<div class="obe-replace-source">Заменяем: <b>${esc(catalog.find(p=>p.code===sourceCode)?.name || sourceCode)}</b></div>`:''}
        <label>Найти ${type==='replace'?'новый ':''}товар <input id="obeProductSearch" type="search" placeholder="Код или название · сınaq kataloqu"></label>
        <select id="obeAllocationProduct" aria-label="Выбранный товар"></select>
        <div class="obe-distribution"><label>Общее количество <input id="obeTotalQty" type="number" min="0.001" step="any" placeholder="İstəyə görə"></label><button class="btn-1c" data-obe-action="distribute">Распределить поровну</button><button class="btn-1c" data-obe-action="select-all">Выбрать все</button><button class="btn-1c" data-obe-action="deselect-all">Seçimi ləğv et</button></div>
        <p class="obe-allocation-help">Ümumi miqdar məcburi deyil. Boş saxlasan, əvvəlki miqdarlar qalır; yalnız «Bölüşdür» basanda yeni bölgü edilir.</p>
        <details class="obe-code-import"><summary>Заполнить по кодам магазинов (из Excel / списка)</summary><p>Одна строка: код магазина и общее количество. Если у магазина несколько заказов, количество делится между ними.</p><button class="btn-1c" data-obe-action="upload-excel">📂 Excel yüklə (.xlsx)</button> <button class="btn-1c" data-obe-action="excel-template">⬇ Excel nümunəsini endir</button><input id="obeExcelFile" type="file" accept=".xlsx" hidden><p>Birinci vərəq: mağaza kodu və miqdar. Başlıq sətri ola bilər. Fayl sənədlərə yazılmır.</p><textarea id="obeCodeQuantities" rows="4" placeholder="C000020101&#9;24&#10;C000032840&#9;12"></textarea><button class="btn-1c" data-obe-action="import-codes">Заполнить по кодам</button></details>
        <div id="obeAllocationMessage" role="status"></div>
        <div id="obeAllocationRows" class="obe-dialog-scroll"></div><div id="obeAllocationSummary" class="obe-allocation-summary"></div>
        <p class="obe-allocation-help">${type==='replace'?'Старый товар удаляется только из отмеченных заказов. Цена и единица берутся у нового товара. Если новый товар уже есть, количества суммируются.':'Указанное количество прибавляется к товару, если он уже есть в заказе.'} Данные остаются только в сınaq пəncərəsində.</p>`;
      const rows=eligible.map(order=>{
        const qty=type==='replace'?order.items.filter(r=>r.code===sourceCode).reduce((sum,r)=>sum+r.qty,0):1;
        return {id:order.id,orderId:order.id,storeCode:order.storeCode,store:order.store,number:order.number,current:type==='replace'?qty:0,originalQty:qty,qty,checked:true};
      });
      this.createDialogTable(document.getElementById('obeAllocationRows'),rows,'allocation');
      this.searchProducts('');
      document.getElementById('obeAllocationProduct').onchange=()=>this.refreshAllocationCurrent();
      this.refreshAllocationCurrent();this.allocationSummary();this.openOperation();
    },
    searchProducts(query) {
      const select=document.getElementById('obeAllocationProduct');if(!select)return;
      const previous=select.value,q=query.trim().toLocaleLowerCase();
      const products=catalog.filter(p=>p.code!==this.dialogMode.sourceCode && `${p.code} ${p.name}`.toLocaleLowerCase().includes(q));
      select.innerHTML=products.map(p=>`<option value="${p.code}">${esc(p.code+' — '+p.name+' · '+money(p.price)+' AZN')}</option>`).join('');
      if(products.some(p=>p.code===previous))select.value=previous;
      if(!products.length)select.innerHTML='<option value="">Товар не найден в сınaq каталоге</option>';
      this.refreshAllocationCurrent();
    },
    refreshAllocationCurrent() {
      if(this.dialogMode.type!=='add-many')return;
      const code=document.getElementById('obeAllocationProduct')?.value;
      this.allocationInputs(false).forEach(input=>{
        const qty=this.orders.find(o=>o.id===input.dataset.order).items.filter(r=>r.code===code).reduce((sum,r)=>sum+r.qty,0);
        input.closest('tr').querySelector('[data-allocation-current]').textContent=qty;
        const row=this.dialogRows.find(r=>r.orderId===input.dataset.order);if(row)row.current=qty;
      });
    },
    allocationInputs(selected=true) {return Array.from(this.operationEl.querySelectorAll('[data-allocation-qty]')).filter(i=>!selected || i.closest('tr').querySelector('[data-allocation-check]').checked);},
    allocationMessage(text,error=false) {const el=document.getElementById('obeAllocationMessage');el.textContent=text;el.className=error?'obe-allocation-error':'';},
    allocationSummary() {
      const inputs=this.allocationInputs();
      const total=inputs.reduce((sum,i)=>sum+(i.value?Number(i.value):this.dialogRows.find(r=>r.orderId===i.dataset.order)?.originalQty || 0),0);
      document.getElementById('obeAllocationSummary').textContent=`Выбрано заказов: ${inputs.length} · Общее количество: ${Math.round(total*1000)/1000}`;
    },
    splitQuantity(total,count) {
      if(!Number.isFinite(total)||total<=0||!count)throw Error('Müsbət ümumi miqdar və ən azı bir sifariş seçin.');
      const scale=Number.isInteger(total)?1:1000,units=Math.round(total*scale);
      if(Math.abs(units/scale-total)>0.0000001)throw Error('Miqdar ən çox 3 onluq rəqəmlə yazılmalıdır.');
      const each=Math.floor(units/count),remainder=units%count;
      return Array.from({length:count},(_,i)=>(each+(i<remainder?1:0))/scale);
    },
    distributeTotal() {
      try {
        const totalInput=document.getElementById('obeTotalQty');
        if(!totalInput.value.trim()){this.allocationMessage('Ümumi miqdar yazılmayıb. Əvvəlki miqdarlar və seçimlər saxlanıldı.');return;}
        const inputs=this.allocationInputs(),total=Number(totalInput.value);
        const quantities=this.splitQuantity(total,inputs.length);
        inputs.forEach((input,i)=>{input.value=quantities[i];input.closest('tr').querySelector('[data-allocation-check]').checked=quantities[i]>0;this.syncDialogRow(input);});
        this.updateDialogSelection();this.allocationMessage('Ümumi miqdar bərabər bölündü; qalıq ilk sifarişlərə verildi. Sıfır pay alan sifarişlər seçilmədi.');
      } catch(error){this.allocationMessage(error.message,true);}
    },
    async loadExcel(file) {
      const context=this.dialogMode,button=this.operationEl.querySelector('[data-obe-action="upload-excel"]');
      if(!file.name.toLowerCase().endsWith('.xlsx')){this.allocationMessage('Excel .xlsx faylı seçin.',true);return;}
      if(file.size>10*1024*1024){this.allocationMessage('Excel faylı 10 MB-dan böyükdür.',true);return;}
      button.disabled=true;this.allocationMessage('Excel oxunur…');
      try {
        const body=new FormData();body.append('file',file);
        const response=await fetch('/api/orders/preview/import-excel',{method:'POST',body});
        const result=await response.json();
        if(!this.operationOpen || this.dialogMode!==context)return;
        if(!response.ok || !result.success)throw Error(result.error || 'Excel oxunmadı.');
        document.getElementById('obeCodeQuantities').value=result.rows.map(row=>`${row.code}\t${row.quantity}`).join('\n');
        this.importCodes();
      }catch(error){if(this.operationOpen && this.dialogMode===context)this.allocationMessage(error.message,true);}
      finally{button.disabled=false;const input=document.getElementById('obeExcelFile');if(input && this.dialogMode===context)input.value='';}
    },
    normalizeStoreCode(value) {return String(value).trim().toUpperCase().replace(/С/g,'C');},
    importCodes() {
      try {
        const lines=document.getElementById('obeCodeQuantities').value.trim().split(/\r?\n/).filter(s=>s.trim());
        if(!lines.length)throw Error('Mağaza kodu və miqdar siyahısını daxil edin.');
        const inputs=this.allocationInputs(false),used=new Set(),assignments=new Map();
        for(const line of lines) {
          const match=line.trim().match(/^(\S+?)[\t; ]+([\d]+(?:[.,]\d+)?)$/);
          if(!match)throw Error(`Sətir düzgün deyil: ${line}`);
          const code=this.normalizeStoreCode(match[1]),qty=Number(match[2].replace(',','.'));
          if(used.has(code))throw Error(`Kod təkrarlanıb: ${code}`);used.add(code);
          const matches=inputs.filter(input=>{
            const order=this.orders.find(o=>o.id===input.dataset.order);
            return [order.storeCode,order.store.match(/^\d+/)?.[0]].filter(Boolean).some(c=>this.normalizeStoreCode(c)===code);
          });
          if(!matches.length)throw Error(`Mağaza kodu tapılmadı: ${code}`);
          const quantities=this.splitQuantity(qty,matches.length);
          matches.forEach((input,i)=>{if(assignments.has(input))throw Error(`Eyni mağaza iki kodla verilib: ${code}`);assignments.set(input,quantities[i]);});
        }
        inputs.forEach(input=>{const qty=assignments.get(input);if(qty!==undefined)input.value=qty;input.closest('tr').querySelector('[data-allocation-check]').checked=qty>0;this.syncDialogRow(input);});
        this.updateDialogSelection();this.allocationMessage(`${used.size} mağaza kodu uyğunlaşdırıldı. Miqdarlar dolduruldu; tətbiq üçün «Применить» basın.`);
      } catch(error){this.allocationMessage(error.message,true);}
    },
    applyAllocation() {
      const product=catalog.find(p=>p.code===document.getElementById('obeAllocationProduct').value),inputs=this.allocationInputs();
      if(!product){this.allocationMessage('Məhsul seçin.',true);return;}
      if(!inputs.length){this.allocationMessage('Ən azı bir sifariş seçin.',true);return;}
      for(const input of inputs)if((!input.value && this.dialogMode.type!=='replace') || (input.value && !input.reportValidity())){this.allocationMessage('Seçilmiş sifarişlərin miqdarlarını yoxlayın.',true);return;}
      inputs.forEach(input=>{
        const order=this.orders.find(o=>o.id===input.dataset.order),qty=input.value?Number(input.value):this.dialogRows.find(r=>r.orderId===order.id).originalQty;
        if(this.dialogMode.type==='replace')order.items=order.items.filter(r=>r.code!==this.dialogMode.sourceCode);
        const existing=order.items.find(r=>r.code===product.code);
        if(existing)existing.qty=Math.round((existing.qty+qty)*1000)/1000;
        else order.items.push({...product,id:`new-${Date.now()}-${order.items.length}`,qty});
      });
      this.closeOperation();this.render();this.status(`${inputs.length} sifarişə ${this.dialogMode.type==='replace'?'məhsul əvəzlənməsi':'məhsul əlavəsi'} tətbiq edildi (sınaq).`);
    },
    createDialogTable(container,rows,mode) {
      if(this.dialogTable)this.dialogTable.destroy();
      this.dialogRows=rows;this.dialogTableMode=mode;
      const isBatch=mode==='batch',checkAttr=isBatch?'data-batch-check':'data-allocation-check',qtyAttr=isBatch?'data-batch-qty':'data-allocation-qty';
      const columns=[
        {key:'checked',label:'✓',width:40,sortable:false,render:(_,row)=>`<input type="checkbox" ${checkAttr} data-dialog-row="${esc(row.id)}" ${row.checked?'checked':''}>`},
        {key:'storeCode',label:'Код магазина',width:125},
        {key:'store',label:'Магазин',width:310},
        {key:'number',label:'Заказ',width:135},
        {key:'current',label:'Сейчас',width:110,render:value=>`<span ${isBatch?'':'data-allocation-current'}>${value}</span>`},
        {key:'qty',label:isBatch || this.dialogMode.type==='replace'?'Новое количество':'Добавить',width:150,render:(_,row)=>`<input type="number" min="0.001" step="any" value="${esc(row.qty)}" placeholder="${row.originalQty ?? row.current}" ${qtyAttr} data-dialog-row="${esc(row.id)}" data-order="${row.orderId}" ${row.rowId?`data-row="${row.rowId}"`:''}>`}
      ];
      this.dialogTable=new C1TableComponent({container,defaultColumns:columns,items:rows,rowHeight:34,selectable:false,
        onSortChange:(key,asc)=>this.dialogTable.sortItemsInternally(key,asc)});
      // Component persists JSON column settings; keep editable renderers local.
      this.dialogTable.columns.forEach(col=>{col.render=columns.find(c=>c.key===col.key)?.render;});
      const renderHead=this.dialogTable.renderHead.bind(this.dialogTable);
      this.dialogTable.renderHead=()=>{
        renderHead();
        const header=this.dialogTable.theadEl.querySelector('[data-col-key="checked"] .c1-col-header-label');
        const cell=this.dialogTable.theadEl.querySelector('[data-col-key="checked"]');
        if(cell){const label=header || cell.querySelector('span');if(label)label.innerHTML='<input type="checkbox" data-dialog-select-all aria-label="Hamısını seç / seçimi ləğv et">';}
        this.updateDialogSelection();
      };
      this.dialogTable.render();
      this.updateDialogSelection();
    },
    syncDialogRow(input) {
      const row=this.dialogRows?.find(r=>r.id===input.dataset.dialogRow);if(!row)return;
      const tr=input.closest('tr'),qty=tr.querySelector('[data-allocation-qty],[data-batch-qty]'),check=tr.querySelector('[data-allocation-check],[data-batch-check]');
      row.qty=qty.value;row.checked=check.checked;
    },
    selectDialogRows(selected) {
      this.operationEl.querySelectorAll('[data-allocation-check],[data-batch-check]').forEach(input=>{input.checked=selected;this.syncDialogRow(input);});
      this.updateDialogSelection();
    },
    updateDialogSelection() {
      const checks=Array.from(this.operationEl.querySelectorAll('[data-allocation-check],[data-batch-check]'));
      const header=this.operationEl.querySelector('[data-dialog-select-all]');
      if(header){const selected=checks.filter(i=>i.checked).length;header.checked=checks.length>0 && selected===checks.length;header.indeterminate=selected>0 && selected<checks.length;}
      if(document.getElementById('obeAllocationSummary'))this.allocationSummary();
    }
  };
})();
