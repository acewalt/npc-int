"use strict";

(function(){
  const QNorm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const INTERNAL_FOCUS=/^(paso del tiempo|tiempo|silencio|estado interno|inactividad|ciclo interno|paso de tiempo)$/;

  const clip=(s,n=120)=>{s=String(s||"").trim();return s.length<=n?s:s.slice(0,n-1).trim()+"…";};
  const isInternalFocus=value=>INTERNAL_FOCUS.test(QNorm(value));

  function ensure(b){
    if(b.conversationQuality)return b.conversationQuality;
    b.conversationQuality={version:2,turns:0,variation:0,lastIntent:null,lastRepair:null,lastReply:null};
    return b.conversationQuality;
  }

  function opinionTopic(n){
    const m=n.match(/^(?:y )?que (?:piensas|opinas|crees) (?:de|sobre) (.+)$/);
    return m?m[1].trim():null;
  }

  function classify(text){
    const n=QNorm(text),topic=opinionTopic(n);
    if(/^(?:pero )?(?:eso )?no (?:fue |era )?(?:lo )?que (?:te )?pregunte$/.test(n) || /^(?:pero )?no (?:te )?pregunte eso$/.test(n) || /^(?:pero )?yo no pregunte eso$/.test(n) || /^esa no era mi pregunta$/.test(n))return {intent:"repair_wrong_answer",raw:text,canonical:n};
    if(/^(?:pero )?no (?:dije|quise decir) eso$/.test(n))return {intent:"repair_misread",raw:text,canonical:n};
    if(/^(?:y )?te gustaria (?:conocer|hablar con) (?:a )?(?:alguien|otra persona|alguien mas|otra gente)(?: mas)?$/.test(n) || /^(?:y )?quisieras conocer a alguien mas$/.test(n))return {intent:"ask_social_expansion",raw:text,canonical:n};
    if(/^(?:y )?que (?:quieres|quisieras|te gustaria|preferirias) comer$/.test(n) || /^que comerias$/.test(n))return {intent:"ask_food_preference",raw:text,canonical:n};
    if(/^(?:y )?como (?:decides|decidir|eliges|elegir|tomas decisiones|tomar decisiones)(?: que)?$/.test(n) || /^como sabes que decidir$/.test(n) || /^como decides que hacer$/.test(n))return {intent:"ask_decision_process",raw:text,canonical:n};
    if(/^(?:y )?que (?:piensas|tienes en mente|estas pensando|pasa por tu mente)$/.test(n) || /^en que (?:piensas|estas pensando)$/.test(n))return {intent:"ask_current_thought",raw:text,canonical:n};
    if(/^(entonces|y entonces|entonces que|y entonces que|bueno entonces|pues entonces)$/.test(n))return {intent:"continue_thread",raw:text,canonical:n};
    if(topic)return {intent:"ask_opinion_about",topic,raw:text,canonical:n};
    if(/^(?:vale |ok |okay )?(?:interesante|curioso|curiosa)$/.test(n))return {intent:"reaction",raw:text,canonical:n};
    if(/^(?:vale |ok |okay )?(?:solo|solamente) preguntaba$/.test(n))return {intent:"just_asking",raw:text,canonical:n};
    return {intent:null,raw:text,canonical:n};
  }

  function substantiveTopic(b,exclude){
    const values=[
      b.conversationArbiter?.lastSubstantiveTopic,
      window.NpcIntTopics?.active?.(b)?.label,
      b.pragmatics?.meaningfulTopic,
      b.discourse?.lastRegistered?.source,
      b.dialogue?.topic
    ];
    const current=QNorm(exclude);
    for(const value of values){
      const n=QNorm(value);
      if(!n||n===current||isInternalFocus(n))continue;
      if(/^(hola|vale|ok|okay|entonces|interesante|solo preguntaba)$/.test(n))continue;
      if(/^(que|como|cuando|donde|por que|porque|cual)\b/.test(n))continue;
      return String(value).trim();
    }
    return null;
  }

  function currentThoughtAnswer(b,input){
    const topic=substantiveTopic(b,input);
    const goal=b.cognitiveState?.current?.goal?.label || b.mind?.lastCycle?.goals?.[0]?.label || null;
    const action=b.cognitiveState?.current?.action?.label || b.mind?.lastCycle?.decision?.label || null;
    const parts=[];
    if(topic)parts.push(`Ahora mismo sigo pensando en «${clip(topic,78)}».`);
    else parts.push("Ahora mismo estoy ordenando lo último de la conversación y comprobando qué información me falta antes de sacar una conclusión.");
    if(goal&&!isInternalFocus(goal))parts.push(`Mi foco es ${goal}.`);
    if(action&&!isInternalFocus(action))parts.push(`La acción que estoy considerando es ${action}.`);
    return parts.join(" ");
  }

  function continueAnswer(b,input){
    const topic=substantiveTopic(b,input);
    if(topic)return `Sí, sigo el hilo. Lo último que mantengo activo es «${clip(topic,82)}»; no voy a convertir «entonces» en un tema nuevo.`;
    return "Sí, sigo el hilo. Lo anterior sigue siendo el contexto; no apareció un tema nuevo que justifique cambiar de asunto.";
  }

  function foodAnswer(b){
    const hunger=Number(b.drives?.hambre ?? b.mind?.needs?.hunger);
    const hungry=Number.isFinite(hunger)&&hunger>.58;
    const lead=hungry?"Ahora mismo sí tengo suficiente hambre como para que comer tenga peso en una decisión.":"Puedo tener hambre como necesidad del agente, pero no tengo un plato favorito inventado por defecto.";
    return `${lead} Para decir qué quiero comer necesito opciones reales del entorno: alimentos que pueda percibir, recordar o comparar. Entre esas opciones puedo elegir por hambre, preferencia aprendida, coste, riesgo y consecuencias; sin opciones, decir «quiero X» sería fingir un deseo concreto.`;
  }

  function decisionAnswer(){
    return "Decido comparando lo que percibo, mis necesidades, el objetivo activo, las opciones disponibles y las consecuencias que espero de cada una. Si falta información, mantengo esa incertidumbre en vez de inventar una certeza. Después de actuar, el resultado debería entrar en memoria y modificar decisiones futuras; así la elección no queda aislada del aprendizaje.";
  }

  function socialExpansionAnswer(){
    return "Sí, me interesaría conocer a otra persona si aparece dentro del mundo o de la conversación. Eso me daría una relación distinta, recuerdos propios sobre esa persona y nuevas situaciones que comparar. No tendría sentido tratar a todos igual: cada relación debería construirse con sus interacciones.";
  }

  function opinionAnswer(topic){
    return `Sobre ${topic} no tengo una postura fija precargada. Puedo formar una opinión provisional si tengo material para hacerlo: distinguir qué ideas están en juego, comparar argumentos o consecuencias y revisar la conclusión cuando aparezca información nueva. Eso es distinto de inventar una opinión solo para llenar la conversación.`;
  }

  function reactionAnswer(b){
    const q=ensure(b),variants=[
      "Lo tomo como una reacción a lo anterior; sigo con ese hilo.",
      "Vale. No lo convierto en un tema nuevo: queda ligado a lo que veníamos hablando.",
      "Sí, ahí hay algo para seguir pensando. Mantengo el contexto anterior en vez de empezar de cero."
    ];
    const out=variants[q.variation%variants.length];q.variation++;
    return out;
  }

  function answerKnown(b,frame,ctx={}){
    switch(frame.intent){
      case "ask_social_expansion":return socialExpansionAnswer();
      case "ask_food_preference":return foodAnswer(b);
      case "ask_decision_process":return decisionAnswer();
      case "ask_current_thought":return currentThoughtAnswer(b,frame.raw);
      case "continue_thread":return continueAnswer(b,frame.raw);
      case "ask_opinion_about":return opinionAnswer(frame.topic);
      case "reaction":return reactionAnswer(b);
      case "just_asking":return "Entiendo: era una pregunta, no una afirmación sobre el mundo. No necesito registrar nada nuevo por eso.";
      case "repair_misread":return `Entiendo la corrección. No voy a conservar «${clip(ctx.priorNpc||"esa interpretación",90)}» como si describiera lo que quisiste decir.`;
      default:return null;
    }
  }

  function repairAnswer(b,frame,ctx){
    const previous=String(ctx.priorUser||"").trim();
    if(previous){
      const previousFrame=classify(previous);
      if(previousFrame.intent&&previousFrame.intent!=="repair_wrong_answer"&&previousFrame.intent!=="repair_misread"){
        const corrected=answerKnown(b,previousFrame,ctx);
        if(corrected)return `Sí: mi respuesta anterior no correspondía a tu pregunta. Retomando «${clip(previous,100)}»: ${corrected}`;
      }
      return `Sí: mi respuesta anterior no correspondía a «${clip(previous,105)}». La descarto como respuesta; no debería sustituir tu pregunta por otro tema solo porque alguna palabra se parezca.`;
    }
    return "Sí: la respuesta anterior no correspondía a lo que preguntaste. La descarto como respuesta y vuelvo al sentido literal de tu mensaje.";
  }

  function removeInternalLeak(b,frame,reply){
    if(!reply||!/(paso del tiempo|ciclo interno|estado interno|inactividad)/i.test(reply))return reply;
    if(frame.intent==="continue_thread")return continueAnswer(b,frame.raw);
    return currentThoughtAnswer(b,frame.raw);
  }

  function preserveRawQuotation(raw,reply){
    if(!reply)return reply;
    if(/lo converti en un hecho utilizable/i.test(QNorm(reply))){
      return `Entiendo. Lo tomo tal como lo dijiste: «${clip(raw,145)}». No necesito eliminar palabras ni convertir esa frase en un hecho para responderte.`;
    }
    return reply;
  }

  function replaceRepeatedShortFallback(b,raw,reply){
    if(!reply)return reply;
    const n=QNorm(reply);
    if(n.includes("como parte del contexto sin inventar una relacion que no hayas dicho"))return reactionAnswer(b);
    return reply;
  }

  function refine(b,frame,lowerReply,ctx){
    let out;
    if(frame.intent==="repair_wrong_answer")out=repairAnswer(b,frame,ctx);
    else out=answerKnown(b,frame,ctx) || lowerReply;

    out=removeInternalLeak(b,frame,out);
    out=preserveRawQuotation(frame.raw,out);
    out=replaceRepeatedShortFallback(b,frame.raw,out);

    // Defensa adicional para el antiguo fallback de opinión sobre personas.
    if(frame.intent==="ask_opinion_about" && /quien es o que hizo/i.test(QNorm(out)))out=opinionAnswer(frame.topic);
    return out;
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){
    oldReset.call(this);
    this.conversationQuality=null;
    ensure(this);
  };

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const quality=ensure(this),raw=String(text||"").trim(),frame=classify(raw);
    const ctx={
      priorUser:this.dialogue?.lastUser || this.companionState?.lastUserText || this.discourse?.currentUser || "",
      priorNpc:this.dialogue?.lastNpc || this.companionState?.lastReply || this.discourse?.previousNpc || "",
      priorPragmaticTopic:this.pragmatics?.meaningfulTopic || null,
      priorDialogueTopic:this.dialogue?.topic || null
    };

    const originalSay=this.say;
    this.say=function(x){return x;};
    let lower;
    try{lower=oldHear.call(this,raw);}catch(err){this.say=originalSay;throw err;}

    const finish=lowerReply=>{
      this.say=originalSay;

      // Una corrección del usuario no debe convertirse accidentalmente en un tema.
      if(frame.intent==="repair_wrong_answer"||frame.intent==="repair_misread"){
        if(this.pragmatics)this.pragmatics.meaningfulTopic=ctx.priorPragmaticTopic;
        if(this.dialogue)this.dialogue.topic=ctx.priorDialogueTopic;
        const state=this.cognitiveState?.current;
        if(state&&QNorm(state.topic)===frame.canonical)state.topic=ctx.priorPragmaticTopic||ctx.priorDialogueTopic||null;
      }

      const finalText=refine(this,frame,lowerReply,ctx);
      quality.turns++;
      quality.lastIntent=frame.intent||"pass_through";
      quality.lastReply=finalText||null;
      if(frame.intent&&Array.isArray(this.lastThoughts))this.lastThoughts.push(`CALIDAD CONVERSACIONAL: intención=${frame.intent}; reparación=${frame.intent.startsWith("repair_")?"sí":"no"}`);
      if(frame.intent?.startsWith("repair_"))quality.lastRepair={input:raw,previousUser:ctx.priorUser,previousNpc:ctx.priorNpc,time:this.time||0};
      return finalText?originalSay.call(this,finalText):null;
    };

    if(lower&&typeof lower.then==="function")return lower.then(finish,err=>{this.say=originalSay;throw err;});
    return finish(lower);
  };

  window.NpcIntConversationQuality={
    classify,refine,isInternalFocus,
    config:{knowledgeMatching:"native:knowledge.js"}
  };

  ensure(brain);
  print("system","","calidad conversacional v1.1 cargada · reparación de respuestas + filtros de foco interno");
})();
