"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.join(__dirname,"..");
const pack=JSON.parse(fs.readFileSync(path.join(root,"knowledge","commonsense.es.json"),"utf8"));
const schema=JSON.parse(fs.readFileSync(path.join(root,"contracts","commonsense.v1.schema.json"),"utf8"));
const allowedDomains=new Set(schema.$defs.relation.properties.domain.enum);
const allowedFields=new Set(schema.$defs.relation.required);

assert.strictEqual(pack.version,1);
assert.strictEqual(pack.language,"es");
assert.ok(pack.relations.length>=schema.properties.relations.minItems,"el pack debe superar el mínimo contractual");
assert.strictEqual(new Set(pack.relations.map(r=>`${r.subject}|${r.predicate}|${r.object}`)).size,pack.relations.length,"no debe haber relaciones duplicadas");
for(const relation of pack.relations){
  assert.deepStrictEqual(new Set(Object.keys(relation)),allowedFields,"cada relación debe respetar additionalProperties=false");
  assert.ok(relation.subject.length>=2&&relation.object.length>=2,"sujeto y objeto no pueden ser placeholders");
  assert.match(relation.predicate,/^[a-z][a-z0-9_]*$/);
  assert.ok(Number.isFinite(relation.confidence)&&relation.confidence>=0&&relation.confidence<=1);
  assert.ok(allowedDomains.has(relation.domain),`dominio desconocido: ${relation.domain}`);
}
for(const domain of allowedDomains){
  assert.ok(pack.relations.filter(r=>r.domain===domain).length>=20,`${domain} necesita cobertura sustancial`);
}

global.window={setTimeout};
global.print=()=>{};
global.command=()=>{};
global.send=()=>{};
global.clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
global.short=(s,n=72)=>String(s||"").slice(0,n);

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=0;
    this.identity={name:"NIA-01"};
    this.relation={name:"Jugador",trust:.5};
    this.dialogue={turn:0};
    this.drives={social:.5,curiosidad:.5};
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
  remember(type,text,salience){this.mem.push({type,text,salience});}
  thoughts(text){this.lastThoughts=[`OBSERVACIÓN: ${text}`];}
  say(text){this.lastNpc=text;return text;}
  hear(text){return `fallback inferior para ${text}`;}
  event(text){
    const perception={type:"world",text,tags:[]};
    this.mind.perceptions.push(perception);
    this.mind.lastCycle.perception=perception;
    this.mem.push({type:"world",text,salience:.8});
    this.cognitiveState.current={input:`Evento del mundo: ${text}`,intent:"world_event",topic:text,workingMemory:[],unresolved:[]};
    this.cognitiveState.history.push(this.cognitiveState.current);
    return null;
  }
  tick(){return null;}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();
global.fetch=async url=>{
  const local=path.join(root,String(url).replace(/\//g,path.sep));
  const data=JSON.parse(fs.readFileSync(local,"utf8"));
  if(String(url)==="knowledge/commonsense.es.json"){
    data.relations.push({subject:"x",predicate:"INVALID PREDICATE",object:"",confidence:4,domain:"inventado"});
  }
  return {ok:true,json:async()=>data};
};

// Mismo orden asíncrono que usa index.html: cognición espera al cargador,
// knowledge inicia fetch y el grafo se suscribe mientras la carga está en curso.
require("../cognition.js");
require("../knowledge.js");
require("../concept-graph.js");
require("../hypothesis-engine.js");
require("../idea-engine.js");

(async()=>{
  for(let i=0;i<30&&!global.npcKnowledge.ready;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.strictEqual(global.npcKnowledge.ready,true,"la carga asíncrona debe finalizar");
  const graphLoad=await window.NpcIntConceptGraph.commonsenseReady;

  assert.strictEqual(global.npcKnowledge.commonsense.length,pack.relations.length,"knowledge.js debe aceptar todo el pack válido");
  assert.strictEqual(global.npcKnowledge.commonsenseRejected,1,"la validación de runtime debe aislar una relación malformada");
  assert.strictEqual(graphLoad.relations,pack.relations.length,"el grafo debe recibir el mismo snapshot canónico");

  const cause=window.NpcIntConceptGraph.causesOf("charco").find(x=>x.cause==="fuga");
  assert.ok(cause,"una relación que solo existe en el JSON debe llegar al grafo");
  assert.strictEqual(window.NpcIntConceptGraph.neighbors("fuga").out.find(x=>x.to==="charco")?.source,"commonsense");

  const b=new NpcBrain();
  assert.strictEqual(b.cognition.loaded,true,"una instancia creada después del fetch debe hidratarse inmediatamente");
  assert.ok(b.cognition.facts.some(f=>f.subject==="fuga"&&f.predicate==="puede_causar"&&f.object==="charco"&&f.source==="commonsense"));

  b.event("apareció un charco junto a la pared");
  const hypotheses=b.hypothesisEngine?.current?.hypotheses||[];
  assert.ok(hypotheses.some(h=>h.cause.id==="fuga"&&h.effect.id==="charco"),"el pack debe producir una hipótesis causal nueva");
  assert.match(b.ideaEngine.current.synthesis.claim,/fuga/i,"la relación del pack debe enriquecer la idea sintetizada");

  const answer=b.hear("¿destornillador es objeto?");
  assert.match(answer,/sí: relaciono destornillador con objeto/i,"la cadena del pack debe habilitar inferencia transitiva");
  assert.ok(b.cognition.facts.some(f=>f.subject==="destornillador"&&f.predicate==="es_un"&&f.object==="objeto"&&f.derived));

  console.log(`commonsense integration smoke: ok (${pack.relations.length} relations)`);
})().catch(err=>{console.error(err);process.exitCode=1;});
