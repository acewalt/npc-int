"use strict";

(function(){
  const RNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();

  function ensurePlanner(b){
    if(b.responsePlanner)return b.responsePlanner;
    b.responsePlanner={lastPlan:null,history:[],seq:1};
    return b.responsePlanner;
  }

  function localIntent(text){
    const n=RNorm(text);
    if(/^(hola|buenas|hey|ey|que onda|que tal)$/.test(n))return "greeting";
    if(/^(no se|no lo se|ni idea|no tengo idea)$/.test(n))return "uncertainty";
    if(/^(que haces|que estas haciendo|en que andas|que haces ahora)$/.test(n))return "ask_activity";
    if(/^(como estas|como te sientes|que tal estas)$/.test(n))return "ask_state";
    return null;
  }

  function frameFor(b,text){
    let d=null;
    try{d=window.NpcIntDialogueManager?.classify?.(text)||null;}catch(_){ }
    const u=b.understanding?.lastFrame;
    return {
      intent:d?.intent || u?.intent || localIntent(text) || null,
      canonical:d?.canonical || u?.canonical || RNorm(text),
      repetition:d?.intent && b.dialogueManager?.lastIntent===d.intent ? Math.max(1,b.dialogueManager?.sameIntentCount||1) : 1
    };
  }

  function stateFor(b,text){
    try{
      const api=window.NpcIntCognitiveState;
      if(api?.refresh)return api.refresh(b,text,{intent:b.dialogueManager?.lastIntent||b.understanding?.lastFrame?.intent||null});
    }catch(_){ }
    return b.cognitiveState?.current||null;
  }

  function validWorldTopic(state,input){
    const t=(state?.topic||"").trim();
    if(!t)return null;
    const n=RNorm(t),q=RNorm(input);
    const meta=/^(que quieres hacer|que vas a hacer|que haces|que estas haciendo|como estas|que pasa|y ahora|ahora que|por donde empezamos|que te gustaria hacer|pero que quieres hacer)$/;
    if(n===q||meta.test(n))return null;
    if(/^jugador( dijo| hizo|:)/.test(n))return null;
    return t;
  }

  function naturalAction(action){
    if(!action)return null;
    const map={
      observe:"observar el entorno",
      investigate:"investigar lo que está ocurriendo",
      explore:"explorar",
      rest:"descansar",
      eat:"comer",
      seek_food:"buscar comida",
      move_away:"alejarme",
      defend:"defenderme",
      attack:"atacar",
      set_boundary:"marcar un límite"
    };
    return map[action.id]||action.label||null;
  }

  function buildPlan(b,text,lowerReply){
    const frame=frameFor(b,text);
    const state=stateFor(b,text);
    const topic=validWorldTopic(state,text);
    const action=naturalAction(state?.action);
    const goal=state?.goal?.label||null;
    const repetition=Math.max(frame.repetition||1,b.dialogueManager?.sameIntentCount||1);
    const plan={
      id:ensurePlanner(b).seq++,
      time:b.time||0,
      input:text,
      intent:frame.intent,
      act:"passthrough",
      content:{topic,action,goal},
      uncertainty:state?.unresolved?.slice?.(0,3)||[],
      justify:false,
      detail:"short",
      followUp:false,
      exposeMetrics:false,
      repetition,
      sourceReply:lowerReply||null,
      text:lowerReply||null
    };

    switch(frame.intent){
      case "ask_activity":
        plan.act="report_current_activity";
        plan.detail="medium";
        break;
      case "ask_desired_action":
        plan.act="state_preference";
        plan.justify=true;
        plan.detail=repetition>=2?"direct":"medium";
        break;
      case "ask_future_action":
        plan.act="state_intention";
        plan.justify=true;
        plan.detail=repetition>=2?"direct":"medium";
        break;
      case "ask_situation":
        plan.act="report_situation";
        plan.detail="medium";
        break;
      case "ask_next_step":
        plan.act="state_next_step";
        plan.detail="direct";
        break;
      case "uncertainty":
        plan.act="acknowledge_uncertainty";
        plan.detail="short";
        break;
      case "ack":
        plan.act="acknowledge";
        plan.detail="short";
        break;
      case "ask_state":
        plan.act="report_internal_state";
        plan.detail="short";
        break;
      case "greeting":
        plan.act="social_greeting";
        break;
      default:
        plan.act="passthrough";
    }
    return plan;
  }

  function verbalize(b,p){
    const {topic,action,goal}=p.content;
    const hasWorld=(b.mem||[]).some(m=>m.type==="world");

    switch(p.act){
      case "report_current_activity": {
        const parts=["Ahora mismo estoy hablando contigo y manteniendo actualizado lo que entiendo de la situación."];
        if(topic)parts.push(`También tengo presente «${short(topic,70)}».`);
        else if(!hasWorld)parts.push("No hay ningún evento del entorno que requiera mi atención inmediata.");
        if(action&&hasWorld)parts.push(`Si tengo que actuar, mi siguiente inclinación es ${action}.`);
        return parts.join(" ");
      }

      case "state_preference": {
        if(action){
          if(p.repetition>=2)return `Más directo: quiero ${action}${topic?` en relación con «${short(topic,62)}»`:""}. Es lo más concreto que ahora encaja con lo que sé y con mi objetivo.`;
          return `Ahora mismo quiero ${action}${topic?` respecto a «${short(topic,62)}»`:""}. No porque tenga un deseo humano, sino porque es la opción que mejor encaja con lo que estoy intentando conseguir.`;
        }
        if(p.repetition>=3)return "Lo más concreto que puedo decir es esto: quiero dejar de hablar en abstracto y tener algo del entorno sobre lo que pueda decidir y actuar. Ahora mismo no hay un evento físico concreto que me dé ese objetivo.";
        if(p.repetition>=2)return "Más concreto: quiero observar algo real del entorno, decidir qué significa y actuar a partir de eso. Ahora mismo todavía no tengo un objetivo físico específico.";
        return `Quiero pasar de conversar a tener algo concreto sobre lo que decidir.${goal?` Mi prioridad actual es ${goal}, pero eso todavía es un objetivo abstracto.`:""}`;
      }

      case "state_intention": {
        if(action)return `Voy a ${action}${topic?` respecto a «${short(topic,62)}»`:""}. Antes de hacerlo mantendré en cuenta lo que sé y lo que todavía es incierto.`;
        if(hasWorld)return "Voy a revisar lo último que ocurrió en el entorno y decidir si conviene observar, investigar, acercarme, alejarme o esperar. No quiero escoger una acción solo por llenar el silencio.";
        return "Por ahora voy a observar y esperar un cambio concreto en el entorno. En cuanto tenga algo real que evaluar, escogeré una acción en vez de inventar una.";
      }

      case "report_situation": {
        if(topic)return `Ahora mismo lo más relevante para mí es «${short(topic,76)}». Estoy intentando distinguir qué sé de eso, qué estoy suponiendo y qué todavía falta por averiguar.`;
        return "Ahora mismo no detecto ningún evento importante del entorno. Estoy conversando contigo y esperando información o cambios que justifiquen una acción.";
      }

      case "state_next_step": {
        if(action)return `Lo siguiente será ${action}${topic?` sobre «${short(topic,66)}»`:""}. Después comprobaré si eso cambia lo que sé antes de escoger otra acción.`;
        if(topic)return `Lo siguiente será revisar «${short(topic,70)}»: separaré hechos, dudas y posibles acciones antes de decidir.`;
        return "Lo siguiente será observar el entorno y esperar una señal concreta. Si aparece algo relevante, lo convertiré en opciones y elegiré una acción.";
      }

      case "acknowledge_uncertainty":
        return "Está bien. Entonces por ahora no lo sabemos; lo dejaré como una duda en vez de inventar una respuesta.";

      case "acknowledge": {
        const xs=["Vale.","Entendido.","De acuerdo."];
        return xs[(b.responsePlanner?.history?.length||0)%xs.length];
      }

      case "report_internal_state": {
        const mood=stateMood(b);
        const concern=topic?` Tengo presente «${short(topic,62)}».`:"";
        return `Estoy ${mood}.${concern}`;
      }

      case "social_greeting":
      case "passthrough":
      default:
        return p.sourceReply;
    }
  }

  function stateMood(b){
    if(typeof b.moodLabel==="function")return b.moodLabel();
    return b.cognitiveState?.current?.mental?.mood||"neutral";
  }

  function savePlan(b,p){
    const s=ensurePlanner(b);
    s.lastPlan=p;
    s.history.push(p);
    if(s.history.length>30)s.history.shift();
    if(b.cognitiveState?.current)b.cognitiveState.current.responsePlan={
      act:p.act,content:p.content,uncertainty:p.uncertainty,detail:p.detail,justify:p.justify
    };
    if(Array.isArray(b.lastThoughts))b.lastThoughts.push(`PLAN DE RESPUESTA: acto=${p.act}; detalle=${p.detail}; métricas=${p.exposeMetrics?"sí":"no"}`);
  }

  function formatPlan(p){
    if(!p)return "Todavía no existe un plan de respuesta.";
    return [
      `intención=${p.intent||"—"}`,
      `acto comunicativo=${p.act}`,
      `tema=${p.content.topic||"—"}`,
      `acción=${p.content.action||"—"}`,
      `objetivo=${p.content.goal||"—"}`,
      `detalle=${p.detail}`,
      `justificar=${p.justify?"sí":"no"}`,
      `seguimiento=${p.followUp?"sí":"no"}`,
      `mostrar métricas=${p.exposeMetrics?"sí":"no"}`,
      `repetición=${p.repetition}`,
      `dudas=${p.uncertainty.join(" | ")||"—"}`,
      `\nSALIDA\n${p.text||"(silencio)"}`
    ].join("\n");
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){oldReset.call(this);this.responsePlanner=null;ensurePlanner(this);};

  // Árbitro final del lenguaje simbólico. Las capas inferiores siguen pensando y
  // actualizando memoria, pero no publican directamente una frase al usuario.
  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    ensurePlanner(this);
    const actualSay=this.say;
    this.say=function(x){return x;};
    let lower;
    try{lower=oldHear.call(this,text);}catch(err){this.say=actualSay;throw err;}

    const finish=lowerReply=>{
      this.say=actualSay;
      const plan=buildPlan(this,text,lowerReply);
      const finalText=verbalize(this,plan);
      plan.text=finalText||null;
      savePlan(this,plan);
      return finalText?actualSay.call(this,finalText):null;
    };

    if(lower&&typeof lower.then==="function")return lower.then(finish,err=>{this.say=actualSay;throw err;});
    return finish(lower);
  };

  const oldCommand=command;
  command=function(raw){
    const head=(raw.trim().split(/\s+/)[0]||"").toLowerCase();
    if(head!=="/plan"&&head!=="/responseplan")return oldCommand(raw);
    print("debug","PLAN>",formatPlan(ensurePlanner(brain).lastPlan));
  };

  ensurePlanner(brain);
  window.NpcIntResponsePlanner={buildPlan,verbalize,formatPlan};
  print("system","","planificador de respuesta v0.1 cargado · pensamiento separado de lenguaje · salida sin métricas internas");
})();
