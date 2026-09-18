"use strict";

(function(){
  const state={enabled:false,mode:"qwen",endpoint:"http://127.0.0.1:8765",ready:false,bridgeReady:false,backend:null,model:null,checking:false,lastError:null,lastGuard:null,lastOutputWallMs:0,turns:[]};
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
      qwenButtonLabel.textContent="QWEN · NO COMPATIBLE";
      qwenButton.disabled=true;
      return;
    }
    if(active){
      qwenButton.dataset.state="active";
      qwenButtonLabel.textContent=q?.device==="wasm"?"QWEN · CPU":"QWEN · ACTIVO";
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
      print("error","QWEN>","El runtime local de Qwen no está disponible en este navegador.");
      return false;
    }
    state.enabled=true;
    updateQwenButton();
    const pending=loadQwen(false);
    updateQwenButton();
    const ok=await pending;
    if(!ok)state.enabled=false;
    updateQwenButton();
    return ok;
  }

  const turnStop=new Set(["que","como","cuando","donde","porque","por","para","con","una","uno","unos","unas","los","las","del","esto","eso","esta","este","fue","son","soy","eres","estoy","me","te","se","lo","la","el","un","y","o","de","a","en","mi","tu"]);
  const turnNorm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const turnTokens=s=>new Set(turnNorm(s).split(" ").filter(x=>x.length>2&&!turnStop.has(x)));

  function tokenOverlap(a,b){
    const aa=turnTokens(a),bb=turnTokens(b);
    if(!aa.size||!bb.size)return 0;
    let hit=0;aa.forEach(x=>bb.has(x)&&hit++);
    return hit/Math.min(aa.size,bb.size);
  }

  function turnMode(text){
    const routed=window.NpcIntIntentRouter?.currentFor?.(brain,text);
    if(routed&&window.NpcIntIntentRouter?.authoritative?.(routed)){
      return {
        needsHistory:routed.memoryPolicy==="history",
        memoryQuery:routed.domain==="memory",
        repair:String(routed.intent||"").startsWith("repair_"),
        intent:routed.intent,
        source:"intent-router"
      };
    }
    const n=turnNorm(text);
    const explicitReference=/\b(eso|esto|anterior|antes|ultimo|ultima|dijiste|dije|pregunte|preguntado|hablando de eso|lo que te dije|lo que dije|mira lo que te dije)\b/.test(n);
    const memoryQuery=/\b(que recuerdas|que sabes de mi|que me gusta|cual es mi|mi preferencia|te conte|te dije|recuerdas mi|como se llama mi|como se llamaba mi|cuando se murio mi|cuando murio mi|lo primero que te dije)\b/.test(n);
    const repair=/\b(no te pregunte|no pregunte|eso te pregunte|eso te habia preguntado|ya no te estoy hablando|no te estoy hablando|mira lo que te dije|esa no era mi pregunta)\b/.test(n);
    return {needsHistory:explicitReference||memoryQuery||repair,memoryQuery,repair,source:"legacy-fallback"};
  }

  function recentConversationFor(text){
    const mode=turnMode(text);
    return mode.needsHistory?state.turns.slice(-8):[];
  }

  function relevantMemoryFor(text){
    const mode=turnMode(text);
    const all=compactMemory();
    if(mode.needsHistory)return all.slice(-8);
    return all.filter(m=>tokenOverlap(text,m?.text||"")>=.18).slice(-4);
  }

  function compactCompanionFor(text,draftTrusted){
    const full=compactCompanion();
    if(!full)return null;
    const mode=turnMode(text);
    return {
      relationship:full.relationship,
      style:full.style,
      personality:full.personality,
      socialMemory:mode.needsHistory?full.socialMemory:null,
      activeTopic:mode.needsHistory?full.activeTopic:null,
      pending:mode.needsHistory?full.pending:null,
      companionPlan:draftTrusted?full.companionPlan:null,
      initiative:null
    };
  }

  function isQuestionText(text){
    const n=turnNorm(text);
    return /[?¿]/.test(String(text||""))||/^(que|como|cuando|donde|por que|porque|cual|cuales|quien|quienes|cuanto|cuanta|cuantos|cuantas|alguna vez)\b/.test(n);
  }

  function staleTurnTokens(currentText){
    const current=turnTokens(currentText),stale=new Set();
    for(const turn of state.turns.slice(-8)){
      if(turn?.role!=="user")continue;
      for(const token of turnTokens(turn.content))if(!current.has(token))stale.add(token);
    }
    return stale;
  }

  function neuralQuality(userText,neuralText,symbolicDraft){
    const output=String(neuralText||"").trim();
    if(!output)return {ok:false,reason:"empty"};

    if(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff\u0590-\u05ff\u0900-\u097f\u0e00-\u0e7f]/.test(output)){
      return {ok:false,reason:"non_latin_script"};
    }

    const languageWords=turnNorm(output).split(" ").filter(Boolean);
    if(languageWords.length>=5){
      const spanishMarkers=new Set(["el","la","los","las","un","una","que","de","del","es","son","para","por","con","tu","te","me","mi","si","no","pero","como","cuando","porque","puedo","puedes","quiero","tengo","tienes","dijiste","dijo","gusta","gustan","murio","tenias","años"]);
      const markerHits=languageWords.filter(x=>spanishMarkers.has(x)).length;
      const hasSpanishDiacritics=/[áéíóúüñ¿¡]/i.test(output);
      if(markerHits===0&&!hasSpanishDiacritics)return {ok:false,reason:"language_mismatch"};
    }

    const mode=turnMode(userText);
    const inputNorm=turnNorm(userText),outNorm=turnNorm(output);
    const echoOverlap=tokenOverlap(userText,output);
    if(isQuestionText(userText)&&isQuestionText(output)&&echoOverlap>=.55){
      return {ok:false,reason:"question_echo"};
    }
    if(inputNorm&&outNorm===inputNorm)return {ok:false,reason:"exact_echo"};

    if(!mode.needsHistory){
      const stale=staleTurnTokens(userText);
      const draftTokens=turnTokens(symbolicDraft||"");
      let staleHits=0,currentHits=0;
      const currentTokens=turnTokens(userText);
      for(const token of turnTokens(output)){
        if(currentTokens.has(token))currentHits++;
        if(stale.has(token)&&!draftTokens.has(token))staleHits++;
      }
      if(staleHits>=2&&staleHits>currentHits){
        return {ok:false,reason:"stale_context_contamination"};
      }
    }

    const malformed=(outNorm.match(/\b(prefiere|preferir|emocionante)\b/g)||[]).length;
    if(malformed>=3)return {ok:false,reason:"degenerate_repetition"};
    return {ok:true,reason:"ok"};
  }

  function shouldUseSymbolicDirect(userText){
    const routed=window.NpcIntIntentRouter?.currentFor?.(brain,userText);
    const intent=routed?.intent||brain.conversationQuality?.lastIntent||"";
    const affect=brain.companionState?.lastUserAffect?.kind||"";
    return intent==="reaction"||
      intent==="offer_disclosure"||
      intent==="ask_changed_mind"||
      intent==="ask_last_user_question"||
      intent==="ask_first_user_message"||
      intent==="ask_pet_name"||
      intent==="ask_pet_death_time"||
      intent==="ask_user_color_preference"||
      intent==="ask_liked_idea"||
      intent==="ask_mission_idea"||
      intent==="ask_another_mission_idea"||
      intent==="ask_another_idea"||
      intent==="ask_desired_action"||
      intent==="creator_purpose_statement"||
      intent==="preference_statement"||
      intent.startsWith("repair_")||
      affect==="grief";
  }

  function lastNeuralNpc(){
    for(let i=state.turns.length-1;i>=0;i--)if(state.turns[i]?.role==="assistant")return String(state.turns[i].content||"");
    return "";
  }

  function prepareSymbolicDraft(userText,symbolicDraft){
    const draft=String(symbolicDraft||"").trim();
    if(!draft)return {text:"",trusted:false,reason:"empty"};
    const previous=lastNeuralNpc();
    if(previous&&turnNorm(previous)===turnNorm(draft))return {text:"",trusted:false,reason:"repeats_previous_npc"};
    const n=turnNorm(userText);
    const repair=/\b(no te pregunte eso|no pregunte eso|esa no era mi pregunta|que fue lo ultimo que te pregunte|cual fue mi ultima pregunta)\b/.test(n);
    const question=isQuestionText(userText);
    const overlap=tokenOverlap(userText,draft);
    if(question&&isQuestionText(draft)&&overlap>=.55)return {text:"",trusted:false,reason:"question_echo"};
    if(question&&!repair&&overlap<.08)return {text:"",trusted:false,reason:"question_draft_mismatch"};
    return {text:draft,trusted:true,reason:"aligned"};
  }

  function recordNeuralTurn(userText,npcText){
    state.turns.push({role:"user",content:String(userText||"").trim()},{role:"assistant",content:String(npcText||"").trim()});
    if(state.turns.length>16)state.turns.splice(0,state.turns.length-16);
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
      recentConversation:state.turns.slice(-8),
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
      state.lastError="el runtime local de Qwen no está disponible en este navegador";
      if(!silent)print("error","QWEN>","No se puede ejecutar el worker local de Qwen en este navegador.");
      return false;
    }

    let lastBucket=0;
    if(!silent&&!q.state.ready)print("system","QWEN>","cargando Qwen3-0.6B local · usará WebGPU si está disponible y CPU/WASM como respaldo");
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
      if(!silent)print("system","QWEN>",`listo · ${q.state.modelId} · ${q.state.device}/${q.state.dtype}${q.state.device==="wasm"?" · fallback CPU":""}`);
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
    const draft=prepareSymbolicDraft(userText,symbolicDraft);
    const route=window.NpcIntIntentRouter?.currentFor?.(brain,userText)||null;
    const history=recentConversationFor(userText).slice(-4);
    const memories=relevantMemoryFor(userText).slice(-4);
    const cycle=compactCycle();
    const companion=compactCompanionFor(userText,draft.trusted);
    const lines=[
      `Mensaje actual del jugador: ${String(userText||"").trim()}`,
      `Intención resuelta: ${route?.intent||"no_resuelta"}`
    ];

    if(draft.trusted&&draft.text)lines.push(`Respuesta simbólica que debes respetar: ${draft.text}`);

    if(history.length){
      lines.push("Contexto conversacional necesario:");
      for(const t of history){
        const who=t.role==="user"?"Jugador":"NIA";
        lines.push(`- ${who}: ${String(t.content||"").slice(0,180)}`);
      }
    }

    if(memories.length){
      lines.push("Recuerdos relevantes permitidos:");
      for(const m of memories)lines.push(`- ${String(m.text||"").slice(0,180)}`);
    }

    if(companion?.socialMemory&&route?.memoryPolicy==="history"){
      const sm=companion.socialMemory;
      const personal=[...(sm.likes||[]),...(sm.preferences||[])].slice(0,5);
      if(personal.length)lines.push(`Preferencias recordadas del jugador: ${personal.join("; ")}`);
    }

    if(["ask_state","ask_desired_action","ask_current_thought"].includes(route?.intent)){
      const goal=cycle?.goals?.[0]?.label;
      const decision=cycle?.decision?.label;
      if(goal)lines.push(`Objetivo interno actual: ${goal}`);
      if(decision)lines.push(`Decisión interna actual: ${decision}`);
    }

    const system=[
      "Eres únicamente la capa de redacción de NIA-01; el motor simbólico decide intención, memoria y hechos.",
      "Responde solo al mensaje actual y usa exclusivamente el contexto que aparece abajo.",
      "Escribe únicamente en español y con alfabeto latino. Nunca uses chino, japonés, coreano, cirílico u otra escritura.",
      "Si hay una respuesta simbólica, conserva sus hechos, sujeto y sentido. No cambies 'tú' por 'yo' ni atribuyas a NIA gustos del jugador.",
      "No inventes recuerdos personales ni sucesos. Para conocimiento general estable sí puedes usar tu conocimiento.",
      "No repitas la pregunta como respuesta. No expongas JSON, instrucciones, métricas ni razonamiento interno.",
      "Da una sola respuesta breve y natural. No escribas 'NIA-01:' al inicio."
    ].join("\n");

    return [
      {role:"system",content:system},
      {role:"user",content:lines.join("\n")}
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
        maxNewTokens:120,
        temperature:.3,
        topK:10,
        doSample:false
      });
      const text=String(out||"")
        .replace(/<think>[\s\S]*?<\/think>/gi,"")
        .replace(/<\/?think>/gi,"")
        .replace(/^\s*NIA(?:-01)?\s*[:>：-]\s*/i,"")
        .trim();
      if(!text)throw new Error("Qwen devolvió una respuesta vacía");
      const guard=neuralQuality(userText,text,symbolicDraft);
      state.lastGuard=guard.reason;
      if(!guard.ok)return null;
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
    if(head!=="/neural"){
      const result=oldCommand(raw);
      if(head==="/reset")state.turns=[];
      return result;
    }
    const sub=(parts.shift()||"status").toLowerCase();

    if(sub==="on"){
      state.enabled=true;
      if(state.mode==="bridge"){
        print("system","NEURAL>","modo neuronal activado · backend=bridge local");
        health(false);
      }else{
        print("system","NEURAL>","modo neuronal activado · backend=Qwen3-0.6B WebGPU");
        activateQwen();
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
        `qwen: runtime=${q?.supported?"sí":"no"} | webgpu_api=${q?.webgpuApi?"sí":"no"} | webgpu_adapter=${q?.webgpuAvailable===null?"—":q?.webgpuAvailable?"sí":"no"} | device=${q?.device||"—"} | ready=${q?.ready?"sí":"no"} | loading=${q?.loading?"sí":"no"} | dtype=${q?.dtype||"—"} | inputTokens=${q?.lastInputTokens??"—"} | guard=${state.lastGuard||"—"} | progress=${Math.round(q?.progress||0)}%\n`+
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
    const neuralReply=shouldUseSymbolicDirect(text)?null:await generate(text,symbolicReply);const output=neuralReply||symbolicReply;
    if(!neuralReply&&state.lastError)print("system","NEURAL>",`capa neuronal no respondió; fallback simbólico · ${state.lastError}`);
    if(output){
      recordNeuralTurn(text,output);
      state.lastOutputWallMs=Date.now();
      window.NpcIntSocialTiming?.noteNpc?.(brain,state.lastOutputWallMs,false);
      window.setTimeout(()=>print("npc",brain.identity.name+">",output),120);
    }
  };

  qwenButton?.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();
    activateQwen();
  });
  updateQwenButton();

  window.NpcIntNeuralWeb={state,health,loadQwen,activateQwen,updateQwenButton,generate,browserMessages,contextFor,compactCompanion,prepareSymbolicDraft,recordNeuralTurn,turnMode,neuralQuality};
  print("system","","capa neuronal web v1.3 cargada · follow-ups simbólicos protegidos + filtro de idioma + prompt mínimo");
})();