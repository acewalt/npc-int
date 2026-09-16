"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const meta=/^(hola|buenas|hey|ey|vale|ok|okay|si|no|aja|mm+|como estas|y tu|que haces|que quieres hacer|que puedes hacer|que sabes|contexto de que)$/;
  const sensitive=/\b(religion|religioso|religiosa|catolico|cristiano|musulman|politic|partido|voto|gay|lesbiana|bisexual|sexualidad|diagnostico|enfermedad|trastorno|sindrome|medicamento|adiccion)\b/i;

  function ensure(b){if(b.topicManager)return b.topicManager;b.topicManager={version:1,seq:1,activeId:null,topics:[],history:[]};return b.topicManager;}
  function candidate(text){
    const raw=String(text||"").trim(),n=norm(raw);if(!n||n.length<3||meta.test(n)||sensitive.test(n))return null;
    let m;
    const patterns=[
      /(?:estoy (?:haciendo|creando|trabajando en|desarrollando)|quiero (?:hacer|crear|aprender|probar))\s+(.{2,120})/i,
      /(?:sobre|acerca de)\s+(.{2,120})/i,
      /(?:que (?:piensas|opinas) de)\s+(.{2,100})/i
    ];
    for(const p of patterns){m=raw.match(p);if(m&&!sensitive.test(m[1]))return m[1].trim().replace(/[?!.]+$/g,"");}
    if(/[?¿]/.test(raw)&&/^\s*(que|como|cuando|donde|por que|porque|cual|quien)\b/i.test(n))return null;
    if(n.split(" ").length>=4)return raw.replace(/[?!.]+$/g,"");
    return null;
  }
  function key(text){return norm(text).split(" ").filter(w=>w.length>2).slice(0,8).join(" ");}
  function noteTurn(b,text,meta={}){
    const s=ensure(b),topicText=meta.topic||candidate(text);if(!topicText||sensitive.test(norm(topicText)))return null;
    const k=key(topicText);if(!k)return null;
    let t=s.topics.find(x=>x.key===k);
    if(!t){t={id:s.seq++,key:k,label:topicText,status:"active",mentions:0,importance:meta.importance??.58,createdTime:b.time||0,lastTime:b.time||0,lastWallMs:Date.now(),source:meta.source||"user",summary:topicText};s.topics.push(t);}
    t.mentions++;t.lastTime=b.time||0;t.lastWallMs=Date.now();t.status="active";t.importance=Math.min(1,Math.max(t.importance,meta.importance??.58)+.015);
    if(s.activeId&&s.activeId!==t.id){const prev=s.topics.find(x=>x.id===s.activeId);if(prev&&prev.status==="active")prev.status="dormant";}
    s.activeId=t.id;s.history.push({time:b.time||0,topicId:t.id,label:t.label});if(s.history.length>50)s.history.shift();
    return t;
  }
  function active(b){const s=ensure(b);return s.topics.find(x=>x.id===s.activeId)||null;}
  function recent(b,count=5){return ensure(b).topics.slice().sort((a,c)=>(c.lastWallMs||0)-(a.lastWallMs||0)).slice(0,count);}
  function resumeCandidate(b){return ensure(b).topics.filter(x=>x.status!=="resolved").sort((a,c)=>(c.importance+c.mentions*.025)-(a.importance+a.mentions*.025))[0]||null;}
  function mark(b,id,status="resolved"){const t=ensure(b).topics.find(x=>x.id===id||x.key===id);if(t)t.status=status;return t||null;}
  function snapshot(b){const s=ensure(b);return {version:1,seq:s.seq,activeId:s.activeId,topics:s.topics.filter(x=>!sensitive.test(norm(x.label))).map(x=>({...x}))};}
  function restore(b,data){const s=ensure(b);if(!data||!Array.isArray(data.topics))return s;s.topics=data.topics.filter(x=>x&&x.label&&!sensitive.test(norm(x.label))).slice(-60);s.seq=Math.max(1,...s.topics.map(x=>Number(x.id)||0))+1;s.activeId=s.topics.some(x=>x.id===data.activeId)?data.activeId:null;return s;}
  function format(b){const s=ensure(b),a=active(b);return [`activo=${a?.label||"—"}`,`temas=${s.topics.length}`,...recent(b,10).map(t=>`#${t.id} [${t.status}] ${t.label} · menciones=${t.mentions} · imp=${t.importance.toFixed(2)}`)].join("\n");}

  window.NpcIntTopics={ensure,candidate,noteTurn,active,recent,resumeCandidate,mark,snapshot,restore,format};
  print("system","","gestor de temas v1.1 cargado · continuidad selectiva + filtro de datos sensibles");
})();