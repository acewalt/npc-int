"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const meta=/^(hola|buenas|hey|ey|vale|ok|okay|si|no|aja|mm+|como estas|y tu|que haces|que quieres hacer|que puedes hacer|que sabes|contexto de que)$/;
  const npcMeta=/^(?:y )?(?:quien eres|que eres|como eres|cual es tu proposito|que proposito tienes|para que existes|por que existes|que quieres|que deseas|que te gustaria hacer|que quieres hacer|que te gusta|que prefieres|como te sientes|que estas haciendo|que piensas|que tienes en mente)$/;
  const questionLead=/^(?:y )?(?:que|como|cuando|donde|por que|porque|cual|quien)\b/;
  const transient=/\b(?:me siento|estoy|ando)\s+(?:solo|sola|aislado|aislada|triste|mal|ansioso|ansiosa|aburrido|aburrida|cansado|cansada|frustrado|frustrada)\b/i;
  const sensitive=/\b(religion|religioso|religiosa|catolico|cristiano|musulman|politic|partido|voto|gay|lesbiana|bisexual|sexualidad|diagnostico|enfermedad|trastorno|sindrome|medicamento|adiccion)\b/i;
  const internal=/^(paso del tiempo|tiempo|silencio|estado interno|inactividad|ciclo interno)$/;

  function isKeepable(text){
    const n=norm(text);
    if(!n||n.length<3||meta.test(n)||npcMeta.test(n)||sensitive.test(n)||transient.test(n)||internal.test(n))return false;
    if(questionLead.test(n))return false;
    return true;
  }

  function ensure(b){if(b.topicManager)return b.topicManager;b.topicManager={version:2,seq:1,activeId:null,topics:[],history:[]};return b.topicManager;}
  function candidate(text){
    const raw=String(text||"").trim(),n=norm(raw);if(!n||n.length<3||meta.test(n)||npcMeta.test(n)||sensitive.test(n)||transient.test(n))return null;
    let m;
    const patterns=[
      /(?:estoy (?:haciendo|creando|trabajando en|desarrollando)|quiero (?:hacer|crear|aprender|probar))\s+(.{2,120})/i,
      /(?:sobre|acerca de)\s+(.{2,120})/i,
      /(?:que (?:piensas|opinas) de)\s+(.{2,100})/i
    ];
    for(const p of patterns){
      m=raw.match(p);
      if(m){const v=m[1].trim().replace(/[?!.]+$/g,"");return isKeepable(v)?v:null;}
    }
    // Las preguntas no se convierten en temas solo por no llevar "?". En chat casual
    // es normal escribir "cual es tu proposito" o "y que te gustaria hacer" sin signos.
    if(questionLead.test(n))return null;
    const v=raw.replace(/[?!.]+$/g,"");
    if(n.split(" ").length>=4&&isKeepable(v))return v;
    return null;
  }
  function key(text){return norm(text).split(" ").filter(w=>w.length>2).slice(0,8).join(" ");}
  function sanitize(s){
    s.topics=s.topics.filter(x=>x&&x.label&&isKeepable(x.label));
    if(s.activeId&&!s.topics.some(x=>x.id===s.activeId))s.activeId=null;
    return s;
  }
  function noteTurn(b,text,meta={}){
    const s=sanitize(ensure(b)),topicText=meta.topic||candidate(text);if(!topicText||!isKeepable(topicText))return null;
    const k=key(topicText);if(!k)return null;
    let t=s.topics.find(x=>x.key===k);
    if(!t){t={id:s.seq++,key:k,label:topicText,status:"active",mentions:0,importance:meta.importance??.58,createdTime:b.time||0,lastTime:b.time||0,lastWallMs:Date.now(),source:meta.source||"user",summary:topicText};s.topics.push(t);}
    t.mentions++;t.lastTime=b.time||0;t.lastWallMs=Date.now();t.status="active";t.importance=Math.min(1,Math.max(t.importance,meta.importance??.58)+.015);
    if(s.activeId&&s.activeId!==t.id){const prev=s.topics.find(x=>x.id===s.activeId);if(prev&&prev.status==="active")prev.status="dormant";}
    s.activeId=t.id;s.history.push({time:b.time||0,topicId:t.id,label:t.label});if(s.history.length>50)s.history.shift();
    return t;
  }
  function active(b){const s=sanitize(ensure(b));return s.topics.find(x=>x.id===s.activeId)||null;}
  function recent(b,count=5){return sanitize(ensure(b)).topics.slice().sort((a,c)=>(c.lastWallMs||0)-(a.lastWallMs||0)).slice(0,count);}
  function resumeCandidate(b){return sanitize(ensure(b)).topics.filter(x=>x.status!=="resolved"&&isKeepable(x.label)).sort((a,c)=>(c.importance+c.mentions*.025)-(a.importance+a.mentions*.025))[0]||null;}
  function mark(b,id,status="resolved"){const t=sanitize(ensure(b)).topics.find(x=>x.id===id||x.key===id);if(t)t.status=status;return t||null;}
  function snapshot(b){const s=sanitize(ensure(b));return {version:2,seq:s.seq,activeId:s.activeId,topics:s.topics.filter(x=>isKeepable(x.label)).map(x=>({...x}))};}
  function restore(b,data){const s=ensure(b);if(!data||!Array.isArray(data.topics))return sanitize(s);s.topics=data.topics.filter(x=>x&&x.label&&isKeepable(x.label)).slice(-60);s.seq=Math.max(1,...s.topics.map(x=>Number(x.id)||0))+1;s.activeId=s.topics.some(x=>x.id===data.activeId)?data.activeId:null;return sanitize(s);}
  function format(b){const s=sanitize(ensure(b)),a=active(b);return [`activo=${a?.label||"—"}`,`temas=${s.topics.length}`,...recent(b,10).map(t=>`#${t.id} [${t.status}] ${t.label} · menciones=${t.mentions} · imp=${t.importance.toFixed(2)}`)].join("\n");}

  window.NpcIntTopics={ensure,candidate,isKeepable,noteTurn,active,recent,resumeCandidate,mark,snapshot,restore,format};
  print("system","","gestor de temas v1.2 cargado · preguntas/meta fuera del tópico + continuidad selectiva");
})();