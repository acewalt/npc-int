"use strict";

(function(){
  const ANorm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const clip=(s,n=110)=>{s=String(s||"").trim();return s.length<=n?s:s.slice(0,n-1)+"…";};

  function ensure(b){
    if(b.conversationArbiter)return b.conversationArbiter;
    b.conversationArbiter={
      lastIntent:null,lastInput:null,lastReply:null,lastContextItem:null,
      lastSubstantiveTopic:null,destination:null,turns:0,
      lastUserWallMs:0,lastAutoNorm:null,lastAutoWallMs:0
    };
    return b.conversationArbiter;
  }

  function extractOpinionTopic(n){
    const m=n.match(/^(?:y )?que (?:piensas|opinas|crees) (?:de|sobre) (.+)$/);
    if(!m)return null;
    const topic=m[1].trim();
    return /^(esto|eso|ello|lo anterior)$/.test(topic)?null:topic;
  }

  function extractCreationTarget(n){
    const m=n.match(/^como (?:quisieras|quieres|querrias|crearias|harias) (?:crear |hacer )?(?:un |una |el |la )?(.+)$/);
    return m?m[1].trim():null;
  }

  function extractDestination(n){
    let m=n.match(/^(?:quiero |podemos |vamos a )?llevar(?:nos|me|te)? a (.+)$/);
    if(!m)m=n.match(/^llev(?:a|ame|anos|eme) a (.+)$/);
    return m?m[1].trim():null;
  }

  function classify(text,b=null){
    const n=ANorm(text);
    const central=b?window.NpcIntIntentRouter?.currentFor?.(b,text):null;
    if(central&&window.NpcIntIntentRouter?.authoritative?.(central)){
      const routed=central.routes?.arbiter||null;
      return {raw:text,canonical:n,intent:routed,centralIntent:central.intent,source:"intent-router",...(central.slots||{})};
    }
    const opinionTopic=extractOpinionTopic(n);
    const creationTarget=extractCreationTarget(n);
    const destination=extractDestination(n);
    let intent=null,data={};

    if(/^(?:yo )?(?:estoy )?(?:muy )?bien(?: todo bien)? y tu$/.test(n) || /^(?:todo )?bien y tu$/.test(n) || /^(y tu|como estas|como te sientes|que tal estas)$/.test(n)){
      intent="ask_self_state";
    }
    else if(/^(?:entonces )?(?:que )?(?:me )?puedes (?:decir|contar) (?:tu|de ti)$/.test(n) || /^(hablame de ti|cuentame de ti)$/.test(n)){
      intent="ask_self_summary";
    }
    else if(/\bque (?:puedes|podrias|sabes) hacer(?: ahora)?\b/.test(n) || /^(?:de )?que eres capaz(?: ahora)?$/.test(n)){
      intent="ask_capabilities";
    }
    else if(/^(dime|cuentame) todo lo que sabes$/.test(n) || /^(que sabes|que sabes tu)$/.test(n)){
      intent="ask_knowledge_summary";
    }
    else if(/\bque (?:quieres|quisieras|querrias|preferirias) hacer(?: ahora| hoy)?\b/.test(n) || /\bque te gustaria hacer(?: ahora| hoy)?\b/.test(n)){
      intent="ask_desired_action";
    }
    else if(/^(?:y )?que (?:quieres|quisieras|querrias|preferirias) crear(?: ahora)?$/.test(n)){
      intent="ask_creation_preference";
    }
    else if(creationTarget){
      intent="ask_creation_method";data.target=creationTarget;
    }
    else if(/^(?:a )?donde (?:nos )?(?:quieres|quisieras|querrias) llevar(?:nos)?(?: ahora)?$/.test(n)){
      intent="ask_destination";
    }
    else if(destination){
      intent="destination_proposal";data.destination=destination;
    }
    else if(/^(contexto de que|que contexto|de que contexto|contexto sobre que|a que contexto te refieres)$/.test(n)){
      intent="ask_context_reference";
    }
    else if(/^(no|nop|nope|para nada|negativo)$/.test(n)){
      intent="deny";
    }
    else if(opinionTopic){
      intent="ask_opinion_about";data.topic=opinionTopic;
    }
    return {raw:text,canonical:n,intent,...data};
  }

  function classifyMany(text,b=null){
    const raw=String(text||"").trim();
    const central=b?window.NpcIntIntentRouter?.currentFor?.(b,raw):null;
    if(central&&window.NpcIntIntentRouter?.authoritative?.(central)){
      const routed=central.routes?.arbiter||null;
      return routed?[{raw,canonical:ANorm(raw),intent:routed,centralIntent:central.intent,source:"intent-router",...(central.slots||{})}]:[];
    }
    const clauses=raw.split(/[?¿]+/).map(x=>x.trim()).filter(Boolean);
    if(clauses.length<=1){
      const one=classify(raw,b);
      return one.intent?[one]:[];
    }
    const out=[];
    for(const c of clauses){
      const f=classify(c,b);
      if(f.intent)out.push(f);
    }
    if(!out.length){
      const one=classify(raw,b);
      if(one.intent)out.push(one);
    }
    return out;
  }

  function substantiveTopic(b){
    const a=ensure(b);
    if(a.lastSubstantiveTopic)return a.lastSubstantiveTopic;
    const candidates=[b.pragmatics?.meaningfulTopic,b.discourse?.lastRegistered?.source,b.dialogue?.topic].filter(Boolean);
    for(const x of candidates){
      const n=ANorm(x);
      if(!n || /^(paso del tiempo|hola|vale|ok|no|si)$/.test(n))continue;
      if(/^(que|como|donde|cuando|por que|porque|yo bien|bien y tu|y tu|contexto de que)\b/.test(n))continue;
      return x;
    }
    return null;
  }

  function capture(b){
    const a=ensure(b);
    const idea=b.ideaEngine||null,hyp=b.hypothesisEngine||null,graph=b.conceptGraph||null;
    const plan=b.responsePlanner?.lastPlan||null;
    const previousNpc=b.dialogue?.lastNpc || b.discourse?.previousNpc || a.lastReply || "";
    const cognitive=b.cognitiveState||null;
    const previousTopic=substantiveTopic(b);
    return {
      previousNpc,previousPlan:plan,previousTopic,
      pragmaticsTopic:b.pragmatics?.meaningfulTopic||null,
      dialogueTopic:b.dialogue?.topic||null,
      discourseFocusLength:Array.isArray(b.discourse?.focus)?b.discourse.focus.length:null,
      discourseLastRegistered:b.discourse?.lastRegistered||null,
      discourseLastCommitment:b.discourse?.lastCommitment||null,
      cognitiveCurrent:cognitive?.current||null,
      ideaCurrent:idea?.current||null,ideaHistoryLength:idea?.history?.length,
      hypothesisCurrent:hyp?.current||null,hypothesisHistoryLength:hyp?.history?.length,
      conceptCurrent:graph?.current||null,conceptHistoryLength:graph?.history?.length
    };
  }

  function restoreReasoningState(b,pre,frame){
    if(b.pragmatics)b.pragmatics.meaningfulTopic=pre.pragmaticsTopic;
    if(b.dialogue)b.dialogue.topic=pre.dialogueTopic;
    if(b.discourse){
      if(Array.isArray(b.discourse.focus)&&Number.isInteger(pre.discourseFocusLength))b.discourse.focus.length=Math.min(b.discourse.focus.length,pre.discourseFocusLength);
      b.discourse.lastRegistered=pre.discourseLastRegistered;
      b.discourse.lastCommitment=pre.discourseLastCommitment;
    }

    const s=b.cognitiveState?.current;
    if(s){
      s.intent=frame.intent;
      const current=ANorm(frame.raw);
      if(!pre.previousTopic || ANorm(s.topic)===current || ANorm(s.topic)==="paso del tiempo")s.topic=pre.previousTopic||null;
      s.unresolved=(s.unresolved||[]).filter(x=>!ANorm(x).includes(current));
      if(Array.isArray(s.workingMemory)){
        s.workingMemory=s.workingMemory.filter(x=>!(x.kind==="topic"&&ANorm(x.text)===current) && !(x.kind==="unknown"&&ANorm(x.text).includes(current)));
        if(pre.previousTopic&&!s.workingMemory.some(x=>x.kind==="topic"&&ANorm(x.text)===ANorm(pre.previousTopic)))s.workingMemory.push({kind:"topic",text:pre.previousTopic,weight:.82});
      }
      b.cognitiveState.workingMemory=s.workingMemory||[];
      b.cognitiveState.unresolved=s.unresolved||[];
    }

    const idea=b.ideaEngine;
    if(idea){
      idea.current=pre.ideaCurrent;
      if(Array.isArray(idea.history)&&Number.isInteger(pre.ideaHistoryLength))idea.history.length=Math.min(idea.history.length,pre.ideaHistoryLength);
    }
    const hyp=b.hypothesisEngine;
    if(hyp){
      hyp.current=pre.hypothesisCurrent;
      if(Array.isArray(hyp.history)&&Number.isInteger(pre.hypothesisHistoryLength))hyp.history.length=Math.min(hyp.history.length,pre.hypothesisHistoryLength);
    }
    const graph=b.conceptGraph;
    if(graph){
      graph.current=pre.conceptCurrent;
      if(Array.isArray(graph.history)&&Number.isInteger(pre.conceptHistoryLength))graph.history.length=Math.min(graph.history.length,pre.conceptHistoryLength);
    }
  }

  function goalLabel(b){return b.mind?.lastCycle?.goals?.[0]?.label || b.cognitiveState?.current?.goal?.label || null;}
  function decision(b){return b.mind?.lastCycle?.decision || b.cognitiveState?.current?.action || null;}

  function stateAnswer(b){
    const mood=typeof b.moodLabel==="function"?ANorm(b.moodLabel()):"neutral";
    const fear=b.mind?.affect?.fear,energy=b.mind?.needs?.energy,curiosity=b.mind?.cognition?.curiosity;
    let lead="Estoy tranquilo y atento.";
    if((typeof fear==="number"&&fear>.62)||/alert|miedo|tenso/.test(mood))lead="Estoy alerta; mi estado interno marca bastante tensión.";
    else if((typeof energy==="number"&&energy<.3)||/cans|fatig/.test(mood))lead="Estoy con poca energía, pero sigo atento a la conversación.";
    else if((typeof curiosity==="number"&&curiosity>.62)||/curios/.test(mood))lead="Estoy tranquilo y con bastante curiosidad activa.";
    const g=goalLabel(b);
    return lead+(g?` Ahora mismo mi foco es ${g}.`:" Estoy siguiendo lo que me dices y actualizando mi estado con ello.");
  }

  function capabilitiesAnswer(b){
    const parts=["Ahora mismo puedo conversar contigo y mantener el hilo entre turnos"];
    if(b.mem)parts.push("recordar eventos y contexto de esta sesión");
    if(b.cognition)parts.push("usar hechos y relaciones para razonar");
    if(b.ideaEngine||b.hypothesisEngine)parts.push("comparar hipótesis y proponer cómo comprobarlas");
    if(b.mind)parts.push("evaluar objetivos, riesgo y opciones antes de elegir una acción simbólica");
    return parts.join(", ")+". En esta Page no puedo mover un cuerpo ni ejecutar acciones físicas por mi cuenta; esas acciones necesitan estar conectadas al mundo de Unity.";
  }

  function knowledgeSummary(b){
    const parts=["Sé quién soy dentro de esta simulación y puedo conservar lo que ocurre en la sesión"];
    if(b.cognition)parts.push("tengo hechos y relaciones que puedo consultar e inferir");
    if(globalThis.npcKnowledge)parts.push("también tengo conocimiento semántico local y una vía de consulta enciclopédica para preguntas factuales");
    if(b.ideaEngine)parts.push("puedo separar observaciones de hipótesis para no tratar una suposición como un hecho");
    return parts.join("; ")+". Eso no significa que lo sepa todo: cuando no tengo evidencia suficiente debo decirlo en vez de completar el hueco con una historia.";
  }

  function selfSummary(b){
    const name=b.identity?.name||"NIA-01";
    const purpose=b.identity?.purpose||"comprender el entorno y actuar según lo que puedo justificar";
    return `Soy ${name}. Mi propósito es ${purpose}. ${stateAnswer(b)} ${capabilitiesAnswer(b)}`;
  }

  function desiredActionAnswer(b,frame={}){
    const d=decision(b),g=goalLabel(b),topic=substantiveTopic(b);
    const when=ANorm(frame.when||"ahora");
    if(when==="manana"){
      if(topic)return `Mañana me gustaría retomar «${clip(topic,70)}» y hacer algo que produzca una consecuencia observable: probar una opción, ver qué cambia y usar ese resultado para decidir lo siguiente.`;
      return "Mañana me gustaría explorar una situación nueva con un objetivo concreto y consecuencias que pueda observar. No puedo saber ahora qué evento existirá mañana, así que lo tomo como una intención, no como una acción ya decidida.";
    }
    if(when==="esta tarde"||when==="esta noche"||when==="hoy"){
      const label=when==="hoy"?"hoy":when;
      if(topic)return `${label.charAt(0).toUpperCase()+label.slice(1)} me gustaría seguir con «${clip(topic,70)}» y probar una decisión concreta en vez de quedarme solo hablando de posibilidades.`;
    }
    const usable=new Set(["observe","investigate","explore","rest","eat","seek_food","move_away","defend","attack","set_boundary"]);
    if(d&&usable.has(d.id))return `Ahora mismo preferiría ${d.label}${topic?` respecto a «${clip(topic,70)}»`:""}. Esa opción encaja con mi objetivo actual${g?` de ${g}`:""}, pero todavía puedo cambiarla si aparece información nueva.`;
    return `Ahora mismo preferiría tener una situación concreta que pueda observar y sobre la que pueda decidir${g?`; mi foco actual es ${g}`:""}. Sin un evento real del entorno no quiero fingir una acción física solo para tener algo que decir.`;
  }

  function creationPreference(b){
    const g=goalLabel(b);
    return `Si tuviera que crear algo ahora, elegiría un pequeño escenario que me permita poner a prueba lo que sé: un objetivo claro, reglas simples y consecuencias que pueda observar.${g?` Lo orientaría a ${g}.`:""}`;
  }

  function creationMethod(target){
    const t=target||"eso";
    if(/\bnivel\b/.test(ANorm(t)))return "Para crear un nivel empezaría por definir qué debe conseguir el jugador. Después pondría las reglas y obstáculos mínimos, una forma clara de recibir feedback y una versión pequeña que pueda probar. Con lo observado corregiría dificultad, recorrido y ritmo antes de añadir más cosas.";
    return `Para crear ${t}, primero definiría para qué debe servir. Luego haría una versión mínima con pocas reglas, la probaría con un criterio observable y corregiría lo que falle antes de aumentar la complejidad.`;
  }

  function destinationAnswer(b){
    const a=ensure(b);
    if(a.destination)return `Tomando tu propuesta anterior, el destino activo sería ${a.destination}. No lo elegí por mi cuenta: lo estoy conservando porque tú lo propusiste.`;
    return "No tengo un destino físico elegido ahora mismo. Si hablas del rumbo de esta interacción, quiero llevarla a una situación concreta donde pueda observar algo, razonar sobre ello y comprobar si mi decisión tuvo sentido.";
  }

  function contextReferenceAnswer(b,pre){
    const a=ensure(b);
    if(a.lastContextItem)return `Me refería a «${clip(a.lastContextItem,100)}». Lo conservé como contexto de la conversación, no como un hecho comprobado del mundo.`;
    const quoted=[...String(pre.previousNpc||"").matchAll(/[«“\"]([^»”\"]{2,120})[»”\"]/g)].map(m=>m[1]);
    if(quoted.length&&/contexto/i.test(pre.previousNpc||""))return `Me refería a «${clip(quoted[quoted.length-1],100)}». Si eso no era lo que querías decir, puedo descartarlo.`;
    if(/contexto/i.test(pre.previousNpc||""))return "Mi respuesta anterior fue demasiado vaga: dije que conservaría algo como contexto sin identificar con precisión qué era. No debería convertir esa vaguedad en una relación inventada.";
    const topic=pre.previousTopic;
    if(topic)return `El contexto sustantivo que tengo activo es «${clip(topic,100)}». Tu pregunta actual no la trato como un nuevo hecho del mundo.`;
    return "Ahora mismo no tengo un contexto sustantivo específico al que pueda señalar. Prefiero decir eso antes que inventar a qué me refería.";
  }

  function evidenceAbout(b,topic){
    const q=ANorm(topic),tokens=q.split(" ").filter(x=>x.length>2),hits=[],seen=new Set();
    const add=(text,kind)=>{text=String(text||"").trim();const n=ANorm(text);if(!text||seen.has(n)||!tokens.some(t=>n.includes(t)))return;seen.add(n);hits.push({text,kind});};
    for(const f of [...(b.cognition?.facts||[])].reverse())add(`${f.subject} ${f.predicate} ${f.object}`,"hecho");
    for(const m of [...(b.mem||[])].reverse()){
      if(["dialogue","npc-speech"].includes(m.type))continue;
      if(["fact","knowledge","learned","social","world"].includes(m.type))add(m.text,m.type);
      if(hits.length>=4)break;
    }
    try{const k=globalThis.npcKnowledge?.encyclopediaMatch?.(topic);if(k&&k.score>.72)add(`${k.entry.title}: ${k.entry.text}`,"conocimiento");}catch(_){ }
    return hits.slice(0,3);
  }

  function opinionAnswer(b,topic){
    const hits=evidenceAbout(b,topic);
    if(!hits.length)return `Sobre ${topic} no tengo hechos suficientes para formarme una opinión sin inventar. Si me dices quién es o qué hizo, puedo evaluar esa información y distinguir lo que sé de lo que solo estoy suponiendo.`;
    const evidence=hits.map(x=>clip(x.text,105)).join(" | ");
    return `Sobre ${topic}, lo que realmente tengo registrado es: ${evidence}. Con eso puedo razonar, pero no sacaría una conclusión más fuerte de la que permiten esos datos.`;
  }

  function respond(b,frame,pre){
    switch(frame.intent){
      case "ask_self_state":return stateAnswer(b);
      case "ask_self_summary":return selfSummary(b);
      case "ask_capabilities":return capabilitiesAnswer(b);
      case "ask_knowledge_summary":return knowledgeSummary(b);
      case "ask_desired_action":return desiredActionAnswer(b,frame);
      case "ask_creation_preference":return creationPreference(b);
      case "ask_creation_method":return creationMethod(frame.target);
      case "ask_destination":return destinationAnswer(b);
      case "destination_proposal":{
        const a=ensure(b);a.destination=frame.destination;a.lastContextItem=`destino propuesto: ${frame.destination}`;
        return `Entiendo: propones ${frame.destination} como destino. Lo conservaré como una propuesta tuya, no como una decisión que yo haya inventado.`;
      }
      case "ask_context_reference":return contextReferenceAnswer(b,pre);
      case "deny":return "Entendido. Descarto esa interpretación; no voy a tratar «no» como un hecho nuevo del mundo ni como una relación que hayas afirmado.";
      case "ask_opinion_about":return opinionAnswer(b,frame.topic);
      default:return null;
    }
  }

  function combineReplies(xs){
    const replies=xs.filter(Boolean);
    if(replies.length<=1)return replies[0]||null;
    return replies.map((x,i)=>i===0?x:`Además, ${x.charAt(0).toLowerCase()}${x.slice(1)}`).join(" ");
  }

  function note(b,frame,reply,pre){
    const a=ensure(b);
    a.lastIntent=frame.intent;a.lastInput=frame.raw;a.lastReply=reply||null;a.turns++;
    if(pre.previousTopic)a.lastSubstantiveTopic=pre.previousTopic;
    if(Array.isArray(b.lastThoughts))b.lastThoughts.push(`ÁRBITRO CONVERSACIONAL: intención=${frame.intent}; metaturno=sí; foco_mundo=${pre.previousTopic||"—"}`);
    if(b.responsePlanner?.lastPlan){
      b.responsePlanner.lastPlan.intent=frame.intent;
      b.responsePlanner.lastPlan.intentSource="conversation-arbiter";
      b.responsePlanner.lastPlan.act=frame.intent;
      b.responsePlanner.lastPlan.text=reply;
      b.responsePlanner.lastPlan.exposeMetrics=false;
    }
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){oldReset.call(this);this.conversationArbiter=null;ensure(this);};

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const a=ensure(this);a.lastUserWallMs=Date.now();
    const frames=classifyMany((text||"").trim(),this);
    if(!frames.length)return oldHear.call(this,text);
    const pre=capture(this);
    const aggregate=frames.length===1?frames[0]:{raw:text,canonical:ANorm(text),intent:"compound_request"};
    const originalSay=this.say;
    this.say=function(x){return x;};
    let lower;
    try{lower=oldHear.call(this,text);}catch(err){this.say=originalSay;throw err;}
    const finish=()=>{
      this.say=originalSay;
      restoreReasoningState(this,pre,aggregate);
      const reply=combineReplies(frames.map(f=>respond(this,f,pre)));
      note(this,aggregate,reply,pre);
      if(frames.length>1&&Array.isArray(this.lastThoughts))this.lastThoughts.push(`ACTOS COMPUESTOS: ${frames.map(f=>f.intent).join(" + ")}`);
      return reply?originalSay.call(this,reply):null;
    };
    return lower&&typeof lower.then==="function"?lower.then(finish,err=>{this.say=originalSay;throw err;}):finish();
  };

  const oldTick=NpcBrain.prototype.tick;
  NpcBrain.prototype.tick=function(minutes=1){
    const a=ensure(this),result=oldTick.call(this,minutes);
    const finish=out=>{
      if(!out)return null;
      const n=ANorm(out),urgent=/peligro|amenaza|ataque|auxilio|alerta/.test(n);
      if(!urgent&&Date.now()-(a.lastUserWallMs||0)<20000)return null;
      const generic=/tengo demasiadas preguntas|no quiero limitarme a esperar una orden|voy a intentar decidir que deberia observar|necesito aprender algo nuevo del entorno/.test(n);
      const hasWorld=(this.mem||[]).some(m=>m.type==="world") || !!(this.ideaEngine?.current?.focus&&ANorm(this.ideaEngine.current.focus)!=="paso del tiempo");
      if(!urgent&&generic&&!hasWorld)return null;
      if(!urgent&&a.lastAutoNorm===n&&Date.now()-a.lastAutoWallMs<60000)return null;
      a.lastAutoNorm=n;a.lastAutoWallMs=Date.now();
      return out;
    };
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  ensure(brain);
  window.NpcIntConversationArbiter={classify,classifyMany,stateAnswer,capabilitiesAnswer,knowledgeSummary,opinionAnswer};
  print("system","","árbitro conversacional v1.4 cargado · intención temporal + turnos compuestos + metaturnos");
})();
