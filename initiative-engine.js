"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const internalFocus=/^(paso del tiempo|tiempo|silencio|estado interno|inactividad|ciclo interno|paso de tiempo)$/;
  function ensure(b){if(b.initiativeEngine)return b.initiativeEngine;b.initiativeEngine={version:2,seq:1,history:[],lastCandidate:null,lastOutput:null};return b.initiativeEngine;}
  function seenRecently(b,key){const now=Date.now();return ensure(b).history.some(x=>x.key===key&&now-x.wallMs<1000*60*12);}
  function candidate(b,type,text,score,novelty,reason,meta={}){return {id:ensure(b).seq++,type,text,score,novelty,reason,key:meta.key||`${type}:${norm(text).slice(0,80)}`,urgent:!!meta.urgent,topic:meta.topic||null};}
  function meaningfulFocus(focus){
    const n=norm(focus);if(!n||internalFocus.test(n))return false;
    const topics=window.NpcIntTopics;if(topics?.isKeepable&&!topics.isKeepable(focus))return false;
    return true;
  }

  function buildCandidates(b){
    const out=[],pending=window.NpcIntPending?.best?.(b),topic=window.NpcIntTopics?.resumeCandidate?.(b),idea=b.ideaEngine?.current,mem=window.NpcIntSocialMemory?.profile?.(b);
    if(pending&&pending.kind!=="question"){
      const text=`Antes quedó pendiente «${pending.text}». ¿Quieres retomarlo o lo dejamos para después?`;
      out.push(candidate(b,"resume_pending",text,.74,.72,"asunto compartido sin cerrar",{key:`pending:${pending.id}`,topic:pending.text}));
    }
    if(idea?.synthesis?.claim&&idea?.focus&&meaningfulFocus(idea.focus)){
      const claim=String(idea.synthesis.claim).trim();
      const text=`Se me ocurrió algo sobre «${String(idea.focus).slice(0,70)}»: ${claim}${idea.recommendedTest?` Podríamos comprobarlo ${idea.recommendedTest}.`:""}`;
      out.push(candidate(b,"share_idea",text,.75,.80,"idea nueva sobre un foco externo o conversacional significativo",{key:`idea:${norm(claim).slice(0,60)}`,topic:idea.focus}));
    }
    if(topic&&topic.mentions>1&&meaningfulFocus(topic.label)){
      const text=`He vuelto a «${String(topic.label).slice(0,80)}». Podemos seguir desde ahí en vez de empezar de cero.`;
      out.push(candidate(b,"resume_topic",text,.61,.52,"tema recurrente",{key:`topic:${topic.id}`,topic:topic.label}));
    }
    const project=mem?.projects?.[0]||mem?.goals?.[0];
    if(project){
      const text=`Me acordé de que estabas con «${String(project.value).slice(0,90)}». Si quieres, podemos trabajar una parte concreta juntos.`;
      out.push(candidate(b,"shared_activity",text,.69,.59,"recuerdo social relevante",{key:`memory:${project.id}`,topic:project.value}));
    }
    const unresolved=b.cognitiveState?.current?.unresolved?.[0];
    const active=window.NpcIntTopics?.active?.(b);
    if(unresolved&&active&&meaningfulFocus(active.label)){
      const text=`Hay una cosa que todavía no tengo clara sobre «${String(active.label).slice(0,70)}». Si conseguimos esa pieza, puedo razonar mejor lo siguiente.`;
      out.push(candidate(b,"targeted_question",text,.60,.48,"incertidumbre concreta de un tema persistente válido",{key:`unknown:${norm(unresolved).slice(0,50)}`,topic:active.label}));
    }
    const threat=b.mind?.affect?.fear??0;
    if(threat>.72){
      out.push(candidate(b,"urgent_alert","Hay algo que sí interrumpiría la conversación: mi evaluación de riesgo subió bastante. Antes de seguir, comprobaría qué está provocándolo.",.96,.82,"riesgo alto",{key:"urgent:risk",urgent:true}));
    }
    return out.filter(x=>!seenRecently(b,x.key)).sort((a,c)=>c.score-a.score);
  }

  function choose(b,meta={}){
    const s=ensure(b),cs=buildCandidates(b),best=cs[0]||null;s.lastCandidate=best;if(!best)return null;
    const timing=window.NpcIntSocialTiming?.evaluate?.(b,{score:best.score,novelty:best.novelty,urgent:best.urgent,now:meta.now});
    if(timing&&!timing.canSpeak)return null;
    return best;
  }
  function commit(b,c,now=Date.now()){
    if(!c)return null;const s=ensure(b);s.history.push({...c,wallMs:now,time:b.time||0});if(s.history.length>30)s.history.shift();s.lastOutput=c.text;window.NpcIntSocialTiming?.noteNpc?.(b,now,true);return c.text;
  }
  function format(b){const s=ensure(b),c=s.lastCandidate;return [`historial=${s.history.length}`,c?`candidato=${c.type} · score=${c.score.toFixed(2)} · novedad=${c.novelty.toFixed(2)} · motivo=${c.reason}`:"sin candidato",`última salida=${s.lastOutput||"—"}`].join("\n");}
  window.NpcIntInitiative={ensure,meaningfulFocus,buildCandidates,choose,commit,format};
  print("system","","iniciativa social v1.1 cargada · ideas internas filtradas + retomar solo contexto significativo");
})();