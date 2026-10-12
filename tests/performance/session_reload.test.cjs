const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const requests = [];
const context = vm.createContext({console,window:{},
  localStorage:{getItem:()=>JSON.stringify({server:'Test1C',ref:'Aztrade_test3',user:'test'}),setItem(){}},
  document:{getElementById:()=>null},
  setTimeout:()=>{throw new Error('Reload must not schedule a connection check');},
  fetch:async url=>{requests.push(url); return {json:async()=>({success:true,bases:[]})};}
});
vm.runInContext(fs.readFileSync('static/js/session.js','utf8')+'\nthis.session = SessionManager;',context);
context.session.init();
setImmediate(()=>{
  assert.deepEqual(requests,['/api/bases']);
  assert.equal(context.session.state.ref,'Aztrade_test3');
  assert.equal(context.session.connectionStatus,'idle','reload must not announce a new connection');
  console.log('Reload restores UI without a 1C ping or connection timer.');
});
