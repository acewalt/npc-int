"use strict";

(function(){
  const state={
    version:"1.1",
    installed:false,
    stages:{hear:[],event:[],tick:[]},
    legacy:{hear:null,event:null,tick:null},
    trace:[],
    seq:1
  };

  const isPromise=x=>x&&typeof x.then==="function";
  const sort=list=>list.slice().sort((a,b)=>(a.priority-b.priority)||(a.id-b.id));

  function register(kind,name,handler,options={}){
    if(!state.stages[kind])throw new Error(`pipeline kind desconocido: ${kind}`);
    if(typeof handler!=="function")throw new TypeError("handler debe ser función");
    const stage={id:state.seq++,name:String(name||`stage-${state.seq}`),priority:Number(options.priority)||500,phase:options.phase==="before"?"before":"after",handler};
    state.stages[kind].push(stage);
    return stage.id;
  }

  function unregister(id){
    for(const kind of Object.keys(state.stages)){
      const i=state.stages[kind].findIndex(x=>x.id===id);
      if(i>=0){state.stages[kind].splice(i,1);return true;}
    }
    return false;
  }

  function runList(list,ctx,index=0){
    if(index>=list.length)return ctx;
    const stage=list[index];
    let out;
    try{out=stage.handler(ctx);}catch(err){ctx.errors.push({stage:stage.name,error:String(err?.message||err)});throw err;}
    const next=value=>{
      if(value!==undefined)ctx.result=value;
      ctx.executed.push(stage.name);
      return runList(list,ctx,index+1);
    };
    return isPromise(out)?out.then(next):next(out);
  }

  function dispatch(kind,brain,args){
    const all=sort(state.stages[kind]||[]);
    const before=all.filter(x=>x.phase==="before"),after=all.filter(x=>x.phase==="after");
    const ctx={kind,brain,args:Array.from(args||[]),result:undefined,skipLegacy:false,data:{},errors:[],executed:[],startedAt:Date.now()};

    const invokeLegacy=()=>{
      if(ctx.skipLegacy)return ctx.result;
      const fn=state.legacy[kind];
      if(typeof fn!=="function")return ctx.result;
      return fn.apply(brain,ctx.args);
    };
    const afterLegacy=result=>{ctx.result=result;return runList(after,ctx);};
    const finish=()=>{
      state.trace.push({kind,ms:Date.now()-ctx.startedAt,stages:ctx.executed.slice(),errors:ctx.errors.slice()});
      if(state.trace.length>40)state.trace.shift();
      return ctx.result;
    };
    const afterBefore=()=>{
      const legacy=invokeLegacy();
      const proceeded=isPromise(legacy)?legacy.then(afterLegacy):afterLegacy(legacy);
      return isPromise(proceeded)?proceeded.then(finish):finish();
    };

    const pre=runList(before,ctx);
    return isPromise(pre)?pre.then(afterBefore):afterBefore();
  }

  function install(){
    if(state.installed)return false;
    state.legacy.hear=NpcBrain.prototype.hear;
    state.legacy.event=NpcBrain.prototype.event;
    state.legacy.tick=NpcBrain.prototype.tick;

    NpcBrain.prototype.hear=function(){return dispatch("hear",this,arguments);};
    NpcBrain.prototype.event=function(){return dispatch("event",this,arguments);};
    NpcBrain.prototype.tick=function(){return dispatch("tick",this,arguments);};
    state.installed=true;
    return true;
  }

  function format(){
    const registered=Object.values(state.stages).reduce((total,list)=>total+list.length,0);
    const lines=[`pipeline=${state.version} · installed=${state.installed?"sí":"no"}`,`legacy-core=encapsulado · etapas registradas=${registered}`];
    for(const kind of ["hear","event","tick"]){
      const list=sort(state.stages[kind]);
      lines.push(`${kind}: ${list.length?list.map(x=>`${x.priority}:${x.phase}:${x.name}`).join(" → "):"legacy-core"}`);
    }
    const last=state.trace[state.trace.length-1];
    if(last)lines.push(`último=${last.kind} · ${last.ms}ms · etapas=${last.stages.join(", ")||"legacy-core"}${last.errors.length?` · errores=${last.errors.length}`:""}`);
    return lines.join("\n");
  }

  window.NpcIntPipeline={state,register,unregister,install,dispatch,format};

  // Se carga justo antes de la primera capa migrada. Así captura las capas heredadas
  // anteriores, mientras los wrappers aún no migrados que se cargan después conservan
  // su posición observable. Las capas nuevas deben registrarse sin reabrir hear/tick/event.
  install();

  const oldCommand=command;
  command=function(raw){
    const head=(String(raw||"").trim().split(/\s+/)[0]||"").toLowerCase();
    if(head==="/pipeline"){
      print("debug","PIPELINE>",format());
      return;
    }
    return oldCommand(raw);
  };
})();
