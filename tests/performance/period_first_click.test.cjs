const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const css=['1c_base','1c_mdi'].map(n=>fs.readFileSync(`static/css/${n}.css`,'utf8')).join('\n');
  const html=['universal_journal_window','period_picker_modal'].map(n=>fs.readFileSync(`templates/components/${n}.html`,'utf8')).join('\n');
  await page.setContent(`<style>${css}</style><div id="mdiWorkspace" style="position:relative;width:1400px;height:950px">${html}</div>`);
  await page.evaluate(()=>{
   const values=new Map([['1c_remember_period_active','false']]);
   Object.defineProperty(window,'localStorage',{value:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});
   window.fetch=()=>{throw Error('No API calls allowed');};
  });
  for(const name of ['c1_dates','c1_i18n','mdi_manager','period_picker','components/picker/period_widget','universal_journal'])await page.addScriptTag({content:fs.readFileSync(`static/js/${name}.js`,'utf8')});
  await page.evaluate(()=>{
   UniversalJournal.startDateStr='12.10.2026';UniversalJournal.endDateStr='13.10.2026';
   UniversalJournal.updatePeriodLabel();window.loads=0;UniversalJournal.loadDocuments=()=>loads++;
   document.getElementById('universalJournalWindow').style.display='flex';
   MdiManager.activateWindow('universalJournalWindow');
  });
  assert.match(await page.locator('#ujPeriodLabel').innerText(),/12.10.2026/);
  const button=page.locator('#ujBtnPeriod');const box=await button.boundingBox();
  await button.click({position:{x:box.width-10,y:box.height/2}});
  assert.equal(await page.locator('#periodPickerModal').isVisible(),true,'one click at the right edge must open the period picker');
  assert.match(await page.locator('#ppStartDateInput').inputValue(),/^12.10.2026/);
  assert.match(await page.locator('#ujPeriodLabel').innerText(),/12.10.2026/);
  await page.fill('#ppStartDateInput','10.10.2026 00:00:00');
  await page.evaluate(()=>PeriodPicker.confirm());
  assert.match(await page.locator('#ujPeriodLabel').innerText(),/10.10.2026/);
  assert.equal(await page.evaluate(()=>loads),1);
  assert.deepEqual(errors,[]);
  console.log('Period first-click opening, stable label and date edit passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
