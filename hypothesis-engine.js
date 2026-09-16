"use strict";

(function(){
  const HNorm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ_ ]+/g," ").replace(/\s+/g," ").trim();
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

  const EXPECTED={
    persona:["voz","pasos","movimiento"],
    viento:["viento","corriente_aire","movimiento"],
    objeto_caido:["objeto","caida","movimiento"],
    fallo_electrico:["energia","luz","oscuridad"],
    fuego:["humo","alarma","calor"],
    amenaza:["peligro","arma","ataque","auxilio"]
  };

  const TESTS={
    persona:"escuchar si aparecen voces, pasos o nuevos golpes",
    objeto_caido:"observar el suelo y buscar un objeto desplazado o caído",
    caida:"buscar qué objeto pudo haberse movido o caído",
    viento:"observar si hay corriente de aire o movimiento repetido de la puerta",
    fallo_electrico:"comprobar si otras luces o dispositivos también perdieron energía",
    interruptor:"revisar el estado del interruptor antes de asumir un fallo",
    fuego:"buscar humo, calor o una alarma antes de acercarse",
    amenaza:"observar a distancia y buscar señales independientes de peligro",
    herido:"buscar a la persona y comprobar si responde o pide ayuda"
  };

  const CAUSE_PHRASE={
    persona:"una persona podría haber provocado el evento",
    objeto_caido:"un objeto pudo haberse caído o desplazado",
    caida:"algo pudo haberse caído",
    viento:"el viento o una corriente de aire podría explicarlo",
    fallo_electrico:"podría haber un fallo eléctrico",
    interruptor:"alguien pudo accionar un interruptor",
    fuego:"podría haber fuego u otra fuente de calor",
    amenaza:"podría tratarse de una amenaza real",
    herido:"podría haber una persona herida"
  };

  function ensure(b){
    if(b.hypothesisEngine)return b.hypothesisEngine;
    b.hypothesisEngine={current:null,history:[],seq:1};
    return b.hypothesisEngine;
  }

  function activatedSet(activation){
    return new Map((activation?.concepts||[]).map(c=>[c.id,c.score]));
  }

  function observedSet(activation){
    return new Map((activation?.seeds||[]).map(c=>[c.id,c.weight]));
  }

  function relevantEffects(activation){
    const graph=window.NpcIntConceptGraph;
    if(!graph)return [];
    const out=[];
    // Solo conceptos realmente observados pueden actuar como efecto de una
    // explicación causal. Los conceptos alcanzados por propagación son ideas,
    // no nuevas observaciones.
    for(const c of (activation?.concepts||[]).filter(x=>x.seed)){
      const causes=graph.causesOf(c.id)||[];
      if(causes.length)out.push({effect:c,causes});
    }
    return out.sort((a,b)=>b.effect.score-a.effect.score).slice(0,5);
  }

  function evidenceForCause(cause,effect,observed,perception){
    const ev=[];
    if(observed.has(effect.id))ev.push({text:`se observó «${effect.label}»`,weight:observed.get(effect.id),source:"perception"});
    if(observed.has(cause.cause))ev.push({text:`también se observó algo relacionado con «${cause.causeLabel}»`,weight:observed.get(cause.cause),source:"perception"});
    const p=HNorm(perception||"");
    if(cause.cause==="persona"&&/(alguien|persona|voz|pasos)/.test(p))ev.push({text:"el evento menciona una señal compatible con presencia humana",weight:.78,source:"text"});
    if(cause.cause==="viento"&&/(viento|aire|corriente)/.test(p))ev.push({text:"se menciona viento o corriente de aire",weight:.82,source:"text"});
    if(["objeto_caido","caida"].includes(cause.cause)&&/(cayo|cayó|caida|objeto|caja)/.test(p))ev.push({text:"se menciona un objeto o una caída",weight:.82,source:"text"});
    return ev;
  }

  function evidenceAgainstCause(cause,observed){
    const expected=EXPECTED[cause.cause]||[];
    if(!expected.length)return [];
    const present=expected.filter(x=>observed.has(x));
    if(present.length)return [];
    return [{text:`todavía no hay una señal independiente esperable de ${cause.causeLabel}`,weight:.18,source:"missing-corroboration"}];
  }

  function makeHypothesis(store,cause,effect,activation,perception){
    const observed=observedSet(activation);
    const support=evidenceForCause(cause,effect,observed,perception);
    const against=evidenceAgainstCause(cause,observed);
    const supportScore=support.reduce((s,x)=>s+x.weight,0)/Math.max(1,support.length);
    const againstScore=against.reduce((s,x)=>s+x.weight,0);
    const prior=cause.weight*.52;
    const confidence=clamp(.12+prior+supportScore*.28-againstScore*.20,.08,.86);
    const test=TESTS[cause.cause]||`buscar una observación independiente que confirme o descarte ${cause.causeLabel}`;
    return {
      id:store.seq++,
      claim:CAUSE_PHRASE[cause.cause]||`${cause.causeLabel} podría explicar ${effect.label}`,
      cause:{id:cause.cause,label:cause.causeLabel},
      effect:{id:effect.id,label:effect.label},
      confidence,
      status:"unverified",
      evidenceFor:support,
      evidenceAgainst:against,
      test,
      testability:test.startsWith("escuchar")?.88:test.startsWith("observar")?.84:.7,
      source:"concept-graph"
    };
  }

  function genericAlternatives(store,activation){
    const observed=observedSet(activation),out=[];
    const has=x=>observed.has(x);
    if(has("golpe")||has("ruido")||has("sonido")){
      out.push({
        id:store.seq++,claim:"el sonido podría tener una causa física no observada todavía",cause:{id:"causa_desconocida",label:"una causa física desconocida"},
        effect:{id:has("golpe")?"golpe":"sonido",label:has("golpe")?"golpe":"sonido"},confidence:.3,status:"unverified",
        evidenceFor:[{text:"hay un sonido, pero no se observó directamente su causa",weight:.68,source:"perception"}],evidenceAgainst:[],
        test:"repetir la observación desde otra posición y buscar cambios sincronizados con el sonido",testability:.76,source:"abductive-fallback"
      });
    }
    if(has("amenaza")||has("peligro")){
      out.push({
        id:store.seq++,claim:"la señal podría parecer peligrosa sin que exista una amenaza inmediata",cause:{id:"falsa_alarma",label:"una falsa alarma"},
        effect:{id:"peligro",label:"señal de peligro"},confidence:.26,status:"unverified",
        evidenceFor:[{text:"una señal de peligro no demuestra por sí sola una amenaza",weight:.58,source:"reasoning"}],evidenceAgainst:[],
        test:"buscar una segunda señal independiente antes de escalar la respuesta",testability:.86,source:"critical-alternative"
      });
    }
    return out;
  }

  function dedupe(list){
    const seen=new Map();
    for(const h of list){
      const key=`${h.cause.id}|${h.effect.id}`;
      const old=seen.get(key);
      if(!old||h.confidence>old.confidence)seen.set(key,h);
    }
    return [...seen.values()].sort((a,b)=>b.confidence-a.confidence);
  }

  function generate(brain,activation,meta={}){
    const store=ensure(brain);
    const perception=meta.perception || brain.mind?.lastCycle?.perception?.text || brain.cognitiveState?.current?.topic || "";
    const raw=[];
    for(const item of relevantEffects(activation)){
      for(const cause of item.causes.slice(0,5))raw.push(makeHypothesis(store,cause,item.effect,activation,perception));
    }
    raw.push(...genericAlternatives(store,activation));
    let hypotheses=dedupe(raw).slice(0,7);

    // Las alternativas cercanas permanecen competidoras; no forzamos una
    // ganadora solo por diferencias pequeñas de heurística.
    if(hypotheses.length>1){
      const max=hypotheses[0].confidence;
      hypotheses=hypotheses.map((h,i)=>({...h,confidence:clamp(h.confidence-(i>0?Math.min(.08,i*.018):0),.06,.88),relativeToBest:max?clamp(h.confidence/max):0}));
    }

    const snapshot={time:brain.time||0,perception,activation,hypotheses};
    store.current=snapshot;store.history.push(snapshot);if(store.history.length>30)store.history.shift();
    if(Array.isArray(brain.lastThoughts)&&hypotheses.length){
      brain.lastThoughts.push(`HIPÓTESIS: ${hypotheses.slice(0,3).map(h=>`${h.claim} (${Math.round(h.confidence*100)}%)`).join(" | ")}`);
    }
    return snapshot;
  }

  function format(snapshot){
    const hs=snapshot?.hypotheses||[];
    if(!hs.length)return "No hay hipótesis activas; falta una percepción con relaciones causales útiles.";
    return hs.map((h,i)=>[
      `${i+1}. ${h.claim}`,
      `   estado=${h.status} · confianza=${Math.round(h.confidence*100)}%`,
      `   a favor=${h.evidenceFor.map(x=>x.text).join(" | ")||"—"}`,
      `   en contra=${h.evidenceAgainst.map(x=>x.text).join(" | ")||"—"}`,
      `   prueba=${h.test}`
    ].join("\n")).join("\n\n");
  }

  const oldCommand=command;
  command=function(raw){
    const h=(raw.trim().split(/\s+/)[0]||"").toLowerCase();
    if(h!=="/hypotheses"&&h!=="/hipotesis")return oldCommand(raw);
    print("debug","HYPOTHESES>",format(ensure(brain).current));
  };

  window.NpcIntHypothesisEngine={generate,format};
  print("system","","motor de hipótesis v1.1 cargado · observación ≠ inferencia · abducción · evidencia · pruebas falsables");
})();
