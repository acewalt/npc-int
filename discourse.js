"use strict";

(function(){
  const DNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ¿?¡! ]+/g," ").replace(/\s+/g," ").trim();

  function ensureDiscourse(b){
    if(b.discourse)return;
    b.discourse={
      previousUser:"",
      currentUser:"",
      previousNpc:"",
      lastInterpretation:null,
      lastCommitment:null,
      lastRegistered:null,
      lastExplanation:null,
      focus:[],
      emissions:[],
      suppressedAutonomous:0
    };
  }

  function rememberFocus(b,kind,text,meta={}){
    ensureDiscourse(b);
    if(!text)return null;
    const item={kind,text,time:b.time||0,...meta};
    b.discourse.focus.push(item);
    if(b.discourse.focus.length>24)b.discourse.focus.shift();
    return item;
  }

  function semanticReading(text){
    const n=DNorm(text).replace(/[¿?¡!]/g,"").trim();
    if(!n)return "no había contenido lingüístico suficiente";
    if(/^(no se|ni idea|no tengo idea|quien sabe)$/.test(n))return "expresaste incertidumbre o falta de información";
    if(/^(vale|ok|okay|de acuerdo|si|sip|aja)$/.test(n))return "lo tomé como una aceptación o confirmación breve, no como un hecho nuevo";
    if(/^(mm+|mmm+|hm+|hmm+)$/.test(n))return "lo tomé como una señal de escucha, duda o procesamiento; no como una afirmación concreta";
    if(/^(hola|buenas|hey|ey|que onda|que tal)/.test(n))return "lo interpreté como un saludo o apertura de conversación";
    if(/^(que|como|eh|mande|perdon|no entendi)$/.test(n))return "lo interpreté como una petición de aclaración";
    if(/^(gracias|muchas gracias)/.test(n))return "lo interpreté como agradecimiento";
    if(/\b(no|nunca|tampoco)\b/.test(n))return "detecté una posible negación, aunque necesito el contexto para saber exactamente qué niegas";
    if(/[?¿]/.test(text)||/^(que|quien|como|cuando|donde|por que|porque|cual|cuanto)\b/.test(n))return "lo interpreté como una pregunta relacionada con el contexto actual";
    return "lo traté como información de conversación; conservarlo no significa asumir automáticamente que sea verdadero";
  }

  function noteDirectUserTurn(b,text,intent){
    ensureDiscourse(b);
    if(b.dialogue){
      b.dialogue.turn=(b.dialogue.turn||0)+1;
      b.dialogue.lastUser=text;
      b.dialogue.lastIntent=intent||"discourse-query";
    }
    b.silence=0;
    if(b.relation)b.relation.familiarity=clamp((b.relation.familiarity||0)+.012);
    if(typeof b.remember==="function")b.remember("dialogue",`${b.relation?.name||"Jugador"}: ${text}`,.48);
    if(typeof b.thoughts==="function"){
      b.thoughts(`${b.relation?.name||"Jugador"} hizo una consulta sobre el discurso: «${short(text,100)}»`);
      if(Array.isArray(b.lastThoughts))b.lastThoughts.splice(1,0,"DISCURSO: resolví la referencia usando turnos anteriores, no como un tema nuevo");
    }
  }

  function directSay(b,text,reason){
    if(reason)rememberFocus(b,"explanation",text,{reason});
    return b.say(text);
  }

  function explainPreviousResponse(b){
    const prevUser=b.discourse.previousUser||"";
    const prevNpc=b.discourse.previousNpc||b.dialogue?.lastNpc||"";
    const prevIntent=b.dialogue?.lastIntent||"";
    const n=DNorm(prevUser);

    let why;
    if(/^(no se|ni idea|no tengo idea)/.test(n)){
      why=`Porque interpreté «${prevUser}» como incertidumbre. Preferí reconocer que faltaba información antes que completar el hueco inventando una respuesta.`;
    }else if(/^(hola|buenas|hey|ey|que onda|que tal)/.test(n)){
      why=`Porque interpreté «${prevUser}» como un saludo. Respondí socialmente en vez de tratarlo como una pregunta factual.`;
    }else if(prevIntent==="ask_state"){
      why="Porque entendí que estabas preguntando por mi estado interno, así que respondí usando mis variables de ánimo e impulsos actuales.";
    }else if(prevNpc){
      why=`Respondí así porque ${semanticReading(prevUser)}. Mi respuesta anterior fue «${short(prevNpc,120)}». Si esa interpretación no coincide con lo que querías decir, puedo corregirla.`;
    }else{
      why="No tengo un turno anterior suficiente para reconstruir con precisión por qué respondí de esa manera.";
    }
    b.discourse.lastExplanation={question:"why-response",answer:why,sourceUser:prevUser,sourceNpc:prevNpc,time:b.time||0};
    return why;
  }

  function resolveCommitment(b){
    const c=b.discourse.lastCommitment;
    if(!c)return "Ahora mismo no tengo un «lo tendré en cuenta» concreto que pueda señalar. Prefiero decir eso antes que fingir que recuerdo una referencia inexistente.";
    return `Cuando dije que lo tendría en cuenta me refería a «${c.source}». Mi interpretación fue: ${c.interpretation}.`;
  }

  function resolveRegistered(b){
    const r=b.discourse.lastRegistered;
    if(!r)return "No encuentro un registro conversacional concreto al que pueda referirme en los últimos turnos.";
    return `Registré «${r.source}» como ${r.kind}. Lo conservé como contexto; eso no significa que lo haya aceptado como un hecho verdadero.`;
  }

  function resolveUnderstood(b){
    const x=b.discourse.lastInterpretation;
    if(!x)return "No tengo una interpretación concreta reciente que pueda recuperar con seguridad.";
    return `De «${x.source}» entendí esto: ${x.interpretation}.`;
  }

  function explainFollow(b){
    const prev=b.discourse.previousNpc||b.dialogue?.lastNpc||"";
    if(/te sigo/i.test(prev))return "Cuando dije «Te sigo» usé «seguir» en sentido figurado: quería decir que estaba siguiendo el hilo de lo que decías, no que te estuviera siguiendo físicamente.";
    return explainPreviousResponse(b);
  }

  function classifyQuery(text){
    const n=DNorm(text).replace(/[¿?¡!]/g,"").trim();
    if(/^(por que|porque) (hablas|respondes|dices) (asi|haci|de esa manera|de esa forma)$/.test(n))return "why-style";
    if(/^(por que|porque) (dijiste|respondiste) (eso|asi|haci|eso ultimo|lo anterior)$/.test(n))return "why-response";
    if(/^(que|qué) (tienes|estas teniendo) en cuenta$/.test(n)||/^que vas a tener en cuenta$/.test(n))return "what-commitment";
    if(/^(que|qué) registraste$/.test(n)||/^que fue lo que registraste$/.test(n))return "what-registered";
    if(/^(que|qué) entendiste$/.test(n)||/^que fue lo que entendiste$/.test(n))return "what-understood";
    if(/^(por que|porque) me sigues$/.test(n))return "why-follow";
    if(/^(a que te refieres|que quisiste decir|que quieres decir con eso)$/.test(n))return "what-meant";
    if(/^(que acabas de decir|que dijiste)$/.test(n))return "repeat-last";
    return null;
  }

  function discourseReply(b,type){
    switch(type){
      case "why-style":
      case "why-response": return explainPreviousResponse(b);
      case "what-commitment": return resolveCommitment(b);
      case "what-registered": return resolveRegistered(b);
      case "what-understood": return resolveUnderstood(b);
      case "why-follow": return explainFollow(b);
      case "what-meant": {
        const prev=b.discourse.previousNpc||b.dialogue?.lastNpc||"";
        if(!prev)return "No tengo una frase anterior clara que reformular.";
        return `Me refería a «${short(prev,120)}». En otras palabras: esa era mi lectura del contexto en ese momento, no una afirmación absoluta.`;
      }
      case "repeat-last": {
        const prev=b.discourse.previousNpc||b.dialogue?.lastNpc||"";
        return prev?`Lo último que dije fue: «${prev}».`:"Todavía no había dicho nada que pueda repetir.";
      }
      default:return null;
    }
  }

  function nearDuplicate(b,text){
    const n=DNorm(text);
    if(!n)return false;
    return b.discourse.emissions.some(e=>{
      if(DNorm(e.text)===n)return true;
      return typeof b.similarity==="function" && b.similarity(e.text,text)>.92;
    });
  }

  function rememberEmission(b,text,source){
    if(!text)return;
    b.discourse.emissions.push({text,source,time:b.time||0});
    if(b.discourse.emissions.length>10)b.discourse.emissions.shift();
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){
    oldReset.call(this);
    ensureDiscourse(this);
  };

  const oldSay=NpcBrain.prototype.say;
  NpcBrain.prototype.say=function(text){
    ensureDiscourse(this);
    const source=this.dialogue?.lastUser||this.discourse.currentUser||"";
    const result=oldSay.call(this,text);
    const n=DNorm(result);

    this.discourse.previousNpc=result;
    rememberEmission(this,result,"dialogue");

    if(source){
      const interpretation=semanticReading(source);
      this.discourse.lastInterpretation={source,interpretation,time:this.time||0,response:result};
      rememberFocus(this,"interpretation",source,{interpretation});

      if(/\b(lo tengo en cuenta|lo tendre en cuenta|lo tomare en cuenta|tomo eso como)\b/.test(n)){
        this.discourse.lastCommitment={source,interpretation,time:this.time||0,response:result};
      }
      if(/\b(queda registrado|lo voy a conservar como contexto|queda en el contexto|lo recordare|queda registrado en mi contexto)\b/.test(n)){
        this.discourse.lastRegistered={source,kind:"contexto conversacional",interpretation,time:this.time||0,response:result};
      }
      if(/^te sigo[.!]?$/.test(n)){
        this.discourse.lastInterpretation={source,interpretation:"estaba siguiendo el hilo de la conversación; «seguir» se usó de forma figurada",time:this.time||0,response:result};
      }
    }
    return result;
  };

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    ensureDiscourse(this);
    text=(text||"").trim();

    this.discourse.previousUser=this.dialogue?.lastUser||this.discourse.currentUser||"";
    this.discourse.previousNpc=this.dialogue?.lastNpc||this.discourse.previousNpc||"";
    this.discourse.currentUser=text;

    const query=classifyQuery(text);
    if(query){
      noteDirectUserTurn(this,text,query);
      const answer=discourseReply(this,query);
      if(Array.isArray(this.lastThoughts)){
        this.lastThoughts.push(`REFERENCIA: usuario=${short(this.discourse.previousUser||"ninguno",70)} | npc=${short(this.discourse.previousNpc||"ninguno",70)}`);
        this.lastThoughts.push(`RESOLUCIÓN: ${query}`);
      }
      return directSay(this,answer,"discourse-resolution");
    }

    const result=oldHear.call(this,text);
    const finish=answer=>{
      if(text){
        rememberFocus(this,"user",text,{interpretation:semanticReading(text)});
      }
      return answer;
    };
    if(result&&typeof result.then==="function")return result.then(finish);
    return finish(result);
  };

  const oldTick=NpcBrain.prototype.tick;
  NpcBrain.prototype.tick=function(minutes=1){
    ensureDiscourse(this);
    const result=oldTick.call(this,minutes);
    const finish=reply=>{
      if(!reply)return null;
      if(nearDuplicate(this,reply)){
        this.discourse.suppressedAutonomous++;
        return null;
      }
      rememberEmission(this,reply,"autonomous");
      return reply;
    };
    if(result&&typeof result.then==="function")return result.then(finish);
    return finish(result);
  };

  const oldEvent=NpcBrain.prototype.event;
  NpcBrain.prototype.event=function(text){
    ensureDiscourse(this);
    const result=oldEvent.call(this,text);
    const finish=reply=>{
      if(!reply)return null;
      if(nearDuplicate(this,reply))return null;
      rememberEmission(this,reply,"world");
      return reply;
    };
    if(result&&typeof result.then==="function")return result.then(finish);
    return finish(result);
  };

  const oldCommand=command;
  command=function(raw){
    const [head]=raw.trim().split(/\s+/);
    if(head.toLowerCase()==="/discourse"){
      ensureDiscourse(brain);
      const d=brain.discourse;
      const focus=d.focus.slice(-8).map((x,i)=>`${i+1}. [${x.kind}] ${x.text}${x.interpretation?` -> ${x.interpretation}`:""}`);
      print("debug","DISCOURSE>",[
        `usuario anterior: ${d.previousUser||"—"}`,
        `npc anterior: ${d.previousNpc||"—"}`,
        `última interpretación: ${d.lastInterpretation?`${d.lastInterpretation.source} -> ${d.lastInterpretation.interpretation}`:"—"}`,
        `último compromiso: ${d.lastCommitment?.source||"—"}`,
        `último registro: ${d.lastRegistered?.source||"—"}`,
        `autónomos duplicados suprimidos: ${d.suppressedAutonomous}`,
        focus.length?`foco:\n${focus.join("\n")}`:"foco: —"
      ].join("\n"));
      return;
    }
    return oldCommand(raw);
  };

  ensureDiscourse(brain);
  print("system","","discurso v0.1 cargado · referencias entre turnos · causalidad · compromisos · anti-repetición global");
})();
