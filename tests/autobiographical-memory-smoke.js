"use strict";

const assert=require("node:assert/strict");

global.window={};
global.print=()=>{};
global.command=()=>{};
global.short=(s,n=100)=>String(s||"").length<=n?String(s||""):String(s||"").slice(0,n-1)+"…";
const storage=new Map();
global.localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>storage.set(key,String(value)),
  removeItem:key=>storage.delete(key)
};

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=0;
    this.identity={name:"NIA-01",purpose:"comprender el entorno, conservar continuidad y actuar según mis experiencias"};
    this.relation={name:"Jugador",familiarity:.05,trust:.5};
    this.drives={hambre:.2};
    this.pragmatics={lastTone:"neutral",meaningfulTopic:null};
    this.dialogue={lastUser:"",lastNpc:"",topic:null};
    this.discourse={currentUser:"",previousNpc:"",focus:[],lastRegistered:null};
    this.mem=[];
    this.lastThoughts=[];
    this.responsePlanner={lastPlan:null};
    this.ideaEngine={current:null};
    this.cognitiveState={current:{topic:null,goal:null,action:null}};
    this.mind={lastCycle:{goals:[],decision:null},needs:{}};
  }
  say(text){
    this.dialogue.lastNpc=text;
    this.discourse.previousNpc=text;
    return text;
  }
  hear(text){
    this.dialogue.lastUser=text;
    this.discourse.currentUser=text;
    return this.say("Respuesta base.");
  }
  tick(minutes=1){this.time+=minutes;return null;}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

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
require("../conversation-quality.js");

const b=global.brain;

let out=b.hear("hola");
assert.match(out,/hola|cuéntame|traes/i);

out=b.hear("cuando tenia 8 años, se me murió un perro llamado Junior");
assert.match(out,/Junior/i);
assert.match(out,/8 años/i);
assert.doesNotMatch(out,/ayer|reciente/i);

const pet=window.NpcIntSocialMemory.latestPet(b);
assert.ok(pet,"debe existir un recuerdo estructurado de la mascota");
assert.equal(pet.data.name,"Junior");
assert.equal(pet.data.species,"perro");
assert.equal(pet.data.status,"deceased");
assert.deepEqual(pet.data.when,{type:"user_age",age:8});

out=b.hear("te creé con la finalidad de crear algo similar a un director de juego dinámico");
assert.match(out,/me creaste con la finalidad/i);
assert.match(out,/director de juego din[aá]mico/i);
assert.match(b.selfModel.creatorIntent,/director de juego dinamico/i);

out=b.hear("me gusta el color negro");
assert.match(out,/color negro/i);

out=b.hear("que mision te gustaria crear ?");
assert.match(out,/misión|mision/i);
assert.match(out,/sala que cambia de reglas|tres rutas/i);
assert.doesNotMatch(out,/base suficiente/i);

out=b.hear("vale, como se llamaba mi perro ?");
assert.match(out,/Junior/i);

out=b.hear("cuando se murió mi perro?");
assert.match(out,/8 años/i);
assert.doesNotMatch(out,/ayer|reciente/i);

out=b.hear("te pregunté que cuando pasó");
assert.match(out,/8 años/i);

out=b.hear("como se llama mi perro que tuve ?");
assert.match(out,/Junior/i);

out=b.hear("que fue lo primero que te dije cuando hablé contigo ?");
assert.match(out,/hola/i);

console.log("autobiographical memory smoke: ok");
