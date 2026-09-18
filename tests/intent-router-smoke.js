"use strict";

const assert=require("node:assert/strict");

global.window=globalThis;
global.print=()=>{};
global.command=()=>{};

class NpcBrain{
  constructor(){this.reset();}
  reset(){this.lastThoughts=[];this.intentRouter=null;}
  hear(text){return "base:"+text;}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

require("../intent-router.js");

const R=global.NpcIntIntentRouter;

function intent(text){return R.resolve(text,brain,{record:false});}

assert.equal(intent("eso te pregunté").intent,"repair_repeat_question");
assert.equal(intent("pero ya no estamos hablando de eso").intent,"repair_topic_drift");
assert.equal(intent("qué fue lo primero que te dije").intent,"ask_first_user_message");
assert.equal(intent("cómo se llamaba mi perro que tuve?").intent,"ask_pet_name");
assert.equal(intent("cuándo murió mi mascota?").intent,"ask_pet_death_time");
assert.equal(intent("mi color favorito es el negro").intent,"personal_fact_statement");
assert.equal(intent("Los gatos son mamíferos").intent,"fact_statement");
assert.equal(intent("¿Los gatos son mamíferos?").intent,"fact_verification");
assert.equal(intent("que idea es la que me gusta?").intent,"ask_liked_idea");
assert.notEqual(intent("que idea es la que me gusta?").intent,"fact_verification");
assert.equal(intent("que colores me gustan").intent,"ask_user_color_preference");
assert.equal(intent("y cual otro color me gusta a mi?").intent,"ask_user_color_preference");
assert.equal(intent("a que edad yo tenia cuando murio mi perro").intent,"ask_pet_death_time");
assert.equal(intent("y a que edad murio?").intent,"ask_pet_death_time");
assert.equal(intent("que te gustaria hacer hoy?").intent,"ask_desired_action");
assert.equal(intent("quequé color me gusta?").intent,"ask_user_color_preference");
assert.equal(intent("mme gusta el color azul y negro").intent,"preference_statement");
assert.equal(R.semanticPrototype("vale"),null,"una sola palabra nunca debe decidir intención por hashing");
assert.equal(intent("vale").intent,"reaction");
assert.equal(intent("dime otra idea").intent,"ask_another_idea");
assert.equal(intent("dime alguna otra idea para otra mision").intent,"ask_another_mission_idea");
assert.equal(intent("te quiero contar algo").intent,"offer_disclosure");
const tomorrow=intent("qué te gustaría hacer mañana?");
assert.equal(tomorrow.intent,"ask_desired_action");
assert.equal(tomorrow.slots.when,"manana");

const paraphrases=[
  ["me podrías recordar cuál era el nombre de mi mascota?","ask_pet_name"],
  ["qué te dije cuando recién empezamos a hablar?","ask_first_user_message"],
  ["alguna vez tuviste que corregir una opinión tuya?","ask_changed_mind"],
  ["qué clase de misión crearías tú?","ask_mission_idea"]
];

for(const [text,expected] of paraphrases){
  const frame=intent(text);
  assert.equal(frame.intent,expected,`«${text}» debe resolverse como ${expected}, obtuvo ${frame.intent} (${frame.source})`);
  assert.ok(frame.confidence>=.54);
}

brain.hear("me podrías recordar cuál era el nombre de mi mascota?");
assert.equal(brain.intentRouter.current.intent,"ask_pet_name");
assert.equal(R.routeFor(brain,"me podrías recordar cuál era el nombre de mi mascota?","quality"),"ask_pet_name");

console.log("intent router smoke: ok");
