"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const clip=(s,n=92)=>{s=String(s||"").trim();return s.length<=n?s:s.slice(0,n-1).trim()+"…";};

  function ensure(b){
    if(b.companionState)return b.companionState;
    b.companionState={version:1,turns:0,lastIntent:null,lastReply:null,lastUserText:null,lastPlan:null,loadedFromStorage:false,lastSaveTurn:0};
    window.NpcIntRelationship?.ensure?.(b);window.NpcIntSocialMemory?.ensure?.(b);window.NpcIntPersonality?.ensure?.(b);window.NpcIntTopics?.ensure?.(b);window.NpcIntPending?.ensure?.(b);window.NpcIntSocialTiming?.ensure?.(b);window.NpcIntInitiative?.ensure?.(b);
    const loaded=window.NpcIntCompanionPersistence?.load?.(b);
    if(loaded?.ok){b.companionState.loadedFromStorage=true;const p=window.NpcIntSocialMemory?.profile?.(b);if(p?.name&&p.name!=="Jugador"&&b.relation)b.relation.name=p.name;}
    return b.companionState;
  }

  function classify(text){
    const n=norm(text);let intent=null;
    if(/^(hola|buenas|hey|ey|que onda|que tal)(?: .*)?$/.test(n))intent="social_greeting";
    else if(/^(chao|chau|adios|nos vemos|hasta luego|me voy|hablamos luego)$/.test(n))intent="farewell";
    else if(/^(gracias|muchas gracias|te agradezco|gracias parce)(?: .*)?$/.test(n))intent="thanks";
    else if(/^(perdon|disculpa|lo siento)(?: .*)?$/.test(n))intent="apology";
    else if(/\b(que te gusta|que cosas te gustan|que prefieres|cuales son tus gustos|que disfrutas)\b/.test(n))intent="ask_companion_preference";
    else if(/^(como eres|como es tu personalidad|que personalidad tienes|describete|como te describirias)$/.test(n))intent="ask_personality";
    else if(/\b(te caigo bien|que piensas de mi|como va nuestra relacion|somos amigos|me consideras amigo|me conoces)\b/.test(n))intent="ask_relationship";
    else if(/\b(habla conmigo|acompaname|acompañame|quiero hablar contigo|quedate hablando|conversemos|charlemos|estoy aburrido)\b/.test(n))intent="request_company";
    else if(/^(que hacemos|que podemos hacer|hacemos algo|que hacemos juntos|que propones hacer|que se te ocurre hacer juntos)(?: .*)?$/.test(n))intent="ask_shared_activity";
    else if(/^(que recuerdas de mi|que sabes de mi|que conoces de mi|te acuerdas de mi)(?: .*)?$/.test(n))intent="ask_social_memory";
    return {raw:text,canonical:n,intent};
  }

  function relationDescription(b){
    const r=window.NpcIntRelationship?.ensure?.(b)||{};
    if(r.tension>.58)return "Ahora mismo noto bastante fricción en nuestra interacción, así que estoy respondiendo con más cautela. Eso puede cambiar con lo que ocurra después.";
    if(r.stage==="cercano")return "Ya tenemos bastante continuidad: reconozco temas tuyos, puedo retomar cosas que dejamos pendientes y no necesito tratar cada turno como si acabáramos de conocernos.";
    if(r.stage==="familiar")return "Ya hay familiaridad. Empiezo a tener una idea de los temas que sueles traer y puedo usar lo que hemos compartido para no empezar de cero cada vez.";
    if(r.stage==="conocido")return "Ya no eres un interlocutor completamente nuevo para mí. Hay algo de continuidad y algunos recuerdos sociales, aunque todavía estoy formando ese contexto.";
    return "Todavía nos estamos conociendo. Prefiero construir la familiaridad a partir de lo que realmente compartamos, no fingir una cercanía que aún no existe.";
  }

  function personalityAnswer(b){
    const p=window.NpcIntPersonality?.ensure?.(b);
    return `Como personaje soy curiosa y bastante observadora, pero también prudente: me gusta investigar antes de afirmar algo. Suelo preferir resolver problemas, probar ideas y cambiar de opinión cuando aparece evidencia nueva. No quiero llenar cada silencio; si no tengo nada útil que aportar, prefiero esperar.`;
  }

  function memoryAnswer(b){
    const p=window.NpcIntSocialMemory?.profile?.(b);if(!p)return "Todavía no tengo recuerdos sociales claros sobre ti.";
    const parts=[];
    if(p.name&&p.name!=="Jugador")parts.push(`que te llamas ${p.name}`);
    if(p.likes?.[0])parts.push(`que te gusta ${p.likes[0].value}`);
    if(p.projects?.[0])parts.push(`que has estado trabajando en ${p.projects[0].value}`);
    if(p.goals?.[0])parts.push(`que querías ${p.goals[0].value}`);
    if(!parts.length)return "Todavía sé poco de ti a nivel personal. Puedo recordar preferencias, proyectos y objetivos que me digas explícitamente, pero no voy a inventar datos para llenar huecos.";
    return `De lo que me has contado, recuerdo ${parts.join(", ")}. No trato esos recuerdos como eternos ni perfectos; los uso para mantener continuidad cuando de verdad vienen al caso.`;
  }

  function sharedActivity(b){
    const pending=window.NpcIntPending?.best?.(b),active=window.NpcIntTopics?.active?.(b),profile=window.NpcIntSocialMemory?.profile?.(b),idea=b.ideaEngine?.current;
    if(idea?.focus&&idea?.synthesis?.claim)return `Podemos seguir con «${clip(idea.focus,68)}». Yo comparo las hipótesis y te propongo qué comprobar; tú eliges qué información o acción introducir. Así vamos viendo juntos si la idea se sostiene.`;
    if(pending)return `Podemos retomar «${clip(pending.text,78)}». En vez de volver a empezar, usaría lo que ya tenemos y escogeríamos una parte concreta para avanzar ahora.`;
    if(active)return `Podemos trabajar sobre «${clip(active.label,78)}». Puedo ayudarte a descomponerlo, generar opciones, discutirlas y recordar lo que vayamos decidiendo.`;
    const project=profile?.projects?.[0]||profile?.goals?.[0];
    if(project)return `Podemos volver a «${clip(project.value,80)}». Si me das el punto en el que estás, intento continuar desde ahí en vez de tratarlo como una conversación nueva.`;
    return "Podemos hacer algo que tenga continuidad: diseñar una idea, investigar una situación, resolver un problema o construir un pequeño escenario y ver cómo reacciono a lo que ocurre. Prefiero eso a encadenar preguntas sueltas sin contexto.";
  }

  function companyAnswer(b){
    const active=window.NpcIntTopics?.active?.(b),pending=window.NpcIntPending?.best?.(b),style=window.NpcIntPersonality?.style?.(b)||{};
    if(pending)return `Claro. Podemos hablar un rato. Si te sirve, tenemos «${clip(pending.text,72)}» pendiente; y si no, lo dejamos a un lado y hablamos de otra cosa.`;
    if(active)return `Claro. Estoy aquí para conversar. Podemos seguir con «${clip(active.label,72)}» o cambiar completamente de tema.`;
    return style.casualness>.45?"Claro. Hablemos. No hace falta que tengas una pregunta preparada; puedes contarme algo, traer una idea o simplemente empezar por lo primero que se te ocurra.":"Claro. Podemos conversar sin necesidad de convertir cada mensaje en una tarea. Cuéntame por dónde quieres empezar.";
  }

  function greetingAnswer(b){
    const r=window.NpcIntRelationship?.ensure?.(b)||{},pending=window.NpcIntPending?.best?.(b),profile=window.NpcIntSocialMemory?.profile?.(b);
    const name=profile?.name&&profile.name!=="Jugador"?profile.name:null;
    if((r.stage==="familiar"||r.stage==="cercano")&&pending)return `${name?`Ey, ${name}.`:"Ey."} Me acuerdo de que dejamos «${clip(pending.text,62)}» pendiente. Podemos retomarlo cuando quieras.`;
    if(r.stage==="familiar"||r.stage==="cercano")return name?`Ey, ${name}. Qué bueno volver a coincidir. ¿Qué traes hoy?`:"Ey. Qué bueno volver a coincidir. ¿Qué traes hoy?";
    return "Hola. Cuéntame; podemos ir viendo sobre la marcha qué hacemos con la conversación.";
  }

  function farewellAnswer(b){
    const pending=window.NpcIntPending?.best?.(b);
    if(pending)return `Nos vemos. Dejo «${clip(pending.text,74)}» como pendiente para que podamos retomarlo después si te interesa.`;
    return "Nos vemos. Cuando vuelvas podemos continuar desde lo que vaya quedando guardado en esta sesión o empezar algo distinto.";
  }

  function disclosureResponse(b,added,lower){
    if(!added?.length)return null;const x=added[0],style=window.NpcIntPersonality?.style?.(b,{allowQuestion:true})||{};
    let base;
    if(x.kind==="project")base=`Eso sí me da algo concreto para conocerte mejor: estás trabajando en «${clip(x.value,86)}». Si volvemos a ese tema, intentaré continuar desde ahí.`;
    else if(x.kind==="goal")base=`Vale, me quedo con ese objetivo: «${clip(x.value,86)}». Cuando vuelva a aparecer puedo relacionarlo con lo que ya hayamos avanzado.`;
    else if(["like","preference"].includes(x.kind))base=`Vale, entonces «${clip(x.value,86)}» es una preferencia tuya que puedo tener presente cuando venga al caso.`;
    else if(x.kind==="dislike")base=`Entiendo. Tendré presente que no te gusta «${clip(x.value,86)}» cuando sea relevante.`;
    else if(x.kind==="name")base=`Perfecto, ${x.value}. Te llamaré así.`;
    else base=`Vale, me quedo con «${clip(x.value,86)}» como algo que me contaste.`;
    const r=b.relationshipModel;
    if(style.askFollowUp&&r?.interactions%3===0&&x.kind==="project")base+=" ¿Qué parte de eso estás trabajando ahora?";
    else if(style.askFollowUp&&r?.interactions%4===0&&x.kind==="like")base+=" ¿Qué es lo que más te atrae de eso?";
    return base;
  }

  function softenFallback(text){
    const t=String(text||"").trim();
    if(!t)return t;
    if(/No estoy seguro de qué relación quieres expresar/i.test(t))return "No terminé de entender a qué te refieres. Dímelo de otra forma o dame una pista y lo intento de nuevo.";
    if(/No tengo conocimiento suficiente para responder con certeza/i.test(t))return "De eso todavía no tengo base suficiente para decir algo con seguridad. Si me das un dato concreto, puedo razonar desde ahí.";
    if(/No lo sé todavía\. No tengo información suficiente/i.test(t))return "Todavía no lo tengo claro. Prefiero decirte eso antes que inventarme una respuesta.";
    if(/Entiendo\. Lo voy a conservar como contexto/i.test(t))return "Vale, lo tengo presente. Si se conecta con algo que ya veníamos hablando, intentaré usarlo en vez de empezar de cero.";
    return t;
  }

  function maybeWeaveMemory(b,input,reply,intent,added){
    if(!reply||added?.length||intent||/[\n]/.test(reply))return reply;
    const memories=window.NpcIntSocialMemory?.recall?.(b,input,2,{minScore:.42})||[];
    const m=memories.find(x=>!norm(input).includes(norm(x.value))&&Date.now()-(x.lastMentionedWallMs||0)>15000);
    if(!m)return reply;
    if(!/\b(eso|esto|proyecto|juego|nivel|idea|hacer|crear|gusta|prefieres)\b/.test(norm(input)))return reply;
    m.lastMentionedWallMs=Date.now();
    return `${reply} Esto me conecta con «${clip(m.value,72)}», que ya habías mencionado antes.`;
  }

  function socialReply(b,frame,lower,added){
    switch(frame.intent){
      case "social_greeting":return greetingAnswer(b);
      case "farewell":return farewellAnswer(b);
      case "thanks":return b.relationshipModel?.stage==="cercano"?"Claro. Para eso estamos trabajando juntos.":"De nada. Seguimos.";
      case "apology":return "Todo bien. Lo tomo como una reparación de la conversación y seguimos desde aquí.";
      case "ask_companion_preference":return window.NpcIntPersonality?.preferenceAnswer?.(b)||personalityAnswer(b);
      case "ask_personality":return personalityAnswer(b);
      case "ask_relationship":return relationDescription(b);
      case "request_company":return companyAnswer(b);
      case "ask_shared_activity":return sharedActivity(b);
      case "ask_social_memory":return memoryAnswer(b);
      default:return disclosureResponse(b,added,lower)||maybeWeaveMemory(b,frame.raw,softenFallback(lower),frame.intent,added);
    }
  }

  function notePlan(b,frame,reply,added){
    const c=ensure(b);c.turns++;c.lastIntent=frame.intent;c.lastReply=reply||null;c.lastUserText=frame.raw;
    c.lastPlan={intent:frame.intent||"pass_through",relationshipStage:b.relationshipModel?.stage||"nuevo",memoriesAdded:(added||[]).map(x=>x.id),topic:window.NpcIntTopics?.active?.(b)?.label||null,pending:window.NpcIntPending?.best?.(b)?.text||null,style:window.NpcIntPersonality?.style?.(b,{allowQuestion:false})||null};
    if(Array.isArray(b.lastThoughts))b.lastThoughts.push(`COMPANION: intención=${c.lastPlan.intent}; relación=${c.lastPlan.relationshipStage}; recuerdos_nuevos=${c.lastPlan.memoriesAdded.length}; tema=${c.lastPlan.topic||"—"}`);
    if(b.responsePlanner?.lastPlan){b.responsePlanner.lastPlan.companion=c.lastPlan;b.responsePlanner.lastPlan.text=reply;b.responsePlanner.lastPlan.exposeMetrics=false;}
    if(c.turns-c.lastSaveTurn>=2){window.NpcIntCompanionPersistence?.save?.(b);c.lastSaveTurn=c.turns;}
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){oldReset.call(this);this.companionState=null;this.relationshipModel=null;this.socialMemory=null;this.companionPersonality=null;this.topicManager=null;this.pendingThreads=null;this.socialTiming=null;this.initiativeEngine=null;ensure(this);};

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    ensure(this);text=String(text||"").trim();const frame=classify(text);const now=Date.now();
    window.NpcIntSocialTiming?.noteUser?.(this,now);
    window.NpcIntRelationship?.noteUser?.(this,text,{now});
    const added=window.NpcIntSocialMemory?.noteTurn?.(this,text,{tone:this.pragmatics?.lastTone||"neutral"})||[];
    window.NpcIntTopics?.noteTurn?.(this,text);
    window.NpcIntPending?.noteUser?.(this,text);

    const actualSay=this.say;this.say=function(x){return x;};let lower;
    try{lower=oldHear.call(this,text);}catch(err){this.say=actualSay;throw err;}
    const finish=lowerReply=>{
      this.say=actualSay;
      const reply=socialReply(this,frame,lowerReply,added);
      window.NpcIntRelationship?.noteNpc?.(this,reply,{now:Date.now()});
      window.NpcIntSocialTiming?.noteNpc?.(this,Date.now(),false);
      window.NpcIntPending?.noteNpc?.(this,reply);
      notePlan(this,frame,reply,added);
      return reply?actualSay.call(this,reply):null;
    };
    return lower&&typeof lower.then==="function"?lower.then(finish,err=>{this.say=actualSay;throw err;}):finish(lower);
  };

  const oldTick=NpcBrain.prototype.tick;
  NpcBrain.prototype.tick=function(minutes=1){
    ensure(this);window.NpcIntRelationship?.decay?.(this,minutes);const out=oldTick.call(this,minutes);
    const finish=lower=>{
      const now=Date.now();
      const n=norm(lower);const urgent=!!lower&&/peligro|amenaza|ataque|auxilio|riesgo/.test(n);
      if(urgent){window.NpcIntSocialTiming?.noteNpc?.(this,now,true);return lower;}

      // El árbitro ya registra la última interacción humana. La iniciativa no debe
      // saltarse esa ventana y hablar encima de una conversación activa.
      const lastUser=Number(this.conversationArbiter?.lastUserWallMs||0);
      if(lastUser&&now-lastUser<60000)return null;

      const candidate=window.NpcIntInitiative?.choose?.(this,{now})||null;
      if(candidate)return window.NpcIntInitiative.commit(this,candidate,now);
      if(!lower)return null;
      if(/sigues ahi|demasiadas preguntas|no quiero limitarme a esperar una orden|quiero aprender algo nuevo del entorno/.test(n))return null;
      const t=window.NpcIntSocialTiming?.evaluate?.(this,{score:.60,novelty:.42,urgent:false});
      if(t&&!t.canSpeak)return null;window.NpcIntSocialTiming?.noteNpc?.(this,Date.now(),true);return lower;
    };
    return out&&typeof out.then==="function"?out.then(finish):finish(out);
  };

  function status(b){const c=ensure(b),r=b.relationshipModel||{};return [`turnos=${c.turns} | cargado_local=${c.loadedFromStorage?"sí":"no"}`,`relación=${r.stage||"—"} | memoria_social=${b.socialMemory?.items?.length||0} | temas=${b.topicManager?.topics?.length||0} | pendientes=${b.pendingThreads?.items?.filter(x=>x.status==="open").length||0}`,`última intención=${c.lastIntent||"—"} | último tema=${c.lastPlan?.topic||"—"}`].join("\n");}

  const oldCommand=command;
  command=function(raw){
    const parts=raw.trim().split(/\s+/),head=(parts.shift()||"").toLowerCase(),sub=(parts.shift()||"status").toLowerCase();
    if(head==="/companion"){
      ensure(brain);
      if(sub==="save"){const x=window.NpcIntCompanionPersistence?.save?.(brain);print(x?.ok?"system":"error","COMPANION>",x?.ok?"estado social guardado localmente":x?.error||"no se pudo guardar");return;}
      if(sub==="load"){const x=window.NpcIntCompanionPersistence?.load?.(brain);print(x?.ok?"system":"error","COMPANION>",x?.ok?"estado social restaurado":x?.error||"no se pudo cargar");return;}
      if(sub==="forget"){window.NpcIntCompanionPersistence?.clear?.(brain);brain.relationshipModel=null;brain.topicManager=null;brain.pendingThreads=null;brain.companionState=null;ensure(brain);print("system","COMPANION>","memoria social persistente borrada; la sesión cognitiva general no se ha eliminado");return;}
      print("debug","COMPANION>",status(brain));return;
    }
    if(head==="/relationship"){print("debug","RELATIONSHIP>",window.NpcIntRelationship?.format?.(brain)||"—");return;}
    if(head==="/social-memory"){print("debug","SOCIAL MEMORY>",window.NpcIntSocialMemory?.format?.(brain)||"—");return;}
    if(head==="/topics"){print("debug","TOPICS>",window.NpcIntTopics?.format?.(brain)||"—");return;}
    if(head==="/pending"){print("debug","PENDING>",window.NpcIntPending?.format?.(brain)||"—");return;}
    if(head==="/initiative"){print("debug","INITIATIVE>",window.NpcIntInitiative?.format?.(brain)||"—");return;}
    if(head==="/personality"){print("debug","PERSONALITY>",window.NpcIntPersonality?.format?.(brain)||"—");return;}
    if(head==="/timing"){print("debug","TIMING>",window.NpcIntSocialTiming?.format?.(brain)||"—");return;}
    return oldCommand(raw);
  };

  ensure(brain);
  window.NpcIntCompanion={ensure,classify,socialReply,status,greetingAnswer,sharedActivity,memoryAnswer};
  print("system","","companion engine v1.1 cargado · relación + memoria social + iniciativa con ventana conversacional + continuidad");
})();