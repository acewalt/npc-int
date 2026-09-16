"use strict";

(function(){
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();

  function ensure(b){
    if(b.relationshipModel)return b.relationshipModel;
    const baseTrust=b.relation?.trust??.46,baseFam=b.relation?.familiarity??.05;
    b.relationshipModel={
      version:1,interactions:0,
      familiarity:clamp(baseFam),trust:clamp(baseTrust),comfort:.36,rapport:.30,reciprocity:.40,
      tension:0,boundaryPressure:0,positiveStreak:0,hostileStreak:0,
      lastUserWallMs:0,lastNpcWallMs:0,lastInteractionTime:b.time||0,
      stage:"nuevo",history:[]
    };
    return b.relationshipModel;
  }

  function signals(text){
    const n=norm(text),ws=new Set(n.split(" "));
    const has=(...xs)=>xs.some(x=>n.includes(x));
    const friendly=has("gracias","bacano","chevere","genial","me gusta hablar","amigo","amiga","parce")?.75:has("bien","vale","dale")?.25:0;
    const hostile=has("malparido","hijueputa","idiota","imbecil","estupido","callate","largate")?.9:has("molesta","fastidias")?.45:0;
    const apology=has("perdon","disculpa","lo siento")?.75:0;
    const asksAboutNpc=/\b(tu|te)\b/.test(n)&&/\b(que|como|cual|donde|por que|porque)\b/.test(n);
    const selfDisclosure=/\b(me gusta|no me gusta|prefiero|quiero|estoy haciendo|estoy trabajando|me llamo|mi nombre es|hoy hice|ayer hice)\b/.test(n);
    const gratitude=ws.has("gracias")||n.includes("te agradezco");
    const rejection=/^(no|nop|nope|para nada)$/.test(n);
    return {friendly,hostile,apology,asksAboutNpc,selfDisclosure,gratitude,rejection};
  }

  function updateStage(r){
    const score=r.familiarity*.35+r.trust*.30+r.comfort*.20+r.rapport*.15;
    r.stage=score>.73&&r.interactions>18?"cercano":score>.56&&r.interactions>9?"familiar":score>.38&&r.interactions>3?"conocido":"nuevo";
  }

  function noteUser(b,text,meta={}){
    const r=ensure(b),s=signals(text);
    r.interactions++;
    r.lastUserWallMs=meta.now??Date.now();
    r.lastInteractionTime=b.time||r.lastInteractionTime;
    r.familiarity=clamp(r.familiarity+.012+Math.min(.018,r.interactions*.00035));
    r.trust=clamp(r.trust+s.friendly*.025+s.apology*.018-s.hostile*.08);
    r.comfort=clamp(r.comfort+s.friendly*.035+s.apology*.018-s.hostile*.10);
    r.rapport=clamp(r.rapport+(s.selfDisclosure?.018:0)+(s.asksAboutNpc?.012:0)+(s.gratitude?.02:0)-s.hostile*.08);
    r.reciprocity=clamp(r.reciprocity+(s.asksAboutNpc?.02:0)+(s.selfDisclosure?.01:0)-s.hostile*.025);
    r.tension=clamp(r.tension*.82+s.hostile*.55-(s.apology+s.friendly)*.10);
    r.boundaryPressure=clamp(r.boundaryPressure*.88+s.hostile*.42);
    if(s.hostile>.45){r.hostileStreak++;r.positiveStreak=0;}else{r.hostileStreak=0;r.positiveStreak++;}
    updateStage(r);
    r.history.push({time:b.time||0,wallMs:r.lastUserWallMs,kind:"user",signals:s,stage:r.stage});
    if(r.history.length>40)r.history.shift();
    if(b.relation){b.relation.familiarity=r.familiarity;b.relation.trust=r.trust;}
    return r;
  }

  function noteNpc(b,reply,meta={}){
    const r=ensure(b);if(!reply)return r;
    r.lastNpcWallMs=meta.now??Date.now();
    const n=norm(reply);
    if(/[?¿]/.test(reply))r.reciprocity=clamp(r.reciprocity+.006);
    if(/entiendo|recuerdo|antes|hablamos|podemos/.test(n))r.rapport=clamp(r.rapport+.004);
    updateStage(r);
    return r;
  }

  function decay(b,minutes=1){
    const r=ensure(b),m=Math.max(0,Number(minutes)||0);
    r.tension=clamp(r.tension-m*.012);
    r.boundaryPressure=clamp(r.boundaryPressure-m*.007);
    return r;
  }

  function styleHint(b){
    const r=ensure(b);
    return {
      stage:r.stage,
      familiarity:r.familiarity,trust:r.trust,comfort:r.comfort,rapport:r.rapport,
      casualness:clamp(.24+r.familiarity*.50+r.comfort*.22),
      openness:clamp(.20+r.trust*.42+r.rapport*.25-r.tension*.30),
      playfulness:clamp(.10+r.comfort*.30+r.rapport*.18-r.tension*.42),
      caution:clamp(.35+(1-r.trust)*.28+r.tension*.38)
    };
  }

  function snapshot(b){
    const r=ensure(b);
    return {version:r.version,interactions:r.interactions,familiarity:r.familiarity,trust:r.trust,comfort:r.comfort,rapport:r.rapport,reciprocity:r.reciprocity,tension:r.tension,boundaryPressure:r.boundaryPressure,positiveStreak:r.positiveStreak,hostileStreak:r.hostileStreak,lastInteractionTime:r.lastInteractionTime,stage:r.stage};
  }

  function restore(b,data){
    if(!data||typeof data!=="object")return ensure(b);
    const r=ensure(b);for(const k of ["interactions","familiarity","trust","comfort","rapport","reciprocity","tension","boundaryPressure","positiveStreak","hostileStreak","lastInteractionTime"]){if(Number.isFinite(data[k]))r[k]=data[k];}
    updateStage(r);if(b.relation){b.relation.familiarity=r.familiarity;b.relation.trust=r.trust;}return r;
  }

  function format(b){const r=ensure(b);return `etapa=${r.stage} | interacciones=${r.interactions} | familiaridad=${r.familiarity.toFixed(2)} | confianza=${r.trust.toFixed(2)} | comodidad=${r.comfort.toFixed(2)} | rapport=${r.rapport.toFixed(2)} | reciprocidad=${r.reciprocity.toFixed(2)} | tensión=${r.tension.toFixed(2)}`;}

  window.NpcIntRelationship={ensure,noteUser,noteNpc,decay,styleHint,snapshot,restore,signals,format};
  print("system","","relación social v1.0 cargada · familiaridad + confianza + comodidad + rapport + reciprocidad");
})();