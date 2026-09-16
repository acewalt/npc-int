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
    this.discourse={previousUser:"hola",previousNpc:"Te sigo.",lastInterpretation:{source:"hola",interpretation:"saludo"},lastCommitment:null,lastRegistered:null};
    this.pragmatics={meaningfulTopic:"conversación"};
    this.mem=[];
    this.lastThoughts=[];
    this.mind=null;
  }
  say(x){this.dialogue.lastNpc=x;return x;}
  remember(type,text,salience){this.mem.push({type,text,salience,time:this.time});}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

require("../understanding.js");

const U=window.NpcIntUnderstanding;
const cases=[
  ["que tienees encuenta","ask_considering"],
  ["que tienes encuenta","ask_considering"],
  ["que inteligencia teines","ask_capabilities"],
  ["informacion para que","ask_information_purpose"],
  ["que sigues","ask_following"],
  ["añadir que","ask_what_add"],
  ["que entiendes","ask_understanding"],
  ["eres gay","ask_orientation"],
  ["te gusta?","ask_preference"],
  ["Mm","backchannel"]
];

for(const [input,expected] of cases){
  const got=U.classify(input,brain).intent;
  assert.strictEqual(got,expected,`${input}: esperado ${expected}, recibido ${got}`);
}

const repaired=U.canonical("que inteligencia teines");
assert.strictEqual(repaired.text,"que inteligencia tienes");
assert.ok(repaired.repaired.some(x=>x.includes("teines→tienes")));

console.log("understanding smoke: ok");
