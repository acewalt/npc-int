"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const config=JSON.parse(fs.readFileSync(path.join(__dirname,"..","config","mental-cycle.v1.json"),"utf8"));
const source=fs.readFileSync(path.join(__dirname,"..","mental-cycle.js"),"utf8");
const match=source.match(/const ACTIONS\s*=\s*(\{[\s\S]*?\});\s*\n\s*function candidateIds/);
assert.ok(match,"no se pudo localizar ACTIONS en mental-cycle.js");
const actions=Function(`"use strict"; return (${match[1]});`)();

global.window={};
global.print=()=>{};
global.command=()=>{};

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=0;
    this.identity={name:"NIA-01",purpose:"comprender el entorno"};
    this.relation={name:"Jugador",trust:.5};
    this.drives={amenaza:.04,curiosidad:.46,social:.34,proposito:.31,fatiga:.08};
    this.mood={valence:.1,arousal:.22};
    this.personality={caution:.48};
    this.cognition={facts:[]};
    this.lastThoughts=[];
    this.mem=[];
  }
  recall(){return [];}
  hear(){return null;}
  event(){return null;}
  tick(minutes=1){this.time+=Math.max(0,Number(minutes)||0);return null;}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();
require("../brain-pipeline.js");
require("../mental-cycle.js");

function round(v){return typeof v==="number"?Math.round(v*1e6)/1e6:v;}
function normalizedAction(x){
  return {
    label:x.label,
    cost:round(x.cost),
    risk:round(x.risk),
    info:round(x.info),
    social:round(x.social),
    align:Object.fromEntries(Object.entries(x.align||{}).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,round(v)]))
  };
}

assert.deepStrictEqual(Object.keys(actions).sort(),Object.keys(config.actions).sort(),"las acciones declaradas deben coincidir");
for(const id of Object.keys(config.actions)){
  assert.deepStrictEqual(normalizedAction(actions[id]),normalizedAction(config.actions[id]),`tuning distinto para ${id}`);
}

for(const [name,value] of Object.entries(config.scoring)){
  assert.ok(Number.isFinite(value),`scoring.${name} debe ser numérico`);
}
assert.ok(config.scoring.normalizer>0,"normalizer debe ser positivo");
assert.ok(config.goalThresholds.food>=0&&config.goalThresholds.food<=1);
assert.ok(config.goalThresholds.restEnergyBelow>=0&&config.goalThresholds.restEnergyBelow<=1);

const mentalApi=window.NpcIntMentalCycle;
assert.ok(mentalApi&&Array.isArray(mentalApi.hostileTerms),"mental-cycle debe exponer el vocabulario que usa");
assert.ok(Array.isArray(config.perception?.hostileTerms),"config.perception.hostileTerms debe ser una lista");
assert.deepStrictEqual(mentalApi.hostileTerms,config.perception.hostileTerms,"mental-cycle debe usar el mismo vocabulario hostil declarado en config");
assert.strictEqual(new Set(mentalApi.hostileTerms).size,mentalApi.hostileTerms.length,"el vocabulario hostil no debe tener duplicados");
for(const term of mentalApi.hostileTerms){
  assert.strictEqual(term,term.toLowerCase(),`término hostil sin normalizar: ${term}`);
  assert.ok(mentalApi.detect(`Eres ${term}`).includes("hostile"),`el detector no consume perception.hostileTerms: ${term}`);
}

console.log(`mental tuning config smoke: ${Object.keys(actions).length} actions and ${mentalApi.hostileTerms.length} hostile terms synced`);
