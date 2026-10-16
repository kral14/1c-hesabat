const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
 const page=await browser.newPage();
 const files=fs.readdirSync('templates/components').filter(name=>name.endsWith('.html'));
 const html=files.map(name=>fs.readFileSync(path.join('templates/components',name),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')).join('\n');
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<meta charset="utf-8">'+html}));
 await page.goto('http://i18n-templates.test');
 await page.addScriptTag({content:fs.readFileSync('static/js/c1_i18n.js','utf8')});
 const leftovers=await page.evaluate(()=>{
   const out=[];
   for(const el of document.querySelectorAll('button,a,span,label,th,option,summary,legend,h1,h2,h3,h4,.mdi-win-title-text,.settings-header-title')){
     if(el.closest('script,style,[data-i18n-skip]') || el.closest('tbody') && !['BUTTON','OPTION','TH','LABEL'].includes(el.tagName))continue;
     for(const node of el.childNodes)if(node.nodeType===3 && /[А-Яа-яЁё]/.test(node.nodeValue))out.push({id:el.id,tag:el.tagName,text:node.nodeValue.trim()});
   }
   return out;
 });
 if(leftovers.length)console.log(JSON.stringify(leftovers.slice(0,40),null,2));
 assert.equal(leftovers.length,0,'Static UI labels must all be localized in AZ');
 console.log('AZ template UI checks passed across '+files.length+' component templates.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
