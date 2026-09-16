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
    this.mind={lastCycle:{goals:[{label:"reducir incertidumbre",priority:.72}],decision:{id:"ask",label:"preguntar",score:.66}}};
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
  ["sigo aqui","presence"],
  ["aqui estoy","presence"],
  ["vale conectalo","directive_with_reference"],
  ["conectalo","directive_with_reference"],
  ["hazlo","directive_with_reference"],
  ["eso que significa","ask_deictic_reference"]
];

for(const [input,expected] of cases){
  const got=D.classify(input).intent;
  assert.strictEqual(got,expected,`${input}: esperado ${expected}, recibido ${got}`);
}

const b=new NpcBrain();
assert.match(b.hear("que pasa"),/Ahora mismo estoy/);
assert.match(b.hear("entonces por donde empezamos"),/Empezaría|Podemos empezar/);
assert.match(b.hear("sigo aqui"),/te tengo presente/i);
assert.match(b.hear("vale conectalo"),/Nanochat|conexión neuronal/i);

// Después de decir explícitamente que sigue presente, una comprobación automática
// inmediata de presencia debe ser suprimida.
b.time=20;
b.hear("sigo aqui");
b.time=22;
assert.strictEqual(b.tick(2),null);

console.log("dialogue manager smoke: ok");
