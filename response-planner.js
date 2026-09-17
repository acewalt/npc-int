"use strict";

(function(){
  const RNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();

  function ensurePlanner(b){
    if(b.responsePlanner)return b.responsePlanner;
    b.responsePlanner={lastPlan:null,history:[],seq:1,lastUserWallMs:0};
    return b.responsePlanner;
  }

  function localIntent(text){
    const n=RNorm(text);
    if(/^(hola|buenas|hey|ey|que onda|que tal)$/.test(n))return "greeting";
    if(/^(no se|no lo se|ni idea|no tengo idea)$/.test(n))return "uncertainty";
    if(/^(entonces|y entonces|bueno entonces|pues entonces|y bueno|bueno pues)$/.test(n))return "continue_thread";
    if(/^(?:entonces |bueno |pues |a ver )?(?:habla|responde|explica|explicate|contesta)(?:me)? (?:bien|claro|mejor|mas claro|de forma clara|directo|mas directo)(?: por favor)?$/.test(n))return "request_clearer_speech";
    if(/^(?:pero |entonces |bueno |pues )?(?:por que|porque) (?:dices|respondes|repites|estas diciendo).*(?:lo mismo|siempre|otra vez|repet)/.test(n) || /^(?:por que|porque) repites/.test(n))return "complaint_repetition";
    if(/^(que haces|que estas haciendo|en que andas|que haces ahora)$/.test(n))return "ask_activity";
    if(/^(que estas pensando|que piensas|en que piensas|en que estas pensando|que tienes en mente|que pasa por tu mente|que estas pensando ahora|en que andas pensando)$/.test(n))return "ask_current_thought";
    if(/\bque (?:quieres|preferirias) hacer\b/.test(n) || /\bque te gustaria hacer\b/.test(n))return "ask_desired_action";
    if(/\bque (?:vas a hacer|haras|piensas hacer)\b/.test(n) || /\bcual es tu siguiente accion\b/.test(n))return "ask_future_action";
    if(/^(como estas|como te sientes|que tal estas)$/.test(n))return "ask_state";

    const words=n.split(" ").filter(Boolean);
    const looksQuestion=/^(que|quien|como|cuando|donde|cual|cuanto|por que|porque)\b/.test(n);
    const incompleteTail=/\b(con|para|de|del|a|por|porque|que|y|pero|si|cuando|aunque|sin|sobre)$/.test(n);
    if(n && words.length<=3 && !looksQuestion && !incompleteTail)return "short_statement";
    return null;
  }

  function currentSemantic(b,text){
    if(b.nlp?.lastText===text&&b.nlp?.lastSemantic)return b.nlp.lastSemantic;
    return b.understanding?.lastFrame?.semantic||null;
  }

  function currentQueryFrame(b,text){
    const q=b.queryFrame?.current;
    return q&&RNorm(q.input)===RNorm(text)?q:null;
  }

  function frameFor(b,text){
    let d=null;
    try{d=window.NpcIntDialogueManager?.classify?.(text)||null;}catch(_){ }
    const u=b.understanding?.lastFrame;
    const semantic=currentSemantic(b,text);
    const queryFrame=currentQueryFrame(b,text);
    const local=localIntent(text);
    const strongLocal=["continue_thread","request_clearer_speech","complaint_repetition"].includes(local)?local:null;
    const queryIntent=queryFrame?.intent&&queryFrame.intent!=="unresolved"?queryFrame.intent:null;
    const intent=strongLocal || queryIntent || semantic?.intent || u?.intent || d?.intent || local || null;
    return {
      intent,
      canonical:queryFrame?.canonical || u?.canonical || d?.canonical || RNorm(text),
      source:strongLocal?"pragmatic-local":queryIntent?"query-frame":semantic?.intent?"semantic-nlp":u?.source||d?.intent?"dialogue-fallback":local?"local-structure":"dialogue-fallback",
      repetition:intent&&b.dialogueManager?.lastIntent===intent ? Math.max(1,b.dialogueManager?.sameIntentCount||1) : 1,
      queryFrame
    };
  }

  function stateFor(b,text){
    try{
      const api=window.NpcIntCognitiveState;
      const semantic=currentSemantic(b,text);
      const q=currentQueryFrame(b,text);
      const intent=q?.intent||semantic?.intent||b.understanding?.lastFrame?.intent||b.dialogueManager?.lastIntent||null;
      if(api?.refresh)return api.refresh(b,text,{intent,semantic,queryFrame:q});
    }catch(_){ }
    return b.cognitiveState?.current||null;
  }

  function validWorldTopic(state,input){
    const t=(state?.topic||"").trim();
    if(!t)return null;
    const n=RNorm(t),q=RNorm(input);
    const meta=/^(que quieres hacer(?: .*)?|que vas a hacer(?: .*)?|que haces|que estas haciendo|como estas|que pasa|y ahora|ahora que|por donde empezamos|que te gustaria hacer(?: .*)?|pero que quieres hacer(?: .*)?|que estas pensando|que piensas|en que piensas|en que estas pensando|que tienes en mente|que pasa por tu mente|que estas pensando ahora|en que andas pensando|entonces|y entonces|bueno entonces|pues entonces|entonces habla bien|habla bien|responde bien|habla claro)$/;
    if(n===q||meta.test(n))return null;
    if(/^(hola|buenas|hey|ey|vale|ok|okay|mm+|aja)$/.test(n))return null;
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

  function priorCognitiveState(b,input){
    const current=RNorm(input);
    const history=b.cognitiveState?.history||[];
    for(let i=history.length-1;i>=0;i--){
      const s=history[i];
      if(!s)continue;
      const sinput=RNorm(s.input||"");
      if(!sinput||sinput===current)continue;
      if(["ask_current_thought","greeting","ack","backchannel","continue_thread","request_clearer_speech","complaint_repetition"].includes(s.intent))continue;
      const topic=validWorldTopic(s,input);
      if(topic||s.action||s.goal)return s;
    }
    return null;
  }

  function buildPlan(b,text,lowerReply){
    const frame=frameFor(b,text);
    const state=stateFor(b,text);
    const topic=validWorldTopic(state,text);
    const action=naturalAction(state?.action);
    const goal=state?.goal?.label||null;
    const prior=["ask_current_thought","continue_thread","request_clearer_speech","complaint_repetition","ask_reason"].includes(frame.intent)?priorCognitiveState(b,text):null;
    const thoughtTopic=validWorldTopic(prior,text)||topic;
    const thoughtAction=naturalAction(prior?.action)||action;
    const thoughtGoal=prior?.goal?.label||goal;
    const thoughtUnknown=prior?.unresolved?.[0]||state?.unresolved?.[0]||null;
    const repetition=Math.max(frame.repetition||1,b.dialogueManager?.sameIntentCount||1);
    const plan={
      id:ensurePlanner(b).seq++,
      time:b.time||0,
      input:text,
      intent:frame.intent,
      intentSource:frame.source,
      queryFrameId:frame.queryFrame?.id||null,
      references:(frame.queryFrame?.references||[]).map(x=>({id:x.id,kind:x.kind,mention:x.mention,target:x.target,confidence:x.confidence})),
      evidenceRequest:frame.queryFrame?.evidenceRequest?{stores:frame.queryFrame.evidenceRequest.stores.slice(),reason:frame.queryFrame.evidenceRequest.reason}:null,
      evidence:(frame.queryFrame?.candidateEvidence||[]).slice(0,8).map(x=>({store:x.store,kind:x.kind,score:x.score,source:x.source,proposition:x.proposition||null})),
      act:"passthrough",
      content:{topic,action,goal,thoughtTopic,thoughtAction,thoughtGoal,thoughtUnknown},
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
      case "ask_current_thought":
        plan.act="report_current_thought";
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
      case "continue_thread":
        plan.act="continue_discourse";
        plan.detail="short";
        break;
      case "request_clearer_speech":
        plan.act="acknowledge_repair_request";
        plan.detail="direct";
        break;
      case "complaint_repetition":
        plan.act="explain_repetition";
        plan.detail="direct";
        break;
      case "ask_reason":
        plan.act="explain_previous_response";
        plan.detail="short";
        break;
      case "short_statement":
        plan.act="accept_short_context";
        plan.detail="short";
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
    const {topic,action,goal,thoughtTopic,thoughtAction,thoughtGoal,thoughtUnknown}=p.content;
    const hasWorld=(b.mem||[]).some(m=>m.type==="world");

    switch(p.act){
      case "report_current_activity": {
        const parts=["Ahora mismo estoy hablando contigo y manteniendo actualizado lo que entiendo de la situación."];
        if(topic)parts.push(`También tengo presente «${short(topic,70)}».`);
        else if(!hasWorld)parts.push("No hay ningún evento del entorno que requiera mi atención inmediata.");
        if(action&&hasWorld)parts.push(`Si tengo que actuar, mi siguiente inclinación es ${action}.`);
        return parts.join(" ");
      }

      case "report_current_thought": {
        const parts=[];
        if(thoughtTopic)parts.push(`Ahora mismo tengo en mente «${short(thoughtTopic,76)}».`);
        else parts.push("Ahora mismo estoy pensando en cómo interpretar bien la situación y qué información me falta antes de decidir.");
        if(thoughtGoal)parts.push(`Mi foco mental es ${thoughtGoal}.`);
        if(thoughtAction)parts.push(`La acción que estoy considerando es ${thoughtAction}.`);
        if(thoughtUnknown){
          if(/no hay un evento concreto del mundo activo/i.test(thoughtUnknown))parts.push("Aún no tengo un evento concreto del mundo sobre el que actuar.");
          else parts.push(`Lo que todavía no tengo claro es ${thoughtUnknown}.`);
        }
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

      case "continue_discourse": {
        if(thoughtTopic)return `Sí, sigo el hilo. Mantengo «${short(thoughtTopic,72)}» como el punto activo de la conversación.`;
        if(thoughtGoal)return `Sí, sigo. Mi foco sigue siendo ${thoughtGoal}; todavía no apareció información suficiente para cambiarlo.`;
        return "Sí, sigo el hilo. Continúa; usaré lo anterior como contexto en vez de tratar «entonces» como una frase incompleta.";
      }

      case "acknowledge_repair_request":
        return "Entendido. Voy a responder más directo y a usar el contexto antes de pedirte que completes una frase. Los porcentajes y detalles internos los dejaré para /mind, /cognitive y /plan.";

      case "explain_repetition":
        return "Porque estaba enviando frases distintas al mismo fallback de aclaración. Eso hacía que repitiera la misma respuesta aunque el contexto cambiara. Debo distinguir continuidad, afirmaciones cortas y preguntas reales antes de pedir más contexto.";

      case "explain_previous_response":
        return "La respuesta anterior salió de cómo interpreté tu turno y del contexto que tenía activo. Si esa interpretación no encaja, prefiero reformularla en vez de defenderla con números internos.";

      case "accept_short_context":
        return `Entendido. Tomo «${short(p.input,72)}» como parte del contexto sin inventar una relación que no hayas dicho.`;

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
      act:p.act,content:p.content,uncertainty:p.uncertainty,detail:p.detail,justify:p.justify,queryFrameId:p.queryFrameId
    };
    if(Array.isArray(b.lastThoughts))b.lastThoughts.push(`PLAN DE RESPUESTA: acto=${p.act}; fuente=${p.intentSource||"—"}; frame=${p.queryFrameId||"—"}; detalle=${p.detail}; métricas=${p.exposeMetrics?"sí":"no"}`);
  }

  function formatPlan(p){
    if(!p)return "Todavía no existe un plan de respuesta.";
    return [
      `intención=${p.intent||"—"}`,
      `fuente intención=${p.intentSource||"—"}`,
      `query frame=${p.queryFrameId||"—"}`,
      `acto comunicativo=${p.act}`,
      `tema=${p.content.topic||"—"}`,
      `acción=${p.content.action||"—"}`,
      `objetivo=${p.content.goal||"—"}`,
      `detalle=${p.detail}`,
      `justificar=${p.justify?"sí":"no"}`,
      `seguimiento=${p.followUp?"sí":"no"}`,
      `mostrar métricas=${p.exposeMetrics?"sí":"no"}`,
      `repetición=${p.repetition}`,
      `referencias=${p.references?.length?p.references.map(x=>`${x.kind}→${x.target?.text||"?"}`).join(" | "):"—"}`,
      `evidencia solicitada=${p.evidenceRequest?.stores?.join(" → ")||"—"}`,
      `candidatos evidencia=${p.evidence?.length||0}`,
      `dudas=${p.uncertainty.join(" | ")||"—"}`,
      `\nSALIDA\n${p.text||"(silencio)"}`
    ].join("\n");
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){oldReset.call(this);this.responsePlanner=null;ensurePlanner(this);};

  // Árbitro final del lenguaje simbólico. QueryFrame reúne interpretación,
  // conceptos y referencias; la semántica NLP y los actos pragmáticos locales
  // siguen disponibles como fallback y para reparaciones de diálogo.
  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const planner=ensurePlanner(this);
    planner.lastUserWallMs=Date.now();
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

  // El modo AUTO no debe parecer una segunda respuesta al mismo turno.
  // Durante unos segundos tras hablar el jugador, se silencian pensamientos
  // autónomos no urgentes. Las alertas de riesgo siguen pudiendo aparecer.
  const oldTick=NpcBrain.prototype.tick;
  NpcBrain.prototype.tick=function(minutes=1){
    const planner=ensurePlanner(this);
    const result=oldTick.call(this,minutes);
    const finish=out=>{
      if(!out)return null;
      const wallSince=Date.now()-(planner.lastUserWallMs||0);
      const n=RNorm(out);
      const urgent=/peligro|alerta|amenaza|riesgo|auxilio|ataque/.test(n);
      if(wallSince<12000&&!urgent)return null;
      return out;
    };
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  const oldCommand=command;
  command=function(raw){
    const head=(raw.trim().split(/\s+/)[0]||"").toLowerCase();
    if(head!=="/plan"&&head!=="/responseplan")return oldCommand(raw);
    print("debug","PLAN>",formatPlan(ensurePlanner(brain).lastPlan));
  };

  ensurePlanner(brain);
  window.NpcIntResponsePlanner={buildPlan,verbalize,formatPlan};
  print("system","","planificador de respuesta v0.5 cargado · QueryFrame + pragmática contextual + salida natural");
})();
