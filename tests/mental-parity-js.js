"use strict";

const fs=require("fs");
const path=require("path");

const scenarios=JSON.parse(fs.readFileSync(path.join(__dirname,"parity","mental-scenarios.json"),"utf8"));

global.window={};
global.print=()=>{};
global.command=()=>{};

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=0;
    this.identity={name:"NIA-01",purpose:"comprender el entorno, conservar continuidad y actuar según mis experiencias"};
    this.relation={name:"Jugador",trust:.45};
    this.drives={amenaza:.04,curiosidad:.46,social:.34,proposito:.31,fatiga:.08};
    this.mood={valence:.10,arousal:.22};
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

function applyState(b,state){
  if(!state)return;
  b.mind.needs.hunger=state.hunger;
  b.mind.needs.energy=state.energy;
  b.drives.curiosidad=state.curiosity;
  b.drives.amenaza=state.fear;
  b.relation.trust=state.trust;
  // Evita que la sincronización por fatiga destruya un valor de energía de escenario.
  b.drives.fatiga=1-state.energy;
}

function runScenario(s){
  const b=new NpcBrain();
  applyState(b,s.state||{});
  if(s.kind==="user")b.hear(s.text||"");
  else if(s.kind==="world")b.event(s.text||"");
  else b.tick(s.minutes||1);
  const c=b.mind.lastCycle;
  return {
    id:s.id,
    decision:c?.decision?.id||null,
    topGoal:c?.goals?.[0]?.id||null,
    tags:(c?.perception?.tags||[]).slice().sort()
  };
}

const out={version:scenarios.version,engine:"js",results:scenarios.scenarios.map(runScenario)};
process.stdout.write(JSON.stringify(out));
