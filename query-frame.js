"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const stripDet=s=>String(s||"").trim().replace(/^(?:el|la|los|las|un|una|unos|unas)\s+/i,"").trim();
  const STORE={memory:"MemoryStore",commonsense:"CommonsenseStore",factual:"FactualKnowledgeStore",lexical:"LexicalStore",social:"SocialKnowledgeStore",internal:"InternalState"};
  const TRUST={[STORE.memory]:.74,[STORE.commonsense]:.72,[STORE.factual]:.88,[STORE.lexical]:.82,[STORE.social]:.68,[STORE.internal]:.92};

  function ensure(b){
    if(b.queryFrame)return b.queryFrame;
    b.queryFrame={version:1,seq:1,current:null,history:[]};
    return b.queryFrame;
  }

  function concept(value,options={}){
    value=stripDet(value);
    if(!value)return null;
    const registry=window.NpcIntConceptRegistry;
    if(registry?.mention)return registry.mention(value,{create:true,type:options.type,source:"query-frame"});
    return {kind:"concept",id:`concept:entity:${norm(value).replace(/ /g,"_")}`,label:value,type:options.type||"entity",language:"es"};
  }

  function selfRef(){return {kind:"agent",id:"agent:self",label:"NIA-01"};}
  function playerRef(b){return {kind:"agent",id:"agent:player",label:b.relation?.name||"Jugador"};}

  function understandingFor(b,text){
    const u=b.understanding?.lastFrame;
    return u&&norm(u.raw)===norm(text)?u:null;
  }

  function semanticFor(b,text,u){
    if(b.nlp?.lastText===text&&b.nlp?.lastSemantic)return b.nlp.lastSemantic;
    return u?.semantic||null;
  }

  function explicitParse(text,b,u,semantic){
    const n=norm(text);let m;
    const result={intent:u?.intent||semantic?.intent||null,subject:null,predicate:null,object:null,question:null,topic:u?.topic||semantic?.topic||null};

    if((m=n.match(/^(?:a ti )?te gustan? (.+)$/))){
      result.intent="ask_preference";result.subject=selfRef();result.predicate="likes";result.object=concept(m[1]);result.question="value";return result;
    }
    if((m=n.match(/^que (.+?) te gustan?(?: mas)?$/))){
      result.intent="ask_preference";result.subject=selfRef();result.predicate="likes";result.object=concept(m[1]);result.question="value";return result;
    }
    if((m=n.match(/^(?:los |las |el |la )?(.+?) son (?:un |una |unos |unas )?(.+)$/))&&/[?¿]/.test(text)){
      result.intent="factual_query";result.subject=concept(m[1]);result.predicate="is_a";result.object=concept(m[2]);result.question="truth";return result;
    }
    if((m=n.match(/^(?:el |la )?(.+?) es (?:un |una )?(.+)$/))&&/[?¿]/.test(text)){
      result.intent="factual_query";result.subject=concept(m[1]);result.predicate="is_a";result.object=concept(m[2]);result.question="truth";return result;
    }
    if((m=n.match(/^que (?:es|son) (.+)$/))){
      result.intent="factual_query";result.subject=concept(m[1]);result.predicate="definition";result.question="object";return result;
    }
    if((m=n.match(/^que sabes (?:de|sobre) (.+)$/))){
      result.intent="factual_query";result.subject=concept(m[1]);result.predicate="describe";result.question="evidence";return result;
    }
    if((m=n.match(/^que (?:entiendes|comprendes)(?: tu)? (?:como|por|sobre|de) (.+)$/))){
      result.intent="ask_concept_understanding";result.subject=selfRef();result.predicate="understands";result.object=concept(m[1]);result.question="value";return result;
    }
    if((m=n.match(/^tengo (.+)$/))){
      result.intent="state_statement";result.subject=playerRef(b);result.predicate="has_state";result.object=concept(m[1],{type:"need"});return result;
    }
    if((m=n.match(/^me siento (.+)$/))){
      result.intent="state_statement";result.subject=playerRef(b);result.predicate="feels";result.object=concept(m[1],{type:"state"});return result;
    }

    if(result.intent==="ask_preference"){
      result.subject=selfRef();result.predicate="likes";result.object=concept(u?.topic||semantic?.topic||"");result.question="value";
    }else if(result.intent==="ask_self_concept"){
      result.subject=selfRef();result.predicate="conceptualizes";result.object=concept(u?.topic||"");result.question="value";
    }else if(result.intent==="ask_internet_access"){
      result.subject=selfRef();result.predicate="has_capability";result.object=concept("acceso a internet",{type:"capability"});result.question="truth";
    }
    return result;
  }

  function evidenceRequest(parsed,references){
    const intent=parsed.intent;
    if(intent==="ask_preference")return {stores:[STORE.memory,STORE.social,STORE.internal],reason:"preferencia del agente: recuerdos, relación/persona y estado interno; conocimiento factual no decide el gusto"};
    if(intent==="state_statement")return {stores:[STORE.memory,STORE.commonsense,STORE.internal],reason:"estado comunicado por el jugador: conservar episodio y recuperar sentido común relevante sin asumir que el NPC comparte el estado"};
    if(intent==="factual_query"||intent==="fact_verification"||intent==="fact_statement")return {stores:[STORE.commonsense,STORE.factual,STORE.lexical],reason:"consulta/hecho factual: relaciones de sentido común y conocimiento factual/lexical"};
    if(intent==="ask_concept_understanding")return {stores:[STORE.lexical,STORE.factual,STORE.memory],reason:"concepto explícito: significado/conocimiento y contexto previo, no anáfora automática"};
    if(references?.references?.length)return {stores:[STORE.memory],reason:"la consulta depende de recuperar una referencia discursiva concreta"};
    return {stores:[STORE.memory,STORE.internal],reason:"sin clase especializada: contexto reciente y estado interno"};
  }

  function focusConcepts(parsed){return [parsed.subject,parsed.object].filter(x=>x?.kind==="concept");}
  function relationNorm(v){return norm(String(v||"").replaceAll("_"," "));}

  function propositionFromRelation(r){
    return {subject:concept(String(r.subject||"").replaceAll("_"," ")),predicate:r.predicate||"related_to",object:concept(String(r.object||"").replaceAll("_"," "))};
  }

  function scoreEvidence(e){
    const relevance=e.relevance??.5,confidence=e.confidence??.5,sourceTrust=e.sourceTrust??.5,personal=e.personalRelevance??0,recency=e.recency??.5;
    return Math.max(0,Math.min(1,relevance*.35+confidence*.25+sourceTrust*.18+personal*.12+recency*.10));
  }

  function collectEvidence(b,frame){
    const requested=new Set(frame.evidenceRequest.stores),focus=focusConcepts(frame),labels=focus.map(x=>norm(x.label)),out=[];
    const push=e=>{e.score=scoreEvidence(e);out.push(e);};

    if(requested.has(STORE.memory)){
      const mem=b.mem||[];
      for(let i=mem.length-1;i>=0&&out.filter(x=>x.store===STORE.memory).length<5;i--){
        const m=mem[i],txt=String(m?.text||""),n=norm(txt);
        const hit=labels.length?labels.some(x=>x&&n.includes(x)):true;
        if(!hit)continue;
        const age=Math.max(0,(b.time||0)-(m.time||b.time||0));
        push({store:STORE.memory,kind:"episode",proposition:null,text:txt,source:{type:m.type||"memory",id:`memory:${i}`},relevance:.82,confidence:m.confidence??m.weight??.62,sourceTrust:TRUST[STORE.memory],personalRelevance:.92,recency:1/(1+age/60)});
      }
    }

    if(requested.has(STORE.commonsense)){
      const rels=globalThis.npcKnowledge?.commonsense||[];
      for(let i=0;i<rels.length&&out.filter(x=>x.store===STORE.commonsense).length<8;i++){
        const r=rels[i],s=relationNorm(r.subject),o=relationNorm(r.object);
        const direct=labels.some(x=>x&&(x===s||x===o));
        if(!direct)continue;
        push({store:STORE.commonsense,kind:"relation",proposition:propositionFromRelation(r),source:{type:"commonsense-pack",id:`commonsense:${i}`,path:globalThis.npcKnowledge?.sources?.find?.(x=>x.type==="commonsense")?.path||"knowledge/commonsense.es.json"},rawWeight:r.rawWeight??null,relevance:.9,confidence:r.confidence??.7,sourceTrust:TRUST[STORE.commonsense],personalRelevance:.15,recency:.5});
      }
    }

    if(requested.has(STORE.factual)&&frame.subject?.kind==="concept"){
      const match=globalThis.npcKnowledge?.encyclopediaMatch?.(frame.subject.label);
      if(match?.entry&&match.score>.55){
        push({store:STORE.factual,kind:"encyclopedia",proposition:null,text:match.entry.text||"",source:{type:match.entry.source||"local-encyclopedia",id:match.entry.id||match.entry.title},relevance:Math.min(1,match.score),confidence:Math.min(.95,Math.max(.55,match.score)),sourceTrust:TRUST[STORE.factual],personalRelevance:0,recency:.5});
      }
    }

    if(requested.has(STORE.internal)){
      const state=b.cognitiveState?.current||null;
      push({store:STORE.internal,kind:"state",proposition:null,text:state?.topic||"estado interno actual",source:{type:"internal-state",id:"cognitive-state:current"},relevance:frame.subject?.id==="agent:self"?.85:.55,confidence:.9,sourceTrust:TRUST[STORE.internal],personalRelevance:.9,recency:1});
    }

    return out.sort((a,c)=>c.score-a.score).slice(0,12);
  }

  function reasoningHints(frame){
    const xs=[];
    if(frame.intent==="state_statement"&&frame.subject?.id==="agent:player")xs.push("El jugador comunica un estado propio; no debe proyectarse automáticamente al estado de NIA.");
    if(frame.intent==="ask_preference")xs.push("Una preferencia de NIA debe derivarse de memoria, personalidad/estado o aprendizaje; un hecho enciclopédico sobre el objeto no decide el gusto.");
    if(frame.intent==="factual_query"||frame.intent==="fact_verification")xs.push("La respuesta requiere evaluar evidencia sobre una proposición, no recuperar el primer texto relacionado.");
    if(frame.references.length)xs.push("La referencia discursiva fue resuelta antes de recuperar evidencia; su objetivo conserva procedencia y confianza.");
    if(!xs.length)xs.push("Mantener separados contexto conversacional, evidencia externa y estado interno antes de planificar la respuesta.");
    return xs;
  }

  function build(text,b){
    const state=ensure(b),u=understandingFor(b,text),semantic=semanticFor(b,text,u),refs=b.referenceResolver?.last&&norm(b.referenceResolver.last.input)===norm(text)?b.referenceResolver.last:window.NpcIntReferenceResolver?.resolve?.(text,b)||{references:[],candidates:[]};
    const parsed=explicitParse(text,b,u,semantic);
    const route=window.NpcIntIntentRouter?.currentFor?.(b,text)||null;
    if(route&&window.NpcIntIntentRouter?.authoritative?.(route)){
      parsed.intent=route.intent;
      if(route.intent==="fact_verification"){
        parsed.subject=concept(route.slots?.subject||"");
        parsed.predicate="is_a";
        parsed.object=concept(route.slots?.object||"");
        parsed.question="truth";
      }else if(route.intent==="factual_query"&&route.slots?.topic){
        parsed.subject=concept(route.slots.topic);
        parsed.predicate=route.slots.question==="definition"?"definition":"describe";
        parsed.question=route.slots.question||"evidence";
      }
    }
    const frame={
      id:`qf:${state.seq++}`,version:1,time:b.time||0,input:String(text||""),canonical:u?.canonical||norm(text),
      intent:parsed.intent||"unresolved",speechAct:route?.speechAct||semantic?.speechType||(/[?¿]/.test(text)?"question":"statement"),
      subject:parsed.subject,predicate:parsed.predicate,object:parsed.object,question:parsed.question,topic:parsed.topic,
      entities:(semantic?.entities||[]).map(x=>({...x})),references:(refs.references||[]).map(x=>({...x,target:{...x.target}})),
      evidenceRequest:null,candidateEvidence:[],reasoning:[],parser:{source:route?.source||u?.source||semantic?.source||"query-frame-rules",confidence:route?.confidence??u?.confidence??semantic?.confidence??null}
    };
    frame.evidenceRequest=evidenceRequest(parsed,refs);
    frame.candidateEvidence=collectEvidence(b,frame);
    frame.reasoning=reasoningHints(frame);
    return frame;
  }

  function record(b,frame){
    const s=ensure(b);s.current=frame;s.history.push(frame);if(s.history.length>30)s.history.shift();
    if(Array.isArray(b.lastThoughts))b.lastThoughts.push(`QUERY FRAME: ${frame.intent} · ${frame.subject?.id||"—"} --${frame.predicate||"—"}--> ${frame.object?.id||"—"} · evidencia=${frame.candidateEvidence.length}`);
    return frame;
  }

  function describeEntity(x){return x?`${x.label||x.id} [${x.id}]`:"—";}
  function formatTrace(b,frame=ensure(b).current){
    if(!frame)return "Todavía no existe un Query/Thought Frame.";
    const plan=b.responsePlanner?.lastPlan;
    const lines=["INPUT",frame.input,"","FRAME",`id=${frame.id}`,`intent=${frame.intent}`,`speechAct=${frame.speechAct}`,`subject=${describeEntity(frame.subject)}`,`predicate=${frame.predicate||"—"}`,`object=${describeEntity(frame.object)}`,`question=${frame.question||"—"}`];
    lines.push("","REFERENCES");
    if(frame.references.length)for(const r of frame.references)lines.push(`${r.kind}: «${r.mention}» → «${r.target.text}» (${Math.round((r.confidence||0)*100)}%)`);else lines.push("none");
    lines.push("","RETRIEVAL",`requested=${frame.evidenceRequest.stores.join(" → ")}`,`reason=${frame.evidenceRequest.reason}`);
    if(frame.candidateEvidence.length)frame.candidateEvidence.slice(0,8).forEach((e,i)=>lines.push(`${i+1}. ${e.store} · score=${e.score.toFixed(2)} · rel=${(e.relevance??0).toFixed(2)} · conf=${(e.confidence??0).toFixed(2)} · trust=${(e.sourceTrust??0).toFixed(2)} · source=${e.source?.type||"—"}${e.proposition?` · ${e.proposition.subject?.label||"?"} --${e.proposition.predicate}--> ${e.proposition.object?.label||"?"}`:""}`));else lines.push("candidates=0");
    lines.push("","REASONING",...frame.reasoning.map(x=>`- ${x}`),"","RESPONSE_INTENT");
    if(plan&&norm(plan.input)===norm(frame.input))lines.push(`act=${plan.act}`,`intent=${plan.intent||"—"}`,`detail=${plan.detail}`,`followUp=${plan.followUp?"yes":"no"}`);else lines.push("plan=not available for this frame");
    return lines.join("\n");
  }

  const pipeline=window.NpcIntPipeline;
  if(pipeline?.register){
    pipeline.register("hear","query-frame",ctx=>{
      const input=String(ctx.args?.[0]||"");
      record(ctx.brain,build(input,ctx.brain));
    },{phase:"after",priority:840});
  }

  const oldCommand=command;
  command=function(raw){
    const head=(String(raw||"").trim().split(/\s+/)[0]||"").toLowerCase();
    if(head!=="/trace"&&head!=="/frame")return oldCommand(raw);
    print("debug","TRACE>",formatTrace(brain));
  };

  ensure(brain);
  window.NpcIntQueryFrame={ensure,build,record,collectEvidence,scoreEvidence,formatTrace,stores:STORE};
  print("system","","query frame v1.1 cargado · intent router + conceptos + referencias + routing de evidencia + /trace");
})();
