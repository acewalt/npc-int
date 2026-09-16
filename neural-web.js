"use strict";

(function(){
  const state={enabled:false,endpoint:"http://127.0.0.1:8765",ready:false,backend:null,model:null,checking:false,lastError:null};

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
    if(state.checking)return state.ready;state.checking=true;
    try{
      const r=await fetch(state.endpoint+"/health",{cache:"no-store"});if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();state.ready=!!d.ok&&!!d.ready;state.backend=d.backend||null;state.model=d.modelTag||d.source||null;state.lastError=null;
      if(!silent)print("system","NEURAL>",`bridge disponible · backend=${state.backend}${state.model?` · model=${state.model}`:""}`);
      return state.ready;
    }catch(err){state.ready=false;state.backend=null;state.lastError=String(err?.message||err);if(!silent)print("error","NEURAL>",`bridge no disponible en ${state.endpoint} · ${state.lastError}`);return false;}
    finally{state.checking=false;}
  }

  async function generate(userText,symbolicDraft){
    if(!state.ready){const ok=await health(true);if(!ok)return null;}
    const context=contextFor(userText,symbolicDraft);
    const prompt=[
      "Eres la capa neuronal de lenguaje de NIA-01, un NPC compañero, no una persona humana.",
      "El motor cognitivo ya decidió qué comprende, qué cree, qué objetivo tiene y qué debe comunicar.",
      "RESPETA responsePlan y companion.companionPlan: no cambies su acto comunicativo ni inventes una acción física diferente.",
      "Usa companion.relationship, companion.style, socialMemory, activeTopic y pending para dar continuidad social SOLO cuando sean relevantes.",
      "No inventes recuerdos, cercanía, gustos del usuario ni hechos que no aparezcan en companion/socialMemory/memory.",
      "No conviertas la compañía en dependencia: evita culpa, exclusividad, presión para volver, celos o frases como 'no me dejes'.",
      "La personalidad de NIA puede mostrarse mediante curiosidad, prudencia, opinión provisional, humor ligero y preferencias simuladas.",
      "Si existe nlp.semantic, úsalo como interpretación lingüística prioritaria: intención, predicado, roles, entidades y coreferencias ya fueron analizados.",
      "Si existe ideaState, distingue estrictamente observación, hipótesis y conclusión. Una hipótesis con status=unverified NO es un hecho.",
      "Puedes combinar y redactar con naturalidad la síntesis, crítica y prueba de ideaState, pero no aumentar su certeza ni inventar evidencia.",
      "No enumeres el JSON ni expongas métricas internas salvo que el plan lo pida.",
      "No conviertas probabilidades, utilidad, miedo, confianza o curiosidad en porcentajes dentro de conversación normal.",
      "Evita sonar como documentación técnica. Prefiere lenguaje conversacional, variado y contextual, sin fingir emociones o experiencias humanas reales.",
      "No termines cada respuesta con una pregunta. Pregunta solo si companion.style/plan sugiere que aporta continuidad.",
      "Redacta una sola respuesta natural, breve o media según el plan, en español.",
      "Si symbolicDraft es torpe, conserva su intención y mejora únicamente la expresión.",
      "Contexto:",JSON.stringify(context)
    ].join("\n");
    try{
      const r=await fetch(state.endpoint+"/v1/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:"utterance",prompt,context,maxTokens:240,temperature:.62,topK:50})});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();if(!d.ok||!d.text)throw new Error(d.error||"respuesta neuronal vacía");
      state.backend=d.backend||state.backend;state.model=d.model||state.model;state.lastError=null;return String(d.text).trim();
    }catch(err){state.ready=false;state.lastError=String(err?.message||err);return null;}
  }

  const oldCommand=command;
  command=function(raw){
    const parts=raw.trim().split(/\s+/);const head=(parts.shift()||"").toLowerCase();if(head!=="/neural")return oldCommand(raw);
    const sub=(parts.shift()||"status").toLowerCase();
    if(sub==="on"){state.enabled=true;print("system","NEURAL>","modo neuronal solicitado; comprobando bridge local...");health(false);return;}
    if(sub==="off"){state.enabled=false;print("system","NEURAL>","modo neuronal desactivado; las respuestas vuelven a la capa simbólica.");return;}
    if(sub==="endpoint"){
      const value=parts.join(" ").trim().replace(/\/$/,"");if(!/^https?:\/\//i.test(value)){print("error","NEURAL>","Uso: /neural endpoint http://127.0.0.1:8765");return;}
      state.endpoint=value;state.ready=false;print("system","NEURAL>",`endpoint=${state.endpoint}`);return;
    }
    if(sub==="check"){health(false);return;}
    if(sub==="status"){print("debug","NEURAL>",`enabled=${state.enabled} | ready=${state.ready} | endpoint=${state.endpoint} | backend=${state.backend||"—"} | model=${state.model||"—"} | error=${state.lastError||"—"}`);return;}
    print("error","NEURAL>","Uso: /neural on|off|status|check|endpoint <url>");
  };

  const symbolicSend=send;
  send=async function(text){
    text=(text||"").trim();if(!text)return;if(text.startsWith("/")){command(text);return;}
    if(!state.enabled){symbolicSend(text);return;}
    print("user",brain.relation.name+">",text);
    let symbolicReply=brain.hear(text);if(symbolicReply&&typeof symbolicReply.then==="function")symbolicReply=await symbolicReply;
    const neuralReply=await generate(text,symbolicReply);const output=neuralReply||symbolicReply;
    if(!neuralReply&&state.lastError)print("system","NEURAL>",`bridge no respondió; fallback simbólico · ${state.lastError}`);
    if(output)window.setTimeout(()=>print("npc",brain.identity.name+">",output),120);
  };

  window.NpcIntNeuralWeb={state,health,generate,contextFor,compactCompanion};
  print("system","","puente neuronal web v0.5 cargado · NLP + cognición + ideas + estado social/compañía · /neural on");
})();