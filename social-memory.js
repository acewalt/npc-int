"use strict";

(function(){
  function repairInput(s){
    return String(s||"")
      .replace(/\bmme\b/gi,"me")
      .replace(/\bmcuando\b/gi,"cuando")
      .replace(/\bquequ[eé]\b/gi,"qué")
      .replace(/\bquemuri[oó]\b/gi,"que murió");
  }
  const norm=s=>repairInput(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const COLOR_RE=/\b(rojo|azul|verde|amarillo|negro|blanco|morado|violeta|rosa|rosado|naranja|gris|cafe|marron)\b/g;
  const MULTI_SLOTS=new Set(["color_like"]);
  function colorsIn(value){return [...new Set([...norm(value).matchAll(COLOR_RE)].map(m=>m[1]))];}
  const categoryNorm=s=>norm(s).replace(/\s+/g," ").trim();
  const stripValue=s=>String(s||"").trim().replace(/^(?:el|la|los|las)\s+/i,"").replace(/[.!?]+$/g,"").trim();
  function personalSlot(category,qualifier="value"){return `personal:${qualifier}:${categoryNorm(category)}`;}
  function displayCategory(category,label=null){
    const raw=String(label||category||"dato").trim();
    const n=categoryNorm(raw);
    const pretty={numero:"número",pelicula:"película",cancion:"canción",direccion:"dirección",ocupacion:"ocupación"};
    return pretty[n]||raw;
  }
  const stop=new Set(["que","como","para","pero","porque","esto","eso","una","uno","unos","unas","del","las","los","con","por","soy","estoy","quiero","gusta"]);
  const sensitive=/\b(religion|religioso|religiosa|catolico|cristiano|musulman|politic|partido|voto|gay|lesbiana|bisexual|sexualidad|diagnostico|enfermedad|trastorno|sindrome|medicamento|adiccion)\b/i;
  const tokens=s=>norm(s).split(" ").filter(w=>w.length>2&&!stop.has(w));

  function ensure(b){
    if(b.socialMemory)return b.socialMemory;
    b.socialMemory={version:1,seq:1,items:[],lastExtracted:[]};
    return b.socialMemory;
  }

  function keyOf(kind,value){return `${kind}:${norm(value)}`;}
  function slotOf(kind,value,data=null){
    if(kind==="personal_fact"&&data?.category)return personalSlot(data.category,data.qualifier||"value");
    if(!["like","preference"].includes(kind))return null;
    if(!colorsIn(value).length)return null;
    return kind==="like"?"color_like":"color_favorite";
  }
  function deactivateSlot(s,slot,exceptKey=null){
    if(!slot||MULTI_SLOTS.has(slot))return;
    for(const item of s.items){
      const itemSlot=item.slot||slotOf(item.kind,item.value);
      if(itemSlot===slot&&item.key!==exceptKey&&item.active!==false){item.slot=itemSlot;item.active=false;}
    }
  }
  function add(b,kind,value,meta={}){
    const s=ensure(b),clean=String(value||"").trim().replace(/[.!?]+$/g,"").trim();
    if(!clean||clean.length<2||sensitive.test(clean))return null;
    const slot=meta.slot||slotOf(kind,clean,meta.data);
    const key=slot&&!MULTI_SLOTS.has(slot)?`${kind}:${slot}`:keyOf(kind,clean);
    const existing=s.items.find(x=>x.key===key);
    if(existing){
      deactivateSlot(s,slot,key);
      existing.active=true;existing.slot=slot||existing.slot||null;
      if(meta.data)existing.data={...(existing.data||{}),...meta.data};
      existing.value=clean;
      existing.mentions++;existing.lastMentionedTime=b.time||0;existing.lastMentionedWallMs=Date.now();existing.importance=Math.min(1,Math.max(existing.importance,meta.importance??.55)+.025);existing.confidence=Math.max(existing.confidence,meta.confidence??.82);return existing;
    }
    deactivateSlot(s,slot);
    const item={id:s.seq++,key,kind,value:clean,slot,active:true,subject:meta.subject||"user",source:meta.source||"explicit-user",confidence:meta.confidence??.9,importance:meta.importance??.58,time:b.time||0,wallMs:Date.now(),lastMentionedTime:b.time||0,lastMentionedWallMs:Date.now(),mentions:1,tone:meta.tone||"neutral",tags:meta.tags||[],data:meta.data||null};
    s.items.push(item);
    if(s.items.length>120)s.items.sort((a,c)=>(c.importance+c.mentions*.03)-(a.importance+a.mentions*.03)).splice(120);
    return item;
  }

  function extract(text){
    const raw=repairInput(String(text||"").trim()),n=norm(raw),out=[];
    const push=(kind,value,importance=.6,tags=[],data=null)=>{if(value&&String(value).trim().length>1&&!sensitive.test(String(value)))out.push({kind,value:String(value).trim(),importance,tags,data});};
    let m;
    if((m=raw.match(/(?:me llamo|mi nombre es)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ-]{1,40})/i)))push("name",m[1],.95,["identity"]);
    const temporalDisclosure=/^cuando\b/.test(n)&&/\b(?:tenia|era|estaba|tuve|vivia)\b/.test(n);
    const asksQuestion=/[?¿]/.test(raw)||/^(?:como|donde|que|cual|quien|por que|porque|a que edad|y a que edad|en que edad)\b/.test(n)||(/^cuando\b/.test(n)&&!temporalDisclosure);
    if(!asksQuestion&&/\b(?:murio|fallecio|se murio)\b/.test(n)&&/\b(?:perro|perra|gato|gata|mascota)\b/.test(n)){
      const species=(n.match(/\b(perro|perra|gato|gata|mascota)\b/)||[])[1]||"mascota";
      const nameMatch=raw.match(/\b(?:llamad[oa]|se llamaba|de nombre)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ-]{1,40})/i);
      const ageMatch=n.match(/\bcuando (?:yo )?tenia(?: yo)?\s+(\d{1,2})\s+anos?\b/)||n.match(/\b(?:yo )?tenia(?: yo)?\s+(\d{1,2})\s+anos?\b/)||n.match(/\ba los\s+(\d{1,2})\s+anos?\b/);
      const name=nameMatch?nameMatch[1]:null;
      const age=ageMatch?Number(ageMatch[1]):null;
      const relative=/\bayer\b/.test(n)?"ayer":/\bhoy\b/.test(n)?"hoy":null;
      const label=name||species;
      push("pet",label,.93,["pet","deceased",species],{
        name,
        species,
        status:"deceased",
        when:age?{type:"user_age",age}:relative?{type:"relative",value:relative}:null,
        original:raw
      });
    }

    // Hechos personales genéricos: una categoría nueva no requiere código nuevo.
    // Ej.: "mi número favorito es el 3", "mi comida favorita es la pizza", "mi trabajo es soldador".
    let personalMatched=false;
    if(!asksQuestion&&(m=raw.match(/\bmi\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ -]{0,48}?)\s+favorit[oa]s?\s+(?:es|son)\s+(.+)$/i))){
      const category=m[1].trim(),value=stripValue(m[2]);
      push("personal_fact",value,.84,["personal","favorite"],{category:categoryNorm(category),categoryLabel:category,qualifier:"favorite"});
      personalMatched=true;
    }
    if(!asksQuestion&&!personalMatched&&(m=raw.match(/\bmi\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ -]{0,48}?)\s+(?:es|son)\s+(.+)$/i))){
      const category=m[1].trim(),value=stripValue(m[2]);
      if(!/\b(?:gusta|prefier|favorit)\b/i.test(category)&&!sensitive.test(category)){
        push("personal_fact",value,.78,["personal","fact"],{category:categoryNorm(category),categoryLabel:category,qualifier:"value"});
        personalMatched=true;
      }
    }

    const negativeColorSegment=(n.match(/\bno me gusta(?:n)?\s+([^,;.]+)/)||[])[1]||"";
    const dislikedColors=colorsIn(negativeColorSegment);
    const positiveSegments=[...n.matchAll(/(?:^|[,;.])?\s*(?:pero\s+)?(?:me gusta(?:n)?|me gusta es|solo me gusta|me gusta solo)\s+([^,;.]+)/g)].map(x=>x[1]);
    let likedColors=[...new Set(positiveSegments.flatMap(colorsIn))].filter(color=>!dislikedColors.includes(color));
    if(!likedColors.length&&/\bm+e gusta(?:n|ba|ban)?\b/.test(n)){
      likedColors=colorsIn(n).filter(color=>!dislikedColors.includes(color));
    }
    const replaceColorSet=/\b(?:solo|solamente|unicamente|únicamente)\b/.test(n)||/\b(?:te dije|te repito|repito)\b/.test(n)&&likedColors.length>0;

    if(likedColors.length){
      for(const color of likedColors)push("like",`color ${color}`,.72,["preference","color"],{category:"color",color,replaceSet:replaceColorSet});
      for(const color of dislikedColors)push("dislike",`color ${color}`,.74,["preference","color","negative"],{category:"color",color});
    }else if((m=raw.match(/\bno me gusta(?:n)?\s+(.{2,120})/i))){
      push("dislike",m[1],.66,["preference"]);
    }else if((m=raw.match(/\bm+e gusta(?:n|ba|ban)?\s+(.{2,120})/i))){
      push("like",m[1],.66,["preference"]);
    }
    if((m=raw.match(/\bprefiero\s+(.{2,120})/i))&&!colorsIn(m[1]).length)push("preference",m[1],.70,["preference"]);
    if((m=raw.match(/\bestoy (?:haciendo|creando|trabajando en|desarrollando|armando)\s+(.{2,140})/i)))push("project",m[1],.82,["project","active"]);
    if((m=raw.match(/\bquiero (?:hacer|crear|aprender|probar|terminar)\s+(.{2,140})/i)))push("goal",m[1],.78,["goal"]);
    if((m=raw.match(/\b(?:hoy|ayer) (?:hice|termine|terminé|probe|probé|avance|avancé)\s+(.{2,140})/i)))push("shared-update",m[1],.72,["progress"]);
    if(/\b(me encanta|me fascina)\b/.test(n)&&(m=raw.match(/\b(?:me encanta|me fascina)\s+(.{2,120})/i)))push("like",m[1],.78,["preference","strong"]);
    return out;
  }

  function resolveDeicticPreference(x,meta={}){
    if(!x||x.kind!=="like")return x;
    const n=norm(x.value);
    if(!/^(?:esa|esta|la) idea$/.test(n)&&!/^esa mision$/.test(n))return x;
    const prior=String(meta.priorNpc||"");
    const quoted=[...prior.matchAll(/[«“"]([^»”"]{3,120})[»”"]/g)].map(m=>m[1].trim());
    const label=quoted.at(-1);
    if(!label)return x;
    return {...x,value:label,data:{...(x.data||{}),category:"idea",reference:"previous_npc"}};
  }

  function noteTurn(b,text,meta={}){
    const s=ensure(b),items=extract(text).map(x=>resolveDeicticPreference(x,meta)),added=[];
    const positiveColors=items.filter(x=>x.kind==="like"&&x.data?.category==="color").map(x=>x.data.color);
    const negativeColors=items.filter(x=>x.kind==="dislike"&&x.data?.category==="color").map(x=>x.data.color);
    const replaceColors=items.some(x=>x.kind==="like"&&x.data?.category==="color"&&x.data?.replaceSet);
    if(replaceColors){
      for(const item of s.items){
        const isColorSlot=item.slot==="color_like"||item.slot==="color_favorite"||item.slot==="personal:favorite:color";
        const color=item.data?.color||colorsIn(item.value)[0]||norm(item.value);
        if(isColorSlot&&item.active!==false&&!positiveColors.includes(color))item.active=false;
      }
    }
    if(negativeColors.length){
      for(const item of s.items){
        const color=item.data?.color||colorsIn(item.value)[0]||norm(item.value);
        const isColorSlot=item.slot==="color_like"||item.slot==="color_favorite"||item.slot==="personal:favorite:color";
        if(isColorSlot&&item.active!==false&&negativeColors.includes(color))item.active=false;
      }
    }
    for(const x of items){
      const item=add(b,x.kind,x.value,{importance:x.importance,tags:x.tags,data:x.data||null,slot:x.slot||null,tone:meta.tone||"neutral"});
      if(item)added.push(item);
    }
    s.lastExtracted=added.map(x=>x.id);
    return added;
  }

  function similarity(q,item){
    const a=new Set(tokens(q)),b=new Set(tokens(`${item.value} ${(item.tags||[]).join(" ")}`));
    if(!a.size||!b.size)return 0;let hit=0;a.forEach(x=>b.has(x)&&hit++);return hit/Math.max(a.size,b.size);
  }

  function recall(b,query,count=4,opts={}){
    const s=ensure(b),now=Date.now();
    return s.items.filter(item=>item.active!==false).map(item=>{
      const sim=similarity(query,item),recency=Math.exp(-Math.max(0,now-(item.lastMentionedWallMs||now))/(1000*60*60*24*14));
      const kindBoost=Array.isArray(opts.kinds)&&opts.kinds.includes(item.kind) ? .18 : 0;
      return {item,score:sim*.62+item.importance*.22+Math.min(.1,item.mentions*.018)+recency*.06+kindBoost};
    }).filter(x=>x.score>(opts.minScore??.18)).sort((a,c)=>c.score-a.score).slice(0,count).map(x=>x.item);
  }

  function profile(b){
    const s=ensure(b),best=kind=>s.items.filter(x=>x.kind===kind&&x.active!==false).sort((a,c)=>(c.lastMentionedWallMs||0)-(a.lastMentionedWallMs||0)||(c.importance+c.mentions*.03)-(a.importance+a.mentions*.03)).slice(0,5);
    return {name:best("name")[0]?.value||b.relation?.name||"Jugador",likes:best("like"),dislikes:best("dislike"),preferences:best("preference"),personalFacts:best("personal_fact"),projects:best("project"),goals:best("goal"),updates:best("shared-update"),pets:best("pet")};
  }

  function latestPet(b){
    return ensure(b).items
      .filter(x=>x.kind==="pet"&&x.active!==false)
      .sort((a,c)=>(c.lastMentionedWallMs||c.wallMs||0)-(a.lastMentionedWallMs||a.wallMs||0))[0]||null;
  }

  function personalFact(b,category,qualifier=null){
    const cat=categoryNorm(category);
    return ensure(b).items
      .filter(x=>x.kind==="personal_fact"&&x.active!==false&&categoryNorm(x.data?.category||"")===cat&&(!qualifier||x.data?.qualifier===qualifier))
      .sort((a,c)=>(c.lastMentionedWallMs||c.wallMs||0)-(a.lastMentionedWallMs||a.wallMs||0))[0]||null;
  }

  function snapshot(b){return {version:1,seq:ensure(b).seq,items:ensure(b).items.map(x=>({...x}))};}
  function restore(b,data){
    const s=ensure(b);if(!data||!Array.isArray(data.items))return s;
    s.items=data.items.filter(x=>x&&x.kind&&x.value&&!sensitive.test(String(x.value))).slice(-120).map(x=>({...x,slot:x.slot||slotOf(x.kind,x.value,x.data),active:x.active!==false}));
    const latestBySlot=new Map();
    for(const item of s.items){
      if(!item.slot||MULTI_SLOTS.has(item.slot))continue;
      const prev=latestBySlot.get(item.slot);
      if(!prev||(item.lastMentionedWallMs||item.wallMs||0)>(prev.lastMentionedWallMs||prev.wallMs||0))latestBySlot.set(item.slot,item);
    }
    for(const item of s.items)if(item.slot&&!MULTI_SLOTS.has(item.slot)&&latestBySlot.get(item.slot)!==item)item.active=false;
    s.seq=Math.max(1,...s.items.map(x=>Number(x.id)||0))+1;return s;
  }
  function clear(b){const s=ensure(b);s.items=[];s.seq=1;s.lastExtracted=[];}
  function format(b){const p=profile(b),s=ensure(b);const rows=s.items.slice(-12).map(x=>`#${x.id} [${x.kind}] ${x.value} · imp=${x.importance.toFixed(2)} · menciones=${x.mentions}`);return [`persona=${p.name}`,`recuerdos sociales=${s.items.length}`,...rows].join("\n");}

  window.NpcIntSocialMemory={ensure,add,extract,noteTurn,recall,profile,snapshot,restore,clear,format,slotOf,latestPet,personalFact,personalSlot,displayCategory,colorsIn,repairInput};
  print("system","","memoria social v1.6 cargada · hechos personales genéricos + correcciones de preferencias + memoria autobiográfica");
})();