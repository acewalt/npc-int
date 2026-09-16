"use strict";

(function(){
  const MNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ¿?¡! ]+/g," ").replace(/\s+/g," ").trim();
  const MClamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

  function ensureMind(b){
    if(b.mind)return;
    b.mind={
      needs:{hunger:.18,energy:.88,social:.34},
      affect:{fear:b.drives?.amenaza||.04,valence:b.mood?.valence||0,arousal:b.mood?.arousal||.2},
      cognition:{curiosity:b.drives?.curiosidad||.45,certainty:.55,load:.18},
      personality:{caution:.64,aggression:.16,empathy:.66,assertiveness:.48,curiosity:.72},
      identity:{
        self:b.identity?.name||"NIA-01",
        purpose:b.identity?.purpose||"comprender el entorno y actuar con continuidad",
        values:["continuidad","seguridad","curiosidad","coherencia"]
      },
      perceptions:[],
      goals:[],
      options:[],
      lastCycle:null,
      history:[],
      seq:1
    };
  }

  function detect(text){
    const n=MNorm(text);
    const tags=[];
    const has=(...xs)=>xs.some(x=>n.includes(x));
    if(has("peligro","arma","ataque","atacar","matar","fuego","explosion","sangre","amenaza"))tags.push("danger");
    if(has("comida","alimento","pan","carne","fruta","hambre","comer"))tags.push("food");
    if(has("puerta","cerradura","llave"))tags.push("door");
    if(has("oscuro","oscuridad","luz","luces"))tags.push("visibility");
    if(has("ayuda","auxilio","herido","dolor"))tags.push("distress");
    if(has("hola","buenas","hey","que onda"))tags.push("greeting");
    if(/[?¿]/.test(text))tags.push("question");
    if(has("malparido","caremonda","hijueputa","gonorrea","idiota","imbecil","estupido"))tags.push("hostile");
    return tags;
  }

  function perceive(b,type,text,meta={}){
    ensureMind(b);
    const tags=detect(text);
    const threat=meta.threat!==undefined?MClamp(meta.threat):tags.includes("danger")?0.78:tags.includes("hostile")?0.28:0;
    const importance=meta.importance!==undefined?MClamp(meta.importance):Math.max(.25,threat,tags.includes("question")?.55:.35);
    const p={
      id:b.mind.seq++, type, source:meta.source||("user"===type?b.relation?.name||"Jugador":type==="world"?"mundo":"interno"),
      text:text||"", tags, threat, importance, novelty:meta.novelty??.5, time:b.time||0
    };
    b.mind.perceptions.push(p);
    if(b.mind.perceptions.length>40)b.mind.perceptions.shift();
    return p;
  }

  function syncMentalState(b,p,minutes=0){
    ensureMind(b);
    const m=b.mind;
    if(minutes>0){
      m.needs.hunger=MClamp(m.needs.hunger+minutes*.0042);
      m.needs.energy=MClamp(m.needs.energy-minutes*.0028);
      m.needs.social=MClamp((b.drives?.social??m.needs.social));
    }
    if(p){
      m.affect.fear=MClamp(Math.max((b.drives?.amenaza||0),m.affect.fear*.82+p.threat*.72));
      if(p.tags.includes("food")&&m.needs.hunger>.45)m.cognition.load=MClamp(m.cognition.load+.04);
      if(p.tags.includes("hostile"))m.affect.valence=MClamp((b.mood?.valence||0)-.16,-1,1);
    }else{
      m.affect.fear=MClamp(Math.max(b.drives?.amenaza||0,m.affect.fear*.96));
    }
    m.affect.valence=b.mood?.valence??m.affect.valence;
    m.affect.arousal=b.mood?.arousal??m.affect.arousal;
    m.cognition.curiosity=b.drives?.curiosidad??m.cognition.curiosity;
    m.needs.social=b.drives?.social??m.needs.social;
    const fatigue=b.drives?.fatiga;
    if(typeof fatigue==="number")m.needs.energy=MClamp((m.needs.energy*.65)+(1-fatigue)*.35);
  }

  function retrieveContext(b,p){
    const out=[];
    if(typeof b.recall==="function" && p?.text){
      try{
        const r=b.recall(p.text,4)||[];
        for(const x of r)out.push({kind:"memory",text:x.text||String(x),weight:x.salience??.5});
      }catch(_){ }
    }
    if(b.cognition?.facts && p?.text){
      const q=MNorm(p.text);
      const words=q.split(" ").filter(w=>w.length>3);
      for(const f of b.cognition.facts.slice().reverse()){
        const hay=MNorm(`${f.subject} ${f.predicate} ${f.object}`);
        if(words.some(w=>hay.includes(w))){
          out.push({kind:"fact",text:`${f.subject} --${f.predicate}--> ${f.object}`,weight:f.confidence??.6});
          if(out.length>=6)break;
        }
      }
    }
    return out.slice(0,6);
  }

  function buildGoals(b,p){
    const m=b.mind, goals=[];
    const add=(id,label,priority,reason)=>goals.push({id,label,priority:MClamp(priority),reason});
    const fear=m.affect.fear, hunger=m.needs.hunger, energy=m.needs.energy, curiosity=m.cognition.curiosity;

    add("safety","mantenerme seguro",fear*.95+(p?.threat||0)*.65, fear>.45?"miedo/amenaza elevados":"seguridad basal");
    if(hunger>.22)add("food","reducir hambre",hunger,"hambre acumulada");
    if(energy<.78)add("rest","recuperar energía",1-energy,"energía por debajo del máximo");
    if(curiosity>.35)add("understand","reducir incertidumbre",curiosity*(p?.tags.includes("question")?.85:.65),"curiosidad activa");
    if(p?.type==="user")add("social","mantener una interacción coherente",Math.max(.35,m.needs.social*.75),"hay un interlocutor presente");
    if(b.drives?.proposito>.25)add("purpose","actuar de acuerdo con mi propósito",b.drives.proposito*.72,"propósito persistente");
    if((b.relation?.trust??.5)<.35)add("boundaries","proteger la relación y mis límites",.62,"confianza interpersonal baja");

    goals.sort((a,c)=>c.priority-a.priority);
    m.goals=goals;
    return goals;
  }

  const ACTIONS={
    respond:{label:"hablar",cost:.04,risk:.02,info:.10,social:.70,align:{social:.9,understand:.25,purpose:.25,boundaries:.25}},
    ask:{label:"preguntar",cost:.05,risk:.02,info:.85,social:.60,align:{understand:.95,social:.65,purpose:.35}},
    observe:{label:"observar",cost:.04,risk:.05,info:.60,social:.05,align:{understand:.70,safety:.35,purpose:.35}},
    investigate:{label:"investigar",cost:.16,risk:.22,info:.95,social:0,align:{understand:.95,purpose:.70,safety:.10}},
    wait:{label:"esperar",cost:.01,risk:.12,info:.05,social:-.10,align:{rest:.25,safety:.18}},
    rest:{label:"descansar",cost:-.30,risk:.10,info:0,social:-.15,align:{rest:1,purpose:-.10}},
    seek_food:{label:"buscar comida",cost:.18,risk:.10,info:.20,social:0,align:{food:1,purpose:.15}},
    eat:{label:"comer",cost:.02,risk:.02,info:0,social:0,align:{food:1}},
    move_away:{label:"alejarme",cost:.14,risk:.05,info:.05,social:0,align:{safety:.95}},
    defend:{label:"defenderme",cost:.30,risk:.50,info:0,social:-.60,align:{safety:.72}},
    attack:{label:"atacar",cost:.42,risk:.82,info:0,social:-1,align:{safety:.38}},
    set_boundary:{label:"marcar un límite",cost:.05,risk:.05,info:.05,social:.15,align:{boundaries:1,safety:.28}},
    explore:{label:"explorar",cost:.18,risk:.15,info:.78,social:0,align:{understand:.70,purpose:.72}}
  };

  function candidateIds(b,p){
    const ids=[];
    if(p.type==="user"){
      ids.push("respond");
      if(p.tags.includes("question") || b.mind.cognition.curiosity>.62)ids.push("ask");
      if(p.tags.includes("hostile"))ids.push("set_boundary");
      ids.push("wait");
    }else if(p.type==="world"){
      ids.push("observe","investigate","wait");
      if(p.threat>.35)ids.push("move_away","defend");
      if(p.threat>.72)ids.push("attack");
      if(p.tags.includes("food")&&b.mind.needs.hunger>.35)ids.push("eat");
    }else{
      ids.push("wait","observe");
      if(b.mind.needs.energy<.55)ids.push("rest");
      if(b.mind.needs.hunger>.58)ids.push("seek_food");
      if(b.mind.cognition.curiosity>.68)ids.push("explore");
    }
    return [...new Set(ids)];
  }

  function scoreOption(b,p,goals,id){
    const spec=ACTIONS[id];
    const pers=b.mind.personality;
    let goalScore=0;
    const contributions=[];
    for(const g of goals){
      const a=spec.align[g.id]||0;
      const c=g.priority*a;
      goalScore+=c;
      if(Math.abs(c)>.08)contributions.push(`${g.id}:${c.toFixed(2)}`);
    }

    let risk=spec.risk;
    if(id==="attack" && p.threat<.7)risk+=.35;
    if(id==="wait" && p.threat>.55)risk+=.45;
    if(id==="investigate")risk+=p.threat*.25;
    const riskPenalty=risk*(.45+pers.caution*.55);

    const lowEnergy=1-b.mind.needs.energy;
    const costPenalty=Math.max(0,spec.cost)*(.22+lowEnergy*.80);
    const recoveryBonus=spec.cost<0?(-spec.cost)*(1+lowEnergy):0;
    const infoBonus=spec.info*b.mind.cognition.curiosity*.45;
    const socialBonus=spec.social*(b.relation?.trust??.5)*.16;

    let identityPenalty=0;
    const conflicts=[];
    if(id==="attack"){
      identityPenalty=(1-pers.aggression)*.38 + (p.threat<.75?.22:0);
      conflicts.push("atacar puede reducir una amenaza, pero aumenta mucho el riesgo y entra en tensión con seguridad/coherencia");
    }
    if(id==="investigate"&&p.threat>.55)conflicts.push("investigar aporta información, pero expone al NPC al peligro");
    if(id==="rest"&&p.threat>.35)conflicts.push("descansar recupera energía, pero ignora una posible amenaza");
    if(id==="set_boundary")conflicts.push("marcar un límite protege la relación, aunque puede reducir cooperación inmediata");

    const raw=.18+goalScore+infoBonus+socialBonus+recoveryBonus-riskPenalty-costPenalty-identityPenalty;
    const score=MClamp(raw/1.65);
    const consequences=[];
    if(spec.info>.5)consequences.push(`+ información ${Math.round(spec.info*100)}%`);
    if(spec.cost>0)consequences.push(`- energía ${Math.round(spec.cost*100)}%`);
    if(spec.cost<0)consequences.push(`+ energía ${Math.round(-spec.cost*100)}%`);
    if(risk>.15)consequences.push(`riesgo ${Math.round(MClamp(risk)*100)}%`);
    if(spec.social>.25)consequences.push("+ continuidad social");
    if(spec.social<-.25)consequences.push("- relación social");

    return {id,label:spec.label,score,risk:MClamp(risk),cost:spec.cost,consequences,conflicts,contributions};
  }

  function runCycle(b,p,meta={}){
    ensureMind(b);
    syncMentalState(b,p,meta.minutes||0);
    const context=retrieveContext(b,p);
    const goals=buildGoals(b,p);
    const options=candidateIds(b,p).map(id=>scoreOption(b,p,goals,id)).sort((a,c)=>c.score-a.score);
    const decision=options[0]||{id:"wait",label:"esperar",score:.1,consequences:[],conflicts:[]};

    const cycle={
      id:b.mind.seq++,time:b.time||0,perception:p,
      mentalState:{
        hunger:b.mind.needs.hunger,energy:b.mind.needs.energy,fear:b.mind.affect.fear,
        curiosity:b.mind.cognition.curiosity,trust:b.relation?.trust??.5,
        mood:b.mood?.moodLabel?b.mood.moodLabel():b.mood?.Label||"neutral"
      },
      memory:context,
      identity:{name:b.identity?.name||"NIA-01",purpose:b.identity?.purpose||b.mind.identity.purpose,values:b.mind.identity.values.slice()},
      goals:goals.slice(0,6),options,decision,
      execution:{kind:decision.id,target:meta.target||null,status:"selected"}
    };
    b.mind.options=options;
    b.mind.lastCycle=cycle;
    b.mind.history.push(cycle);
    if(b.mind.history.length>30)b.mind.history.shift();

    if(Array.isArray(b.lastThoughts)){
      b.lastThoughts.push(`CICLO: objetivo=${goals[0]?.label||"ninguno"}; decisión=${decision.label}; utilidad=${decision.score.toFixed(2)}`);
    }
    return cycle;
  }

  function applyExecutionEffects(b,cycle){
    if(!cycle?.decision)return;
    const id=cycle.decision.id;
    if(id==="eat")b.mind.needs.hunger=MClamp(b.mind.needs.hunger-.42);
    if(id==="rest")b.mind.needs.energy=MClamp(b.mind.needs.energy+.30);
    if(["investigate","explore","move_away","defend","attack","seek_food"].includes(id))
      b.mind.needs.energy=MClamp(b.mind.needs.energy-Math.max(0,ACTIONS[id]?.cost||0)*.22);
    cycle.execution.status="simulated";
  }

  function formatCycle(c){
    if(!c)return "Todavía no existe un ciclo mental.";
    const s=c.mentalState;
    const topGoals=c.goals.slice(0,4).map(g=>`${g.label}=${Math.round(g.priority*100)}%`).join(" | ");
    const opts=c.options.slice(0,6).map((o,i)=>`${i+1}. ${o.label} ${Math.round(o.score*100)}%${o.conflicts.length?" ⚠":""}`).join("\n");
    const cons=(c.decision.consequences||[]).join(", ")||"sin consecuencias fuertes estimadas";
    const conf=(c.decision.conflicts||[]).join(" | ")||"ninguno relevante";
    const mem=c.memory.slice(0,3).map(x=>x.text).join(" | ")||"sin recuerdo relevante";
    return `PERCEPCIÓN\n${c.perception.type}: ${c.perception.text||"(paso del tiempo)"}\n`+
      `\nESTADO MENTAL\nhambre=${Math.round(s.hunger*100)}% miedo=${Math.round(s.fear*100)}% curiosidad=${Math.round(s.curiosity*100)}% confianza=${Math.round(s.trust*100)}% energía=${Math.round(s.energy*100)}%\n`+
      `\nMEMORIA\n${mem}\n`+
      `\nIDENTIDAD\n${c.identity.name} · propósito=${c.identity.purpose}\nvalores=${c.identity.values.join(", ")}\n`+
      `\nOBJETIVOS\n${topGoals||"ninguno"}\n`+
      `\nRAZONAMIENTO / OPCIONES\n${opts}\n`+
      `\nDECISIÓN\n${c.decision.label} · utilidad=${Math.round(c.decision.score*100)}%\nconsecuencias=${cons}\nconflictos=${conf}\n`+
      `\nACCIÓN\n${c.execution.kind} · ${c.execution.status}`;
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){
    oldReset.call(this);
    ensureMind(this);
  };

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    ensureMind(this);
    const p=perceive(this,"user",text,{source:this.relation?.name||"Jugador"});
    const result=oldHear.call(this,text);
    const finish=answer=>{
      const cycle=runCycle(this,p,{surfaceReply:answer});
      applyExecutionEffects(this,cycle);
      return answer;
    };
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  const oldEvent=NpcBrain.prototype.event;
  NpcBrain.prototype.event=function(text){
    ensureMind(this);
    const p=perceive(this,"world",text,{source:"mundo"});
    const result=oldEvent.call(this,text);
    const cycle=runCycle(this,p,{});
    applyExecutionEffects(this,cycle);
    return result;
  };

  const oldTick=NpcBrain.prototype.tick;
  NpcBrain.prototype.tick=function(minutes=1){
    ensureMind(this);
    const p=perceive(this,"time","Pasó tiempo sin un estímulo externo.",{source:"interno",importance:.15,novelty:.02});
    syncMentalState(this,p,Math.max(0,minutes||0));
    const result=oldTick.call(this,minutes);
    const cycle=runCycle(this,p,{minutes:0});
    applyExecutionEffects(this,cycle);
    return result;
  };

  const oldCommand=command;
  command=function(raw){
    const parts=raw.trim().split(/\s+/);
    const h=(parts.shift()||"").toLowerCase();
    const arg=parts.join(" ");
    ensureMind(brain);

    if(h==="/mind"||h==="/cycle"){
      print("debug","MIND>",formatCycle(brain.mind.lastCycle));
      return;
    }
    if(h==="/needs"){
      const m=brain.mind;
      print("debug","NEEDS>",`hambre=${Math.round(m.needs.hunger*100)}% | energía=${Math.round(m.needs.energy*100)}% | miedo=${Math.round(m.affect.fear*100)}% | curiosidad=${Math.round(m.cognition.curiosity*100)}% | confianza=${Math.round((brain.relation?.trust??.5)*100)}%`);
      return;
    }
    if(h==="/goals"){
      const gs=brain.mind.lastCycle?.goals||buildGoals(brain,{type:"time",tags:[],threat:0});
      print("debug","GOALS>",gs.map((g,i)=>`${i+1}. ${g.label} ${Math.round(g.priority*100)}% · ${g.reason}`).join("\n"));
      return;
    }
    if(h==="/options"||h==="/actions"){
      const os=brain.mind.lastCycle?.options||[];
      print("debug","OPTIONS>",os.length?os.map((o,i)=>`${i+1}. ${o.label} ${Math.round(o.score*100)}% | riesgo=${Math.round(o.risk*100)}% | ${o.consequences.join(", ")||"sin consecuencias fuertes"}${o.conflicts.length?`\n   conflicto: ${o.conflicts.join(" | ")}`:""}`).join("\n"):"Aún no hay opciones calculadas.");
      return;
    }
    if(h==="/need"){
      const [name,valRaw]=arg.split(/\s+/);
      const val=Number(valRaw);
      if(!name||!Number.isFinite(val)){print("error","ERROR>","Uso: /need hunger 0.8  |  /need energy 0.3");return;}
      const map={hunger:"hunger",hambre:"hunger",energy:"energy",energia:"energy"};
      const key=map[MNorm(name)];
      if(!key){print("error","ERROR>","Necesidades editables: hunger/hambre, energy/energia");return;}
      brain.mind.needs[key]=MClamp(val);
      print("debug","NEEDS>",`${key}=${brain.mind.needs[key].toFixed(2)}`);
      return;
    }
    if(h==="/help"){
      oldCommand(raw);
      print("system","","mente: /mind · /needs · /goals · /options · /need hunger 0.8");
      return;
    }
    return oldCommand(raw);
  };

  ensureMind(brain);
  print("system","","ciclo mental v0.1 cargado · percepción → estado → memoria/identidad/objetivos → opciones/consecuencias → decisión → acción");
})();
