const fs=require('node:fs'),assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1600,height:950}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const css=['1c_base','1c_toolbar','1c_mdi','list_appearance'].map(n=>fs.readFileSync(`static/css/${n}.css`,'utf8')).join('\n');
 const html=['audit_journal_window','universal_journal_filter_window'].map(n=>fs.readFileSync(`templates/components/${n}.html`,'utf8')).join('\n');
 await page.setContent(`<style>${css}body{margin:0;background:#ece9d8}</style>${html}`);
 await page.evaluate(()=>{
  const storage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  window.starts=0;window.polls=0;window.confirm=()=>false;window.alerts=[];window.alert=m=>alerts.push(m);
  const snapshot={success:true,number:'TEST-C001',date:'09.10.2026 11:34:06',amount:85,kontragent:'Sınaq müştərisi',warehouse:'Sınaq anbarı',contract:'Sınaq müqaviləsi',raw_versions:[
   {version:1,doc_date:'09.10.2026 11:34:06',change_date:'09.10.2026 12:00:00',amount:100,items:[{code:'TEST-A',name:'Sınaq malı',qty:1,price:100,total:100,discount_manual:0}]},
   {version:2,doc_date:'09.10.2026 11:34:06',change_date:'13.10.2026 10:00:00',amount:85,posted:true,items:[{code:'TEST-A',name:'Sınaq malı',qty:1,price:100,total:85,discount_manual:15}]}
  ]};
  const events=[{date:'09.10.2026 12:00:00',user:'Sınaq istifadəçisi',event:'_$Data$_.New',action:'Yaradıldı'},{date:'13.10.2026 10:00:00',user:'Sınaq istifadəçisi',event:'_$Data$_.Update',action:'Dəyişdirildi'}];
  window.fetch=async(url,options)=>{
   if(url==='/api/jobs/start'){starts++;return {ok:true,status:200,json:async()=>({success:true,job_id:'browser-test'})};}
   if(url==='/api/jobs/status'){
    polls++;const done=polls>1;
    const chunks=done ? [{sequence:1,data:{kind:'events-fragment',fragment:JSON.stringify({events,scanned_to:'13.10.2026 23:59:59'}),complete:true}}] : [{sequence:0,data:{kind:'snapshot-fragment',fragment:JSON.stringify(snapshot),complete:true}}];
    return {ok:true,status:200,json:async()=>({success:true,job:{state:done?'succeeded':'running',result:{event_count:2},chunks,has_more:false}})};
   }
   return {ok:true,status:200,json:async()=>({success:true,connected:true})};
  };
 });
 for(const file of ['form_action','mdi_manager','session','c1_filter_component','list_appearance','universal_journal','job_client','audit_journal'])await page.addScriptTag({content:fs.readFileSync(`static/js/${file}.js`,'utf8')});
 await page.evaluate(()=>{
  window.SessionManager=SessionManager;SessionManager.state.password='demo';
  MdiManager.init();AuditJournal.init();AuditJournal.startDateStr='06.10.2026';AuditJournal.endDateStr='13.10.2026';
  AuditJournal.openForDocument('ВозвратТоваровОтПокупателя','TEST-C001',{doc_type:'ВозвратТоваровОтПокупателя',doc_type_title:'Qaytarma',number:'TEST-C001',amount:85,posted:true});
  AuditJournal.switchTab('timeline');AuditJournal.loadDiff('ВозвратТоваровОтПокупателя','TEST-C001');
 });
 await page.waitForFunction(()=>!AuditJournal._loadingDetails);
 assert.equal(await page.evaluate(()=>starts),1);
 assert.ok((await page.locator('#ajEventProgress').textContent()).includes('2 hadisə'));
 assert.equal(await page.locator('#auditProtocolWindow').isVisible(),true);
 assert.deepEqual(await page.evaluate(()=>alerts),[]);assert.deepEqual(errors,[]);
 await page.screenshot({path:'logs/stable-audit-browser.png'});
 await page.evaluate(()=>SessionManager.showConnectionWarning('Ofis serverinə çıxış yoxdur.'));
 await page.getByRole('button',{name:'İlişmiş əlaqəni bərpa et',exact:true}).click();
 assert.equal(await page.evaluate(()=>starts),1,'declined recovery cannot restart the worker');
 console.log('Browser: async Audit, snapshot/event fragments, F5 guard, progress and declined recovery passed.');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
