"use strict";

(function(){
  const Core=globalThis.NpcIntKnowledgeArchitectureCore;
  if(!Core){
    console.error("knowledge-architecture.js requires knowledge-architecture-core.js");
    return;
  }

  const shared=Core.createArchitecture();
  let commonsenseMeta={relations:0,rejected:0,source:null};

  function ensureState(b){
    if(b.knowledgeArchitecture)return b.knowledgeArchitecture;
    b.knowledgeArchitecture={
      beliefs:new Core.BeliefStore(shared.registry),
      seenFacts:new Set(),
      lastFrame:null,
      lastRetrieval:null,
      lastTrace:null,
      history:[],
      seq:1
    };
    return b.knowledgeArchitecture;
  }

  function conceptText(id){return id?shared.registry.label(id):"—";}
  function propositionText(p){
    if(!p)return "—";
    return `${conceptText(p.subject)} --${p.predicate}--> ${conceptText(p.object)}`;
  }

  function syncBeliefsFromFacts(b){
    const state=ensureState(b);
    for(const fact of b.cognition?.facts||[]){
      const key=String(fact.id??`${fact.subject}|${fact.predicate}|${fact.object}|${fact.time}`);
      if(state.seenFacts.has(key))continue;
      state.seenFacts.add(key);
      if(fact.source==="commonsense")continue;
      const sourceType=fact.source==="inferencia"?"inference":"player_statement";
      state.beliefs.addBelief({
        id:`fact:${key}`,
        proposition:{subject:fact.subject,predicate:fact.predicate,object:fact.object},
        source:{type:sourceType,id:`fact:${key}`},
        status:fact.derived?"derived":"reported",
        confidence:fact.confidence??.7,
        sourceTrust:sourceType==="inference"?.62:null,
        time:fact.time??b.time??0,
        derived:!!fact.derived
      });
    }
  }

  function semanticFor(b,text){
    if(b.nlp?.lastText===text&&b.nlp?.lastSemantic)return b.nlp.lastSemantic;
    return b.understanding?.lastFrame?.semantic||b.nlp?.lastSemantic||null;
  }

  function reasoningSummary(frame,retrieval){
    if(frame.intent==="state_statement")return "El jugador comunica un estado o hecho propio; se conserva como declaración/memoria y el sentido común solo aporta contexto.";
    if(frame.intent==="ask_memory_semantic")return "La consulta pide memoria conversacional; conocimiento general no debe competir con los turnos recordados.";
    if(frame.intent==="ask_preference")return "La consulta pide una preferencia de NIA; memoria, personalidad y experiencia tienen prioridad sobre conocimiento factual.";
    if(["ask_definition","ask_factual_purpose","ask_factual_relation"].includes(frame.intent))return "La consulta es factual; se recuperan candidatos de conocimiento sin tratarlos como memoria personal.";
    if(retrieval.conflicts.length)return "Hay afirmaciones competidoras; se preservan sus fuentes y se evita sobrescribir evidencia silenciosamente.";
    return "La recuperación se decide por el tipo de consulta y después se ordena evidencia por relevancia, confianza, fuente y contexto personal.";
  }

  function buildTurn(b,text){
    const state=ensureState(b);
    syncBeliefsFromFacts(b);
    const semantic=semanticFor(b,text);
    const frame=shared.frameBuilder.build(text,{brain:b,semantic});
    const retrieval=shared.retriever.retrieve(frame,{brain:b,beliefs:state.beliefs,knowledge:globalThis.npcKnowledge,time:b.time||0});
    const trace={
      id:state.seq++,
      time:b.time||0,
      input:text,
      frame,
      references:frame.references||[],
      retrieval,
      reasoning:reasoningSummary(frame,retrieval),
      responsePlan:null
    };
    state.lastFrame=frame;
    state.lastRetrieval=retrieval;
    state.lastTrace=trace;
    state.history.push(trace);
    if(state.history.length>40)state.history.shift();
    return trace;
  }

  function attachResponsePlan(b,trace){
    if(!trace)return;
    const plan=b.responsePlanner?.lastPlan;
    if(!plan)return;
    if(plan.input&&Core.norm(plan.input)!==Core.norm(trace.input))return;
    const evidence=trace.retrieval.accepted.slice(0,6).map(x=>({
      store:x.store,
      proposition:x.proposition||null,
      source:x.source||null,
      score:x.score,
      confidence:x.confidence,
      relevance:x.relevance
    }));
    plan.queryFrame=trace.frame;
    plan.evidence=evidence;
    plan.conflicts=trace.retrieval.conflicts.map(x=>({kind:x.kind,predicate:x.predicate,objects:x.objects}));
    trace.responsePlan={act:plan.act,detail:plan.detail,justify:plan.justify,evidenceCount:evidence.length};
    if(b.cognitiveState?.current?.responsePlan){
      b.cognitiveState.current.responsePlan.queryFrame=trace.frame;
      b.cognitiveState.current.responsePlan.evidence=evidence;
    }
  }

  function afterCurrentStack(fn){
    if(typeof queueMicrotask==="function")queueMicrotask(fn);
    else Promise.resolve().then(fn);
  }

  function formatTrace(b){
    const trace=ensureState(b).lastTrace;
    if(!trace)return "Todavía no existe una traza de consulta.";
    const f=trace.frame,r=trace.retrieval;
    const subject=f.subject?.kind||conceptText(f.subject?.conceptId);
    const object=f.object?.kind||conceptText(f.object?.conceptId);
    const refs=(trace.references||[]).map((x,i)=>`${i+1}. ${x.raw} -> ${x.resolved} [${x.source}]`).join("\n")||"none";
    const byStore={};
    for(const x of r.candidates){
      const key=x.store||"unknown";
      (byStore[key]||(byStore[key]=[])).push(x);
    }
    const retrievalLines=Object.entries(byStore).map(([store,items])=>{
      const rows=items.slice(0,5).map(x=>`  - ${x.proposition?propositionText(x.proposition):(x.text||"evidencia textual")} · rel=${(x.relevance??0).toFixed(2)} · conf=${(x.confidence??0).toFixed(2)} · score=${(x.score??0).toFixed(2)} · source=${x.source?.type||"—"}`);
      return `${store}:\n${rows.join("\n")}`;
    }).join("\n")||"none";
    const conflicts=r.conflicts.map((x,i)=>`${i+1}. ${x.kind} · ${x.predicate} · ${x.objects.map(conceptText).join(" vs ")}`).join("\n")||"none";
    const plan=trace.responsePlan||b.responsePlanner?.lastPlan;
    return [
      "INPUT",
      trace.input,
      "",
      "FRAME",
      `intent = ${f.intent}`,
      `speechAct = ${f.speechAct}`,
      `subject = ${subject||"—"}`,
      `predicate = ${f.predicate||"—"}`,
      `object = ${object||"—"}`,
      `requestedEvidence = ${(f.requestedEvidence||[]).join(", ")||"—"}`,
      `confidence = ${(f.confidence??0).toFixed(2)}`,
      "",
      "REFERENCES",
      refs,
      "",
      "RETRIEVAL",
      retrievalLines,
      "",
      "EVIDENCE",
      `${r.candidates.length} candidatos · ${r.accepted.length} aceptados · ${r.conflicts.length} grupos conflictivos/competidores`,
      "",
      "REASONING",
      trace.reasoning,
      "",
      "RESPONSE_INTENT",
      plan?`act = ${plan.act||"—"}\ndetail = ${plan.detail||"—"}\nevidence = ${plan.evidence?.length??r.accepted.length}`:"todavía no disponible"
    ].join("\n");
  }

  function commonsenseListener(relations,meta={}){
    const result=shared.commonsense.ingest(relations,{sourceType:"commonsense",source:meta.source});
    commonsenseMeta={relations:(relations||[]).length,rejected:meta.rejected||0,source:meta.source||null,stored:result.total};
  }

  if(typeof globalThis.NpcIntSubscribeCommonsense==="function")globalThis.NpcIntSubscribeCommonsense(commonsenseListener);
  else{
    const pending=globalThis.NpcIntPendingCommonsenseSubscribers||(globalThis.NpcIntPendingCommonsenseSubscribers=[]);
    pending.push(commonsenseListener);
  }

  const api={
    core:Core,
    registry:shared.registry,
    stores:{commonsense:shared.commonsense,memory:shared.memory,factual:shared.factual,lexical:shared.lexical,social:shared.social},
    buildFrame:(text,ctx={})=>shared.frameBuilder.build(text,ctx),
    retrieve:(frame,ctx={})=>shared.retriever.retrieve(frame,ctx),
    resolveReferences:(text,ctx={})=>shared.resolver.resolve(text,ctx),
    queryRelation:(subject,predicate,object,opts={})=>shared.commonsense.queryRelation(subject,predicate,object,opts),
    findCommonsense:(subject,predicate=null)=>shared.commonsense.relationCandidates(subject,predicate),
    ensureState,
    syncBeliefsFromFacts,
    formatTrace,
    commonsenseStatus:()=>({...commonsenseMeta,registry:shared.registry.stats()})
  };
  globalThis.NpcIntKnowledgeArchitecture=api;

  if(typeof NpcBrain!=="undefined"){
    const oldReset=NpcBrain.prototype.reset;
    NpcBrain.prototype.reset=function(){
      oldReset.call(this);
      this.knowledgeArchitecture=null;
      ensureState(this);
    };

    const oldHear=NpcBrain.prototype.hear;
    NpcBrain.prototype.hear=function(text){
      const q=String(text||"").trim();
      const trace=buildTurn(this,q);
      const before=new Set((this.cognition?.facts||[]).map(x=>x.id));
      const finish=result=>{
        syncBeliefsFromFacts(this);
        const added=(this.cognition?.facts||[]).filter(x=>!before.has(x.id)&&x.source!=="commonsense");
        if(added.length&&Array.isArray(this.lastThoughts))this.lastThoughts.push(`EVIDENCIA PERSONAL: ${added.length} hecho(s) reportado(s)/derivado(s), separados del conocimiento general`);
        afterCurrentStack(()=>attachResponsePlan(this,trace));
        return result;
      };
      const result=oldHear.call(this,text);
      return result&&typeof result.then==="function"?result.then(finish):finish(result);
    };
  }

  if(typeof command==="function"){
    const oldCommand=command;
    command=function(raw){
      const head=(String(raw||"").trim().split(/\s+/)[0]||"").toLowerCase();
      if(head==="/trace"||head==="/evidence"){
        print("debug","TRACE>",formatTrace(brain));
        return;
      }
      if(head==="/stores"){
        const s=api.commonsenseStatus();
        const state=ensureState(brain);
        print("debug","STORES>",[
          `ConceptRegistry: ${s.registry.concepts} conceptos · ${s.registry.aliases} aliases`,
          `CommonsenseStore: ${s.stored||0} relaciones · fuente=${s.source||"—"}`,
          `Memory/Beliefs: ${state.beliefs.items.length} creencias personales`,
          `FactualKnowledgeStore: adaptador a encyclopedia/Wikidata local`,
          `LexicalStore: adaptador a dictionary/OMW`,
          `SocialKnowledgeStore: adaptador a social-topics`,
          `cognition.facts: ${(brain.cognition?.facts||[]).length} hechos conversacionales/inferidos (sin commonsense)`
        ].join("\n"));
        return;
      }
      return oldCommand(raw);
    };
  }

  ensureState(globalThis.brain||{});
  if(typeof print==="function")print("system","","arquitectura de conocimiento v2 cargada · ConceptRegistry + QueryFrame + ReferenceResolver + stores + evidencia + /trace");
})();
