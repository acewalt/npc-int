"use strict";

const assert=require("assert");
global.window={};
global.print=()=>{};
global.command=()=>{};
global.short=(s,n=72)=>String(s||"").length<=n?String(s||""):String(s||"").slice(0,n-1)+"…";

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=0;
    this.identity={name:"NIA-01"};
    this.relation={name:"Jugador",trust:.5};
    this.cognition={facts:[]};
    this.mem=[];
    this.lastThoughts=[];
    this.nlp=null;
    this.mind={
      perceptions:[],
      lastCycle:{
        perception:{type:"time",text:""},
        goals:[{id:"understand",label:"reducir incertidumbre",priority:.72}],
        options:[{id:"observe",label:"observar",score:.56,risk:.04},{id:"investigate",label:"investigar",score:.48,risk:.2}],
        decision:{id:"observe",label:"observar",score:.56,risk:.04}
      }
    };
    this.cognitiveState={current:{workingMemory:[]},workingMemory:[],history:[]};
  }
  say(x){this.lastNpc=x;return x;}
  hear(text){return `fallback inferior para ${text}`;}
  event(text){
    const p={type:"world",text,tags:[]};
    this.mind.perceptions.push(p);
    this.mind.lastCycle.perception=p;
    this.mem.push({type:"world",text,salience:.8});
    this.cognitiveState.current={input:`Evento del mundo: ${text}`,intent:"world_event",topic:text,workingMemory:[],goal:{id:"understand",label:"reducir incertidumbre",priority:.72},action:{id:"observe",label:"observar",score:.56},unresolved:[]};
    this.cognitiveState.history.push(this.cognitiveState.current);
    return null;
  }
  tick(){return null;}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

require("../concept-graph.js");
require("../hypothesis-engine.js");
require("../idea-engine.js");
require("../idea-response-bridge.js");

const b=new NpcBrain();
b.event("se escuchó un golpe detrás de la puerta");

assert.ok(b.conceptGraph?.current,"debe existir activación conceptual");
const concepts=b.conceptGraph.current.concepts.map(x=>x.id);
assert.ok(concepts.includes("golpe"),"golpe debe ser concepto observado");
assert.ok(concepts.includes("puerta"),"puerta debe ser concepto observado");
assert.ok(concepts.includes("persona"),"persona debe poder activarse como posibilidad causal");

const hs=b.hypothesisEngine?.current?.hypotheses||[];
assert.ok(hs.length>=3,"un golpe debe producir explicaciones competidoras");
assert.ok(hs.every(h=>h.status==="unverified"),"ninguna hipótesis debe convertirse en hecho automáticamente");
assert.ok(hs.every(h=>h.confidence<.9),"la inferencia no debe fingir certeza");
const person=hs.find(h=>h.cause.id==="persona");
assert.ok(person,"debe considerar una persona como una posibilidad");
assert.ok(!person.evidenceFor.some(e=>/observó.*persona/i.test(e.text)),"una causa inferida no puede contarse como observación directa");

const idea=b.ideaEngine?.current;
assert.ok(idea?.synthesis?.claim,"debe sintetizar una idea");
assert.ok(idea.critique,"debe criticar su propia idea");
assert.ok(idea.recommendedTest,"debe proponer una prueba discriminativa");
assert.ok(idea.recommendedAction?.id,"debe convertir la prueba en una orientación de acción");
assert.ok(b.cognitiveState.current.idea,"la idea debe entrar en el estado cognitivo");
assert.ok(b.mind.lastCycle.ideaGuidance,"la idea debe quedar disponible para deliberación");

let r=b.hear("que posibilidades hay");
assert.match(r,/considerando|posibilidad|explicaci/i);
assert.match(r,/prueba|ayudaría|distinguir/i);
assert.doesNotMatch(r,/%/,"la conversación normal no debe exponer métricas internas");

r=b.hear("que opinas");
assert.match(r,/explicaci|posibilidad|evidencia|distinguir/i);
assert.doesNotMatch(r,/%/);

r=b.hear("que estas pensando");
assert.match(r,/posibilidad|evaluando|comparando|evidencia/i);
assert.doesNotMatch(r,/%/);

console.log("idea engine smoke: ok");
