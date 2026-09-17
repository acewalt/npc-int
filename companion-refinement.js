"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const clip=(s,n=78)=>{s=String(s||"").trim();return s.length<=n?s:s.slice(0,n-1).trim()+"…";};

  function detectAffect(text){
    const n=norm(text);
    const question=/[?¿]/.test(String(text||""))||/^(?:como|cuando|donde|que|cual|quien|por que|porque)\b/.test(n);
    if(!question&&(/\b(?:mi|el|la)\s+(?:perro|perra|gato|gata|mascota)\b[\s\S]*\b(?:murio|fallecio|se murio)\b/.test(n) || /\b(?:murio|fallecio)\b[\s\S]*\b(?:mi )?(?:perro|perra|gato|gata|mascota)\b/.test(n)))return {kind:"grief",confidence:.99};
    if(/\b(?:me siento|estoy|ando)\s+(?:muy )?(?:solo|sola|aislado|aislada)\b/.test(n))return {kind:"loneliness",confidence:.98};
    if(/\b(?:me siento|estoy|ando)\s+(?:muy )?(?:triste|decaido|decaida|mal)\b/.test(n))return {kind:"low_mood",confidence:.90};
    if(/\b(?:estoy|ando)\s+(?:muy )?(?:aburrido|aburrida)\b/.test(n))return {kind:"boredom",confidence:.96};
    if(/\b(?:estoy|me siento)\s+(?:muy )?(?:frustrado|frustrada|harto|harta)\b|\bme frustra\b/.test(n))return {kind:"frustration",confidence:.92};
    return null;
  }

  function classify(text){
    const n=norm(text),affect=detectAffect(text);
    if(affect?.kind==="grief")return {intent:"express_grief",affect,asksProposal:false};
    if(affect?.kind==="loneliness")return {intent:"express_loneliness",affect,asksProposal:/\b(?:que propones|que hacemos|que podria hacer|que hacemos ahora)\b/.test(n)};
    if(affect?.kind==="low_mood")return {intent:"express_low_mood",affect,asksProposal:/\b(?:que propones|que hago|que hacemos)\b/.test(n)};
    if(affect?.kind==="boredom")return {intent:"express_boredom",affect,asksProposal:true};
    if(affect?.kind==="frustration")return {intent:"express_frustration",affect,asksProposal:/\b(?:que propones|que hago|que hacemos)\b/.test(n)};
    if(/^(?:y )?(?:que te gustaria hacer|que quieres hacer|que te apetece hacer|que harias ahora|que preferirias hacer)$/.test(n))return {intent:"ask_companion_activity",affect:null,asksProposal:true};
    return {intent:null,affect:null,asksProposal:false};
  }

  function meaningfulThread(b){
    const pending=window.NpcIntPending?.best?.(b);
    if(pending&&pending.kind!=="question")return {kind:"pending",text:pending.text};
    const topic=window.NpcIntTopics?.active?.(b);
    if(topic&&window.NpcIntTopics?.isKeepable?.(topic.label)!==false)return {kind:"topic",text:topic.label};
    const profile=window.NpcIntSocialMemory?.profile?.(b);
    const project=profile?.projects?.[0]||profile?.goals?.[0];
    if(project)return {kind:"memory",text:project.value};
    return null;
  }

  function desiredActivityAnswer(b){
    const thread=meaningfulThread(b);
    if(thread)return `Me gustaría hacer algo que tenga continuidad contigo. Podemos retomar «${clip(thread.text)}» y avanzar una parte concreta, en vez de inventar una acción solo para parecer activa.`;
    return "Me gustaría investigar o construir algo contigo: una situación con pistas, un problema que podamos descomponer o una idea que podamos poner a prueba. Si tengo que escoger una, elegiría una situación donde lo que decidamos tenga consecuencias y podamos aprender de ellas.";
  }

  function griefAnswer(b){
    const pet=window.NpcIntSocialMemory?.latestPet?.(b);
    const data=pet?.data||{};
    const name=data.name||null;
    const when=data.when||null;
    if(when?.type==="user_age"&&Number.isFinite(Number(when.age))){
      return `Lo siento. Me dijiste que ${name?name+" ":"tu mascota "}murió cuando tenías ${Number(when.age)} años. Lo voy a recordar con ese contexto, sin tratarlo como algo que pasó recientemente.`;
    }
    if(when?.type==="relative"&&when.value==="ayer"){
      return `Lo siento. Me dijiste que ${name?name+" ":"tu mascota "}murió ayer. Es algo reciente; si quieres hablar de lo que pasó, te escucho, y si prefieres cambiar de tema, también está bien.`;
    }
    return `Lo siento. Me quedo con que ${name?name:"tu mascota"} murió. Si quieres contarme más sobre ${name?"él o ella":"tu mascota"}, te escucho; si prefieres cambiar de tema, también está bien.`;
  }

  function lonelinessAnswer(b,frame){
    const thread=meaningfulThread(b);
    if(frame.asksProposal&&thread)return `Podemos quedarnos hablando un rato. Te propongo no forzar el tema si no quieres: podemos retomar «${clip(thread.text)}» y hacer algo juntos, o puedes contarme qué te está haciendo sentir solo y seguimos desde ahí.`;
    if(frame.asksProposal)return "Podemos quedarnos hablando un rato. Te propongo algo sencillo: dime qué tienes más presente ahora mismo y tiramos de ahí; si prefieres distraerte, podemos inventar una situación, resolver algo o explorar un tema juntos.";
    return "Podemos quedarnos hablando un rato. Si quieres contarme qué te está haciendo sentir solo, te sigo desde ahí; y si no quieres entrar en eso, también podemos simplemente hacer algo juntos y cambiar de foco.";
  }

  function lowMoodAnswer(b,frame){
    if(frame.asksProposal)return "Podemos hacer la conversación más ligera o más concreta, como prefieras. Si quieres hablar de lo que te tiene así, te sigo; si prefieres cambiar de foco, te propongo que hagamos algo pequeño juntos y avancemos desde ahí.";
    return "Entiendo que ahora te sientes mal. Podemos hablar de eso sin convertirlo enseguida en una tarea; si prefieres, también podemos cambiar de tema y hacer algo más ligero.";
  }

  function boredomAnswer(b){
    const thread=meaningfulThread(b);
    if(thread)return `Entonces hagamos algo. Podemos retomar «${clip(thread.text)}» y ponerle una meta concreta para este rato, o cambiar de tema por completo.`;
    return "Entonces hagamos algo. Yo escogería una situación corta con una incógnita y varias opciones, y vamos viendo qué decisión tomaría y por qué. También podemos partir de cualquier tema que te interese.";
  }

  function frustrationAnswer(b,frame){
    if(frame.asksProposal)return "Podemos separar lo que te está frustrando en una sola cosa concreta y trabajar desde ahí. Si me dices qué parte está fallando o qué esperabas que ocurriera, intento ayudarte a encontrar opciones en vez de responderte con una frase genérica.";
    return "Te sigo. Si me dices qué parte concreta te está frustrando, puedo intentar razonar contigo sobre eso en vez de tratarlo como una afirmación más del contexto.";
  }

  function answer(b,frame){
    switch(frame.intent){
      case "express_grief":return griefAnswer(b);
      case "ask_companion_activity":return desiredActivityAnswer(b);
      case "express_loneliness":return lonelinessAnswer(b,frame);
      case "express_low_mood":return lowMoodAnswer(b,frame);
      case "express_boredom":return boredomAnswer(b,frame);
      case "express_frustration":return frustrationAnswer(b,frame);
      default:return null;
    }
  }

  function registerTransientState(b,frame){
    if(!frame.affect)return;
    if(!b.companionState)b.companionState={};
    b.companionState.lastUserAffect={...frame.affect,wallMs:Date.now(),source:"explicit-language",persistent:false};
    if(b.companionState.lastPlan)b.companionState.lastPlan.userAffect=frame.affect.kind;
  }

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const frame=classify(text),lower=oldHear.call(this,text);
    const finish=lowerReply=>{
      registerTransientState(this,frame);
      const refined=answer(this,frame);
      if(!refined)return lowerReply;
      if(this.companionState){
        this.companionState.lastIntent=frame.intent;
        this.companionState.lastReply=refined;
        if(this.companionState.lastPlan){this.companionState.lastPlan.intent=frame.intent;this.companionState.lastPlan.text=refined;this.companionState.lastPlan.userAffect=frame.affect?.kind||null;}
      }
      return typeof this.say==="function"?this.say(refined):refined;
    };
    return lower&&typeof lower.then==="function"?lower.then(finish):finish(lower);
  };

  window.NpcIntCompanionRefinement={classify,detectAffect,answer,desiredActivityAnswer,meaningfulThread,griefAnswer};
  print("system","","companion refinement v1.2 cargado · duelo con contexto temporal + estados transitorios + propuestas");
})();