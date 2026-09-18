"use strict";

const assert=require("node:assert/strict");

global.window=globalThis;
global.print=()=>{};
global.command=()=>{};

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=0;
    this.lastThoughts=[];
    this.relation={name:"Jugador"};
    this.socialMemory=null;
    this.intentRouter=null;
  }
  hear(text){return text;}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

require("../social-memory.js");
require("../intent-router.js");

const M=global.NpcIntSocialMemory;
const R=global.NpcIntIntentRouter;
const b=global.brain;

assert.ok(R.usefulWords("me gusta el blanco").includes("me"),"me debe conservarse como señal de sujeto");
assert.ok(R.usefulWords("que color te gusta a ti").includes("te"),"te debe conservarse como señal de sujeto");

let frame=R.resolve("que color me gusta?",b,{record:false});
assert.equal(frame.intent,"ask_user_color_preference");

frame=R.resolve("que color te gusta a ti?",b,{record:false});
assert.equal(frame.intent,"ask_companion_preference");
assert.equal(frame.slots.category,"color");

frame=R.resolve("te dije que no me gusta el negro, me gusta es el blanco",b,{record:false});
assert.equal(frame.intent,"preference_statement");
assert.notEqual(frame.intent,"ask_companion_preference");

frame=R.resolve("mi numero favorito es el 3",b,{record:false});
assert.equal(frame.intent,"personal_fact_statement");
assert.equal(frame.slots.category,"numero");
assert.equal(frame.slots.qualifier,"favorite");

frame=R.resolve("cual es mi numero favorito?",b,{record:false});
assert.equal(frame.intent,"ask_personal_fact");
assert.equal(frame.slots.category,"numero");
assert.equal(frame.slots.qualifier,"favorite");

frame=R.resolve("mi trabajo es soldador",b,{record:false});
assert.equal(frame.intent,"personal_fact_statement");
assert.equal(frame.slots.category,"trabajo");

frame=R.resolve("cual es mi trabajo?",b,{record:false});
assert.equal(frame.intent,"ask_personal_fact");
assert.equal(frame.slots.category,"trabajo");

M.noteTurn(b,"mi número favorito es el 3");
assert.equal(M.personalFact(b,"numero","favorite")?.value,"3");
M.noteTurn(b,"mi número favorito es el 2");
assert.equal(M.personalFact(b,"numero","favorite")?.value,"2");
assert.equal(b.socialMemory.items.filter(x=>x.kind==="personal_fact"&&x.slot==="personal:favorite:numero"&&x.active!==false).length,1);

M.noteTurn(b,"mi comida favorita es la pizza");
assert.equal(M.personalFact(b,"comida","favorite")?.value,"pizza");
M.noteTurn(b,"mi trabajo es soldador");
assert.equal(M.personalFact(b,"trabajo","value")?.value,"soldador");

M.noteTurn(b,"me gustan el color negro y el blanco");
let activeColors=M.profile(b).likes.filter(x=>x.slot==="color_like"&&x.active!==false).map(x=>x.data?.color).sort();
assert.deepEqual(activeColors,["blanco","negro"]);

M.noteTurn(b,"te dije que no me gusta el negro, me gusta es el blanco");
activeColors=M.profile(b).likes.filter(x=>x.slot==="color_like"&&x.active!==false).map(x=>x.data?.color).sort();
assert.deepEqual(activeColors,["blanco"],"una corrección explícita debe retirar negro y conservar blanco");
assert.ok(M.profile(b).dislikes.some(x=>x.data?.color==="negro"));

M.noteTurn(b,"solo te dije que me gusta el blanco");
activeColors=M.profile(b).likes.filter(x=>x.slot==="color_like"&&x.active!==false).map(x=>x.data?.color).sort();
assert.deepEqual(activeColors,["blanco"]);

console.log("generic personal memory smoke: ok");
