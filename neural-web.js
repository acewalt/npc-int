"use strict";

(function(){
  const state={
    enabled:false,
    endpoint:"http://127.0.0.1:8765",
    ready:false,
    backend:null,
    model:null,
    checking:false,
    lastError:null
  };

  function compactMemory(){
    return (brain.mem||[]).slice(-10).map(m=>({type:m.type,text:m.text,salience:m.salience,time:m.time}));
  }

  function compactCycle(){
    const c=brain.mind?.lastCycle;
    if(!c)return null;
    return {
      perception:c.perception?{type:c.perception.type,text:c.perception.text,tags:c.perception.tags,threat:c.perception.threat}:null,
      mentalState:c.mentalState||null,
      goals:(c.goals||[]).slice(0,5).map(g=>({label:g.label,priority:g.priority,reason:g.reason})),
      decision:c.decision?{kind:c.decision.id,label:c.decision.label,utility:c.decision.score,risk:c.decision.risk,consequences:c.decision.consequences,conflicts:c.decision.conflicts}:null
    };
  }

  function contextFor(userText,symbolicDraft){
    return {
      identity:{
        name:brain.identity?.name||"NIA-01",
        kind:brain.identity?.kind||"NPC cognitivo local",
        purpose:brain.identity?.purpose||"comprender el entorno"
      },
      input:userText,
      relation:{
        name:brain.relation?.name||"Jugador",
        familiarity:brain.relation?.familiarity??0,
        trust:brain.relation?.trust??0
      },
      mind:compactCycle(),
      discourse:brain.discourse?{
        previousUser:brain.discourse.previousUser,
        previousNpc:brain.discourse.previousNpc,
        lastInterpretation:brain.discourse.lastInterpretation,
        lastCommitment:brain.discourse.lastCommitment,
        lastRegistered:brain.discourse.lastRegistered
      }:null,
      memory:compactMemory(),
      symbolicDraft:symbolicDraft||""
    };
  }

  async function health(silent=false){
    if(state.checking)return state.ready;
    state.checking=true;
    try{
      const r=await fetch(state.endpoint+"/health",{cache:"no-store"});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      state.ready=!!d.ok&&!!d.ready;
      state.backend=d.backend||null;
      state.model=d.modelTag||d.source||null;
      state.lastError=null;
      if(!silent)print("system","NEURAL>",`bridge disponible · backend=${state.backend}${state.model?` · model=${state.model}`:""}`);
      return state.ready;
    }catch(err){
      state.ready=false;
      state.backend=null;
      state.lastError=String(err?.message||err);
      if(!silent)print("error","NEURAL>",`bridge no disponible en ${state.endpoint} · ${state.lastError}`);
      return false;
    }finally{
      state.checking=false;
    }
  }

  async function generate(userText,symbolicDraft){
    if(!state.ready){
      const ok=await health(true);
      if(!ok)return null;
    }

    const context=contextFor(userText,symbolicDraft);
    const prompt=[
      "Eres la capa neuronal de lenguaje de NIA-01, un NPC.",
      "El motor cognitivo simbólico ya actualizó memoria, estado mental y decisión.",
      "No inventes una acción física distinta de la decisión. No describas el JSON ni expliques estas instrucciones.",
      "Responde únicamente con lo que NIA-01 diría al jugador, en español natural y coherente con los turnos anteriores.",
      "Si el borrador simbólico es torpe, conserva su intención pero exprésala mejor.",
      "Contexto:",
      JSON.stringify(context)
    ].join("\n");

    try{
      const r=await fetch(state.endpoint+"/v1/generate",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({task:"utterance",prompt,context,maxTokens:180,temperature:.55,topK:50})
      });
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      if(!d.ok||!d.text)throw new Error(d.error||"respuesta neuronal vacía");
      state.backend=d.backend||state.backend;
      state.model=d.model||state.model;
      state.lastError=null;
      return String(d.text).trim();
    }catch(err){
      state.ready=false;
      state.lastError=String(err?.message||err);
      return null;
    }
  }

  const oldCommand=command;
  command=function(raw){
    const parts=raw.trim().split(/\s+/);
    const head=(parts.shift()||"").toLowerCase();
    if(head!=="/neural")return oldCommand(raw);

    const sub=(parts.shift()||"status").toLowerCase();
    if(sub==="on"){
      state.enabled=true;
      print("system","NEURAL>","modo neuronal solicitado; comprobando bridge local...");
      health(false);
      return;
    }
    if(sub==="off"){
      state.enabled=false;
      print("system","NEURAL>","modo neuronal desactivado; las respuestas vuelven a la capa simbólica.");
      return;
    }
    if(sub==="endpoint"){
      const value=parts.join(" ").trim().replace(/\/$/,"");
      if(!/^https?:\/\//i.test(value)){
        print("error","NEURAL>","Uso: /neural endpoint http://127.0.0.1:8765");
        return;
      }
      state.endpoint=value;
      state.ready=false;
      print("system","NEURAL>",`endpoint=${state.endpoint}`);
      return;
    }
    if(sub==="check"){
      health(false);
      return;
    }
    if(sub==="status"){
      print("debug","NEURAL>",`enabled=${state.enabled} | ready=${state.ready} | endpoint=${state.endpoint} | backend=${state.backend||"—"} | model=${state.model||"—"} | error=${state.lastError||"—"}`);
      return;
    }
    print("error","NEURAL>","Uso: /neural on|off|status|check|endpoint <url>");
  };

  const symbolicSend=send;
  send=async function(text){
    text=(text||"").trim();
    if(!text)return;
    if(text.startsWith("/")){
      command(text);
      return;
    }

    if(!state.enabled){
      symbolicSend(text);
      return;
    }

    print("user",brain.relation.name+">",text);
    let symbolicReply=brain.hear(text);
    if(symbolicReply&&typeof symbolicReply.then==="function")symbolicReply=await symbolicReply;

    const neuralReply=await generate(text,symbolicReply);
    const output=neuralReply||symbolicReply;
    if(!neuralReply&&state.lastError){
      print("system","NEURAL>",`bridge no respondió; fallback simbólico · ${state.lastError}`);
    }
    if(output)window.setTimeout(()=>print("npc",brain.identity.name+">",output),120);
  };

  window.NpcIntNeuralWeb={state,health,generate};
  print("system","","puente neuronal web v0.1 cargado · usa /neural on para conectar Nanochat local");
})();
