"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

class NpcBrain{
  constructor(){
    this.time=0;
    this.silence=0;
    this.mem=[];
    this.lastThoughts=[];
    this.relation={name:"Jugador"};
    this.dialogue={turn:0,lastIntent:"",previousIntent:"",lastUser:"",lastNpc:"",topic:"tienes acceso internet"};
    this.discourse={
      previousUser:"tienes acceso internet",
      previousNpc:"respuesta anterior",
      lastInterpretation:{source:"que color te gusta",interpretation:"una pregunta sobre una preferencia de color"},
      lastRegistered:null
    };
    this.pragmatics={meaningfulTopic:"tienes acceso internet"};
    this.mind={lastCycle:{goals:[],decision:null}};
    this.cognitiveState={current:{}};
  }
  reset(){}
  hear(){return this.say("respuesta base");}
  say(x){this.dialogue.lastNpc=x;this.discourse.previousNpc=x;return x;}
  remember(type,text){this.mem.push({type,text});}
}

const ctx={
  console,
  NpcBrain,
  brain:new NpcBrain(),
  print:()=>{},
  command:()=>{},
  short:(s,n=100)=>String(s||"").slice(0,n),
  npcKnowledge:{
    localAnswer:()=>null,
    wikipediaAnswer:async()=>null
  }
};
ctx.window=ctx;
ctx.globalThis=ctx;
vm.createContext(ctx);

for(const file of ["semantic-interpreter.js","understanding.js"]){
  const source=fs.readFileSync(path.join(__dirname,"..",file),"utf8");
  vm.runInContext(source,ctx,{filename:file});
}

const conceptAnalysis={
  backend:"test",
  sentences:[{tokens:[
    {id:1,text:"Qué",lemma:"qué",upos:"PRON",feats:{}},
    {id:2,text:"entiendes",lemma:"entender",upos:"VERB",feats:{Person:"2"},deprel:"root"},
    {id:3,text:"tú",lemma:"tú",upos:"PRON",feats:{Person:"2"}},
    {id:4,text:"como",lemma:"como",upos:"SCONJ",feats:{}},
    {id:5,text:"conciencia",lemma:"conciencia",upos:"NOUN",feats:{}}
  ]}],
  frames:[{speechType:"question",questionWords:["qué"],roles:[]}]
};
const conceptGuess=ctx.NpcIntSemanticInterpreter.inferIntent("¿Qué entiendes tú como conciencia?",conceptAnalysis);
assert.equal(conceptGuess.intent,"ask_concept_understanding");
assert.equal(conceptGuess.topic,"conciencia");

const anaphoricAnalysis={
  backend:"test",
  sentences:[{tokens:[
    {id:1,text:"Entendiste",lemma:"entender",upos:"VERB",feats:{Person:"2"},deprel:"root"},
    {id:2,text:"eso",lemma:"eso",upos:"PRON",feats:{}}
  ]}],
  frames:[{speechType:"question",questionWords:[],roles:[]}]
};
assert.equal(ctx.NpcIntSemanticInterpreter.inferIntent("¿Entendiste eso?",anaphoricAnalysis).intent,"ask_understanding");

const b=ctx.brain;
let frame=ctx.NpcIntUnderstanding.classify("¿Qué entiendes tú como conciencia?",b);
assert.equal(frame.intent,"ask_concept_understanding");
assert.equal(frame.topic,"conciencia");

let out=b.hear("¿Qué entiendes tú como conciencia?");
assert.match(out,/experiencia subjetiva/i);
assert.doesNotMatch(out,/que color te gusta/i);

b.dialogue.topic="tienes acceso internet";
b.pragmatics.meaningfulTopic="tienes acceso internet";
out=b.hear("¿Qué color te gusta?");
assert.match(out,/«color»/i);
assert.doesNotMatch(out,/si te refieres a «tienes acceso internet»/i);

b.discourse.lastInterpretation={source:"Mm, me siento solo aquí",interpretation:"expresaste una sensación de soledad"};
out=b.hear("¿Entendiste eso?");
assert.match(out,/Mm, me siento solo aquí/i);

out=b.hear("¿Qué es real para ti?");
assert.match(out,/estado del mundo/i);
assert.match(out,/hipótesis/i);
assert.doesNotMatch(out,/real cédula/i);

out=b.hear("¿Tienes acceso a internet?");
assert.match(out,/acceso de red limitado/i);
assert.match(out,/Wikipedia/i);

console.log("context reference regression: ok");
