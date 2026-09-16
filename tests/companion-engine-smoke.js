"use strict";

const assert=require("assert");

global.window={};
global.print=()=>{};
global.command=()=>{};
global.short=(s,n=72)=>String(s||"").length<=n?String(s||""):String(s||"").slice(0,n-1)+"…";
const storage=new Map();
global.localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=0;this.identity={name:"NIA-01",purpose:"comprender el entorno y conservar continuidad"};
    this.relation={name:"Jugador",familiarity:.05,trust:.46};
    this.pragmatics={lastTone:"neutral",meaningfulTopic:null};
    this.dialogue={lastNpc:"",topic:null};this.discourse={previousNpc:"",focus:[]};
    this.mem=[];this.cognition={facts:[]};this.lastThoughts=[];
    this.mind={affect:{fear:.04},cognition:{curiosity:.75},needs:{energy:.85},lastCycle:{goals:[{id:"understand",label:"reducir incertidumbre",priority:.7}],decision:{id:"observe",label:"observar",score:.58},options:[]}};
    this.responsePlanner={lastPlan:{intent:"fallback",act:"passthrough",text:null}};
    this.ideaEngine={current:null};
  }
  moodLabel(){return "neutral";}
  say(x){this.dialogue.lastNpc=x;this.discourse.previousNpc=x;return x;}
  hear(text){
    if(/me gusta/i.test(text))return this.say("Entiendo. Lo voy a conservar como contexto.");
    if(/estoy (creando|haciendo)/i.test(text))return this.say("Queda registrado.");
    if(/que recuerdas de mi/i.test(text))return this.say("Todavía sé muy poco de ti.");
    if(/que hacemos/i.test(text))return this.say("No tengo información suficiente para responder con certeza.");
    return this.say(`respuesta inferior: ${text}`);
  }
  tick(minutes=1){this.time+=minutes;return null;}
}

global.NpcBrain=NpcBrain;global.brain=new NpcBrain();
require("../relationship-model.js");
require("../social-memory.js");
require("../personality-engine.js");
require("../topic-manager.js");
require("../pending-thread-manager.js");
require("../social-timing.js");
require("../initiative-engine.js");
require("../companion-persistence.js");
require("../companion-engine.js");

const b=new NpcBrain();

let r=b.hear("Me gusta World of Warcraft");
assert.match(r,/World of Warcraft|preferencia/i);
assert.doesNotMatch(r,/conservar como contexto/i);
assert.ok(b.socialMemory.items.some(x=>x.kind==="like"&&/World of Warcraft/i.test(x.value)));

r=b.hear("Estoy creando un juego de tres carriles");
assert.match(r,/juego de tres carriles|concreto|trabajando/i);
assert.ok(b.socialMemory.items.some(x=>x.kind==="project"&&/juego de tres carriles/i.test(x.value)));
assert.ok(b.pendingThreads.items.some(x=>x.kind==="project"&&x.status==="open"));
assert.ok(b.topicManager.topics.length>=1);

r=b.hear("Que recuerdas de mi");
assert.match(r,/World of Warcraft|juego de tres carriles/i);
assert.doesNotMatch(r,/sé muy poco/i);

r=b.hear("Que hacemos");
assert.match(r,/juego de tres carriles|retomar|trabajar/i);
assert.doesNotMatch(r,/no tengo información suficiente/i);

r=b.hear("Que te gusta");
assert.match(r,/investigar|resolver|comprobar/i);

r=b.hear("Habla conmigo");
assert.match(r,/podemos hablar|conversar|hablemos/i);
assert.doesNotMatch(r,/no me dejes|solo me tienes|me necesitas/i);

for(let i=0;i<14;i++)b.hear(i%2===0?"Vale":"Gracias");
assert.ok(["conocido","familiar","cercano"].includes(b.relationshipModel.stage));

const saved=window.NpcIntCompanionPersistence.save(b);
assert.strictEqual(saved.ok,true);
const b2=new NpcBrain();
window.NpcIntCompanion.ensure(b2);
const remembered=window.NpcIntSocialMemory.profile(b2);
assert.ok(remembered.likes.some(x=>/World of Warcraft/i.test(x.value)),"la preferencia debe sobrevivir una recarga local");
assert.ok(remembered.projects.some(x=>/juego de tres carriles/i.test(x.value)),"el proyecto debe sobrevivir una recarga local");

// Iniciativa: no debe hablar justo después del usuario, pero sí puede retomar
// un pendiente cuando ha pasado suficiente tiempo y el contenido tiene valor.
b.socialTiming.lastUserWallMs=Date.now()-120000;
b.socialTiming.lastNpcWallMs=Date.now()-120000;
b.socialTiming.lastInitiativeWallMs=Date.now()-120000;
r=b.tick(2);
assert.ok(r===null || /pendiente|juego de tres carriles|ocurrió|idea|retomar/i.test(r));
assert.doesNotMatch(String(r||""),/sigues ahí|no quiero limitarme a esperar una orden/i);

// Preferencias sensibles no se guardan en el perfil social persistente.
const before=b.socialMemory.items.length;
b.hear("Mi religión es privada");
assert.strictEqual(b.socialMemory.items.length,before);

console.log("companion engine smoke: ok");