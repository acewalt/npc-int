"use strict";

const assert=require("assert");

global.window={};
global.short=(s,n=72)=>String(s||"").length<=n?String(s||""):String(s||"").slice(0,n-1)+"…";
global.print=()=>{};
global.command=()=>{};

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=10;
    this.silence=0;
    this.identity={name:"NIA-01"};
    this.relation={name:"Jugador",trust:.5};
    this.drives={curiosidad:.7};
    this.dialogue={lastNpc:"Puedo conectar Nanochat local.",lastUser:"vale",topic:"Nanochat local"};
    this.discourse={previousNpc:"Puedo conectar Nanochat local.",focus:[{kind:"interpretation",text:"Nanochat local"}],lastRegistered:null,lastCommitment:null,lastInterpretation:null};
    this.pragmatics={meaningfulTopic:"Nanochat local"};
    this.mind={lastCycle:{
      goals:[{label:"reducir incertidumbre",priority:.72}],
      decision:{id:"ask",label:"preguntar",score:.66},
      options:[
        {id:"ask",label:"preguntar",score:.66},
        {id:"observe",label:"observar",score:.52},
        {id:"wait",label:"esperar",score:.08}
      ]
    }};
    this.lastThoughts=[];
  }
  moodLabel(){return "neutral";}
  dominant(){return "curiosidad";}
  goalFor(){return "reducir incertidumbre";}
  say(x){this.dialogue.lastNpc=x;return x;}
  hear(){return "respuesta inferior incorrecta";}
  tick(){return "Ha pasado bastante tiempo. ¿Sigues ahí?";}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

require("../dialogue-manager.js");

const D=window.NpcIntDialogueManager;
const cases=[
  ["que pasa","ask_situation"],
  ["qué ocurre","ask_situation"],
  ["entonces por donde empezamos","ask_next_step"],
  ["por donde empezamos","ask_next_step"],
  ["que hacemos ahora","ask_next_step"],
  ["y ahora","ask_next_step"],
  ["que vas hacer","ask_future_action"],
  ["que vas a hacer","ask_future_action"],
  ["que piensas hacer ahora","ask_future_action"],
  ["que te gustaria hacer","ask_desired_action"],
  ["y que quieres hacer","ask_desired_action"],
  ["pero que quieres hacer","ask_desired_action"],
  ["bueno que quieres hacer","ask_desired_action"],
  ["a ver que quieres hacer","ask_desired_action"],
  ["sigo aqui","presence"],
  ["aqui estoy","presence"],
  ["vale conectalo","directive_with_reference"],
  ["conectalo","directive_with_reference"],
  ["hazlo","directive_with_reference"],
  ["eso que significa","ask_deictic_reference"],
  ["vale","ack"]
];

for(const [input,expected] of cases){
  const got=D.classify(input).intent;
  assert.strictEqual(got,expected,`${input}: esperado ${expected}, recibido ${got}`);
}

const b=new NpcBrain();
assert.match(b.hear("que pasa"),/Ahora mismo estoy/);
assert.match(b.hear("entonces por donde empezamos"),/siguiente|Podemos seguir|aclarar|observar/i);
assert.match(b.hear("y ahora"),/siguiente|Podemos seguir|aclarar|observar/i);
assert.match(b.hear("que vas hacer"),/intención|voy a|Por ahora|observar/i);
assert.match(b.hear("que te gustaria hacer"),/me inclino|prioridades|pref/i);
assert.match(b.hear("vale"),/Vale|Entendido|De acuerdo/);
assert.match(b.hear("sigo aqui"),/te tengo presente/i);
assert.match(b.hear("vale conectalo"),/Nanochat|conexión neuronal/i);

const r1=b.hear("que quieres hacer");
const r2=b.hear("que quieres hacer");
const r3=b.hear("pero que quieres hacer");
assert.notStrictEqual(r1,r2,"repetir intención debe refinar, no clonar la respuesta");
assert.match(r2,/Más directo|quiero/i);
assert.match(r3,/Más directo|Lo más concreto|quiero/i);
assert.strictEqual(b.dialogueManager.lastIntent,"ask_desired_action");
assert.ok(b.dialogueManager.sameIntentCount>=3);

b.time=20;
b.hear("sigo aqui");
b.time=22;
assert.strictEqual(b.tick(2),null);

console.log("dialogue manager smoke: ok");
