"use strict";

(function(){
  const GNorm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ_ ]+/g," ").replace(/\s+/g," ").trim();
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

  const STOP=new Set("el la los las un una unos unas de del a al ante bajo con contra desde durante en entre hacia hasta para por segun sin sobre tras y e o u pero que qué quien como cuando donde cual es son esta estan estaba estaba ser estar haber hay muy mas menos ya hoy ahora aqui ahi eso esto esa ese su sus mi mis tu tus se me te lo le les nos si no".split(" "));

  const LABELS={
    golpe:"golpe",sonido:"sonido",ruido:"ruido",cambio:"cambio en el entorno",persona:"una persona",pasos:"pasos",voz:"una voz",
    objeto:"un objeto",objeto_caido:"un objeto que cayó",caida:"una caída",viento:"el viento",corriente_aire:"una corriente de aire",
    puerta:"la puerta",cerradura:"la cerradura",entrada:"una entrada",salida:"una salida",habitacion:"una habitación",seguridad:"seguridad",
    movimiento:"movimiento",amenaza:"una amenaza",riesgo:"riesgo",peligro:"peligro",fuego:"fuego",humo:"humo",alarma:"una alarma",
    luz:"la luz",oscuridad:"oscuridad",energia:"energía",fallo_electrico:"un fallo eléctrico",interruptor:"un interruptor",
    comida:"comida",hambre:"hambre",recurso:"un recurso",dolor:"dolor",herido:"una persona herida",auxilio:"una petición de auxilio",
    jugador:"el jugador",npc:"el NPC",informacion:"información",incertidumbre:"incertidumbre",observacion:"observación",pregunta:"pregunta",
    evidencia:"evidencia",causa:"causa",consecuencia:"consecuencia",intencion:"intención"
  };

  const ALIASES={
    golpes:"golpe",golpeo:"golpe",golpear:"golpe",ruidos:"ruido",sonidos:"sonido",oye:"sonido",oigo:"sonido",escucho:"sonido",escuchar:"sonido",
    puerta:"puerta",puertas:"puerta",cerradura:"cerradura",llave:"cerradura",persona:"persona",alguien:"persona",hombre:"persona",mujer:"persona",
    pasos:"pasos",voz:"voz",voces:"voz",cayo:"caida",cayó:"caida",caer:"caida",cayendo:"caida",objeto:"objeto",caja:"objeto",
    viento:"viento",aire:"corriente_aire",corriente:"corriente_aire",mueve:"movimiento",movio:"movimiento",movió:"movimiento",movimiento:"movimiento",
    peligro:"peligro",amenaza:"amenaza",arma:"amenaza",ataque:"amenaza",atacar:"amenaza",fuego:"fuego",humo:"humo",alarma:"alarma",
    luz:"luz",luces:"luz",oscuro:"oscuridad",oscuridad:"oscuridad",energia:"energia",electricidad:"energia",apagada:"oscuridad",apago:"oscuridad",
    comida:"comida",alimento:"comida",pan:"comida",fruta:"comida",carne:"comida",hambre:"hambre",dolor:"dolor",herido:"herido",auxilio:"auxilio",
    ayuda:"auxilio",jugador:"jugador",informacion:"informacion",duda:"incertidumbre",incierto:"incertidumbre",incertidumbre:"incertidumbre"
  };

  const SEED_EDGES=[
    ["golpe","es_un","sonido",.95],["ruido","es_un","sonido",.92],["sonido","indica","cambio",.72],["sonido","aporta","informacion",.76],
    ["persona","puede_causar","golpe",.68],["objeto_caido","puede_causar","golpe",.72],["caida","puede_causar","golpe",.62],["viento","puede_causar","ruido",.44],
    ["persona","puede_producir","voz",.86],["persona","puede_producir","pasos",.82],["pasos","es_un","sonido",.9],["voz","es_un","sonido",.9],
    ["objeto","puede_sufrir","caida",.58],["caida","implica","movimiento",.78],["movimiento","puede_causar","ruido",.64],
    ["viento","genera","corriente_aire",.9],["corriente_aire","puede_mover","puerta",.7],["movimiento","puede_afectar","puerta",.54],
    ["puerta","tiene","cerradura",.85],["puerta","es_un","entrada",.72],["puerta","es_un","salida",.68],["puerta","conecta","habitacion",.78],
    ["puerta","relacionada_con","seguridad",.66],["cerradura","relacionada_con","seguridad",.82],["amenaza","aumenta","riesgo",.9],["peligro","aumenta","riesgo",.92],
    ["fuego","produce","humo",.9],["fuego","es_un","peligro",.92],["alarma","puede_indicar","peligro",.72],["auxilio","puede_indicar","peligro",.64],
    ["fallo_electrico","puede_causar","oscuridad",.78],["interruptor","puede_causar","oscuridad",.58],["energia","afecta","luz",.82],["luz","opuesto_a","oscuridad",.9],
    ["hambre","motiva","comida",.82],["comida","es_un","recurso",.74],["herido","puede_expresar","dolor",.82],["herido","puede_pedir","auxilio",.78],
    ["observacion","produce","evidencia",.86],["pregunta","produce","informacion",.8],["evidencia","reduce","incertidumbre",.9],["informacion","reduce","incertidumbre",.78],
    ["causa","produce","consecuencia",.86],["evidencia","apoya","causa",.64],["intencion","puede_causar","accion",.7]
  ];

  function makeGraph(){
    const nodes=new Map(),out=new Map(),incoming=new Map();
    const ensure=value=>{
      const raw=String(value||"").replace(/_/g," ").trim();
      let id=value;
      id=GNorm(id).replace(/ /g,"_");
      if(!nodes.has(id))nodes.set(id,{id,label:LABELS[id]||raw||id.replace(/_/g," ")});
      if(!out.has(id))out.set(id,[]);
      if(!incoming.has(id))incoming.set(id,[]);
      return id;
    };
    const addEdge=(from,relation,to,weight=.6,source="seed")=>{
      from=ensure(from);to=ensure(to);relation=GNorm(relation).replace(/ /g,"_");
      const key=`${from}|${relation}|${to}`;
      const existing=out.get(from).find(e=>e.key===key);
      if(existing){
        if(source!=="seed")existing.source=source;
        existing.weight=Math.max(existing.weight,clamp(weight));
        return false;
      }
      const e={key,from,relation,to,weight:clamp(weight),source};
      out.get(from).push(e);incoming.get(to).push(e);
      return true;
    };
    for(const e of SEED_EDGES)addEdge(...e,"seed");
    return {nodes,out,incoming,addEdge,ensure};
  }

  const graph=makeGraph();
  let commonsenseCount=0,commonsenseRejected=0,commonsenseSource=null;
  let resolveCommonsenseReady;
  const commonsenseReady=new Promise(resolve=>{resolveCommonsenseReady=resolve;});

  function importCommonsense(relations,meta={}){
    let added=0;
    for(const relation of relations||[]){
      if(graph.addEdge(relation.subject,relation.predicate,relation.object,relation.confidence,"commonsense"))added++;
    }
    commonsenseCount=(relations||[]).length;
    commonsenseRejected=meta.rejected||0;
    commonsenseSource=meta.source||"knowledge/commonsense.es.json";
    resolveCommonsenseReady({relations:commonsenseCount,added,rejected:commonsenseRejected,source:commonsenseSource});
  }

  if(typeof globalThis.NpcIntSubscribeCommonsense==="function")globalThis.NpcIntSubscribeCommonsense(importCommonsense);
  else{
    const pending=globalThis.NpcIntPendingCommonsenseSubscribers||(globalThis.NpcIntPendingCommonsenseSubscribers=[]);
    pending.push(importCommonsense);
  }

  function canonicalToken(word){
    const n=GNorm(word).replace(/ /g,"_");
    if(ALIASES[n])return ALIASES[n];
    if(graph.nodes.has(n))return n;
    if(n.endsWith("es")&&graph.nodes.has(n.slice(0,-2)))return n.slice(0,-2);
    if(n.endsWith("s")&&graph.nodes.has(n.slice(0,-1)))return n.slice(0,-1);
    return n;
  }

  function textConcepts(text,brain){
    const found=[];
    const add=(id,weight=.72,source="text")=>{
      id=canonicalToken(id);
      if(!id||STOP.has(id)||id.length<3)return;
      graph.ensure(id);
      const old=found.find(x=>x.id===id);
      if(old){old.weight=Math.max(old.weight,weight);return;}
      found.push({id,label:graph.nodes.get(id)?.label||id,weight:clamp(weight),source});
    };

    const semantic=brain?.nlp?.lastSemantic;
    if(semantic?.tokens?.length){
      for(const t of semantic.tokens){
        if(["NOUN","PROPN","VERB","ADJ"].includes(t.upos))add(t.lemma||t.text,.82,"nlp");
      }
    }
    for(const w of GNorm(text).split(/\s+/)){
      if(!w||STOP.has(w))continue;
      if(ALIASES[w]||graph.nodes.has(canonicalToken(w)))add(w,.78,"text");
      else if(w.length>=5)add(w,.46,"text");
    }
    return found.slice(0,14);
  }

  function importFacts(brain){
    const facts=brain?.cognition?.facts||[];
    for(const f of facts.slice(-40)){
      const s=canonicalToken(f.subject),o=canonicalToken(f.object),r=GNorm(f.predicate||"relacionado_con").replace(/ /g,"_");
      if(s&&o)graph.addEdge(s,r,o,clamp(f.confidence??.55),"brain-fact");
    }
  }

  function activate(text,brain,{depth=3,limit=24}={}){
    importFacts(brain);
    const seeds=textConcepts(text,brain);
    const scores=new Map(),paths=new Map(),queue=[];
    for(const s of seeds){scores.set(s.id,s.weight);paths.set(s.id,[s.id]);queue.push({id:s.id,score:s.weight,depth:0});}
    while(queue.length){
      const cur=queue.shift();
      if(cur.depth>=depth)continue;
      const edges=[...(graph.out.get(cur.id)||[]),...(graph.incoming.get(cur.id)||[])];
      for(const e of edges){
        const next=e.from===cur.id?e.to:e.from;
        const relationPenalty=e.from===cur.id?1:.86;
        const candidate=cur.score*e.weight*.72*relationPenalty;
        if(candidate<.08)continue;
        if(candidate>(scores.get(next)||0)+.02){
          scores.set(next,candidate);
          paths.set(next,[...(paths.get(cur.id)||[cur.id]),next]);
          queue.push({id:next,score:candidate,depth:cur.depth+1});
        }
      }
    }
    const concepts=[...scores.entries()].map(([id,score])=>({
      id,label:graph.nodes.get(id)?.label||id.replace(/_/g," "),score:clamp(score),seed:seeds.some(s=>s.id===id),path:paths.get(id)||[id]
    })).sort((a,b)=>b.score-a.score).slice(0,limit);
    return {text,seeds,concepts,time:brain?.time||0};
  }

  function causesOf(effect){
    effect=canonicalToken(effect);
    const causal=new Set(["puede_causar","produce","genera","puede_mover","puede_indicar","puede_producir","puede_expresar"]);
    return (graph.incoming.get(effect)||[]).filter(e=>causal.has(e.relation)).map(e=>({
      cause:e.from,effect:e.to,relation:e.relation,weight:e.weight,
      causeLabel:graph.nodes.get(e.from)?.label||e.from,effectLabel:graph.nodes.get(e.to)?.label||e.to
    })).sort((a,b)=>b.weight-a.weight);
  }

  function neighbors(id){
    id=canonicalToken(id);
    return {
      out:(graph.out.get(id)||[]).map(e=>({...e,toLabel:graph.nodes.get(e.to)?.label||e.to})),
      incoming:(graph.incoming.get(id)||[]).map(e=>({...e,fromLabel:graph.nodes.get(e.from)?.label||e.from}))
    };
  }

  function formatActivation(a){
    if(!a?.concepts?.length)return "No hay conceptos activados.";
    return a.concepts.slice(0,16).map((c,i)=>`${i+1}. ${c.label} · activación=${Math.round(c.score*100)}%${c.seed?" · semilla":""}\n   ruta=${c.path.map(x=>graph.nodes.get(x)?.label||x).join(" → ")}`).join("\n");
  }

  const oldCommand=command;
  command=function(raw){
    const parts=raw.trim().split(/\s+/);const h=(parts.shift()||"").toLowerCase();
    if(h!=="/concepts"&&h!=="/conceptos")return oldCommand(raw);
    const text=parts.join(" ") || brain.mind?.lastCycle?.perception?.text || brain.cognitiveState?.current?.topic || "";
    const a=activate(text,brain);
    if(!brain.conceptGraph)brain.conceptGraph={};
    brain.conceptGraph.current=a;
    print("debug","CONCEPTS>",formatActivation(a));
  };

  window.NpcIntConceptGraph={
    activate,causesOf,neighbors,textConcepts,addEdge:graph.addEdge,graph,formatActivation,
    commonsenseReady,
    commonsenseStatus:()=>({relations:commonsenseCount,rejected:commonsenseRejected,source:commonsenseSource})
  };
  print("system","","grafo conceptual v1.1 cargado · activación semántica multi-salto · pack de sentido común enlazado");
})();
