"use strict";

const assert=require("node:assert/strict");

global.window=globalThis;
global.print=()=>{};
global.command=()=>{};
global.short=(s,n=72)=>String(s||"").length<=n?String(s||""):String(s||"").slice(0,n-1)+"…";

global.npcKnowledge={
  commonsense:[
    {subject:"hambre",predicate:"motiva",object:"comida",confidence:.82,domain:"vida_cotidiana"},
    {subject:"gato",predicate:"es_un",object:"mamifero",confidence:.94,domain:"objetos"}
  ],
  sources:[{type:"commonsense",path:"knowledge/commonsense.es.json"}],
  encyclopedia:[{id:"gato",title:"Gato",aliases:["gatos"],text:"Mamífero doméstico.",source:"test"}],
  encyclopediaMatch(text){
    const n=String(text||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    if(/gato/.test(n))return {entry:this.encyclopedia[0],score:.91};
    return null;
  }
};

global.NpcIntSubscribeCommonsense=listener=>listener(global.npcKnowledge.commonsense,{source:"knowledge/commonsense.es.json",ready:true});

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=12;
    this.relation={name:"Jugador"};
    this.dialogue={lastUser:"",lastNpc:"",lastIntent:null,topic:null};
    this.discourse={focus:[],previousUser:"",previousNpc:""};
    this.understanding={lastFrame:null};
    this.mem=[];
    this.lastThoughts=[];
    this.cognitiveState={current:{topic:null,unresolved:[]},history:[]};
    this.dialogueManager={lastIntent:null,sameIntentCount:0};
  }
  say(x){this.dialogue.lastNpc=x;return x;}
  hear(text){this.dialogue.lastUser=text;return this.say(`base:${text}`);}
  event(){return null;}
  tick(){return null;}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

require("../brain-pipeline.js");
require("../concept-registry.js");
require("../reference-resolver.js");
require("../query-frame.js");
require("../semantic-frame-bridge.js");
require("../response-planner.js");

assert.deepEqual(global.NpcIntPipeline.state.stages.hear.map(x=>x.name),[],"ReferenceResolver y QueryFrame no deben contaminar el pipeline mental");

const registry=global.NpcIntConceptRegistry;
const cat=registry.resolve("gatos");
assert.equal(cat.id,"concept:animal:gato");
assert.equal(registry.resolve("GATO").id,cat.id);
assert.notEqual(registry.resolve("gustaría").id,"concept:entity:ia","los alias nunca deben resolverse por substring");

const b=new NpcBrain();
b.discourse.focus.push({kind:"user",text:"Mm, me siento solo aqui",time:10});
b.mem.push({type:"dialogue",text:"Jugador: Mm, me siento solo aqui",confidence:.8,time:10});

b.hear("lo que te dije ahorita");
let rr=b.referenceResolver.last;
assert.equal(rr.references.length,1);
assert.match(rr.references[0].target.text,/me siento solo aqui/i);
assert.equal(rr.references[0].kind,"prior-user-utterance");
assert.equal(b.responsePlanner.lastPlan.queryFrameId,b.queryFrame.current.id);

b.hear("aja dime");
rr=b.referenceResolver.last;
assert.equal(rr.references[0].kind,"continuation");
assert.match(rr.references[0].target.text,/me siento solo aqui/i);

b.hear("¿Te gustan los gatos?");
let frame=b.queryFrame.current;
assert.equal(frame.intent,"ask_preference");
assert.equal(frame.subject.id,"agent:self");
assert.equal(frame.predicate,"likes");
assert.equal(frame.object.id,"concept:animal:gato");
assert.deepEqual(frame.evidenceRequest.stores,["MemoryStore","SocialKnowledgeStore","InternalState"]);
assert.ok(!frame.evidenceRequest.stores.includes("FactualKnowledgeStore"),"un gusto no debe decidirse por enciclopedia");
assert.equal(b.responsePlanner.lastPlan.intentSource,"query-frame");

b.hear("¿Los gatos son mamíferos?");
frame=b.queryFrame.current;
assert.equal(frame.intent,"factual_query");
assert.equal(frame.subject.id,"concept:animal:gato");
assert.equal(frame.predicate,"is_a");
assert.equal(frame.object.id,"concept:animal:mamifero");
assert.ok(frame.evidenceRequest.stores.includes("CommonsenseStore"));
assert.ok(frame.evidenceRequest.stores.includes("FactualKnowledgeStore"));
assert.ok(frame.candidateEvidence.some(x=>x.store==="CommonsenseStore"));
assert.ok(frame.candidateEvidence.some(x=>x.store==="FactualKnowledgeStore"));

b.mem.push({type:"dialogue",text:"Jugador: Prefiero pizza cuando tengo hambre",confidence:.84,time:11});
b.hear("Tengo hambre");
frame=b.queryFrame.current;
assert.equal(frame.intent,"state_statement");
assert.equal(frame.subject.id,"agent:player");
assert.equal(frame.predicate,"has_state");
assert.equal(frame.object.id,"concept:need:hambre");
assert.ok(frame.reasoning.some(x=>/no debe proyectarse/i.test(x)));
assert.ok(frame.candidateEvidence.some(x=>x.store==="CommonsenseStore"));

const trace=global.NpcIntQueryFrame.formatTrace(b);
assert.match(trace,/INPUT/);
assert.match(trace,/FRAME/);
assert.match(trace,/RETRIEVAL/);
assert.match(trace,/REASONING/);
assert.match(trace,/RESPONSE_INTENT/);
assert.match(trace,/qf:/);

console.log("semantic frame foundation smoke: ok");
