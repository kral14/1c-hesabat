const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function element(){return {style:{},dataset:{},classList:{add(){},remove(){}},addEventListener(){},querySelector(){return null;},focus(){this.focused=true;}};}
const elements={mdiWorkspace:element(),pdePriceFormationModal:element(),pdePriceTypesModal:element()};
elements.mdiWorkspace.appendChild=child=>{child.parentElement=elements.mdiWorkspace;};
for(const id of ['pdePriceFormationModal','pdePriceTypesModal']){
 elements[id].parentElement=element();
 elements[id].firstElementChild=element();
 elements[id].firstElementChild.firstElementChild=element();
}
const alerts=[];let calls=0;
const mdi={windows:{},z:100,registerWindow(id,options){this.windows[id]=options;},activateWindow(id){this.activeWindowId=id;this.windows[id].element.style.zIndex=++this.z;},closeWindow(id){this.windows[id].closeFn();}};
const ctx=vm.createContext({console,window:{},document:{getElementById:id=>elements[id]||null,addEventListener(){}},MdiManager:mdi,alert:m=>alerts.push(m),fetch:async()=>{calls++;return {json:async()=>({success:true,price_types:['B'],items:[{code:'X',prices:{B:1}}]})};}});
ctx.window=ctx;
vm.runInContext(fs.readFileSync('static/js/price_doc_editor.js','utf8')+';globalThis.editor=PriceDocEditor;',ctx);
const p=ctx.editor;
(async()=>{
 p.showFormationWindow('pdePriceFormationModal','Formation');
 assert.equal(elements.pdePriceFormationModal.parentElement,elements.mdiWorkspace);
 assert.ok(mdi.windows.pdePriceFormationModal);
 assert.equal(elements.pdePriceFormationModal.style.backdropFilter,'none');
 assert.equal(elements.pdePriceFormationModal.firstElementChild.style.height,'100%');
 const firstZ=elements.pdePriceFormationModal.style.zIndex;
 p.showFormationWindow('pdePriceTypesModal','Types');
 assert.ok(elements.pdePriceTypesModal.style.zIndex>firstZ,'picker must be above its owner');
 p.priceTypes=['A'];p.allPriceTypes=Array.from({length:16},(_,i)=>({name:i?'Type'+i:'A'}));
 elements.pdePfVal_pt={value:'B'};
 p.renderPtChecklist=()=>{};
 await p.openPfPriceTypesPicker();
 assert.deepEqual(Array.from(p.priceTypes),['A'],'opening picker must not change editor columns');
 assert.ok(p.ptModalItems.some(row=>row.name==='B'&&row.checked));
 p.closePriceTypesModal();
 assert.deepEqual(Array.from(p.priceTypes),['A'],'cancelling must preserve editor columns');
 elements.pdePfChk_pt={checked:true};elements.pdePfComp_pt={value:'not_equal'};
 elements.pdePfChk_nom={checked:true};elements.pdePfVal_nom={value:'',focus(){this.focused=true;}};
 elements.pdeBtnExecPf={disabled:false};
 await p.executePriceFormation();assert.equal(calls,0,'empty active filter must not execute');
 elements.pdePfChk_nom.checked=false;
 p.currentDocNumber='Document';p.items=[];p.renderTable=()=>{};p.updateRowCount=()=>{};p.closePriceFormationModal=()=>{};
 await p.executePriceFormation();
 assert.equal(calls,1);assert.deepEqual(Array.from(p.priceTypes),['B'],'negative price-type filter must use effective response columns');
 console.log('Formation window ownership, picker stacking, cancellation and result checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
