"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  function ensure(b){if(b.pendingThreads)return b.pendingThreads;b.pendingThreads={version:1,seq:1,items:[]};return b.pendingThreads;}
  function add(b,kind,text,meta={}){
    const s=ensure(b),clean=String(text||"").trim().replace(/[?!.]+$/g,"");if(!clean)return null;
    const k=`${kind}:${norm(clean)}`;let x=s.items.find(i=>i.key===k&&i.status!=="resolved");
    if(x){x.lastTime=b.time||0;x.lastWallMs=Date.now();x.mentions++;x.priority=Math.max(x.priority,meta.priority??x.priority);return x;}
    x={id:s.seq++,key:k,kind,text:clean,status:"open",priority:meta.priority??.58,source:meta.source||"conversation",createdTime:b.time||0,lastTime:b.time||0,lastWallMs:Date.now(),mentions:1};s.items.push(x);if(s.items.length>60)s.items.shift();return x;
  }
  function noteUser(b,text){
    const raw=String(text||"").trim(),n=norm(raw),added=[];let m;
    if((m=raw.match(/\bestoy (?:haciendo|creando|trabajando en|desarrollando|armando)\s+(.{2,140})/i)))added.push(add(b,"project",m[1],{priority:.78,source:"active-project"}));
    if((m=raw.match(/\bquiero (?:hacer|crear|aprender|probar|terminar)\s+(.{2,140})/i)))added.push(add(b,"project",m[1],{priority:.75,source:"user-goal"}));
    if((m=raw.match(/\b(?:despues|luego|mañana|más tarde|mas tarde)\s+(?:quiero |voy a |podemos )?(.{3,140})/i)))added.push(add(b,"future",m[1],{priority:.62,source:"future-mention"}));
    if((m=raw.match(/\bno (?:hemos|alcanzamos a|pudimos)\s+(.{3,120})/i)))added.push(add(b,"unfinished",m[1],{priority:.66,source:"unfinished"}));
    if(/\b(ya lo hice|ya termine|ya terminé|listo ya|lo termine|lo terminé)\b/.test(n)){
      const open=best(b);if(open)resolve(b,open.id,"user-completed");
    }
    return added.filter(Boolean);
  }
  function noteNpc(b,reply){
    const raw=String(reply||"").trim();if(!raw)return null;
    const questions=[...raw.matchAll(/([^.!?¿]{4,120}[?])/g)].map(m=>m[1].trim());
    if(!questions.length)return null;
    const q=questions[questions.length-1];return add(b,"question",q,{priority:.50,source:"npc-question"});
  }
  function best(b){return ensure(b).items.filter(x=>x.status==="open").sort((a,c)=>(c.priority+c.mentions*.03)-(a.priority+a.mentions*.03))[0]||null;}
  function resolve(b,id,reason="resolved"){const x=ensure(b).items.find(i=>i.id===id||i.key===id);if(x){x.status="resolved";x.resolvedReason=reason;x.resolvedTime=b.time||0;}return x||null;}
  function snooze(b,id){const x=ensure(b).items.find(i=>i.id===id);if(x)x.status="snoozed";return x||null;}
  function reopen(b,id){const x=ensure(b).items.find(i=>i.id===id);if(x)x.status="open";return x||null;}
  function snapshot(b){const s=ensure(b);return {version:1,seq:s.seq,items:s.items.map(x=>({...x}))};}
  function restore(b,data){const s=ensure(b);if(!data||!Array.isArray(data.items))return s;s.items=data.items.slice(-60);s.seq=Math.max(1,...s.items.map(x=>Number(x.id)||0))+1;return s;}
  function format(b){const s=ensure(b);return [`pendientes=${s.items.filter(x=>x.status==="open").length}`,...s.items.slice(-12).map(x=>`#${x.id} [${x.status}/${x.kind}] ${x.text} · prioridad=${x.priority.toFixed(2)}`)].join("\n");}
  window.NpcIntPending={ensure,add,noteUser,noteNpc,best,resolve,snooze,reopen,snapshot,restore,format};
  print("system","","pendientes v1.1 cargados · proyectos activos + preguntas + asuntos sin cerrar");
})();