"use strict";

const assert=require("assert");

global.window={};
global.short=(s,n=72)=>String(s||"").length<=n?String(s||""):String(s||"").slice(0,n-1)+"…";
global.print=()=>{};
global.command=()=>{};

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=4;
    this.identity={name:"NIA-01",purpose:"comprender el entorno"};
    this.relation={name:"Jugador",trust:.5};
    this.drives={curiosidad:.7,amenaza:.02,fatiga:.1};
    this.dialogue={lastUser:"",lastNpc:"",lastIntent:null,topic:null};
    this.discourse={focus:[],previousNpc:"",lastRegistered:null,lastCommitment:null};
    this.pragmatics={meaningfulTopic:null};
    this.understanding={lastFrame:null};
    this.cognition={facts:[]};
    this.mem=[];
    this.lastThoughts=[];
    this.mind={
      affect:{fear:.02},
      cognition:{curiosity:.7,certainty:.55},
      needs:{energy:.88},
      lastCycle:{
        goals:[{id:"understand",label:"reducir incertidumbre",priority:.72,reason:"curiosidad"}],
        decision:{id:"ask",label:"preguntar",score:.66,risk:.02},
        options:[
          {id:"ask",label:"preguntar",score:.66,risk:.02},
          {id:"observe",label:"observar",score:.52,risk:.05},
          {id:"wait",label:"esperar",score:.08,risk:.1}
        ]
      }
    };
    this.dialogueManager={lastIntent:null,lastCanonical:null,sameIntentCount:0};
  }
  moodLabel(){return "neutral";}
  say(x){this.dialogue.lastNpc=x;return x;}
  hear(text){
    this.dialogue.lastUser=text;
    return `respuesta técnica inferior 34% / 37% para ${text}`;
  }
  event(text){this.mem.push({type:"world",text:`Mundo: ${text}`,salience:.8});return null;}
  tick(){return null;}
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

window.NpcIntDialogueManager={
  classify(text){
    const n=String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
    let intent=null;
    if(n==="que quieres hacer"||n==="y que quieres hacer")intent="ask_desired_action";
    if(n==="que vas a hacer")intent="ask_future_action";
    if(n==="que pasa")intent="ask_situation";
    return {canonical:n,intent};
  }
};

require("../cognitive-state.js");
require("../response-planner.js");

const b=new NpcBrain();

let r=b.hear("que haces");
assert.match(r,/hablando contigo/i);
assert.doesNotMatch(r,/%/);

r=b.hear("que quieres hacer");
assert.match(r,/quiero|pasar de conversar/i);
assert.doesNotMatch(r,/%/);
assert.ok(b.responsePlanner.lastPlan);
assert.strictEqual(b.responsePlanner.lastPlan.act,"state_preference");
assert.strictEqual(b.responsePlanner.lastPlan.exposeMetrics,false);

r=b.hear("que vas a hacer");
assert.match(r,/voy a|por ahora/i);
assert.doesNotMatch(r,/%/);

b.event("se escuchó un golpe detrás de la puerta");
b.pragmatics.meaningfulTopic="un golpe detrás de la puerta";
b.mind.lastCycle.decision={id:"observe",label:"observar",score:.61,risk:.05};
b.mind.lastCycle.options=[{id:"observe",label:"observar",score:.61,risk:.05}];
r=b.hear("que quieres hacer");
assert.match(r,/observar|quiero/i);
assert.doesNotMatch(r,/%/);

const state=b.cognitiveState.current;
assert.ok(state.workingMemory.length>0);
assert.ok(state.goal);
assert.ok(state.action);
assert.strictEqual(state.action.id,"observe");

console.log("response planner smoke: ok");
