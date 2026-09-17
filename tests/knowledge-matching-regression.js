"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

class NpcBrain{
  constructor(){
    this.dialogue={turn:0,lastUser:"",lastIntent:"",topic:""};
    this.relation={name:"Jugador",familiarity:0};
    this.drives={social:0,curiosidad:0};
    this.lastThoughts=[];
  }
  hear(){return "base";}
  say(x){return x;}
  remember(){}
  thoughts(){}
}

const ctx={
  console,
  URLSearchParams,
  setTimeout,
  clearTimeout,
  NpcBrain,
  brain:new NpcBrain(),
  clamp:(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),
  short:(s,n=100)=>String(s||"").slice(0,n),
  print:()=>{},
  command:()=>{},
  send:()=>{},
  fetch:async url=>({
    ok:true,
    json:async()=>String(url).includes("manifest.json")?{packs:[]}:{query:{pages:[]}}
  })
};
ctx.window=ctx;
ctx.globalThis=ctx;
vm.createContext(ctx);

const source=fs.readFileSync(path.join(__dirname,"..","knowledge.js"),"utf8");
vm.runInContext(source,ctx,{filename:"knowledge.js"});

const store=ctx.npcKnowledge;
store.encyclopedia.push(
  {id:"ia",title:"Inteligencia artificial",aliases:["IA"],tags:["informática"],text:"IA local"},
  {id:"filosofia",title:"Filosofía",aliases:[],tags:["pensamiento"],text:"Filosofía local"},
  {id:"real-cedula",title:"Real cédula",aliases:["real"],tags:["historia"],text:"Documento histórico"}
);

assert.equal(store.matchingConfig.nativeTokenSafe,true);
assert.equal(store.encyclopediaMatch("Y te gustaría conocer a alguien más?"),null,"IA no puede aparecer por substring dentro de gustaría");
const ia=store.encyclopediaMatch("¿Qué es IA?");
assert.ok(ia&&ia.entry.id==="ia"&&ia.score>.9,"IA debe seguir funcionando como token exacto");
assert.equal(store.localAnswer("Y te gustaría conocer a alguien más?"),null,"una pregunta social no debe abrir conocimiento local");
assert.equal(store.isFactualQuery("¿Qué es real para ti?"),false,"una definición subjetiva no debe consultar Wikipedia");
assert.equal(store.localAnswer("¿Qué es real para ti?"),null,"real para ti no debe resolver Real cédula");
assert.equal(store.isFactualQuery("¿Qué sabes de la filosofía?"),true);
assert.equal(store.topicFromQuestion("¿Qué sabes de la filosofía?"),"la filosofía");
assert.equal(store.localAnswer("¿Qué sabes de la filosofía?").title,"Filosofía");

console.log("knowledge matching regression: ok");
