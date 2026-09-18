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
require("../companion-refinement.js");

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

// Los gustos de color son multivalor: decir dos colores no elimina el primero.
r=b.hear("Me gusta el color rojo y azul");
assert.match(r,/rojo/i);
assert.match(r,/azul/i);
r=b.hear("Que colores me gustan");
assert.match(r,/rojo/i);
assert.match(r,/azul/i);
const activeColors=window.NpcIntSocialMemory.profile(b).likes.filter(x=>x.slot==="color_like"&&x.active!==false);
assert.strictEqual(activeColors.length,2);
assert.ok(activeColors.some(x=>/rojo/i.test(x.value)));
assert.ok(activeColors.some(x=>/azul/i.test(x.value)));

// Typos reales y tiempo autobiográfico no deben crear recuerdos de mascota falsos.
r=b.hear("mcuando niño tuve un perro llamado junior quemurio cuando tenía 8 años de edad");
assert.match(r,/junior|8 años|lo siento/i);
let pet=window.NpcIntSocialMemory.latestPet(b);
assert.strictEqual(pet.data.name.toLowerCase(),"junior");
assert.deepStrictEqual(pet.data.when,{type:"user_age",age:8});
const petCount=b.socialMemory.items.filter(x=>x.kind==="pet").length;
r=b.hear("a que edad yo tenia cuando murio mi perro");
assert.strictEqual(b.socialMemory.items.filter(x=>x.kind==="pet").length,petCount,"una pregunta temporal no debe crear otra mascota incompleta");
pet=window.NpcIntSocialMemory.latestPet(b);
assert.strictEqual(pet.data.name.toLowerCase(),"junior");

// La pérdida de una mascota se trata como duelo, no como entusiasmo.
r=b.hear("ayer creo que mi perro murió");
assert.match(r,/lo siento|muy reciente/i);
assert.doesNotMatch(r,/emocionante/i);
assert.strictEqual(b.companionState.lastUserAffect.kind,"grief");

// Regresión del transcript real: preguntas sobre NIA no deben convertirse en temas.
const topicCount=b.topicManager.topics.length;
r=b.hear("cual es tu proposito");
assert.strictEqual(b.topicManager.topics.length,topicCount,"una pregunta meta sobre NIA no debe contaminar la memoria temática");
r=b.hear("y que te gustaria hacer");
assert.match(r,/me gustaria|podemos|investigar|continuidad/i);
assert.strictEqual(b.topicManager.topics.length,topicCount,"'y que te gustaria hacer' no debe convertirse en tema retomable");

// Regresión del transcript real: una expresión explícita de soledad es un estado
// transitorio y debe recibir una respuesta social, no una asociación semántica vieja.
const beforeLonelyTopics=b.topicManager.topics.length;
r=b.hear("creoq ue ahora me siento solo, que propones");
assert.match(r,/hablando|te propongo|contarme|distraerte|hacer algo juntos/i);
assert.doesNotMatch(r,/más contexto sobre gustaria hacer/i);
assert.strictEqual(b.topicManager.topics.length,beforeLonelyTopics,"la soledad explícita no debe persistirse como tema");
assert.strictEqual(b.companionState.lastUserAffect.kind,"loneliness");
assert.strictEqual(b.companionState.lastUserAffect.persistent,false);

// Una idea puramente interna como "Paso del tiempo" no merece iniciativa social.
b.ideaEngine.current={focus:"Paso del tiempo",synthesis:{claim:"todavía no tengo una idea causal suficientemente apoyada"},recommendedTest:"observar qué cambia"};
const internalCandidates=window.NpcIntInitiative.buildCandidates(b);
assert.ok(!internalCandidates.some(x=>x.type==="share_idea"&&/paso del tiempo/i.test(x.topic||"")),"un tick interno no debe presentarse como idea social espontánea");

for(let i=0;i<14;i++)b.hear(i%2===0?"Vale":"Gracias");
assert.ok(["conocido","familiar","cercano"].includes(b.relationshipModel.stage));

const saved=window.NpcIntCompanionPersistence.save(b);
assert.strictEqual(saved.ok,true);
const b2=new NpcBrain();
window.NpcIntCompanion.ensure(b2);
const remembered=window.NpcIntSocialMemory.profile(b2);
assert.ok(remembered.likes.some(x=>/World of Warcraft/i.test(x.value)),"la preferencia debe sobrevivir una recarga local");
assert.ok(remembered.projects.some(x=>/juego de tres carriles/i.test(x.value)),"el proyecto debe sobrevivir una recarga local");
assert.ok(!b2.topicManager.topics.some(x=>/cual es tu proposito|que te gustaria hacer/i.test(x.label)),"restore debe limpiar temas meta de versiones anteriores");

// Mientras Qwen carga o genera, la iniciativa autónoma queda silenciada.
window.NpcIntQwenBrowser={state:{loading:true,generating:false}};
b.conversationArbiter={lastUserWallMs:0};
assert.strictEqual(b.tick(2),null);
window.NpcIntQwenBrowser.state.loading=false;
window.NpcIntQwenBrowser.state.generating=true;
assert.strictEqual(b.tick(2),null);
window.NpcIntQwenBrowser.state.generating=false;

// Iniciativa: no debe hablar justo después del usuario, pero sí puede retomar
// un pendiente cuando ha pasado suficiente tiempo real y el contenido tiene valor.
b.socialTiming.lastUserWallMs=Date.now()-300000;
b.socialTiming.lastNpcWallMs=Date.now()-300000;
b.socialTiming.lastInitiativeWallMs=Date.now()-300000;
r=b.tick(2);
assert.ok(r===null || /pendiente|juego de tres carriles|ocurrió|idea|retomar/i.test(r));
assert.doesNotMatch(String(r||""),/sigues ahí|no quiero limitarme a esperar una orden|Paso del tiempo/i);

// Preferencias sensibles no se guardan en el perfil social persistente.
const before=b.socialMemory.items.length;
b.hear("Mi religión es privada");
assert.strictEqual(b.socialMemory.items.length,before);

console.log("companion engine smoke: ok");