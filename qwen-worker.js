import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1";

const MODEL_ID="onnx-community/Qwen3-0.6B-ONNX";
const RUNTIME_VERSION="transformers.js@3.7.1";

let tokenizer=null;
let model=null;
let dtype=null;
let device=null;
let loadingPromise=null;
let generationChain=Promise.resolve();
const stoppingCriteria=new InterruptableStoppingCriteria();

function messageOf(error){
  return String(error?.message||error||"Error desconocido");
}

function isGpuRuntimeError(error){
  const message=messageOf(error).toLowerCase();
  return message.includes("memory access out of bounds")||
    message.includes("out of memory")||
    message.includes("device lost")||
    message.includes("gpu device")||
    message.includes("webgpu")||
    message.includes("adapter");
}

function fail(error,requestId=null){
  self.postMessage({
    status:"error",
    requestId,
    fatal:device!=="webgpu"&&isGpuRuntimeError(error),
    device,
    error:messageOf(error)
  });
}

async function detectBackend(){
  if(!navigator.gpu?.requestAdapter){
    return {device:"wasm",dtype:"q4",webgpuAvailable:false,reason:"webgpu_api_unavailable"};
  }
  try{
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter){
      return {device:"wasm",dtype:"q4",webgpuAvailable:false,reason:"adapter_unavailable"};
    }
    return {
      device:"webgpu",
      dtype:adapter.features?.has?.("shader-f16")?"q4f16":"q4",
      webgpuAvailable:true,
      reason:"adapter_ready"
    };
  }catch(error){
    return {device:"wasm",dtype:"q4",webgpuAvailable:false,reason:"adapter_error",detail:messageOf(error)};
  }
}

function progressCallback(x){
  if(!x||typeof x!=="object")return;
  if(x.status==="progress"){
    self.postMessage({
      status:"progress",
      file:x.file||null,
      progress:Number(x.progress)||0,
      loaded:x.loaded||0,
      total:x.total||0
    });
  }
}

async function disposeModel(){
  if(!model)return;
  try{
    if(typeof model.dispose==="function")await model.dispose();
  }catch(_){}
  model=null;
}

async function buildModel(targetDevice,targetDtype,{fallbackReason=null}={}){
  device=targetDevice;
  dtype=targetDtype;

  self.postMessage({
    status:fallbackReason?"fallback":"backend",
    device,
    dtype,
    webgpuAvailable:device==="webgpu",
    reason:fallbackReason||"selected"
  });

  if(!tokenizer){
    tokenizer=await AutoTokenizer.from_pretrained(MODEL_ID,{progress_callback:progressCallback});
  }

  model=await AutoModelForCausalLM.from_pretrained(MODEL_ID,{
    dtype,
    device,
    progress_callback:progressCallback
  });

  self.postMessage({
    status:"loading",
    data:device==="webgpu"
      ?"Compilando shaders y verificando generación WebGPU..."
      :"Verificando generación CPU/WASM..."
  });

  const warmupMessages=[
    {role:"system",content:"Responde de forma breve."},
    {role:"user",content:"Hola"}
  ];
  const warmup=tokenizer.apply_chat_template(warmupMessages,{
    add_generation_prompt:true,
    return_dict:true,
    enable_thinking:false
  });
  await model.generate({
    ...warmup,
    max_new_tokens:1,
    do_sample:false,
    return_dict_in_generate:true
  });
}

async function load(){
  if(tokenizer&&model)return {tokenizer,model,dtype,device};
  if(loadingPromise)return loadingPromise;

  loadingPromise=(async()=>{
    self.postMessage({status:"loading",data:"Preparando Qwen3-0.6B..."});
    const preferred=await detectBackend();

    try{
      await buildModel(preferred.device,preferred.dtype);
    }catch(error){
      if(preferred.device!=="webgpu")throw error;

      const reason="webgpu_load_failed: "+messageOf(error);
      await disposeModel();
      self.postMessage({
        status:"fallback",
        device:"wasm",
        dtype:"q4",
        webgpuAvailable:false,
        reason
      });
      await buildModel("wasm","q4",{fallbackReason:reason});
    }

    self.postMessage({
      status:"ready",
      modelId:MODEL_ID,
      device,
      dtype,
      webgpuAvailable:device==="webgpu",
      runtimeVersion:RUNTIME_VERSION
    });

    return {tokenizer,model,dtype,device};
  })();

  try{
    return await loadingPromise;
  }catch(error){
    await disposeModel();
    dtype=null;
    device=null;
    throw error;
  }finally{
    loadingPromise=null;
  }
}

function clean(text){
  return String(text||"")
    .replace(/<think>[\s\S]*?<\/think>/gi,"")
    .replace(/<\/?think>/gi,"")
    .trim();
}

async function runGeneration(data,requestId){
  const messages=Array.isArray(data?.messages)?data.messages:[];
  if(!messages.length)throw new Error("No se recibió contexto para generar.");

  const inputs=tokenizer.apply_chat_template(messages,{
    add_generation_prompt:true,
    return_dict:true,
    enable_thinking:false
  });

  const dims=inputs?.input_ids?.dims;
  const inputTokens=Array.isArray(dims)&&dims.length?Number(dims[dims.length-1]):null;
  self.postMessage({
    status:"generation-start",
    requestId,
    inputTokens:Number.isFinite(inputTokens)?inputTokens:null,
    device
  });

  let output="";
  const streamer=new TextStreamer(tokenizer,{
    skip_prompt:true,
    skip_special_tokens:true,
    callback_function:chunk=>{output+=chunk;}
  });

  await model.generate({
    ...inputs,
    do_sample:true,
    temperature:Number(data?.temperature)||0.55,
    top_k:Number(data?.topK)||20,
    max_new_tokens:Number(data?.maxNewTokens)||180,
    streamer,
    stopping_criteria:stoppingCriteria,
    return_dict_in_generate:true
  });

  return clean(output);
}

async function switchToWasm(reason){
  await disposeModel();
  self.postMessage({
    status:"fallback",
    device:"wasm",
    dtype:"q4",
    webgpuAvailable:false,
    reason:"runtime_webgpu_failed: "+messageOf(reason)
  });
  await buildModel("wasm","q4",{fallbackReason:"runtime_webgpu_failed: "+messageOf(reason)});
  self.postMessage({
    status:"ready",
    modelId:MODEL_ID,
    device,
    dtype,
    webgpuAvailable:false,
    runtimeVersion:RUNTIME_VERSION
  });
}

async function generate(requestId,data){
  try{
    await load();
    stoppingCriteria.reset();

    let text;
    try{
      text=await runGeneration(data,requestId);
    }catch(error){
      if(device!=="webgpu"||!isGpuRuntimeError(error))throw error;
      await switchToWasm(error);
      stoppingCriteria.reset();
      text=await runGeneration(data,requestId);
    }

    self.postMessage({status:"result",requestId,text,device});
  }catch(error){
    fail(error,requestId);
  }
}

self.addEventListener("message",event=>{
  const {type,requestId,data}=event.data||{};

  if(type==="load"){
    load().catch(error=>fail(error));
    return;
  }

  if(type==="interrupt"){
    stoppingCriteria.interrupt();
    return;
  }

  if(type==="generate"){
    generationChain=generationChain
      .then(()=>generate(requestId,data))
      .catch(error=>fail(error,requestId));
  }
});
