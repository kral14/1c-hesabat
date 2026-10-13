/* Read jobs survive API reloads and temporary WARP loss. No write request retries. */
window.JobClient = {
  prefix: 'reporter_job_v1_',
  pending: new Map(),
  memory: new Map(),
  routes: {
    '/api/universal_report':'universal_report', '/api/universal_sales':'universal_sales',
    '/api/generate_report':'generate', '/api/order_analysis/generate':'order_analysis'
  },
  random() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), x=>x.toString(16).padStart(2,'0')).join(''); },
  async storageKey(action, payload) {
    const clean = {...payload}; delete clean.password;
    const canonical = value => Array.isArray(value) ? value.map(canonical) :
      value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
    const input = JSON.stringify([action,canonical(clean)]);
    if (crypto.subtle) {
      const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
      return this.prefix+Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
    }
    // LocalStorage index only; access authorization uses the independent random token.
    return this.prefix+encodeURIComponent(input);
  },
  read(key) { try {return JSON.parse(localStorage.getItem(key)) || this.memory.get(key);} catch (_) {return this.memory.get(key);} },
  save(key, value) { this.memory.set(key,value); try {localStorage.setItem(key,JSON.stringify(value));} catch (_) {} },
  forget(key) {this.memory.delete(key);try {localStorage.removeItem(key);} catch (_) {}},
  abortError() {return new DOMException('Client stopped waiting; the office job remains available.','AbortError');},
  async delay(ms, signal) {
    if (signal?.aborted) throw this.abortError();
    await new Promise((resolve,reject)=>{
      const abort=()=>{clearTimeout(timer);reject(this.abortError());};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
      signal?.addEventListener('abort',abort,{once:true});
    });
  },
  async request(url, body, options) {
    let failures=0;
    while (true) {
      if(options.signal?.aborted)throw this.abortError();
      const controller=new AbortController();
      const abort=()=>controller.abort();
      options.signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>controller.abort(),30000);
      try {
        const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
        if(response.status>=500 || response.status===429)throw new TypeError('Office API temporarily unavailable');
        if(response.status===401 || response.status===403)throw new Error('Ofis serverinə giriş icazəsi tələb olunur.');
        const result=await response.json();
        if(!response.ok || !result.success)throw new Error(result.error || 'Job request rejected');
        return result;
      } catch(error) {
        if(options.signal?.aborted)throw this.abortError();
        if(!(error instanceof TypeError) && !(error instanceof SyntaxError) && error.name!=='AbortError')throw error;
        options.onProgress?.({state:'waiting_connection',message:'Bağlantı gözlənilir; ofisdə iş saxlanılır.'});
        failures++;
      } finally {clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
      await this.delay(Math.min(1000*2**Math.min(failures,5),15000),options.signal);
    }
  },
  async run(action, payload, options={}) {
    if(window.SessionManager?.getCredentials)payload={...window.SessionManager.getCredentials(),...payload};
    const key=await this.storageKey(action,payload);
    if(this.pending.has(key))return this.pending.get(key);
    const execute=async()=>{
      let checkpoint=this.read(key);
      if(!checkpoint){checkpoint={request_id:this.random(),token:this.random()};this.save(key,checkpoint);}
      try {
        const started=await this.request('/api/jobs/start',{action,payload,...checkpoint},options);
        checkpoint.job_id=started.job_id;this.save(key,checkpoint);
        let after=-1, snapshotText='', eventText='', resultText='', assembled=null;
        while(true){
          const {job}=await this.request('/api/jobs/status',{job_id:checkpoint.job_id,token:checkpoint.token,after},options);
          if(options.signal?.aborted)throw this.abortError();
          for(const chunk of job.chunks || []){
            if(options.signal?.aborted)throw this.abortError();
            const data=chunk.data;
            if(data.kind==='snapshot-fragment'){
              snapshotText+=data.fragment;
              if(data.complete){options.onChunk?.({kind:'snapshot',snapshot:JSON.parse(snapshotText)});snapshotText='';}
            } else if(data.kind==='events-fragment'){
              eventText+=data.fragment;
              if(data.complete){options.onChunk?.({kind:'events',...JSON.parse(eventText)});eventText='';}
            } else if(data.kind==='result-fragment'){
              resultText+=data.fragment;
              if(data.complete){assembled=JSON.parse(resultText);resultText='';}
            } else options.onChunk?.(data);
            after=chunk.sequence;
          }
          options.onProgress?.({state:job.state});
          if(options.signal?.aborted)throw this.abortError();
          if(job.state==='succeeded' && !job.has_more){this.forget(key);return assembled ?? job.result;}
          if(['failed','interrupted'].includes(job.state)){this.forget(key);throw new Error(job.error || 'İş dayandı; yenidən yoxlayın.');}
          await this.delay(job.has_more ? 0 : 800,options.signal);
        }
      } catch(error) {
        if(error.name!=='AbortError' && !(error instanceof TypeError))this.forget(key);
        throw error;
      }
    };
    const task=execute().finally(()=>this.pending.delete(key));this.pending.set(key,task);return task;
  },
  async fetch(url, options={}) {
    const action=this.routes[url];
    if(!action)return fetch(url,options);
    const result=await this.run(action,JSON.parse(options.body || '{}'),{signal:options.signal});
    return new Response(JSON.stringify({success:true,...result}),{status:200,headers:{'Content-Type':'application/json'}});
  }
};
