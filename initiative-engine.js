"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const internalFocus=/^(paso del tiempo|tiempo|silencio|estado interno|inactividad|ciclo interno|paso de tiempo)$/;
  const stop=new Set(["que","como","para","pero","porque","esto","eso","una","uno","unos","unas","del","las","los","con","por","soy","estoy","quiero","gusta","hacer","algo","sobre","entre","parte"]);
  const shortSignals=new Set(["ia","ui","ux","vr","ar","2d","3d"]);
  const familyOrder=["everyday","culture","games","reflective","technical"];
  const familySignals={
    everyday:new Set(["vida cotidiana","hogar","bienestar","cocina","jardineria","caminar","descanso","clima","habitos","hobbies","colecciones","mascotas"]),
    culture:new Set(["creatividad","cultura","ciencia","arte","fotografia","lectura","musica","astronomia","biologia","mitologia","mapas","geografia","acertijos","artesania","humor","lenguaje"]),
    technical:new Set(["desarrollo","programacion","unity","testing","telemetria","observabilidad","depuracion","determinismo","persistencia","rendimiento","optimizacion","inteligencia artificial","ia local","comandos","herramientas","permisos","integracion","eventos","configuracion"]),
    games:new Set(["videojuegos","jugador","multijugador","jugabilidad","misiones","sigilo"])
  };
  const tokens=s=>norm(s).split(" ").filter(w=>(w.length>2||shortSignals.has(w))&&!stop.has(w));
  const clamp=v=>Math.max(0,Math.min(1,v));

  function ensure(b){
    if(!b.initiativeEngine)b.initiativeEngine={version:3,seq:1,history:[],lastCandidate:null,lastOutput:null,lastSocialTopicId:null};
    const s=b.initiativeEngine;
    if(!Array.isArray(s.history))s.history=[];
    if(!Number.isFinite(s.seq))s.seq=1;
    s.version=3;
    return s;
  }
  function seenRecently(b,key,now=Date.now()){return ensure(b).history.some(x=>x.key===key&&now-x.wallMs<1000*60*12);}
  function seenInTail(b,key,count=6){return ensure(b).history.slice(-count).some(x=>x.key===key);}
  function candidate(b,type,text,score,novelty,reason,meta={}){return {id:ensure(b).seq++,type,text,score,novelty,reason,key:meta.key||`${type}:${norm(text).slice(0,80)}`,urgent:!!meta.urgent,topic:meta.topic||null,topicId:meta.topicId||null,family:meta.family||null,source:meta.source||null,matchedMemory:meta.matchedMemory||null,relevance:meta.relevance??0,reasonCodes:meta.reasonCodes||[],scoreBreakdown:meta.scoreBreakdown||null};}
  function meaningfulFocus(focus){
    const n=norm(focus);if(!n||internalFocus.test(n))return false;
    const topics=window.NpcIntTopics;if(topics?.isKeepable&&!topics.isKeepable(focus))return false;
    return true;
  }

  function similarity(a,b){
    const aa=new Set(tokens(a)),bb=new Set(tokens(b));
    if(!aa.size||!bb.size)return 0;
    let hit=0;aa.forEach(x=>bb.has(x)&&hit++);
    return hit/Math.min(aa.size,bb.size);
  }

  function topicSimilarity(value,topic){
    const tags=Array.isArray(topic.tags)?topic.tags:[],related=Array.isArray(topic.relatedTo)?topic.relatedTo:[];
    const labelScore=similarity(value,topic.label);
    const tagScore=tags.reduce((best,x)=>Math.max(best,similarity(value,x)),0)*.82;
    const relatedScore=related.reduce((best,x)=>Math.max(best,similarity(value,x)),0)*.68;
    return Math.max(labelScore,tagScore,relatedScore);
  }

  function topicFamily(topic){
    const tags=new Set((Array.isArray(topic?.tags)?topic.tags:[]).map(norm));
    for(const family of ["everyday","culture","technical","games"])
      if([...familySignals[family]].some(signal=>tags.has(signal)))return family;
    return "reflective";
  }

  function preferredColdStartFamily(b,bank){
    const available=new Set(bank.map(topicFamily)),byId=new Map(bank.map(topic=>[topic.id,topic]));
    const counts=Object.fromEntries(familyOrder.map(family=>[family,0]));
    for(const item of ensure(b).history){
      if(item?.type!=="social_topic"&&!String(item?.key||"").startsWith("social-topic:"))continue;
      const id=item.topicId||String(item.key).slice("social-topic:".length);
      const family=familyOrder.includes(item.family)?item.family:topicFamily(byId.get(id));
      if(Object.hasOwn(counts,family))counts[family]++;
    }
    return familyOrder.filter(family=>available.has(family)).sort((a,c)=>(counts[a]-counts[c])||(familyOrder.indexOf(a)-familyOrder.indexOf(c)))[0]||"reflective";
  }

  function socialTopicText(topic){
    return [topic.hook,topic.opinion,topic.followUp].map(x=>String(x||"").trim()).filter(Boolean).join(" ");
  }

  function socialTopicCandidates(b,meta={}){
    const bank=globalThis.npcKnowledge?.socialTopics;
    if(!Array.isArray(bank)||!bank.length)return [];
    const now=meta.now??Date.now();
    const profile=window.NpcIntSocialMemory?.profile?.(b)||{};
    const memories=[
      ...(profile.likes||[]),...(profile.preferences||[]),...(profile.projects||[]),
      ...(profile.goals||[]),...(profile.updates||[])
    ];
    const dislikes=profile.dislikes||[];
    const active=window.NpcIntTopics?.active?.(b);
    const preferredFamily=preferredColdStartFamily(b,bank);
    const out=[];

    for(const topic of bank){
      if(!topic?.id||!topic.label||!topic.hook||!topic.opinion||!topic.followUp||!Array.isArray(topic.tags)||!Array.isArray(topic.relatedTo))continue;
      const key=`social-topic:${topic.id}`;
      if(seenRecently(b,key,now)||seenInTail(b,key))continue;
      if(dislikes.some(x=>topicSimilarity(x.value,topic)>=.58))continue;

      let affinity=0,matched=null;
      for(const memory of memories){
        const score=topicSimilarity(memory.value,topic);
        if(score>affinity){affinity=score;matched=memory;}
      }
      const activeAffinity=active?topicSimilarity(active.label,topic):0;
      const weight=Number.isFinite(Number(topic.weight))?clamp(Number(topic.weight)):.62;
      const priorUses=ensure(b).history.filter(x=>x.key===key).length;
      const novelty=clamp(.78+affinity*.10-priorUses*.16);
      const relevance=Math.max(affinity,activeAffinity*.9);
      const curiosity=clamp(b.companionPersonality?.traits?.curiosity??b.mind?.cognition?.curiosity??.65);
      const coldStart=relevance<.34;
      const family=topicFamily(topic),familyBonus=coldStart&&family===preferredFamily ? .04 : 0;
      const score=Math.min(.72,clamp(.38+weight*.10+relevance*.12+novelty*.07+curiosity*.05+(coldStart?.03:0)+familyBonus));
      const reasonCodes=["character_interest",priorUses?"rotated":"unseen"];
      if(matched&&affinity>=.34)reasonCodes.push(`matches_user_${matched.kind}`);
      else if(active&&activeAffinity>=.34)reasonCodes.push("matches_active_topic");
      else reasonCodes.push("cold_start",`family_${family}`,...(familyBonus?["cold_start_family_priority"]:[]));
      const reason=matched&&affinity>=.34
        ? `tema propio relacionado con ${matched.kind==="project"||matched.kind==="goal"?"tu proyecto u objetivo":"una preferencia tuya"}: «${String(matched.value).slice(0,70)}»`
        : active&&activeAffinity>=.34
          ? `tema propio relacionado con el foco activo «${String(active.label).slice(0,70)}»`
          : "tema propio coherente con la curiosidad y los valores del personaje";
      out.push(candidate(b,"social_topic",socialTopicText(topic),score,novelty,reason,{
        key,topic:topic.label,topicId:topic.id,family,source:"character-social-topic",matchedMemory:matched&&affinity>=.34?{id:matched.id,kind:matched.kind,value:matched.value,affinity}:null,
        relevance,reasonCodes,scoreBreakdown:{weight,relevance,novelty,curiosity,coldStart,familyBonus,preferredFamily}
      }));
    }
    return out.sort((a,c)=>(c.score-a.score)||(c.novelty-a.novelty)||String(a.topicId).localeCompare(String(c.topicId)));
  }

  function buildCandidates(b,meta={}){
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
    out.push(...socialTopicCandidates(b,meta));
    const threat=b.mind?.affect?.fear??0;
    if(threat>.72){
      out.push(candidate(b,"urgent_alert","Hay algo que sí interrumpiría la conversación: mi evaluación de riesgo subió bastante. Antes de seguir, comprobaría qué está provocándolo.",.96,.82,"riesgo alto",{key:"urgent:risk",urgent:true}));
    }
    return out.filter(x=>!seenRecently(b,x.key,meta.now??Date.now())).sort((a,c)=>(c.score-a.score)||String(a.key).localeCompare(String(c.key)));
  }

  function choose(b,meta={}){
    const s=ensure(b),cs=buildCandidates(b,meta),best=cs[0]||null;s.lastCandidate=best;if(!best)return null;
    const timing=window.NpcIntSocialTiming?.evaluate?.(b,{score:best.score,novelty:best.novelty,urgent:best.urgent,now:meta.now});
    if(timing&&!timing.canSpeak)return null;
    return best;
  }
  function commit(b,c,now=Date.now()){
    if(!c)return null;const s=ensure(b);s.history.push({...c,wallMs:now,time:b.time||0});if(s.history.length>30)s.history.shift();s.lastOutput=c.text;
    if(c.type==="social_topic"){
      s.lastSocialTopicId=c.topicId;
      window.NpcIntTopics?.noteNpcTopic?.(b,{id:c.topicId,label:c.topic},{importance:c.score,source:c.source});
    }
    window.NpcIntRelationship?.noteNpc?.(b,c.text,{now});
    window.NpcIntPending?.noteNpc?.(b,c.text,{source:c.source||"npc-initiative",originId:c.topicId||null});
    window.NpcIntSocialTiming?.noteNpc?.(b,now,true);
    window.NpcIntCompanionPersistence?.save?.(b);
    return c.text;
  }
  function snapshot(b){
    const s=ensure(b);
    return {version:3,seq:s.seq,lastSocialTopicId:s.lastSocialTopicId||null,history:s.history.slice(-30).map(x=>({type:x.type,key:x.key,topic:x.topic||null,topicId:x.topicId||null,family:x.family||null,source:x.source||null,reason:x.reason||null,reasonCodes:x.reasonCodes||[],wallMs:x.wallMs||0,time:x.time||0}))};
  }
  function restore(b,data){
    const s=ensure(b);if(!data||!Array.isArray(data.history))return s;
    s.history=data.history.filter(x=>x&&x.key&&Number.isFinite(Number(x.wallMs))).slice(-30).map(x=>({...x,wallMs:Number(x.wallMs)}));
    s.seq=Math.max(Number(data.seq)||1,s.seq);s.lastSocialTopicId=data.lastSocialTopicId||null;return s;
  }
  function clear(b){const s=ensure(b);s.history=[];s.lastCandidate=null;s.lastOutput=null;s.lastSocialTopicId=null;return s;}
  function format(b){const s=ensure(b),c=s.lastCandidate,bank=globalThis.npcKnowledge?.socialTopics?.length||0;return [`historial=${s.history.length} | banco_social=${bank} | último_tema_propio=${s.lastSocialTopicId||"—"}`,c?`candidato=${c.type} · score=${c.score.toFixed(2)} · relevancia=${(c.relevance??0).toFixed(2)} · novedad=${c.novelty.toFixed(2)} · razones=${(c.reasonCodes||[]).join(",")||"—"} · motivo=${c.reason}`:"sin candidato",`última salida=${s.lastOutput||"—"}`].join("\n");}
  window.NpcIntInitiative={ensure,meaningfulFocus,similarity,topicSimilarity,topicFamily,socialTopicCandidates,buildCandidates,choose,commit,snapshot,restore,clear,format};
  print("system","","iniciativa social v1.3 cargada · afinidad ponderada + rotación temática explicable");
})();
