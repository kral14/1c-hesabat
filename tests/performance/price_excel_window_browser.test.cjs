const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1400,height:920}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  const css=['1c_base','1c_toolbar','1c_mdi'].map(n=>fs.readFileSync(`static/css/${n}.css`,'utf8')).join('\n');
  const template=fs.readFileSync('templates/components/price_doc_editor_window.html','utf8');
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>${css}body{margin:0;background:#e9e7db}</style><div id="mdiWorkspace" style="position:relative;width:100%;height:870px;">${template}</div><div id="mdiTaskbarTabs"></div>`}));
  await page.goto('http://price-import.test');
  await page.addScriptTag({content:fs.readFileSync('static/js/mdi_manager.js','utf8')});
  await page.addScriptTag({content:fs.readFileSync('static/js/price_doc_editor.js','utf8')});
  await page.evaluate(()=>{
    PriceDocEditor.priceTypes=['Region','GR','PS'];
    PriceDocEditor.items=[{code:'TEST-001',name:'Sınaq məhsulu',unit:'əd',prices:{Region:2,GR:'',PS:3}}];
    PriceDocEditor.openExcelImportModal();
  });
  assert.equal(await page.locator('#pdeExcelImportModal').evaluate(el=>el.parentElement.id),'mdiWorkspace');
  assert.equal(await page.locator('input[name="pdeExcelMode"]').count(),2);
  assert.equal(await page.locator('#pdeExcelExtraOptions').evaluate(el=>el.open),false);
  await page.locator('#pdeExcelPasteArea').fill('TEST-001\t12,50');
  await page.locator('#pdeExcelModeReference').check();
  assert.equal(await page.locator('#pdeExcelTargetRow').isVisible(),false);
  assert.equal(await page.locator('#pdeExcelExtraOptions').isVisible(),false);
  assert.equal(await page.locator('#pdeExcelPtSelect').inputValue(),'__all_active__');
  await page.locator('#pdeExcelModeSelected').check();
  assert.equal(await page.locator('#pdeExcelTargetRow').isVisible(),true);
  assert.equal(await page.locator('#pdeExcelPtSelect').inputValue(),'Region');
  await page.locator('#pdeExcelModeReference').check();
  await page.locator('#pdeExcelImportModal .mdi-win-btn-max').click();
  const height=await page.locator('#pdeExcelPreviewWrapper').evaluate(el=>el.clientHeight);
  assert.ok(height>300,'preview should fill remaining window height: '+height);
  await page.screenshot({path:'tests/artifacts/price_excel_window_simple.png'});
  await page.locator('#pdeBtnApplyExcel').click();
  const prices=await page.evaluate(()=>PriceDocEditor.items[0].prices);
  assert.equal(prices.Region,12.5);assert.equal(prices.PS,12.5);assert.equal(prices.GR,'');
  assert.equal(await page.locator('#pdeExcelImportModal').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('Excel window browser checks passed: two modes, MDI, maximize/flexible table, reference blanks preserved.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
