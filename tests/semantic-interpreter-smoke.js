"use strict";

const assert=require("assert");
global.window={};
global.print=()=>{};
require("../semantic-interpreter.js");

const I=global.window.NpcIntSemanticInterpreter;

function analysis(tokens,{question=true,predicate=null,roles=[]}={}){
  const frame={
    speechType:question?"question":"statement",
    predicate:predicate||tokens.find(t=>t.deprel==="root")||tokens.find(t=>["VERB","AUX"].includes(t.upos))||null,
    roles,negated:false,
    questionWords:tokens.filter(t=>["qué","que","cómo","como","por qué"].includes((t.lemma||t.text).toLowerCase())).map(t=>t.lemma||t.text)
  };
  return {backend:"stanza",model:"test",sentences:[{id:0,text:"test",tokens,semanticFrame:frame}],frames:[frame],entities:[],coreferences:[]};
}
function t(id,text,lemma,upos,feats={},deprel="dep",head=0){return {id,text,lemma,upos,feats,deprel,head};}

let a=analysis([
  t(1,"Qué","qué","PRON",{},"obj",2),
  t(2,"haces","hacer","VERB",{Person:"2",Number:"Sing",Tense:"Pres"},"root",0)
]);
assert.strictEqual(I.interpret("que haces",a,{}).intent,"ask_activity");

a=analysis([
  t(1,"Qué","qué","PRON",{},"obj",3),
  t(2,"estás","estar","AUX",{Person:"2",Tense:"Pres"},"aux",3),
  t(3,"haciendo","hacer","VERB",{VerbForm:"Ger"},"root",0)
]);
assert.strictEqual(I.interpret("qué estás haciendo",a,{}).intent,"ask_activity");

a=analysis([
  t(1,"Qué","qué","PRON",{},"obj",3),
  t(2,"estás","estar","AUX",{Person:"2",Tense:"Pres"},"aux",3),
  t(3,"pensando","pensar","VERB",{VerbForm:"Ger"},"root",0)
]);
assert.strictEqual(I.interpret("Qué estás pensando",a,{}).intent,"ask_current_thought");

a=analysis([
  t(1,"En","en","ADP",{},"case",2),
  t(2,"qué","qué","PRON",{},"obl",3),
  t(3,"piensas","pensar","VERB",{Person:"2",Tense:"Pres"},"root",0)
]);
assert.strictEqual(I.interpret("en qué piensas",a,{}).intent,"ask_current_thought");

a=analysis([
  t(1,"Qué","qué","PRON",{},"obj",3),
  t(2,"quieres","querer","VERB",{Person:"2",Tense:"Pres"},"root",0),
  t(3,"hacer","hacer","VERB",{VerbForm:"Inf"},"xcomp",2)
],{predicate:{text:"quieres",lemma:"querer",upos:"VERB",feats:{Person:"2",Tense:"Pres"}}});
assert.strictEqual(I.interpret("pero que quieres hacer",a,{}).intent,"ask_desired_action");

a=analysis([
  t(1,"Qué","qué","PRON",{},"obj",4),
  t(2,"vas","ir","AUX",{Person:"2",Tense:"Pres"},"aux",4),
  t(3,"a","a","ADP",{},"mark",4),
  t(4,"hacer","hacer","VERB",{VerbForm:"Inf"},"root",0)
]);
assert.strictEqual(I.interpret("que vas a hacer",a,{}).intent,"ask_future_action");

a=analysis([
  t(1,"Qué","qué","PRON",{},"obj",3),
  t(2,"puedes","poder","AUX",{Person:"2",Tense:"Pres"},"aux",3),
  t(3,"hacer","hacer","VERB",{VerbForm:"Inf"},"root",0)
]);
assert.strictEqual(I.interpret("que puedes hacer",a,{}).intent,"ask_capabilities");

a=analysis([
  t(1,"Qué","qué","PRON",{},"obj",2),
  t(2,"recuerdas","recordar","VERB",{Person:"2",Tense:"Pres"},"root",0)
]);
assert.strictEqual(I.interpret("que recuerdas",a,{}).intent,"ask_memory_semantic");

console.log("semantic interpreter smoke: ok");
