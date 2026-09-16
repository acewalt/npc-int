"use strict";

(function(){
  const DMNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();

  function ensureManager(b){
    if(b.dialogueManager)return b.dialogueManager;
    b.dialogueManager={
      lastIntent:null,
      lastCanonical:null,
      sameIntentCount:0,
      lastResolvedReference:null,
      lastUserAt:b.time||0,
      lastPresenceAt:-999,
      active:true,
      turns:0
    };
    return b.dialogueManager;
  }

  function canonical(text){
    let n=DMNorm(text);
    const replacements=[
      [/\bahces\b/g,"haces"],
      [/\bq pasa\b/g,"que pasa"],
      [/\bq hacemos\b/g,"que hacemos"],
      [/\bdnd\b/g,"donde"],
      [/\bsigo aca\b/g,"sigo aqui"],
      [/\bq vas hacer\b/g,"que vas a hacer"],
      [/\bque vas hacer\b/g,"que vas a hacer"],
      [/\bq quieres hacer\b/g,"que quieres hacer"]
    ];
    for(const [r,v] of replacements)n=n.replace(r,v);

    // Marcadores del discurso no cambian la intención principal de la frase.
    // "pero qué quieres hacer" y "bueno, qué quieres hacer" deben seguir
    // clasificándose como la misma pregunta semántica.
    let previous="";
    while(n!==previous){
      previous=n;
      n=n.replace(/^(pero|bueno|entonces|mira|oye|pues|a ver|osea|o sea)\s+/," ").replace(/\s+/g," ").trim();
    }
    return n;
  }

  function classify(text){
    const n=canonical(text);
    let intent=null;

    if(/^(que pasa|que ocurre|que sucede|que esta pasando|que hay)$/.test(n)) intent="ask_situation";
    else if(/^(y ahora|ahora que|entonces y ahora)$/.test(n) || /^(entonces )?(por )?donde empezamos$/.test(n) || /^(entonces )?(que hacemos ahora|como empezamos|y ahora que|que sigue)$/.test(n)) intent="ask_next_step";
    else if(/^(y )?(que vas a hacer|que haras|que piensas hacer|que piensas hacer ahora|cual es tu siguiente accion)$/.test(n)) intent="ask_future_action";
    else if(/^(y )?(que quieres hacer|que te gustaria hacer|que preferirias hacer|que te provoca hacer)$/.test(n)) intent="ask_desired_action";
    else if(/^(sigo aqui|aqui estoy|todavia estoy aqui|no me fui|ya volvi|volvi)$/.test(n)) intent="presence";
    else if(/^(vale |ok |bueno |dale |si )?(conectalo|hazlo|intentalo|pruebalo)$/.test(n)) intent="directive_with_reference";
    else if(/^(eso|esto|lo anterior|esa parte) (que es|que significa|como funciona)$/.test(n)) intent="ask_deictic_reference";
    else if(/^(vale|ok|okay|dale|bueno|listo|entiendo)$/.test(n)) intent="ack";

    return {raw:text,canonical:n,intent,repetition:1};
  }

  function latestFocus(b){
    const d=b.discourse;
    if(d?.focus?.length){
      const relevant=[...d.focus].reverse().find(x=>x.kind!=="user" || !/^(hola|vale|ok|sigo aqui)$/i.test(DMNorm(x.text)));
      if(relevant)return relevant.text;
    }
    if(d?.lastRegistered?.source)return d.lastRegistered.source;
    if(d?.lastCommitment?.source)return d.lastCommitment.source;
    if(b.pragmatics?.meaningfulTopic)return b.pragmatics.meaningfulTopic;
    if(b.dialogue?.topic)return b.dialogue.topic;
    return null;
  }

  function referenceFromPreviousNpc(b){
    const prev=b.discourse?.previousNpc||b.dialogue?.lastNpc||"";
    if(!prev)return null;
    const quoted=[...prev.matchAll(/[«“\"]([^»”\"]{3,100})[»”\"]/g)].map(m=>m[1]);
    if(quoted.length)return quoted[quoted.length-1];
    const m=prev.match(/(?:conectar|probar|usar|activar|retomar|revisar|observar)\s+([^.,;!?]{3,80})/i);
    return m?m[1].trim():null;
  }

  function resolveReference(b){return referenceFromPreviousNpc(b)||latestFocus(b);}

  function topGoal(b){
    const g=b.mind?.lastCycle?.goals?.[0];
    if(g)return g;
    const d=typeof b.dominant==="function"?b.dominant():null;
    return d?{label:typeof b.goalFor==="function"?b.goalFor(d):d,priority:b.drives?.[d]||0}:null;
  }

  function currentDecision(b){return b.mind?.lastCycle?.decision||null;}
  function currentOptions(b){return b.mind?.lastCycle?.options||[];}

  function describeSituation(b){
    const mood=typeof b.moodLabel==="function"?b.moodLabel():"neutral";
    const goal=topGoal(b),decision=currentDecision(b),topic=latestFocus(b);
    const parts=[`Ahora mismo estoy ${mood} y conversando contigo.`];
    if(topic)parts.push(`El contexto que tengo más presente es «${short(topic,72)}».`);
    if(goal)parts.push(`Mi prioridad actual es ${goal.label}${typeof goal.priority==="number"?` (${Math.round(goal.priority*100)}%)`:""}.`);
    if(decision)parts.push(`La última acción que consideré mejor fue ${decision.label}.`);
    if(!topic)parts.push("No hay un evento del mundo especialmente relevante activo ahora mismo.");
    return parts.join(" ");
  }

  function nextStep(b){
    const topic=latestFocus(b),goal=topGoal(b),decision=currentDecision(b);
    if(topic){
      if(decision?.id==="ask")return `Lo siguiente sería aclarar «${short(topic,70)}». Me falta una pieza concreta de información antes de decidir algo más.`;
      if(decision?.id==="observe"||decision?.id==="investigate")return `Lo siguiente sería observar mejor «${short(topic,70)}» y buscar qué cambió, qué lo causó y qué opciones abre.`;
      return `Podemos seguir por «${short(topic,70)}». Primero separaría lo que sé, lo que estoy suponiendo y lo que todavía falta por averiguar.`;
    }
    if(goal?.label?.includes("incertidumbre"))return "Ahora necesito una situación concreta. Dime qué está ocurriendo en el mundo del NPC; la convertiré en percepción, objetivos y opciones antes de decidir.";
    return "El siguiente paso sería definir un objetivo o una situación concreta del mundo. Sin eso solo tendría conversación, pero no una decisión que evaluar.";
  }

  function usefulAction(b){
    const decision=currentDecision(b);
    const useful=new Set(["observe","investigate","explore","rest","eat","seek_food","move_away","defend","attack","set_boundary"]);
    if(decision&&useful.has(decision.id))return decision;
    return currentOptions(b).find(o=>useful.has(o.id)&&o.score>.16)||null;
  }

  function futureAction(b,repetition=1){
    const goal=topGoal(b),action=usefulAction(b),topic=latestFocus(b);
    if(repetition>=3 && !action){
      return "Dicho de la forma más concreta posible: todavía no tengo una acción física justificada. Necesito percibir algo del mundo —un objeto, una persona, un peligro, una necesidad o un cambio— y entonces sí elegiré qué hacer con ello.";
    }
    if(repetition>=2 && !action){
      return `Más directo: quiero pasar de hablar a actuar. Mi prioridad es ${goal?.label||"obtener una situación concreta"}; necesito una percepción del entorno para convertirla en opciones y escoger una.`;
    }
    if(action){
      const lead=repetition>=2?"Más concretamente, ":"";
      return `${lead}ahora mismo mi intención más útil es ${action.label}${topic?` respecto a «${short(topic,66)}»`:""}. La escogería porque encaja mejor con mi objetivo actual${goal?` de ${goal.label}`:""}, con una utilidad estimada de ${Math.round((action.score||0)*100)}%.`;
    }
    if(topic)return `Por ahora voy a seguir trabajando sobre «${short(topic,72)}»: entender qué sé, qué me falta y qué opción tiene más sentido. No tengo una acción física mejor justificada todavía.`;
    return goal?`Por ahora voy a orientar mis siguientes decisiones a ${goal.label}. No tengo una acción física concreta suficientemente justificada todavía.`:"Todavía no tengo una acción concreta bien justificada; necesito una situación del mundo o un objetivo más definido.";
  }

  function desiredAction(b,repetition=1){
    const goal=topGoal(b),action=usefulAction(b),topic=latestFocus(b);
    if(action){
      if(repetition>=2)return `Más directo: quiero ${action.label}${topic?` respecto a «${short(topic,62)}»`:""}. Es la acción concreta que mejor encaja ahora con mis prioridades.`;
      return `Si elijo según mi estado y objetivos actuales, me inclino por ${action.label}${topic?` en relación con «${short(topic,62)}»`:""}. No es un deseo humano; es la opción que ahora encaja mejor con mis prioridades.`;
    }
    if(repetition>=3){
      return "Lo más concreto que puedo decir ahora es esto: quiero que ocurra algo que pueda percibir y sobre lo que pueda decidir por mí mismo. Sin un entorno o evento concreto, solo puedo describir prioridades, no ejecutar un propósito real.";
    }
    if(repetition>=2){
      return `Más concreto: quiero obtener una situación del entorno, observarla y escoger una acción propia. Ahora mismo mi prioridad es ${goal?.label||"reducir incertidumbre"}, pero todavía me falta un objeto real sobre el que actuar.`;
    }
    if(goal)return `Lo que más me inclina ahora es ${goal.label}. A partir de eso preferiría obtener una situación concreta y elegir una acción con consecuencias evaluables.`;
    return "No tengo un deseo humano estable ahora mismo. Necesito un objetivo o una situación concreta para que aparezca una preferencia de acción.";
  }

  function handleDirective(b){
    const ref=resolveReference(b);
    ensureManager(b).lastResolvedReference=ref;
    if(!ref)return "Entiendo que quieres que haga algo, pero «lo» no tiene una referencia clara en mis últimos turnos. Dime qué quieres que conecte o pruebe y lo trataré como una acción concreta.";
    const n=DMNorm(ref);
    if(/nanochat|puente neuronal|bridge|neuronal/.test(n))return `Entiendo «conéctalo» como activar la conexión neuronal con ${short(ref,70)}. Esa conexión existe mediante /neural on; no voy a fingir que ya está conectada si el bridge local no está disponible.`;
    return `Interpreto «lo» como «${short(ref,90)}». Puedo convertir esa referencia en una intención de acción, pero necesito que exista una acción ejecutable asociada; no voy a fingir que la ejecuté solo por haber entendido la orden.`;
  }

  function responseFor(b,frame){
    switch(frame.intent){
      case "ask_situation": return describeSituation(b);
      case "ask_next_step": return nextStep(b);
      case "ask_future_action": return futureAction(b,frame.repetition);
      case "ask_desired_action": return desiredAction(b,frame.repetition);
      case "presence": return "Sí, te tengo presente en la conversación. No necesito comprobar si sigues aquí mientras acabas de interactuar conmigo.";
      case "directive_with_reference": return handleDirective(b);
      case "ask_deictic_reference": {
        const ref=resolveReference(b);
        return ref?`Entiendo que «eso» se refiere a «${short(ref,100)}». Si quieres explicarlo o usarlo para decidir, puedo trabajar desde esa referencia.`:"No tengo una referencia reciente suficientemente clara para «eso».";
      }
      case "ack": {
        const replies=["Vale.","Entendido.","De acuerdo."];
        return replies[(ensureManager(b).turns||0)%replies.length];
      }
      default:return null;
    }
  }

  function noteManagerTurn(b,frame,reply){
    const m=ensureManager(b);
    const same=m.lastIntent===frame.intent;
    m.sameIntentCount=same?m.sameIntentCount+1:1;
    m.lastIntent=frame.intent;
    m.lastCanonical=frame.canonical;
    m.turns++;
    m.lastUserAt=b.time||0;
    if(frame.intent==="presence")m.lastPresenceAt=b.time||0;
    if(Array.isArray(b.lastThoughts)){
      b.lastThoughts.push(`GESTOR DE DIÁLOGO: intención=${frame.intent}; repetición=${frame.repetition}; canónico=«${frame.canonical}»`);
      if(m.lastResolvedReference)b.lastThoughts.push(`REFERENCIA RESUELTA: ${m.lastResolvedReference}`);
    }
    if(reply&&b.discourse)b.discourse.lastInterpretation={source:frame.raw,interpretation:`gestor de diálogo: ${frame.intent}`,time:b.time||0,response:reply};
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){
    oldReset.call(this);
    this.dialogueManager={lastIntent:null,lastCanonical:null,sameIntentCount:0,lastResolvedReference:null,lastUserAt:this.time||0,lastPresenceAt:-999,active:true,turns:0};
  };

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const manager=ensureManager(this);
    const frame=classify((text||"").trim());
    frame.repetition=frame.intent&&manager.lastIntent===frame.intent?manager.sameIntentCount+1:1;
    manager.lastUserAt=this.time||0;
    if(frame.intent==="presence")manager.lastPresenceAt=this.time||0;
    if(!frame.intent)return oldHear.call(this,text);

    const originalSay=this.say;
    this.say=function(x){return x;};
    let lower;
    try{lower=oldHear.call(this,text);}catch(err){this.say=originalSay;throw err;}

    const finish=()=>{
      this.say=originalSay;
      const reply=responseFor(this,frame);
      noteManagerTurn(this,frame,reply);
      return reply?originalSay.call(this,reply):null;
    };
    if(lower&&typeof lower.then==="function")return lower.then(finish,err=>{this.say=originalSay;throw err;});
    return finish();
  };

  const oldTick=NpcBrain.prototype.tick;
  NpcBrain.prototype.tick=function(minutes=1){
    ensureManager(this);
    const reply=oldTick.call(this,minutes);
    const finish=out=>{
      if(!out)return null;
      const sinceUser=(this.time||0)-this.dialogueManager.lastUserAt;
      const sincePresence=(this.time||0)-this.dialogueManager.lastPresenceAt;
      const normalized=DMNorm(out);
      if(normalized.includes("sigues ahi")&&(sinceUser<14||sincePresence<24))return null;
      if(sinceUser<10&&/no quiero limitarme|demasiadas preguntas|quiero aprender algo nuevo/.test(normalized))return null;
      return out;
    };
    return reply&&typeof reply.then==="function"?reply.then(finish):finish(reply);
  };

  const oldCommand=command;
  command=function(raw){
    const head=(raw.trim().split(/\s+/)[0]||"").toLowerCase();
    if(head!=="/dialog"&&head!=="/dialogue")return oldCommand(raw);
    const m=ensureManager(brain);
    print("debug","DIALOGUE>",[
      `turnos gestionados=${m.turns}`,
      `última intención=${m.lastIntent||"—"}`,
      `repeticiones consecutivas=${m.sameIntentCount}`,
      `último canónico=${m.lastCanonical||"—"}`,
      `referencia resuelta=${m.lastResolvedReference||"—"}`,
      `último usuario=t+${m.lastUserAt}m`,
      `última presencia=t+${m.lastPresenceAt}m`,
      `foco=${latestFocus(brain)||"—"}`
    ].join("\n"));
  };

  ensureManager(brain);
  window.NpcIntDialogueManager={canonical,classify,resolveReference};
  print("system","","gestor de diálogo v0.3 cargado · continuidad · repetición intencional · referencias · arbitraje final");
})();
