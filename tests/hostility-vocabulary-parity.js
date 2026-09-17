"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.join(__dirname,"..");
const config=JSON.parse(fs.readFileSync(path.join(root,"config","mental-cycle.v1.json"),"utf8"));
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match=>match[1]);
const position=name=>scripts.indexOf(name);
const expectedTerms=[
  "malparido","malparida","caremonda","hijueputa","hpta","gonorrea",
  "idiota","imbecil","estupido","callate","largate"
];
const surfaceForm={callate:"cállate",largate:"lárgate"};

assert.ok(position("pragmatics.js")>=0,"pragmatics.js debe estar declarado en index.html");
assert.ok(position("brain-pipeline.js")>position("pragmatics.js"),"el pipeline debe encapsular pragmatics como parte del legacy core");
assert.ok(position("mental-cycle.js")>position("brain-pipeline.js"),"mental-cycle debe registrar sus etapas después de instalar el pipeline");
assert.ok(position("relationship-model.js")>position("mental-cycle.js"),"relationship-model debe consumir la percepción canónica ya cargada");
assert.deepStrictEqual(config.perception?.hostileTerms,expectedTerms,"el vocabulario hostil canónico debe vivir en config");
assert.strictEqual(new Set(config.perception.hostileTerms).size,expectedTerms.length,"el vocabulario hostil no debe contener duplicados");

const printed=[];
global.window={};
global.print=(kind,prefix,text)=>printed.push({kind,prefix,text});
global.command=()=>{};
global.short=(value,size=72)=>String(value||"").length<=size?String(value||""):String(value||"").slice(0,size-1)+"…";
global.clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number(value)||0));

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=0;
    this.identity={name:"NIA-01",purpose:"comprender el entorno"};
    this.relation={name:"Jugador",trust:.65,familiarity:.3};
    this.drives={amenaza:.04,curiosidad:.32,social:.34,proposito:.31,fatiga:.08};
    this.mood={valence:.1,arousal:.22};
    this.personality={caution:.48};
    this.cognition={facts:[]};
    this.dialogue={lastUser:"",lastNpc:"",lastIntent:null,topic:null};
    this.mem=[];
    this.lastThoughts=[];
    this.silence=0;
  }
  moodLabel(){return "neutral";}
  recall(){return [];}
  remember(type,text,salience=.5){this.mem.push({type,text,salience});}
  thoughts(text){this.lastThoughts.push(text);}
  say(text){this.dialogue.lastNpc=String(text||"");return this.dialogue.lastNpc;}
  hear(text){this.dialogue.lastUser=String(text||"");return `base:${text}`;}
  event(text){return `event:${text}`;}
  tick(minutes=1){this.time+=Math.max(0,Number(minutes)||0);return null;}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

// Es el orden relevante real de index.html: pragmática queda dentro del legacy
// encapsulado; percepción corre antes y decisión después de esa cadena.
for(const name of ["pragmatics.js","brain-pipeline.js","mental-cycle.js","relationship-model.js"])
  require(path.join(root,name));

const mental=window.NpcIntMentalCycle;
const pragmatics=window.NpcIntPragmatics;
const relationship=window.NpcIntRelationship;
const pipeline=window.NpcIntPipeline;
assert.ok(mental&&typeof mental.detect==="function"&&typeof mental.isHostile==="function","mental-cycle debe exponer su detector canónico para verificar el contrato");
assert.ok(pragmatics&&typeof pragmatics.hostileScore==="function"&&typeof pragmatics.actOf==="function","pragmatics debe exponer clasificación observable");
assert.ok(relationship&&typeof relationship.signals==="function","relationship-model debe exponer sus señales sociales");
assert.deepStrictEqual(mental.hostileTerms,expectedTerms,"mental-cycle debe consumir exactamente el vocabulario canónico");
assert.ok(Object.isFrozen(mental.hostileTerms),"la vista pública del vocabulario mental debe ser inmutable");

for(const phrase of ["¡hpta!","¿malparida?","idiota!!!"]){
  assert.ok(mental.detect(phrase).includes("hostile"),`${phrase}: la puntuación no debe ocultar el término hostil`);
  assert.ok(pragmatics.hostileScore(phrase)>.55,`${phrase}: pragmatics debe tokenizar puntuación igual que percepción`);
  assert.strictEqual(relationship.signals(phrase).hostile,.9,`${phrase}: la relación debe consumir la misma clasificación hostil`);
}
for(const phrase of ["idiotamente","malparidazo","hptatico","hijueputazo","imbecilidad"]){
  assert.ok(!mental.detect(phrase).includes("hostile"),`${phrase}: una subcadena no debe marcarse como término hostil`);
  assert.strictEqual(pragmatics.hostileScore(phrase),0,`${phrase}: pragmatics no debe producir falsos positivos por subcadena`);
  assert.strictEqual(relationship.signals(phrase).hostile,0,`${phrase}: la relación no debe producir falsos positivos por subcadena`);
}

const hearStages=pipeline.state.stages.hear;
const perceiveStage=hearStages.find(stage=>stage.name==="mental-cycle:perceive");
const decideStage=hearStages.find(stage=>stage.name==="mental-cycle:decide");
assert.strictEqual(perceiveStage?.phase,"before","la percepción debe etiquetar el mensaje antes del legacy core");
assert.strictEqual(decideStage?.phase,"after","la decisión debe observar la pragmática calculada por el legacy core");

for(const term of expectedTerms){
  const phrase=`Eres ${surfaceForm[term]||term}.`;
  assert.ok(mental.detect(phrase).includes("hostile"),`mental-cycle debe detectar ${term}`);
  assert.strictEqual(mental.isHostile(phrase),true,`el clasificador canónico debe detectar ${term}`);
  assert.ok(pragmatics.hostileScore(phrase)>.55,`pragmatics debe puntuar ${term} como hostil`);
  assert.strictEqual(pragmatics.actOf(phrase),"insult",`pragmatics debe clasificar ${term} como insulto`);
  assert.strictEqual(relationship.signals(phrase).hostile,.9,`relationship-model debe clasificar ${term} desde la misma fuente`);

  const socialBrain=new NpcBrain();
  const socialTrustBefore=socialBrain.relation.trust;
  const socialState=relationship.noteUser(socialBrain,phrase,{now:1000});
  assert.ok(socialBrain.relation.trust<socialTrustBefore,`${term}: el modelo relacional debe reducir confianza`);
  assert.ok(socialState.comfort<.36,`${term}: el modelo relacional debe reducir comodidad`);
  assert.ok(socialState.tension>0,`${term}: el modelo relacional debe aumentar tensión`);
  assert.strictEqual(socialState.hostileStreak,1,`${term}: el modelo relacional debe registrar la racha hostil`);

  const b=new NpcBrain();
  const trustBefore=b.relation.trust;
  b.hear(phrase);
  const cycle=b.mind?.lastCycle;

  assert.ok(cycle,`${term}: debe completar el ciclo mental en la misma llamada`);
  assert.ok(cycle.perception.tags.includes("hostile"),`${term}: percepción y pragmática no pueden contradecirse`);
  assert.strictEqual(b.pragmatics.lastTone,"hostil",`${term}: el tono pragmático debe ser hostil`);
  assert.strictEqual(b.pragmatics.lastAct,"insult",`${term}: el acto pragmático debe ser insulto`);
  assert.ok(b.relation.trust<trustBefore,`${term}: pragmatics debe aplicar el efecto social antes de decidir`);
  assert.strictEqual(cycle.mentalState.trust,b.relation.trust,`${term}: la decisión debe leer la confianza ya actualizada por pragmatics`);
  assert.ok(cycle.goals.some(goal=>goal.id==="boundaries"),`${term}: debe existir el objetivo boundaries`);
  assert.ok(cycle.options.some(option=>option.id==="set_boundary"),`${term}: set_boundary debe ser una opción auditable`);
  assert.strictEqual(cycle.decision.id,"set_boundary",`${term}: la decisión debe marcar un límite`);
  assert.deepStrictEqual(pipeline.state.trace.at(-1).stages,["mental-cycle:perceive","mental-cycle:decide"],`${term}: ambas fases deben ejecutarse sin errores ni saltos`);
  assert.deepStrictEqual(pipeline.state.trace.at(-1).errors,[],`${term}: el pipeline no debe ocultar errores`);
}

console.log(`hostility vocabulary parity: ${expectedTerms.length} terms aligned across config, pragmatics, relationship and mental decision`);
