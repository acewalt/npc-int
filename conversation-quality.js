"use strict";

(function(){
  const QNorm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const INTERNAL_FOCUS=/^(paso del tiempo|tiempo|silencio|estado interno|inactividad|ciclo interno|paso de tiempo)$/;

  const clip=(s,n=120)=>{s=String(s||"").trim();return s.length<=n?s:s.slice(0,n-1).trim()+"…";};
  const isInternalFocus=value=>INTERNAL_FOCUS.test(QNorm(value));

  function ensure(b){
    if(b.conversationQuality)return b.conversationQuality;
    b.conversationQuality={version:4,turns:0,variation:0,lastIntent:null,lastRepair:null,lastReply:null,lastUserInput:null,firstUserInput:null,userHistory:[]};
    return b.conversationQuality;
  }

  function opinionTopic(n){
    const m=n.match(/^(?:y )?que (?:piensas|opinas|crees) (?:de|sobre) (.+)$/);
    return m?m[1].trim():null;
  }

  function classify(text){
    const n=QNorm(text),topic=opinionTopic(n);let mCreator;
    if(/^(?:que fue|cual fue) (?:lo )?ultimo que te pregunte$/.test(n) || /^(?:que|cual) fue mi ultima pregunta$/.test(n) || /^que te pregunte (?:antes|anteriormente)$/.test(n))return {intent:"ask_last_user_question",raw:text,canonical:n};
    if(/^(?:que fue|cual fue) (?:lo )?primero que te dije(?: cuando hable contigo)?$/.test(n) || /^(?:que|cual) fue (?:lo )?primero que te dije$/.test(n))return {intent:"ask_first_user_message",raw:text,canonical:n};
    if(/^(?:vale )?(?:como se llamaba|como se llama) mi (?:perro|perra|gato|gata|mascota)(?: que tuve)?$/.test(n))return {intent:"ask_pet_name",raw:text,canonical:n};
    if(/^(?:vale )?(?:cuando se murio|cuando murio|cuando fallecio) mi (?:perro|perra|gato|gata|mascota)(?: que tuve)?$/.test(n))return {intent:"ask_pet_death_time",raw:text,canonical:n};
    if(/^(?:vale )?(?:que|cual) mision (?:te gustaria|quisieras|quieres) crear$/.test(n) || /^(?:vale )?que mision se te ocurre(?: crear)?$/.test(n))return {intent:"ask_mission_idea",raw:text,canonical:n};
    if((mCreator=n.match(/^te cree con (?:la )?finalidad de (.+)$/)))return {intent:"creator_purpose_statement",purpose:mCreator[1],raw:text,canonical:n};
    if(/\bno te pregunte eso\b/.test(n)&&/\bmira lo que te dije\b/.test(n))return {intent:"repair_wrong_answer",raw:text,canonical:n};
    if(/^(?:alguna vez )?(?:cambiaste|has cambiado) de opinion(?: sobre algo)?$/.test(n) || /^alguna vez has cambiado de parecer(?: sobre algo)?$/.test(n))return {intent:"ask_changed_mind",raw:text,canonical:n};
    if(/^(?:eso )?te (?:pregunte|habia preguntado)$/.test(n) || /^(?:eso )?era lo que te (?:pregunte|habia preguntado)$/.test(n) || /^te pregunte que cuando paso$/.test(n) || /^eso era lo que te pregunte que cuando paso$/.test(n))return {intent:"repair_repeat_question",raw:text,canonical:n};
    if(/^(?:pero )?(?:ya )?no te estoy hablando de eso$/.test(n) || /^(?:pero )?mira lo que te dije$/.test(n) || /^mira lo que te dije$/.test(n))return {intent:"repair_topic_drift",raw:text,canonical:n};
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

  function frameFor(b,text){
    const central=window.NpcIntIntentRouter?.currentFor?.(b,text);
    if(central&&window.NpcIntIntentRouter?.authoritative?.(central)){
      const routed=central.routes?.quality||null;
      return {
        intent:routed,raw:text,canonical:QNorm(text),
        centralIntent:central.intent,source:"intent-router",
        ...(central.slots||{})
      };
    }
    return classify(text);
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

  function isQuestionLike(text){
    const raw=String(text||"").trim(),n=QNorm(raw);
    return /[?¿]/.test(raw)||/^(que|como|cuando|donde|por que|porque|cual|cuales|quien|quienes|cuanto|cuanta|cuantos|cuantas)\b/.test(n);
  }

  function lastUserQuestion(ctx={},b=null){
    const history=Array.isArray(ctx.userHistory)?ctx.userHistory:[];
    for(let i=history.length-1;i>=0;i--){
      const item=String(history[i]||"").trim();
      if(item&&isQuestionLike(item)&&frameFor(b,item).intent!=="ask_last_user_question")return item;
    }
    const prior=String(ctx.priorUser||"").trim();
    return isQuestionLike(prior)?prior:null;
  }

  function previousSubstantiveUser(ctx={},b=null){
    const history=Array.isArray(ctx.userHistory)?ctx.userHistory:[];
    for(let i=history.length-1;i>=0;i--){
      const item=String(history[i]||"").trim();
      if(!item)continue;
      const intent=frameFor(b,item).intent||"";
      if(intent.startsWith("repair_"))continue;
      return item;
    }
    const prior=String(ctx.priorUser||"").trim();
    return prior&&!String(frameFor(b,prior).intent||"").startsWith("repair_")?prior:null;
  }

  function petAnswer(b,kind){
    const pet=window.NpcIntSocialMemory?.latestPet?.(b);
    if(!pet)return kind==="name"
      ?"No tengo registrado el nombre de una mascota tuya."
      :"No tengo registrado cuándo ocurrió eso con una mascota tuya.";
    const data=pet.data||{};
    const name=data.name||(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ-]+$/.test(String(pet.value||""))?pet.value:null);
    if(kind==="name"){
      return name?`El ${data.species||"animal"} del que me hablaste se llamaba ${name}.`:"Recuerdo que me hablaste de una mascota, pero no tengo su nombre registrado.";
    }
    const when=data.when;
    if(when?.type==="user_age"&&Number.isFinite(Number(when.age)))return `Me dijiste que ${name?name+" ":""}murió cuando tenías ${Number(when.age)} años.`;
    if(when?.type==="relative"&&when.value)return `Me dijiste que ${name?name+" ":""}murió ${when.value}.`;
    return `Recuerdo que ${name?name:"tu mascota"} murió, pero no tengo registrado con precisión cuándo ocurrió.`;
  }

  function firstUserAnswer(b,ctx={}){
    const first=ctx.firstUser||ensure(b).firstUserInput||null;
    return first?`Lo primero que me dijiste en esta sesión fue: «${clip(first,145)}».`:"No tengo disponible el primer mensaje de esta sesión.";
  }

  function missionIdeaAnswer(){
    return "Crearía una misión llamada «La sala que cambia de reglas»: el jugador entra en un escenario con tres rutas y una regla oculta. Cada decisión modifica una parte del entorno, y yo actuaría como director de la misión: observaría lo que intenta hacer, introduciría consecuencias y adaptaría el siguiente reto sin cambiar las reglas arbitrariamente.";
  }

  function creatorPurposeAnswer(b,frame){
    if(!b.selfModel)b.selfModel={};
    b.selfModel.creatorIntent=frame.purpose;
    return `Entiendo. Me estás diciendo que me creaste con la finalidad de «${frame.purpose}». Lo tomo como una intención de diseño sobre mí, no como una preferencia tuya ni como algo que deba reinterpretar.`;
  }

  function changedMindAnswer(b){
    const revisions=(b.mem||[]).filter(m=>/corrig|cambie|cambió|revis|actualic|hipotesis|hipótesis/i.test(String(m.text||""))).slice(-3);
    if(revisions.length){
      return `Sí. Tengo ${revisions.length===1?"un registro":"registros"} donde una conclusión fue revisada al aparecer información nueva. Para mí cambiar de opinión significa actualizar una hipótesis o decisión cuando la evidencia anterior deja de sostenerla; no fingir que siempre pensé lo mismo.`;
    }
    return "Puedo cambiar de opinión cuando aparece evidencia nueva, pero ahora mismo no tengo un cambio concreto de opinión registrado en mi memoria que pueda citarte como experiencia real. Prefiero decir eso antes que inventarme una historia.";
  }

  function answerKnown(b,frame,ctx={}){
    switch(frame.intent){
      case "ask_last_user_question":{
        const previous=lastUserQuestion(ctx,b);
        return previous?`La última pregunta que me hiciste fue: «${clip(previous,140)}».`:"No encuentro una pregunta anterior tuya en el historial de esta sesión.";
      }
      case "ask_first_user_message":return firstUserAnswer(b,ctx);
      case "ask_pet_name":return petAnswer(b,"name");
      case "ask_pet_death_time":return petAnswer(b,"time");
      case "ask_mission_idea":return missionIdeaAnswer();
      case "creator_purpose_statement":return creatorPurposeAnswer(b,frame);
      case "ask_changed_mind":return changedMindAnswer(b);
      case "repair_repeat_question":{
        const previous=previousSubstantiveUser(ctx,b);
        if(!previous)return "Sí, entendí que estabas corrigiendo mi respuesta anterior, pero no encuentro una pregunta previa suficientemente clara para reconstruirla.";
        const pf=frameFor(b,previous);
        const corrected=answerKnown(b,pf,ctx);
        return corrected?`Sí. Eso fue lo que me preguntaste. Respondiéndolo ahora: ${corrected}`:`Sí. Eso fue lo que me preguntaste: «${clip(previous,120)}». Mi respuesta anterior no lo contestó.`;
      }
      case "repair_topic_drift":return "Tienes razón: ya cambiaste de tema. Cierro el asunto anterior y no lo vuelvo a arrastrar a menos que tú lo retomes.";
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
    const previous=previousSubstantiveUser(ctx,b) || String(ctx.priorUser||"").trim();
    if(previous){
      const previousFrame=frameFor(b,previous);
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
    const quality=ensure(this),raw=String(text||"").trim(),frame=frameFor(this,raw);
    const priorLiteral=quality.lastUserInput || this.dialogue?.lastUser || this.companionState?.lastUserText || this.discourse?.currentUser || "";
    const priorHistory=Array.isArray(quality.userHistory)?quality.userHistory.slice(-12):[];
    const ctx={
      priorUser:priorLiteral,
      firstUser:quality.firstUserInput,
      userHistory:priorHistory,
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
      quality.lastUserInput=raw;
      if(!quality.firstUserInput)quality.firstUserInput=raw;
      quality.userHistory.push(raw);
      if(quality.userHistory.length>24)quality.userHistory.splice(0,quality.userHistory.length-24);
      quality.lastReply=finalText||null;
      if(frame.intent&&Array.isArray(this.lastThoughts))this.lastThoughts.push(`CALIDAD CONVERSACIONAL: intención=${frame.intent}; reparación=${frame.intent.startsWith("repair_")?"sí":"no"}`);
      if(frame.intent?.startsWith("repair_"))quality.lastRepair={input:raw,previousUser:ctx.priorUser,previousNpc:ctx.priorNpc,time:this.time||0};
      return finalText?originalSay.call(this,finalText):null;
    };

    if(lower&&typeof lower.then==="function")return lower.then(finish,err=>{this.say=originalSay;throw err;});
    return finish(lower);
  };

  window.NpcIntConversationQuality={
    classify,frameFor,refine,isInternalFocus,lastUserQuestion,previousSubstantiveUser,changedMindAnswer,petAnswer,firstUserAnswer,missionIdeaAnswer,
    config:{knowledgeMatching:"native:knowledge.js"}
  };

  ensure(brain);
  print("system","","calidad conversacional v1.5 cargada · consume intención central + memoria autobiográfica + reparaciones");
})();
