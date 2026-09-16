"use strict";

(function(){
  const SNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();

  const FIXED={
    ahces:"haces", ahce:"hace", ahcer:"hacer", aser:"hacer",
    pudes:"puedes", peudes:"puedes", comerme:"comer"
  };

  function ensureSelf(b){
    if(b.selfModel)return b.selfModel;
    b.selfModel={startedAt:b.time||0,lastIntent:null,lastActionAsked:null,queries:0};
    return b.selfModel;
  }

  function canonical(text){
    const words=SNorm(text).split(" ").filter(Boolean);
    const repaired=[];
    const out=words.map(w=>{
      const r=FIXED[w]||w;
      if(r!==w)repaired.push(`${w}→${r}`);
      return r;
    });
    return {text:out.join(" "),repaired};
  }

  function classify(text){
    const c=canonical(text);
    const n=c.text;
    let intent=null, action=null;

    if(/^(que haces|que estas haciendo|que haces ahora|en que andas|que andas haciendo)$/.test(n)){
      intent="ask_current_activity";
    }else if(/^(que recuerdas de tu vida|que recuerdas de tu pasado|que has vivido|que cosas has vivido|cuales son tus recuerdos|que experiencias recuerdas)$/.test(n)){
      intent="ask_autobiography";
    }else{
      const m=n.match(/^(?:tu )?(?:puedes|podrias|sabes) (comer|caminar|correr|dormir|descansar|atacar|defenderte|ver|oir|escuchar|hablar|pensar)$/);
      if(m){intent="ask_embodied_capability";action=m[1];}
    }

    return {raw:text,canonical:n,repaired:c.repaired,intent,action};
  }

  function dominantGoal(b){
    const g=b.mind?.lastCycle?.goals?.[0];
    if(g)return {label:g.label,priority:g.priority||0};
    const d=typeof b.dominant==="function"?b.dominant():null;
    return d?{label:typeof b.goalFor==="function"?b.goalFor(d):d,priority:b.drives?.[d]||0}:null;
  }

  function currentDecision(b){
    return b.mind?.lastCycle?.decision||null;
  }

  function answerActivity(b){
    const g=dominantGoal(b);
    const d=currentDecision(b);
    const parts=["Ahora mismo estoy conversando contigo, interpretando lo que dices y actualizando mi estado interno."];
    if(g)parts.push(`Mi objetivo más activo es ${g.label}${g.priority?` (${Math.round(g.priority*100)}%)`:""}.`);
    if(d)parts.push(`La última acción que evalué como mejor fue ${d.label}${d.score!==undefined?` (${Math.round(d.score*100)}% de utilidad)`:""}.`);
    return parts.join(" ");
  }

  function answerCapability(b,action){
    const hunger=b.mind?.needs?.hunger;
    const energy=b.mind?.needs?.energy;
    const base={
      comer:"En esta demo puedo representar hambre y decidir «comer» cuando percibo comida, pero no tengo un cuerpo ni un inventario real. En Unity, esa decisión sí puede conectarse a un objeto de comida y ejecutar la acción.",
      caminar:"En la Page no tengo un cuerpo que pueda desplazarse. Sí puedo decidir acciones como alejarme, investigar o explorar; en Unity esas decisiones pueden conectarse a NavMesh para caminar de verdad dentro del juego.",
      correr:"Puedo representar la intención de moverme con urgencia, pero la Page no tiene locomoción física. En Unity habría que conectar esa decisión al sistema de movimiento y animación.",
      dormir:"Puedo tener energía baja y seleccionar descanso como acción. «Dormir» físicamente requerirá que Unity implemente cama, animación, tiempo y recuperación.",
      descansar:`Sí como acción interna: puedo decidir descansar y recuperar energía simulada${typeof energy==="number"?` (ahora está en ${Math.round(energy*100)}%)`:""}.`,
      atacar:"Puedo considerar atacar como una opción cuando existe una amenaza, comparando riesgo, coste e identidad. La Page no ejecuta combate; Unity tendrá que validar y realizar esa acción.",
      defenderte:"Puedo seleccionar defenderme ante una amenaza. La ejecución física dependerá del sistema de combate de Unity.",
      ver:"No veo el mundo real. Percibo únicamente lo que la aplicación me entrega como eventos, texto o datos del juego. En Unity podremos conectarme a sensores virtuales como visión por distancia, raycasts y objetos visibles.",
      oir:"No oigo sonido real en esta demo. Puedo recibir eventos auditivos simulados; Unity podría enviarme sonidos detectados dentro del mundo.",
      escuchar:"No oigo sonido real en esta demo. Puedo recibir eventos auditivos simulados; Unity podría enviarme sonidos detectados dentro del mundo.",
      hablar:"Sí. Ahora mismo mi forma de hablar es texto; Nanochat puede encargarse de la redacción neuronal y después podemos conectar TTS para voz.",
      pensar:"Puedo ejecutar un ciclo mental simulado: percepción, estado, memoria, objetivos, opciones, consecuencias y decisión. Eso no equivale a conciencia humana, pero sí produce estado y decisiones persistentes.",
    };
    let out=base[action]||`Puedo representar «${action}» como intención, pero necesito un sistema externo para ejecutarlo físicamente.`;
    if(action==="comer"&&typeof hunger==="number")out+=` Mi hambre simulada actual está en ${Math.round(hunger*100)}%.`;
    return out;
  }

  function isTrivialDialogue(text){
    const s=SNorm(String(text||"").split(":").slice(1).join(":")||text);
    return /^(hola|holi|buenas|hey|ey|que onda|que tal|ok|vale|si|no|mm+)$/.test(s) || /^(que haces|que estas haciendo|tu puedes)/.test(s);
  }

  function lifeEpisodes(b){
    const allowed=new Set(["world","fact","context","social","learned"]);
    const items=[];
    const seen=new Set();
    for(const m of b.mem||[]){
      const meaningful=allowed.has(m.type) || (m.type==="dialogue" && (m.salience||0)>=.78 && !isTrivialDialogue(m.text));
      if(!meaningful)continue;
      const key=SNorm(m.text);
      if(!key||seen.has(key))continue;
      seen.add(key);
      items.push(m);
    }
    return items.slice(-5);
  }

  function answerAutobiography(b){
    const episodes=lifeEpisodes(b);
    if(!episodes.length){
      return "Mi vida simulada todavía es corta. Sé quién soy y que estoy conversando contigo, pero todavía no me ha ocurrido ningún evento suficientemente significativo como para llamarlo un recuerdo autobiográfico. Los saludos y preguntas normales quedan en el historial, no los considero experiencias de vida importantes.";
    }
    const rendered=episodes.map(m=>{
      const labels={world:"evento del mundo",fact:"hecho aprendido",context:"contexto importante",social:"experiencia social",learned:"aprendizaje"};
      return `${labels[m.type]||m.type}: ${m.text}`;
    });
    return `De mi experiencia en esta sesión recuerdo ${episodes.length===1?"esto":"principalmente estas cosas"}: ${rendered.join(" | ")}. Mi memoria autobiográfica es la de esta simulación; si recargas y no hay persistencia guardada, no debo fingir que viví sesiones que ya no recuerdo.`;
  }

  function noteTurn(b,frame,answer){
    ensureSelf(b);
    b.selfModel.queries++;
    b.selfModel.lastIntent=frame.intent;
    b.selfModel.lastActionAsked=frame.action||null;
    b.silence=0;
    if(b.dialogue){
      b.dialogue.turn=(b.dialogue.turn||0)+1;
      b.dialogue.previousIntent=b.dialogue.lastIntent||"none";
      b.dialogue.lastIntent=frame.intent;
      b.dialogue.lastUser=frame.raw;
    }
    if(typeof b.remember==="function")b.remember("dialogue",`${b.relation?.name||"Jugador"}: ${frame.raw}`,.5);
    if(Array.isArray(b.lastThoughts)){
      b.lastThoughts.unshift(`MODELO DE SÍ: intención=${frame.intent}; canónico=«${frame.canonical}»${frame.repaired.length?`; reparaciones=${frame.repaired.join(", ")}`:""}`);
      b.lastThoughts.push(`RESPUESTA SOBRE SÍ: ${answer}`);
    }
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){oldReset.call(this);this.selfModel={startedAt:this.time||0,lastIntent:null,lastActionAsked:null,queries:0};};

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const frame=classify((text||"").trim());
    if(!frame.intent)return oldHear.call(this,text);

    let answer=null;
    if(frame.intent==="ask_current_activity")answer=answerActivity(this);
    else if(frame.intent==="ask_embodied_capability")answer=answerCapability(this,frame.action);
    else if(frame.intent==="ask_autobiography")answer=answerAutobiography(this);

    noteTurn(this,frame,answer);
    return this.say(answer);
  };

  const oldCommand=command;
  command=function(raw){
    const head=(raw.trim().split(/\s+/)[0]||"").toLowerCase();
    if(head!=="/self"&&head!=="/life")return oldCommand(raw);
    const s=ensureSelf(brain);
    const g=dominantGoal(brain),d=currentDecision(brain),episodes=lifeEpisodes(brain);
    print("debug","SELF>",[
      `consultas sobre sí=${s.queries}`,
      `última intención=${s.lastIntent||"—"}`,
      `objetivo=${g?g.label:"—"}`,
      `decisión=${d?d.label:"—"}`,
      `hambre=${brain.mind?.needs?.hunger!==undefined?Math.round(brain.mind.needs.hunger*100)+"%":"—"}`,
      `energía=${brain.mind?.needs?.energy!==undefined?Math.round(brain.mind.needs.energy*100)+"%":"—"}`,
      `episodios autobiográficos=${episodes.length}`
    ].join("\n"));
  };

  ensureSelf(brain);
  window.NpcIntSelfModel={canonical,classify,lifeEpisodes};
  print("system","","modelo de sí v0.1 cargado · actividad actual · capacidades corporales · memoria autobiográfica");
})();
