"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const config=JSON.parse(fs.readFileSync(path.join(__dirname,"..","config","mental-cycle.v1.json"),"utf8"));
const source=fs.readFileSync(path.join(__dirname,"..","mental-cycle.js"),"utf8");
const match=source.match(/const ACTIONS\s*=\s*(\{[\s\S]*?\});\s*\n\s*function candidateIds/);
assert.ok(match,"no se pudo localizar ACTIONS en mental-cycle.js");
const actions=Function(`"use strict"; return (${match[1]});`)();

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

console.log(`mental tuning config smoke: ${Object.keys(actions).length} actions synced`);
