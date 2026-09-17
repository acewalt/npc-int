"use strict";

(function(){
  const state={
    version:"1.0",
    supported:typeof navigator!=="undefined"&&!!navigator.gpu,
    ready:false,
    loading:false,
    generating:false,
    modelId:"onnx-community/Qwen3-0.6B-ONNX",
    device:"webgpu",
    dtype:null,
    progress:0,
    progressFile:null,
    lastError:null
  };

  let worker=null;
  let loadPromise=null;
  let loadResolve=null;
  let loadReject=null;
  let seq=1;
  const pending=new Map();
  const progressListeners=new Set();

  function ensureWorker(){
    if(worker)return worker;
    if(!state.supported)throw new Error("WebGPU no está disponible en este navegador.");

    worker=new Worker(new URL("./qwen-worker.js",document.baseURI),{type:"module"});

    worker.addEventListener("message",event=>{
      const msg=event.data||{};

      if(msg.status==="loading"){
        state.loading=true;
        return;
      }

      if(msg.status==="progress"){
        const p=Number(msg.progress);
        if(Number.isFinite(p))state.progress=Math.max(0,Math.min(100,p));
        if(msg.file)state.progressFile=msg.file;
        for(const fn of progressListeners){
          try{fn({...msg,progress:state.progress});}catch(_){}
        }
        return;
      }

      if(msg.status==="ready"){
        state.ready=true;
        state.loading=false;
        state.progress=100;
        state.dtype=msg.dtype||state.dtype;
        state.device=msg.device||state.device;
        state.modelId=msg.modelId||state.modelId;
        state.lastError=null;
        if(loadResolve)loadResolve(state);
        loadResolve=null;
        loadReject=null;
        return;
      }

      if(msg.status==="result"){
        const job=pending.get(msg.requestId);
        if(!job)return;
        pending.delete(msg.requestId);
        state.generating=pending.size>0;
        job.resolve(String(msg.text||"").trim());
        return;
      }

      if(msg.status==="error"){
        const message=String(msg.error||msg.data||"Error desconocido en Qwen.");
        state.lastError=message;
        state.loading=false;

        if(msg.requestId&&pending.has(msg.requestId)){
          const job=pending.get(msg.requestId);
          pending.delete(msg.requestId);
          state.generating=pending.size>0;
          job.reject(new Error(message));
          return;
        }

        state.ready=false;
        if(loadReject)loadReject(new Error(message));
        loadResolve=null;
        loadReject=null;
      }
    });

    worker.addEventListener("error",event=>{
      const message=event?.message||"El worker de Qwen falló.";
      state.lastError=message;
      state.ready=false;
      state.loading=false;
      if(loadReject)loadReject(new Error(message));
      loadResolve=null;
      loadReject=null;
      for(const [,job] of pending)job.reject(new Error(message));
      pending.clear();
      state.generating=false;
    });

    return worker;
  }

  async function load(options={}){
    const onProgress=typeof options.onProgress==="function"?options.onProgress:null;
    if(onProgress)progressListeners.add(onProgress);

    try{
      if(state.ready)return state;
      if(loadPromise)return await loadPromise;

      const w=ensureWorker();
      state.loading=true;
      state.progress=0;
      state.lastError=null;

      loadPromise=new Promise((resolve,reject)=>{
        loadResolve=resolve;
        loadReject=reject;
        w.postMessage({type:"load"});
      });

      try{
        return await loadPromise;
      }finally{
        loadPromise=null;
      }
    }finally{
      if(onProgress)progressListeners.delete(onProgress);
    }
  }

  async function generate(messages,options={}){
    await load();
    const w=ensureWorker();
    const requestId=seq++;
    state.generating=true;
    state.lastError=null;

    const payload={
      messages:Array.isArray(messages)?messages:[],
      maxNewTokens:Math.max(32,Math.min(512,Number(options.maxNewTokens)||220)),
      temperature:Math.max(0.05,Math.min(1.5,Number(options.temperature)||0.55)),
      topK:Math.max(1,Math.min(100,Number(options.topK)||30))
    };

    return new Promise((resolve,reject)=>{
      pending.set(requestId,{resolve,reject});
      w.postMessage({type:"generate",requestId,data:payload});
    });
  }

  function interrupt(){
    if(worker)worker.postMessage({type:"interrupt"});
  }

  function reset(){
    if(loadReject)loadReject(new Error("Qwen fue reiniciado."));
    if(worker){
      worker.terminate();
      worker=null;
    }
    for(const [,job] of pending)job.reject(new Error("Qwen fue reiniciado."));
    pending.clear();
    loadPromise=null;
    loadResolve=null;
    loadReject=null;
    state.ready=false;
    state.loading=false;
    state.generating=false;
    state.progress=0;
    state.progressFile=null;
    state.dtype=null;
    state.lastError=null;
  }

  window.NpcIntQwenBrowser={state,load,generate,interrupt,reset};
})();