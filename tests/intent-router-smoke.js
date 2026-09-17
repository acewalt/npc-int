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
assert.equal(intent("mi color favorito es el negro").intent,"preference_statement");
assert.equal(intent("Los gatos son mamíferos").intent,"fact_statement");
assert.equal(intent("¿Los gatos son mamíferos?").intent,"fact_verification");

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
