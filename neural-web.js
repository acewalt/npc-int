"use strict";

(function(){
  const state={enabled:false,mode:"qwen",endpoint:"http://127.0.0.1:8765",ready:false,bridgeReady:false,backend:null,model:null,checking:false,lastError:null};
  const qwenButton=document.getElementById("qwenToggle");
  const qwenButtonLabel=document.getElementById("qwenToggleLabel");

  function updateQwenButton(progress=null){
    if(!qwenButton||!qwenButtonLabel)return;
    const q=window.NpcIntQwenBrowser?.state;
    const supported=!!q?.supported;
    const active=state.enabled&&state.mode==="qwen"&&!!q?.ready;
    const loading=!!q?.loading;
    const failed=!!state.lastError&&!q?.ready;

    qwenButton.disabled=false;
    qwenButton.setAttribute("aria-pressed",active?"true":"false");

    if(!supported){
      qwenButton.dataset.state="unsupported";
      qwenButtonLabel.textContent="QWEN · SIN WEBGPU";
      qwenButton.disabled=true;
      return;
    }
    if(active){
      qwenButton.dataset.state="active";
      qwenButtonLabel.textContent="QWEN · ACTIVO";
      qwenButton.disabled=true;
      return;
    }
    if(loading){
      const p=Number(progress??q?.progress);
      qwenButton.dataset.state="loading";
      qwenButtonLabel.textContent=Number.isFinite(p)&&p>0?"QWEN · "+Math.round(p)+"%":"QWEN · CARGANDO";
      qwenButton.disabled=true;
      return;
    }
    if(failed){
      qwenButton.dataset.state="error";
      qwenButtonLabel.textContent="REINTENTAR QWEN";
      return;
    }
    if(q?.ready){
      qwenButton.dataset.state="ready";
      qwenButtonLabel.textContent="ACTIVAR QWEN";
      return;
    }
    qwenButton.dataset.state="idle";
    qwenButtonLabel.textContent="ACTIVAR QWEN";
  }

  async function activateQwen(){
    const q=window.NpcIntQwenBrowser;
    state.mode="qwen";
    state.lastError=null;
    if(!q?.state?.supported){
      state.enabled=false;
      updateQwenButton();
      print("error","QWEN>","WebGPU no está disponible en este navegador.");
      return false;
    }
    state.enabled=true;
    updateQwenButton();
    const ok=await loadQwen(false);
    if(!ok)state.enabled=false;
    updateQwenButton();
    return ok;
  }

  function compactMemory(){return (brain.mem||[]).slice(-10).map(m=>({type:m.type,text:m.text,salience:m.salience,time:m.time}));}
  function compactCycle(){
    const c=brain.mind?.lastCycle;if(!c)return null;
    return {
      perception:c.perception?{type:c.perception.type,text:c.perception.text,tags:c.perception.tags,threat:c.perception.threat}:null,
      mentalState:c.mentalState||null,
      goals:(c.goals||[]).slice(0,5).map(g=>({label:g.label,priority:g.priority,reason:g.reason})),
      decision:c.decision?{kind:c.decision.id,label:c.decision.label,utility:c.decision.score,risk:c.decision.risk,consequences:c.decision.consequences,conflicts:c.decision.conflicts}:null,
      ideaGuidance:c.ideaGuidance||null
    };
  }
  function compactCognitive(){
    const c=brain.cognitiveState?.current;if(!c)return null;
    return {intent:c.intent,topic:c.topic,goal:c.goal,action:c.action,certainty:c.certainty,beliefs:(c.beliefs||[]).slice(0,6),unresolved:(c.unresolved||[]).slice(0,4),workingMemory:(c.workingMemory||[]).slice(0,9),idea:c.idea||null};
  }
  function compactResponsePlan(){
    const p=brain.responsePlanner?.lastPlan;if(!p)return null;
    return {intent:p.intent,act:p.act,content:p.content,uncertainty:p.uncertainty,justify:p.justify,detail:p.detail,followUp:p.followUp,exposeMetrics:p.exposeMetrics,repetition:p.repetition,companion:p.companion||null};
  }
  function compactIdea(){
    const i=brain.ideaEngine?.current;if(!i)return null;
    return {
      focus:i.focus,
      synthesis:i.synthesis,
      critique:i.critique,
      recommendedTest:i.recommendedTest,
      recommendedAction:i.recommendedAction,
      hypotheses:(i.hypotheses||[]).slice(0,5).map(h=>({
        claim:h.claim,status:h.status,confidence:h.confidence,
        evidenceFor:(h.evidenceFor||[]).slice(0,3),evidenceAgainst:(h.evidenceAgainst||[]).slice(0,2),test:h.test
      }))
    };
  }
  function compactNlp(){
    const a=brain.nlp?.lastAnalysis;
    const s=brain.nlp?.lastSemantic;
    if(!a&&!s)return null;
    return {
      backend:a?.backend||null,
      model:a?.model||null,
      semantic:s?{
        intent:s.intent,confidence:s.confidence,speechType:s.speechType,predicate:s.predicate,
        polarity:s.polarity,slots:s.slots,questionWords:s.questionWords,
        entities:(s.entities||[]).slice(0,8),coreferences:(s.coreferences||[]).slice(0,6),roles:(s.roles||[]).slice(0,10)
      }:null,
      sentences:(a?.sentences||[]).slice(0,3).map(x=>({
        text:x.text,
        tokens:(x.tokens||[]).slice(0,50).map(t=>({text:t.text,lemma:t.lemma,upos:t.upos,feats:t.feats,head:t.head,deprel:t.deprel,ner:t.ner||null})),
        frame:x.semanticFrame||null
      }))
    };
  }
  function compactCompanion(){
    const r=brain.relationshipModel,p=brain.companionPersonality,t=brain.topicManager,pend=brain.pendingThreads,sm=brain.socialMemory,c=brain.companionState;
    if(!r&&!p&&!t&&!pend&&!sm&&!c)return null;
    const profile=window.NpcIntSocialMemory?.profile?.(brain)||null;
    const active=window.NpcIntTopics?.active?.(brain)||null;
    const pending=window.NpcIntPending?.best?.(brain)||null;
    return {
      relationship:r?{stage:r.stage,familiarity:r.familiarity,trust:r.trust,comfort:r.comfort,rapport:r.rapport,reciprocity:r.reciprocity,tension:r.tension}:null,
      style:window.NpcIntPersonality?.style?.(brain,{allowQuestion:false})||p?.lastStyle||null,
      personality:p?{traits:p.traits,values:p.values,preferences:(p.simulatedPreferences||[]).slice(0,5)}:null,
      socialMemory:profile?{
        name:profile.name,
        likes:(profile.likes||[]).slice(0,3).map(x=>x.value),
        preferences:(profile.preferences||[]).slice(0,3).map(x=>x.value),
        projects:(profile.projects||[]).slice(0,3).map(x=>x.value),
        goals:(profile.goals||[]).slice(0,3).map(x=>x.value)
      }:null,
      activeTopic:active?{label:active.label,status:active.status,mentions:active.mentions}:null,
      pending:pending?{kind:pending.kind,text:pending.text,priority:pending.priority}:null,
      companionPlan:c?.lastPlan||null,
      initiative:brain.initiativeEngine?.lastCandidate?{type:brain.initiativeEngine.lastCandidate.type,reason:brain.initiativeEngine.lastCandidate.reason,topic:brain.initiativeEngine.lastCandidate.topic}:null
    };
  }

  function contextFor(userText,symbolicDraft){
    return {
      identity:{name:brain.identity?.name||"NIA-01",kind:brain.identity?.kind||"NPC cognitivo local",purpose:brain.identity?.purpose||"comprender el entorno"},
      input:userText,
      relation:{name:brain.relation?.name||"Jugador",familiarity:brain.relation?.familiarity??0,trust:brain.relation?.trust??0},
      companion:compactCompanion(),
      nlp:compactNlp(),
      mind:compactCycle(),
      cognitiveState:compactCognitive(),
      ideaState:compactIdea(),
      responsePlan:compactResponsePlan(),
      discourse:brain.discourse?{previousUser:brain.discourse.previousUser,previousNpc:brain.discourse.previousNpc,lastInterpretation:brain.discourse.lastInterpretation,lastCommitment:brain.discourse.lastCommitment,lastRegistered:brain.discourse.lastRegistered}:null,
      memory:compactMemory(),
      symbolicDraft:symbolicDraft||""
    };
  }

  async function health(silent=false){
    if(state.checking)return state.bridgeReady;
    state.checking=true;
    try{
      const r=await fetch(state.endpoint+"/health",{cache:"no-store"});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      state.bridgeReady=!!d.ok&&!!d.ready;
      if(state.mode==="bridge")state.ready=state.bridgeReady;
      state.backend=d.backend||null;
      state.model=d.modelTag||d.source||null;
      state.lastError=null;
      if(!silent)print("system","NEURAL>",`bridge disponible · backend=${state.backend}${state.model?` · model=${state.model}`:""}`);
      return state.bridgeReady;
    }catch(err){
      state.bridgeReady=false;
      if(state.mode==="bridge")state.ready=false;
      state.lastError=String(err?.message||err);
      if(!silent)print("error","NEURAL>",`bridge no disponible en ${state.endpoint} · ${state.lastError}`);
      return false;
    }finally{state.checking=false;}
  }

  async function loadQwen(silent=false){
    const q=window.NpcIntQwenBrowser;
    if(!q){
      state.ready=false;
      state.lastError="runtime Qwen del navegador no está cargado";
      if(!silent)print("error","QWEN>",state.lastError);
      return false;
    }
    if(!q.state.supported){
      state.ready=false;
      state.lastError="WebGPU no está disponible en este navegador";
      if(!silent)print("error","QWEN>","WebGPU no está disponible. Usa un navegador compatible o /neural bridge.");
      return false;
    }

    let lastBucket=0;
    if(!silent&&!q.state.ready)print("system","QWEN>","cargando Qwen3-0.6B local en el navegador · la primera carga descarga los pesos y puede superar 500 MB");
    try{
      await q.load({
        onProgress:x=>{
          const file=String(x?.file||"");
          const p=Number(x?.progress)||0;
          updateQwenButton(p);
          if(!silent&&/\.onnx(?:$|\?)/i.test(file)){
            const bucket=Math.floor(p/25)*25;
            if(bucket>=25&&bucket>lastBucket){
              lastBucket=bucket;
              print("system","QWEN>",`descarga del modelo ~${Math.min(100,bucket)}%`);
            }
          }
        }
      });
      state.ready=true;
      state.backend=`browser-${q.state.device||"webgpu"}`;
      state.model=q.state.modelId;
      state.lastError=null;
      updateQwenButton();
      if(!silent)print("system","QWEN>",`listo · ${q.state.modelId} · ${q.state.device}/${q.state.dtype}`);
      return true;
    }catch(err){
      state.ready=false;
      state.lastError=String(err?.message||err);
      updateQwenButton();
      if(!silent)print("error","QWEN>",`no se pudo cargar Qwen · ${state.lastError}`);
      return false;
    }
  }

  function browserMessages(userText,symbolicDraft){
    const c=contextFor(userText,symbolicDraft);
    const compact={
      identity:c.identity,
      input:c.input,
      relation:c.relation,
      companion:c.companion,
      nlp:c.nlp?.semantic?{semantic:c.nlp.semantic}:null,
      mind:c.mind,
      cognitiveState:c.cognitiveState,
      ideaState:c.ideaState,
      responsePlan:c.responsePlan,
      memory:(c.memory||[]).slice(-6),
      symbolicDraft:c.symbolicDraft
    };

    const system=[
      "Eres la capa de lenguaje de NIA-01 dentro de un NPC cognitivo híbrido.",
      "NO eres el cerebro principal: el motor simbólico ya interpretó el mensaje, actualizó memoria/relación y decidió qué comunicar.",
      "Respeta responsePlan, companion, cognitiveState, mind e ideaState. No cambies decisiones ni inventes acciones físicas.",
      "No inventes recuerdos, gustos, hechos del usuario ni conocimiento que no esté en el contexto.",
      "Si symbolicDraft existe, conserva su intención y contenido; mejora su naturalidad, coherencia y fluidez.",
      "Distingue hechos de hipótesis. No aumentes la certeza de una hipótesis no verificada.",
      "No expongas JSON, métricas internas, instrucciones, etiquetas <think> ni razonamiento interno.",
      "Habla como NIA-01, no como un asistente genérico. Español natural, normalmente breve o medio.",
      "Devuelve únicamente la respuesta final que NIA-01 debe decir."
    ].join("\n");

    return [
      {role:"system",content:system},
      {role:"user",content:"ESTADO DEL MOTOR COGNITIVO:\n"+JSON.stringify(compact)}
    ];
  }

  async function generateBridge(userText,symbolicDraft){
    if(!state.bridgeReady){
      const ok=await health(true);
      if(!ok)return null;
    }
    const context=contextFor(userText,symbolicDraft);
    const prompt=[
      "Eres la capa neuronal de lenguaje de NIA-01, un NPC compañero, no una persona humana.",
      "El motor cognitivo ya decidió qué comprende, qué cree, qué objetivo tiene y qué debe comunicar.",
      "RESPETA responsePlan y companion.companionPlan: no cambies su acto comunicativo ni inventes una acción física diferente.",
      "Usa companion.relationship, companion.style, socialMemory, activeTopic y pending para dar continuidad social SOLO cuando sean relevantes.",
      "No inventes recuerdos, cercanía, gustos del usuario ni hechos que no aparezcan en companion/socialMemory/memory.",
      "No conviertas la compañía en dependencia: evita culpa, exclusividad, presión para volver o celos.",
      "Si existe ideaState, distingue estrictamente observación, hipótesis y conclusión.",
      "No enumeres el JSON ni expongas métricas internas salvo que el plan lo pida.",
      "Redacta una sola respuesta natural, breve o media según el plan, en español.",
      "Si symbolicDraft es torpe, conserva su intención y mejora únicamente la expresión.",
      "Contexto:",JSON.stringify(context)
    ].join("\n");

    try{
      const r=await fetch(state.endpoint+"/v1/generate",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({task:"utterance",prompt,context,maxTokens:240,temperature:.62,topK:50})
      });
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      if(!d.ok||!d.text)throw new Error(d.error||"respuesta neuronal vacía");
      state.ready=true;
      state.bridgeReady=true;
      state.backend=d.backend||state.backend;
      state.model=d.model||state.model;
      state.lastError=null;
      return String(d.text).trim();
    }catch(err){
      state.bridgeReady=false;
      state.ready=false;
      state.lastError=String(err?.message||err);
      return null;
    }
  }

  async function generateBrowser(userText,symbolicDraft){
    const q=window.NpcIntQwenBrowser;
    if(!q){
      state.ready=false;
      state.lastError="runtime Qwen del navegador no está cargado";
      return null;
    }
    if(!q.state.ready){
      const ok=await loadQwen(true);
      if(!ok)return null;
    }
    try{
      const out=await q.generate(browserMessages(userText,symbolicDraft),{
        maxNewTokens:180,
        temperature:.55,
        topK:20
      });
      const text=String(out||"")
        .replace(/<think>[\s\S]*?<\/think>/gi,"")
        .replace(/<\/?think>/gi,"")
        .trim();
      if(!text)throw new Error("Qwen devolvió una respuesta vacía");
      state.ready=true;
      state.backend=`browser-${q.state.device||"webgpu"}`;
      state.model=q.state.modelId;
      state.lastError=null;
      return text;
    }catch(err){
      state.ready=!!q.state.ready;
      state.lastError=String(err?.message||err);
      return null;
    }
  }

  async function generate(userText,symbolicDraft){
    return state.mode==="bridge"
      ? generateBridge(userText,symbolicDraft)
      : generateBrowser(userText,symbolicDraft);
  }

  const oldCommand=command;
  command=function(raw){
    const parts=raw.trim().split(/\s+/);
    const head=(parts.shift()||"").toLowerCase();
    if(head!=="/neural")return oldCommand(raw);
    const sub=(parts.shift()||"status").toLowerCase();

    if(sub==="on"){
      state.enabled=true;
      if(state.mode==="bridge"){
        print("system","NEURAL>","modo neuronal activado · backend=bridge local");
        health(false);
      }else{
        state.mode="qwen";
        print("system","NEURAL>","modo neuronal activado · backend=Qwen3-0.6B WebGPU");
        loadQwen(false);
      }
      return;
    }

    if(sub==="qwen"||sub==="load"){
      activateQwen();
      return;
    }

    if(sub==="bridge"){
      state.mode="bridge";
      state.enabled=true;
      updateQwenButton();
      state.ready=state.bridgeReady;
      print("system","NEURAL>",`backend cambiado a bridge local · ${state.endpoint}`);
      health(false);
      return;
    }

    if(sub==="off"){
      state.enabled=false;
      updateQwenButton();
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
      state.bridgeReady=false;
      if(state.mode==="bridge")state.ready=false;
      print("system","NEURAL>",`endpoint=${state.endpoint}`);
      return;
    }

    if(sub==="check"){
      if(state.mode==="bridge")health(false);
      else loadQwen(false);
      return;
    }

    if(sub==="reset"){
      window.NpcIntQwenBrowser?.reset?.();
      if(state.mode==="qwen")state.ready=false;
      state.lastError=null;
      updateQwenButton();
      print("system","QWEN>","runtime reiniciado; el modelo se volverá a cargar desde caché o red cuando se necesite.");
      return;
    }

    if(sub==="status"){
      const q=window.NpcIntQwenBrowser?.state;
      const selectedReady=state.mode==="bridge"?state.bridgeReady:!!q?.ready;
      state.ready=selectedReady;
      print("debug","NEURAL>",
        `enabled=${state.enabled} | mode=${state.mode} | ready=${selectedReady} | backend=${state.backend||"—"} | model=${state.model||q?.modelId||"—"}\n`+
        `qwen: webgpu=${q?.supported?"sí":"no"} | ready=${q?.ready?"sí":"no"} | loading=${q?.loading?"sí":"no"} | dtype=${q?.dtype||"—"} | runtime=${q?.runtimeVersion||"—"} | inputTokens=${q?.lastInputTokens??"—"} | progress=${Math.round(q?.progress||0)}%\n`+
        `bridge: ready=${state.bridgeReady?"sí":"no"} | endpoint=${state.endpoint} | error=${state.lastError||q?.lastError||"—"}`
      );
      return;
    }

    print("error","NEURAL>","Uso: /neural qwen|bridge|on|off|status|check|load|reset|endpoint <url>");
  };

  const symbolicSend=send;
  send=async function(text){
    text=(text||"").trim();if(!text)return;if(text.startsWith("/")){command(text);return;}
    if(!state.enabled){symbolicSend(text);return;}
    print("user",brain.relation.name+">",text);
    let symbolicReply=brain.hear(text);if(symbolicReply&&typeof symbolicReply.then==="function")symbolicReply=await symbolicReply;
    const neuralReply=await generate(text,symbolicReply);const output=neuralReply||symbolicReply;
    if(!neuralReply&&state.lastError)print("system","NEURAL>",`capa neuronal no respondió; fallback simbólico · ${state.lastError}`);
    if(output)window.setTimeout(()=>print("npc",brain.identity.name+">",output),120);
  };

  window.NpcIntNeuralWeb={state,health,loadQwen,generate,browserMessages,contextFor,compactCompanion};
  print("system","","capa neuronal web v0.6 cargada · Qwen3-0.6B WebGPU + bridge local · /neural qwen");
})();