"use strict";

(function(){
  const CNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const CClamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

  function ensureState(b){
    if(b.cognitiveState)return b.cognitiveState;
    b.cognitiveState={
      current:null,
      workingMemory:[],
      beliefs:[],
      unresolved:[],
      history:[],
      seq:1
    };
    return b.cognitiveState;
  }

  function meaningfulTopic(b,input=""){
    const inputN=CNorm(input);
    const trivial=/^(hola|buenas|hey|ey|vale|ok|okay|si|no|mm+|aja)$/;
    if(inputN && !trivial.test(inputN) && inputN.length>2)return input;
    const d=b.discourse;
    if(d?.focus?.length){
      const item=[...d.focus].reverse().find(x=>{
        const n=CNorm(x.text);
        return n && !trivial.test(n) && !/^jugador hizo una consulta/.test(n);
      });
      if(item)return item.text;
    }
    return b.pragmatics?.meaningfulTopic || b.dialogue?.topic || null;
  }

  function beliefItems(b,topic){
    const out=[];
    const seen=new Set();
    const add=(text,confidence=.6,source="memory",kind="belief")=>{
      const key=CNorm(text);
      if(!key||seen.has(key))return;
      seen.add(key);
      out.push({text,confidence:CClamp(confidence),source,kind});
    };

    const facts=b.cognition?.facts||[];
    const q=CNorm(topic||"");
    const words=q.split(" ").filter(w=>w.length>3);
    for(const f of [...facts].reverse()){
      const text=`${f.subject} ${f.predicate} ${f.object}`;
      const n=CNorm(text);
      if(!words.length||words.some(w=>n.includes(w)))add(text,f.confidence??.72,f.source||"reasoning","fact");
      if(out.length>=5)break;
    }

    for(const m of [...(b.mem||[])].reverse()){
      if(!["world","fact","knowledge","learned","social"].includes(m.type))continue;
      const n=CNorm(m.text);
      if(words.length && !words.some(w=>n.includes(w)) && out.length>=2)continue;
      add(m.text,m.salience??.55,m.type,m.type==="world"?"perception":"memory");
      if(out.length>=7)break;
    }
    return out.slice(0,7);
  }

  function pickAction(b){
    const cycle=b.mind?.lastCycle;
    if(!cycle)return null;
    const physical=new Set(["observe","investigate","explore","rest","eat","seek_food","move_away","defend","attack","set_boundary"]);
    const d=cycle.decision;
    if(d&&physical.has(d.id))return {...d,source:"decision"};
    const alt=(cycle.options||[]).find(o=>physical.has(o.id)&&(o.score??0)>.15);
    return alt?{...alt,source:"option"}:null;
  }

  function unresolvedItems(b,topic,beliefs){
    const out=[];
    const lastUser=CNorm(b.dialogue?.lastUser||"");
    if(/^(no se|no lo se|ni idea|no tengo idea)$/.test(lastUser))out.push("el interlocutor expresó incertidumbre");
    if(topic && beliefs.length===0)out.push(`no tengo conocimiento suficiente sobre «${short(topic,70)}»`);
    const cycle=b.mind?.lastCycle;
    if(cycle?.decision?.id==="ask")out.push("falta una pieza de información antes de actuar");
    if(![...(b.mem||[])].some(m=>m.type==="world"))out.push("no hay un evento concreto del mundo activo");
    return [...new Set(out)].slice(0,4);
  }

  function buildWorkingMemory(b,input,topic,beliefs,goal,action,unresolved){
    const items=[];
    const add=(kind,text,weight=.5)=>{if(text)items.push({kind,text,weight});};
    add("input",input,.95);
    add("topic",topic,.85);
    for(const x of beliefs.slice(0,3))add(x.kind,x.text,x.confidence);
    if(goal)add("goal",goal.label,goal.priority??.65);
    if(action)add("action",action.label,action.score??.5);
    for(const u of unresolved.slice(0,2))add("unknown",u,.7);
    return items.slice(0,9);
  }

  function refresh(b,input="",meta={}){
    const store=ensureState(b);
    const cycle=b.mind?.lastCycle||null;
    const topic=meaningfulTopic(b,input);
    const beliefs=beliefItems(b,topic);
    const goal=cycle?.goals?.[0]||null;
    const action=pickAction(b);
    const unresolved=unresolvedItems(b,topic,beliefs);
    const frame=b.understanding?.lastFrame||null;
    const intent=meta.intent || b.dialogueManager?.lastIntent || frame?.intent || b.dialogue?.lastIntent || null;

    const snapshot={
      id:store.seq++,
      time:b.time||0,
      input:input||b.dialogue?.lastUser||"",
      intent,
      topic,
      mental:{
        mood:typeof b.moodLabel==="function"?b.moodLabel():"neutral",
        fear:b.mind?.affect?.fear??b.drives?.amenaza??0,
        curiosity:b.mind?.cognition?.curiosity??b.drives?.curiosidad??0,
        energy:b.mind?.needs?.energy??(1-(b.drives?.fatiga??0)),
        trust:b.relation?.trust??.5
      },
      goal:goal?{id:goal.id,label:goal.label,priority:goal.priority??0,reason:goal.reason||null}:null,
      action:action?{id:action.id,label:action.label,score:action.score??0,risk:action.risk??0,source:action.source}:null,
      beliefs,
      unresolved,
      certainty:CClamp(b.mind?.cognition?.certainty??(unresolved.length?.38:.66)),
      workingMemory:[]
    };
    snapshot.workingMemory=buildWorkingMemory(b,snapshot.input,topic,beliefs,snapshot.goal,snapshot.action,unresolved);

    store.current=snapshot;
    store.workingMemory=snapshot.workingMemory;
    store.beliefs=beliefs;
    store.unresolved=unresolved;
    store.history.push(snapshot);
    if(store.history.length>30)store.history.shift();
    if(Array.isArray(b.lastThoughts)){
      b.lastThoughts.push(`ESTADO COGNITIVO: tema=${topic||"—"}; objetivo=${snapshot.goal?.label||"—"}; acción=${snapshot.action?.label||"—"}; dudas=${unresolved.length}`);
    }
    return snapshot;
  }

  function format(s){
    if(!s)return "Todavía no existe un estado cognitivo.";
    const wm=s.workingMemory.map((x,i)=>`${i+1}. [${x.kind}] ${x.text}`).join("\n")||"—";
    const beliefs=s.beliefs.map((x,i)=>`${i+1}. ${x.text} · conf=${Math.round(x.confidence*100)}% · ${x.source}`).join("\n")||"—";
    return [
      `entrada=${s.input||"—"}`,
      `intención=${s.intent||"—"}`,
      `tema=${s.topic||"—"}`,
      `objetivo=${s.goal?.label||"—"}`,
      `acción candidata=${s.action?.label||"—"}`,
      `certeza=${Math.round(s.certainty*100)}%`,
      `\nWORKING MEMORY\n${wm}`,
      `\nCREENCIAS\n${beliefs}`,
      `\nPENDIENTES\n${s.unresolved.join("\n")||"—"}`
    ].join("\n");
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){oldReset.call(this);this.cognitiveState=null;ensureState(this);};

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    ensureState(this);
    const result=oldHear.call(this,text);
    const finish=answer=>{refresh(this,text);return answer;};
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  const oldEvent=NpcBrain.prototype.event;
  NpcBrain.prototype.event=function(text){
    ensureState(this);
    const result=oldEvent.call(this,text);
    const finish=answer=>{refresh(this,`Evento del mundo: ${text}`,{intent:"world_event"});return answer;};
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  const oldTick=NpcBrain.prototype.tick;
  NpcBrain.prototype.tick=function(minutes=1){
    ensureState(this);
    const result=oldTick.call(this,minutes);
    const finish=answer=>{refresh(this,"Paso del tiempo",{intent:"internal_tick"});return answer;};
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  const oldCommand=command;
  command=function(raw){
    const head=(raw.trim().split(/\s+/)[0]||"").toLowerCase();
    if(head!=="/cognitive"&&head!=="/cog"&&head!=="/working")return oldCommand(raw);
    const s=ensureState(brain).current||refresh(brain,brain.dialogue?.lastUser||"");
    print("debug","COGNITIVE>",format(s));
  };

  ensureState(brain);
  window.NpcIntCognitiveState={refresh,format,meaningfulTopic};
  print("system","","estado cognitivo v0.1 cargado · working memory · creencias · incertidumbre · acción candidata");
})();
