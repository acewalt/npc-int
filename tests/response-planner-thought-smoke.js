"use strict";

const assert=require("assert");

global.window={};
global.print=()=>{};
global.command=()=>{};
global.short=(s,n=72)=>String(s||"").length<=n?String(s||""):String(s||"").slice(0,n-1)+"…";

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=12;
    this.mem=[{type:"world",text:"Se escuchó un golpe detrás de la puerta",salience:.9}];
    this.dialogueManager=null;
    this.understanding={lastFrame:null};
    this.responsePlanner=null;
    this.lastThoughts=[];
    this.cognitiveState={
      current:null,
      history:[{
        id:1,input:"Evento del mundo: se escuchó un golpe detrás de la puerta",intent:"world_event",
        topic:"Se escuchó un golpe detrás de la puerta",
        goal:{id:"understand",label:"averiguar qué produjo el golpe",priority:.82},
        action:{id:"investigate",label:"investigar",score:.73,risk:.18},
        unresolved:["no sé qué produjo el golpe"]
      }]
    };
  }
  say(x){this.lastSaid=x;return x;}
  hear(){return this.say("No estoy seguro de qué relación quieres expresar. ¿Puedes completar la idea?");}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

window.NpcIntCognitiveState={
  refresh(b,input,meta){
    const s={
      id:2,input,intent:meta?.intent||null,topic:input,
      goal:{id:"social",label:"mantener una interacción coherente",priority:.5},
      action:null,unresolved:[],workingMemory:[]
    };
    b.cognitiveState.current=s;
    b.cognitiveState.history.push(s);
    return s;
  }
};

require("../response-planner.js");

const out=brain.hear("Que estás pensando");
assert.ok(out,"debe producir una respuesta");
assert.ok(!/no estoy seguro de qué relación/i.test(out),"no debe conservar el fallback de relación");
assert.ok(/golpe detrás de la puerta/i.test(out),"debe recuperar el foco cognitivo anterior");
assert.ok(/averiguar qué produjo el golpe/i.test(out),"debe verbalizar el objetivo mental activo");
assert.ok(/investigar/i.test(out),"debe verbalizar la acción considerada");
assert.ok(!/\d+%/.test(out),"la conversación normal no debe exponer métricas internas");
assert.strictEqual(brain.responsePlanner.lastPlan.intent,"ask_current_thought");
assert.strictEqual(brain.responsePlanner.lastPlan.act,"report_current_thought");

console.log("response planner current-thought smoke: ok");
