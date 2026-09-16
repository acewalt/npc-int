"use strict";

(function(){
  const INorm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

  function ensure(b){
    if(b.ideaEngine)return b.ideaEngine;
    b.ideaEngine={current:null,history:[],seq:1};
    return b.ideaEngine;
  }

  function isMeta(text){
    const n=INorm(text);
    return /^(hola|buenas|vale|ok|entonces|que haces|que quieres hacer|que vas a hacer|que estas pensando|que piensas|en que piensas|que opinas|que crees|que idea|que se te ocurre|que podria|que posibilidades|que hipotesis|por que dices|como estas)/.test(n);
  }

  function latestSubstantive(brain,input=""){
    if(input&&!isMeta(input)&&INorm(input).length>3)return input;
    const ps=brain.mind?.perceptions||[];
    for(let i=ps.length-1;i>=0;i--){
      const p=ps[i];
      if(p?.type==="world"&&p.text)return p.text;
    }
    const mem=brain.mem||[];
    for(let i=mem.length-1;i>=0;i--){
      if(mem[i]?.type==="world")return mem[i].text;
    }
    const state=brain.cognitiveState?.history||[];
    for(let i=state.length-1;i>=0;i--){
      const t=state[i]?.topic;
      if(t&&!isMeta(t))return t;
    }
    return "";
  }

  function recommendationFromTest(test){
    const n=INorm(test);
    if(/escuchar|observar|buscar una segunda señal|repetir la observacion|mirar/.test(n))return {id:"observe",label:"observar",reason:test};
    if(/revisar|comprobar|inspeccionar|buscar que objeto|buscar humo|buscar a la persona/.test(n))return {id:"investigate",label:"investigar",reason:test};
    if(/preguntar|consultar/.test(n))return {id:"ask",label:"preguntar",reason:test};
    if(/alejar|distancia/.test(n))return {id:"move_away",label:"alejarme",reason:test};
    return {id:"observe",label:"observar",reason:test};
  }

  function discriminationValue(h,all){
    const confidence=h.confidence||0;
    const testability=h.testability||.6;
    const competitors=Math.max(1,all.length-1);
    const ambiguity=1-Math.abs(.5-confidence)*2;
    return clamp(testability*.55+ambiguity*.25+Math.min(1,competitors/4)*.20);
  }

  function bestTest(hypotheses){
    if(!hypotheses.length)return null;
    return hypotheses.map(h=>({h,value:discriminationValue(h,hypotheses)})).sort((a,b)=>b.value-a.value)[0];
  }

  function previousSimilarity(store,text){
    const n=INorm(text);if(!n)return 0;
    const prev=store.history.slice(-8).map(x=>INorm(x?.synthesis?.claim||""));
    if(!prev.length)return 0;
    const a=new Set(n.split(" ").filter(x=>x.length>3));
    let best=0;
    for(const p of prev){
      const b=new Set(p.split(" ").filter(x=>x.length>3));
      const inter=[...a].filter(x=>b.has(x)).length;
      const union=new Set([...a,...b]).size||1;
      best=Math.max(best,inter/union);
    }
    return best;
  }

  function synthesize(brain,hypSnapshot,activation,focus){
    const store=ensure(brain),hs=hypSnapshot?.hypotheses||[];
    if(!hs.length){
      const empty={
        id:store.seq++,time:brain.time||0,focus,activation,hypotheses:[],
        synthesis:{claim:"todavía no tengo una idea causal suficientemente apoyada",rationale:"faltan relaciones o evidencia que permitan comparar explicaciones",confidence:.18},
        critique:"No sería responsable convertir la falta de datos en una historia concreta.",
        recommendedTest:"observar qué cambia y registrar una señal concreta antes de inferir una causa",
        recommendedAction:{id:"observe",label:"observar",reason:"observar qué cambia y registrar una señal concreta antes de inferir una causa"},
        score:{relevance:.35,plausibility:.18,testability:.72,novelty:.6,contradictionPenalty:.05,total:.38}
      };
      store.current=empty;store.history.push(empty);if(store.history.length>30)store.history.shift();return empty;
    }

    const first=hs[0],second=hs[1]||null;
    const margin=second?first.confidence-second.confidence:first.confidence;
    let claim,rationale,confidence;
    if(first.confidence>=.68&&margin>=.16){
      claim=`La explicación que mejor encaja por ahora es que ${first.claim.replace(/^./,c=>c.toLowerCase())}.`;
      rationale=`Tiene más apoyo que las alternativas actuales, aunque sigue sin estar verificada.`;
      confidence=clamp(first.confidence*.9);
    }else if(second){
      claim=`Veo varias explicaciones plausibles: ${first.claim.replace(/^./,c=>c.toLowerCase())}; también ${second.claim.replace(/^./,c=>c.toLowerCase())}.`;
      rationale="La evidencia actual no separa con suficiente claridad esas alternativas.";
      confidence=clamp((first.confidence+second.confidence)/2*.82);
    }else{
      claim=`Una posibilidad es que ${first.claim.replace(/^./,c=>c.toLowerCase())}, pero todavía no puedo tratarla como conclusión.`;
      rationale="Solo tengo una línea causal activa y falta corroboración independiente.";
      confidence=clamp(first.confidence*.78);
    }

    const bt=bestTest(hs);
    const recommendedTest=bt?.h?.test||"buscar una observación independiente";
    const recommendedAction=recommendationFromTest(recommendedTest);
    const against=first.evidenceAgainst?.[0]?.text;
    const critique=against
      ? `La principal objeción es que ${against}.`
      : second
        ? `La explicación principal todavía compite con «${second.claim}» y no hay evidencia suficiente para descartarla.`
        : "La evidencia disponible todavía es demasiado limitada para cerrar la explicación.";

    const contradictionPenalty=clamp((first.evidenceAgainst||[]).reduce((s,x)=>s+(x.weight||0),0)*.35);
    const relevance=clamp(activation?.concepts?.[0]?.score||.5);
    const plausibility=clamp(first.confidence);
    const testability=clamp(bt?.value||.55);
    const novelty=clamp(1-previousSimilarity(store,claim));
    const total=clamp(relevance*.25+plausibility*.30+testability*.25+novelty*.20-contradictionPenalty*.25);

    const idea={
      id:store.seq++,time:brain.time||0,focus,activation,hypotheses:hs,
      synthesis:{claim,rationale,confidence,topHypothesis:first.id,runnerUp:second?.id||null},
      critique,recommendedTest,recommendedAction,
      score:{relevance,plausibility,testability,novelty,contradictionPenalty,total}
    };
    store.current=idea;store.history.push(idea);if(store.history.length>30)store.history.shift();
    return idea;
  }

  function attach(brain,idea){
    if(brain.cognitiveState?.current){
      brain.cognitiveState.current.idea={
        claim:idea.synthesis.claim,confidence:idea.synthesis.confidence,critique:idea.critique,
        recommendedTest:idea.recommendedTest,recommendedAction:idea.recommendedAction,score:idea.score.total
      };
      const wm=brain.cognitiveState.current.workingMemory||[];
      if(!wm.some(x=>x.kind==="idea"&&INorm(x.text)===INorm(idea.synthesis.claim)))wm.push({kind:"idea",text:idea.synthesis.claim,weight:idea.score.total});
      brain.cognitiveState.current.workingMemory=wm.slice(-9);
      brain.cognitiveState.workingMemory=brain.cognitiveState.current.workingMemory;
    }
    if(brain.mind?.lastCycle){
      const options=brain.mind.lastCycle.options||[];
      const match=options.find(o=>o.id===idea.recommendedAction.id)||null;
      brain.mind.lastCycle.ideaGuidance={
        claim:idea.synthesis.claim,
        recommendedAction:idea.recommendedAction,
        matchingOption:match?{id:match.id,label:match.label,score:match.score}:null,
        note:"orientación deliberativa; no sustituye automáticamente la decisión del ciclo mental"
      };
    }
    if(Array.isArray(brain.lastThoughts)){
      brain.lastThoughts.push(`IDEA: ${idea.synthesis.claim}`);
      brain.lastThoughts.push(`CRÍTICA: ${idea.critique}`);
      brain.lastThoughts.push(`PRUEBA PROPUESTA: ${idea.recommendedTest}`);
    }
  }

  function refresh(brain,input="",meta={}){
    ensure(brain);
    const graph=window.NpcIntConceptGraph,hyp=window.NpcIntHypothesisEngine;
    if(!graph||!hyp)return null;
    const focus=meta.focus || latestSubstantive(brain,input);
    if(!focus)return null;
    const activation=graph.activate(focus,brain,{depth:3,limit:26});
    if(!brain.conceptGraph)brain.conceptGraph={};brain.conceptGraph.current=activation;
    const hs=hyp.generate(brain,activation,{perception:focus});
    const idea=synthesize(brain,hs,activation,focus);
    attach(brain,idea);
    return idea;
  }

  function format(idea){
    if(!idea)return "Todavía no hay una idea sintetizada.";
    const hs=(idea.hypotheses||[]).slice(0,4).map((h,i)=>`${i+1}. ${h.claim} · ${Math.round(h.confidence*100)}% · ${h.status}`).join("\n")||"—";
    return [
      `FOCO\n${idea.focus||"—"}`,
      `\nHIPÓTESIS ACTIVAS\n${hs}`,
      `\nSÍNTESIS\n${idea.synthesis.claim}`,
      `razón=${idea.synthesis.rationale}`,
      `confianza síntesis=${Math.round((idea.synthesis.confidence||0)*100)}%`,
      `\nCRÍTICA\n${idea.critique}`,
      `\nMEJOR PRUEBA\n${idea.recommendedTest}`,
      `acción sugerida=${idea.recommendedAction?.label||"—"}`,
      `\nIDEA SCORE\nrelevancia=${Math.round(idea.score.relevance*100)} plausibilidad=${Math.round(idea.score.plausibility*100)} comprobable=${Math.round(idea.score.testability*100)} novedad=${Math.round(idea.score.novelty*100)} total=${Math.round(idea.score.total*100)}`
    ].join("\n");
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){oldReset.call(this);this.ideaEngine=null;ensure(this);};

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    ensure(this);const result=oldHear.call(this,text);
    const finish=answer=>{refresh(this,text,{source:"user"});return answer;};
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  const oldEvent=NpcBrain.prototype.event;
  NpcBrain.prototype.event=function(text){
    ensure(this);const result=oldEvent.call(this,text);
    const finish=answer=>{refresh(this,text,{source:"world",focus:text});return answer;};
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  const oldTick=NpcBrain.prototype.tick;
  NpcBrain.prototype.tick=function(minutes=1){
    ensure(this);const result=oldTick.call(this,minutes);
    const finish=answer=>{const focus=latestSubstantive(this,"");if(focus)refresh(this,"",{source:"internal",focus});return answer;};
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  const oldCommand=command;
  command=function(raw){
    const h=(raw.trim().split(/\s+/)[0]||"").toLowerCase();
    if(h!=="/idea"&&h!=="/ideas")return oldCommand(raw);
    print("debug","IDEA>",format(ensure(brain).current));
  };

  ensure(brain);
  window.NpcIntIdeaEngine={refresh,synthesize,format,latestSubstantive};
  print("system","","motor de ideas v1.0 cargado · hipótesis → crítica → síntesis → prueba → recomendación");
})();
