import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";

const MODEL_ID="onnx-community/Qwen3-0.6B-ONNX";

let tokenizer=null;
let model=null;
let dtype=null;
let loadingPromise=null;
let generationChain=Promise.resolve();
const stoppingCriteria=new InterruptableStoppingCriteria();

function fail(error,requestId=null){
  self.postMessage({
    status:"error",
    requestId,
    error:String(error?.message||error||"Error desconocido")
  });
}

async function selectDtype(){
  const adapter=await navigator.gpu?.requestAdapter?.();
  if(!adapter)throw new Error("WebGPU no está disponible o no se encontró un adaptador.");
  return adapter.features?.has?.("shader-f16")?"q4f16":"q4";
}

async function load(){
  if(tokenizer&&model)return {tokenizer,model,dtype};
  if(loadingPromise)return loadingPromise;

  loadingPromise=(async()=>{
    self.postMessage({status:"loading",data:"Descargando Qwen3-0.6B..."});
    dtype=await selectDtype();

    const progress_callback=x=>{
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
    };

    const tokenizerPromise=AutoTokenizer.from_pretrained(MODEL_ID,{progress_callback});
    const modelPromise=AutoModelForCausalLM.from_pretrained(MODEL_ID,{
      dtype,
      device:"webgpu",
      progress_callback
    });

    [tokenizer,model]=await Promise.all([tokenizerPromise,modelPromise]);

    self.postMessage({status:"loading",data:"Compilando shaders..."});
    const warmup=tokenizer("Hola");
    await model.generate({...warmup,max_new_tokens:1,do_sample:false});

    self.postMessage({
      status:"ready",
      modelId:MODEL_ID,
      device:"webgpu",
      dtype
    });

    return {tokenizer,model,dtype};
  })();

  try{
    return await loadingPromise;
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

async function generate(requestId,data){
  try{
    await load();
    stoppingCriteria.reset();

    const messages=Array.isArray(data?.messages)?data.messages:[];
    if(!messages.length)throw new Error("No se recibió contexto para generar.");

    const inputs=tokenizer.apply_chat_template(messages,{
      add_generation_prompt:true,
      return_dict:true,
      enable_thinking:false
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
      top_k:Number(data?.topK)||30,
      repetition_penalty:1.08,
      max_new_tokens:Number(data?.maxNewTokens)||220,
      streamer,
      stopping_criteria:stoppingCriteria
    });

    self.postMessage({status:"result",requestId,text:clean(output)});
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