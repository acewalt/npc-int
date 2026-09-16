"use strict";

(function(){
  const CNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const cleanEntity=s=>(s||"").trim().replace(/^(el|la|los|las|un|una|unos|unas|mi|mis|tu|tus)\s+/i,"").replace(/[.!?]+$/g,"").trim();

  function ensureCognition(b){
    if(b.cognition)return;
    b.cognition={facts:[],rules:[],lastEntity:null,unresolved:[],seq:1,loaded:false};
  }

  function addFact(b,subject,predicate,object,confidence=.72,source="conversation",derived=false){
    ensureCognition(b);
    subject=cleanEntity(subject); object=cleanEntity(object);
    if(!subject||!predicate||!object)return null;
    const ns=CNorm(subject), no=CNorm(object);
    const same=b.cognition.facts.find(f=>CNorm(f.subject)===ns&&f.predicate===predicate&&CNorm(f.object)===no);
    if(same){same.confidence=Math.max(same.confidence,confidence);return same;}

    // Estados mutuamente diferentes sobre la misma entidad se conservan como conflicto,
    // en vez de borrar silenciosamente una observación anterior.
    if(predicate==="estado"){
      for(const f of b.cognition.facts){
        if(CNorm(f.subject)===ns&&f.predicate==="estado"&&CNorm(f.object)!==no&&f.active!==false){
          f.conflict=true;
        }
      }
    }

    const fact={id:b.cognition.seq++,subject,predicate,object,confidence,source,derived,active:true,time:b.time};
    b.cognition.facts.push(fact);
    if(b.cognition.facts.length>500)b.cognition.facts.shift();
    b.cognition.lastEntity=subject;
    return fact;
  }

  function extractFacts(b,text){
    const out=[];
    const raw=(text||"").trim();
    if(!raw||/[?¿]$/.test(raw))return out;

    let m;
    if((m=raw.match(/^tengo\s+(.+)$/i)))out.push(addFact(b,b.relation?.name||"Jugador","tiene",m[1],.82));
    if((m=raw.match(/^(.+?)\s+(?:tiene|tienen)\s+(.+)$/i)))out.push(addFact(b,m[1],"tiene",m[2],.78));
    if((m=raw.match(/^(.+?)\s+(?:está|esta|están|estan)\s+(.+)$/i)))out.push(addFact(b,m[1],"estado",m[2],.80));
    if((m=raw.match(/^(.+?)\s+(?:es|son)\s+(.+)$/i)))out.push(addFact(b,m[1],"es",m[2],.74));
    if((m=raw.match(/^(.+?)\s+(?:necesita|necesitan)\s+(.+)$/i)))out.push(addFact(b,m[1],"necesita",m[2],.78));
    if((m=raw.match(/^(.+?)\s+(?:abre|abren)\s+(.+)$/i)))out.push(addFact(b,m[1],"sirve_para",`abrir ${m[2]}`,.80));
    if((m=raw.match(/^(.+?)\s+(?:causa|provoca|produce)\s+(.+)$/i)))out.push(addFact(b,m[1],"puede_causar",m[2],.72));

    return out.filter(Boolean);
  }

  function infer(b){
    ensureCognition(b);
    const facts=b.cognition.facts;
    let added=0;

    // Herencia simple: A es B, B es C => A es C.
    const isa=facts.filter(f=>f.active!==false&&(f.predicate==="es_un"||f.predicate==="es"));
    for(const a of isa){
      for(const c of isa){
        if(CNorm(a.object)!==CNorm(c.subject))continue;
        if(CNorm(a.subject)===CNorm(c.object))continue;
        const x=addFact(b,a.subject,"es_un",c.object,Math.min(a.confidence,c.confidence)*.92,"inferencia",true);
        if(x&&x.derived&&x.time===b.time)added++;
      }
    }

    // Inferencia instrumental muy pequeña: alguien tiene una llave + puerta cerrada.
    const hasKey=facts.find(f=>f.active!==false&&f.predicate==="tiene"&&/llave/i.test(f.object));
    const closedDoor=facts.find(f=>f.active!==false&&f.predicate==="estado"&&/puerta/i.test(f.subject)&&/cerrad/i.test(f.object));
    if(hasKey&&closedDoor){
      addFact(b,"situación","opcion",`usar ${hasKey.object} para intentar abrir ${closedDoor.subject}`,.68,"inferencia",true);
    }

    return added;
  }

  function factsAbout(b,topic){
    const n=CNorm(topic);
    if(!n)return [];
    return b.cognition.facts
      .filter(f=>f.active!==false&&(CNorm(f.subject).includes(n)||CNorm(f.object).includes(n)||n.includes(CNorm(f.subject))))
      .sort((a,c)=>c.confidence-a.confidence||c.id-a.id);
  }

  function planFromState(b){
    const fs=b.cognition.facts.filter(f=>f.active!==false);
    const explicit=fs.filter(f=>f.predicate==="opcion").slice(-3);
    if(explicit.length)return explicit.map(f=>({text:f.object,confidence:f.confidence,why:"inferencia desde hechos actuales"}));

    const door=fs.find(f=>f.predicate==="estado"&&/puerta/i.test(f.subject)&&/cerrad/i.test(f.object));
    if(door){
      const key=fs.find(f=>f.predicate==="tiene"&&/llave/i.test(f.object));
      if(key)return [{text:`probar ${key.object} en ${door.subject}`,confidence:.72,why:"hay una puerta cerrada y una llave disponible"}];
      return [
        {text:`examinar ${door.subject}`,confidence:.70,why:"sé que está cerrada pero no conozco la causa"},
        {text:"buscar una llave o mecanismo de apertura",confidence:.58,why:"una puerta cerrada puede requerir un medio de apertura"},
        {text:"preguntar a alguien que conozca el lugar",confidence:.52,why:"falta información sobre la puerta"}
      ];
    }

    const threat=fs.find(f=>/fuego|arma|peligro/i.test(f.subject+" "+f.object));
    if(threat)return [{text:"priorizar seguridad y observar la fuente del riesgo",confidence:.82,why:`hay un hecho relacionado con ${threat.subject}`}];
    return [];
  }

  function answerCognitiveQuery(b,text){
    ensureCognition(b);
    const n=CNorm(text);
    let topic=null;
    let m;

    if((m=n.match(/^(?:que sabes de|que sabes sobre|que recuerdas sobre)\s+(.+)$/)))topic=m[1];
    if(topic){
      if(topic==="eso"&&b.cognition.lastEntity)topic=b.cognition.lastEntity;
      const fs=factsAbout(b,topic).slice(0,5);
      if(!fs.length)return null;
      const body=fs.map(f=>`${f.subject} ${f.predicate.replaceAll("_"," ")} ${f.object}${f.conflict?" [hay información conflictiva]":""}`).join("; ");
      return b.say(`Sobre ${topic}, tengo estas relaciones: ${body}.`);
    }

    if(/^(que harias|que piensas hacer|que vas a hacer|que puedo hacer|que hacemos|y ahora que)\b/.test(n)){
      infer(b);
      const options=planFromState(b);
      if(!options.length)return null;
      const best=options[0];
      const alternatives=options.slice(1).map(x=>x.text);
      const tail=alternatives.length?` También considero: ${alternatives.join("; ")}.`:"";
      return b.say(`Con lo que sé ahora, mi opción con más soporte es ${best.text}, porque ${best.why}.${tail}`);
    }

    if((m=n.match(/^(.+?)\s+es\s+(.+)\?*$/))&&/[?¿]/.test(text)){
      const subject=cleanEntity(m[1]), object=cleanEntity(m[2]);
      infer(b);
      const f=b.cognition.facts.find(x=>x.active!==false&&CNorm(x.subject)===CNorm(subject)&&(x.predicate==="es"||x.predicate==="es_un")&&CNorm(x.object)===CNorm(object));
      if(f)return b.say(`Con mis hechos actuales, sí: relaciono ${subject} con ${object}. Mi confianza es ${Math.round(f.confidence*100)}%.`);
    }

    return null;
  }

  async function loadCommonsense(b){
    ensureCognition(b);
    try{
      const data=await fetch("knowledge/commonsense.es.json",{cache:"no-cache"}).then(r=>r.json());
      for(const r of data.relations||[])addFact(b,r.subject,r.predicate,r.object,r.confidence??.7,"commonsense",false);
      b.cognition.loaded=true;
      print("system","",`razonamiento v0.1 cargado · ${data.relations?.length||0} relaciones base · hechos + inferencia + opciones`);
    }catch(err){
      console.warn("commonsense load failed",err);
      print("error","COGNITION>","no pude cargar relaciones de sentido común; continuaré con hechos aprendidos en conversación");
    }
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){
    oldReset.call(this);
    ensureCognition(this);
    loadCommonsense(this);
  };

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    ensureCognition(this);
    const q=(text||"").trim();

    const cognitiveAnswer=answerCognitiveQuery(this,q);
    if(cognitiveAnswer){
      this.remember("dialogue",`${this.relation.name}: ${q}`,.60);
      this.thoughts(`${this.relation.name} formuló una consulta sobre hechos/acciones: «${short(q,100)}»`);
      this.lastThoughts.splice(1,0,"COGNICIÓN: respuesta construida desde relaciones e inferencias internas");
      return cognitiveAnswer;
    }

    const extracted=extractFacts(this,q);
    if(extracted.length)infer(this);
    const result=oldHear.call(this,text);

    if(extracted.length){
      const summary=extracted.map(f=>`${f.subject} ${f.predicate.replaceAll("_"," ")} ${f.object}`).join("; ");
      if(this.lastThoughts)this.lastThoughts.splice(2,0,`HECHOS: ${summary}`);

      if(typeof result==="string" && /^(Entiendo\.|Vale, lo tengo en cuenta\.|Te sigo\.|Queda en el contexto|Eso cambia un poco|Lo tengo\.)/i.test(result)){
        return this.say(`Entiendo. Lo convertí en un hecho utilizable: ${summary}.`);
      }
    }
    return result;
  };

  const oldCommand=command;
  command=function(raw){
    const [head,...rest]=raw.trim().split(/\s+/);
    const h=head.toLowerCase();
    const arg=rest.join(" ");
    if(h==="/beliefs"||h==="/facts"){
      ensureCognition(brain);
      const fs=(arg?factsAbout(brain,arg):brain.cognition.facts.slice(-20)).slice(-20);
      print("debug","FACTS>",fs.length?fs.map(f=>`#${f.id} ${f.subject} --${f.predicate}--> ${f.object} | ${Math.round(f.confidence*100)}% | ${f.source}${f.derived?" | inferido":""}${f.conflict?" | CONFLICTO":""}`).join("\n"):"No hay hechos para mostrar.");
      return;
    }
    if(h==="/infer"){
      const n=infer(brain);
      const options=planFromState(brain);
      print("debug","INFER>",`inferencias nuevas=${n}\nopciones=${options.length?options.map(x=>`${x.text} (${Math.round(x.confidence*100)}%)`).join(" | "):"ninguna"}`);
      return;
    }
    return oldCommand(raw);
  };

  ensureCognition(brain);
  loadCommonsense(brain);
})();
