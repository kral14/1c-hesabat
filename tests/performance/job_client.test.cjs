const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const storage=new Map();
function client(fetch){
  const context=vm.createContext({console,window:{},Map,crypto:require('node:crypto').webcrypto,
    TextEncoder,Uint8Array,DOMException,AbortController,TypeError,SyntaxError,
    setTimeout:()=>1,clearTimeout(){},fetch,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}});
  vm.runInContext(fs.readFileSync('static/js/job_client.js','utf8'),context);
  context.window.JobClient.delay=async(_ms,signal)=>{if(signal?.aborted)throw new DOMException('stopped','AbortError');};
  return context.window.JobClient;
}
const reply=body=>({ok:true,status:200,json:async()=>body});
(async()=>{
  let starts=[],created=new Set(),lost=true;
  const api=async(url,opts)=>{
    const body=JSON.parse(opts.body);
    if(url.endsWith('/start')){
      starts.push(body);created.add(body.request_id);
      if(lost){lost=false;throw new TypeError('WARP dropped after server accepted job');}
      return reply({success:true,job_id:'durable-job'});
    }
    return reply({success:true,job:{state:'succeeded',result:{count:250},chunks:[{sequence:0,data:{events:Array(250).fill({})}}],has_more:false}});
  };
  const first=client(api),chunks=[];
  const result=await first.run('audit_history',{server:'Test1C',ref:'Aztrade_test3',password:'secret'},{onChunk:data=>chunks.push(data)});
  assert.equal(created.size,1,'lost reply must not create a second office job');
  assert.equal(starts[0].token,starts[1].token);assert.equal(result.count,250);assert.equal(chunks[0].events.length,250);
  assert.equal(storage.size,0);

  let originalId,aborted=false;
  const controller=new AbortController();
  const stopped=client(async(url,opts)=>{
    const body=JSON.parse(opts.body);
    if(url.endsWith('/start')){originalId=body.request_id;return reply({success:true,job_id:'persisted'});}
    controller.abort();aborted=true;
    return reply({success:true,job:{state:'running',chunks:[],has_more:false}});
  });
  await assert.rejects(stopped.run('audit_history',{ref:'test'},{signal:controller.signal}),error=>error.name==='AbortError');
  assert.ok(aborted);assert.equal(storage.size,1,'closing the client must retain the checkpoint');
  let resumedId;
  const resumed=client(async(url,opts)=>{
    const body=JSON.parse(opts.body);
    if(url.endsWith('/start')){resumedId=body.request_id;return reply({success:true,job_id:'persisted',created:false});}
    return reply({success:true,job:{state:'succeeded',result:{count:3},chunks:[],has_more:false}});
  });
  await resumed.run('audit_history',{ref:'test'});
  assert.equal(resumedId,originalId,'new client instance resumes the existing office job');
  assert.equal(storage.size,0);
  const text=JSON.stringify({rows:[{name:'ƏDV və qiymət',amount:42}],success:true});
  const fragmented=client(async(url)=>url.endsWith('/start') ? reply({success:true,job_id:'fragmented'}) :
    reply({success:true,job:{state:'succeeded',result:{chunked:true},has_more:false,chunks:[
      {sequence:0,data:{kind:'result-fragment',fragment:text.slice(0,12),complete:false}},
      {sequence:1,data:{kind:'result-fragment',fragment:text.slice(12),complete:true}}
    ]}}));
  const restored=await fragmented.run('universal_report',{ref:'test'});
  assert.equal(restored.rows[0].name,'ƏDV və qiymət');assert.equal(restored.rows[0].amount,42);
  console.log('Job client: WARP loss, lost start response, 250 rows, client close and resume passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
