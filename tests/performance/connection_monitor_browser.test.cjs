const fs=require('node:fs');const assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage();
 await page.setContent('<div id="topBasePill"><span id="topBaseDot"></span><span id="topBaseName"></span></div><div id="statusBarBaseName"></div>');
 await page.addScriptTag({content:fs.readFileSync('static/js/session.js','utf8')});
 await page.evaluate(async()=>{window.fetch=async()=>({ok:true,json:async()=>({success:true,connected:false,error:'1C sessiyası kəsilib'})});await SessionManager.checkConnection();});
 assert.equal(await page.getByRole('alert').isVisible(),true);
 assert.ok((await page.getByRole('alert').textContent()).includes('1C sessiyası kəsilib'));
 await page.evaluate(()=>{window.fetch=async()=>({ok:true,json:async()=>({success:true,connected:true})});});
 await page.getByRole('button',{name:'Yenidən qoşul'}).click();
 await page.waitForFunction(()=>document.getElementById('connectionWarning').style.display==='none');
 assert.equal(await page.getByRole('alert').isVisible(),false);
 console.log('Browser warning and reconnect button checks passed.');await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
