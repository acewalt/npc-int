"use strict";

const assert=require("assert");

global.window={};
global.clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
global.short=(s,n=72)=>String(s||"").length<=n?String(s||""):String(s||"").slice(0,n-1)+"…";
global.print=()=>{};
global.command=()=>{};

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=0;
    this.silence=0;
    this.identity={name:"NIA-01"};
    this.relation={name:"Jugador"};
    this.dialogue={turn:0,lastIntent:"none",previousIntent:"none",lastUser:"",lastNpc:""};
    this.mem=[];
    this.lastThoughts=[];
    this.drives={curiosidad:.5};
    this.mind={needs:{hunger:.25,energy:.8},lastCycle:{goals:[{label:"reducir incertidumbre",priority:.7}],decision:{label:"preguntar",score:.6}}};
  }
  say(x){this.dialogue.lastNpc=x;return x;}
  remember(type,text,salience=.5){this.mem.push({type,text,salience,time:this.time});}
  hear(){return "fallback";}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

require("../self-model.js");

const S=window.NpcIntSelfModel;
const cases=[
  ["que haces","ask_current_activity",null],
  ["que ahces","ask_current_activity",null],
  ["que estas haciendo","ask_current_activity",null],
  ["tu puedes comer ?","ask_embodied_capability","comer"],
  ["puedes caminar","ask_embodied_capability","caminar"],
  ["puedes pensar","ask_embodied_capability","pensar"],
  ["que recuerdas de tu vida","ask_autobiography",null],
  ["que has vivido","ask_autobiography",null]
];

for(const [input,intent,action] of cases){
  const got=S.classify(input);
  assert.strictEqual(got.intent,intent,`${input}: esperado ${intent}, recibido ${got.intent}`);
  assert.strictEqual(got.action,action,`${input}: acción esperada ${action}, recibida ${got.action}`);
}

assert.strictEqual(S.canonical("que ahces").text,"que haces");

const b=new NpcBrain();
b.remember("dialogue","Jugador: hola",.6);
b.remember("world","Mundo: se apagaron las luces",.8);
b.remember("fact","El jugador tiene una llave",.9);
const episodes=S.lifeEpisodes(b);
assert.strictEqual(episodes.length,2);
assert.ok(episodes.some(x=>x.type==="world"));
assert.ok(episodes.some(x=>x.type==="fact"));
assert.ok(!episodes.some(x=>/hola/.test(x.text)));

console.log("self model smoke: ok");
