"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match=>match[1]);
const position=name=>scripts.indexOf(name);

for(const name of ["local-wiki.js","brain-pipeline.js","mental-cycle.js","cognitive-state.js","concept-graph.js","output-safety.js"])
  assert.notStrictEqual(position(name),-1,`${name} debe estar declarado en index.html`);
assert.ok(position("local-wiki.js")<position("brain-pipeline.js"),"el pipeline debe encapsular las capas heredadas anteriores");
assert.ok(position("brain-pipeline.js")<position("mental-cycle.js"),"el pipeline debe existir antes del primer módulo migrado");
assert.ok(position("mental-cycle.js")<position("cognitive-state.js"),"el ciclo mental debe terminar antes del snapshot cognitivo");
assert.ok(position("cognitive-state.js")<position("concept-graph.js"),"los wrappers posteriores deben conservar su posición exterior");
assert.ok(position("brain-pipeline.js")<position("output-safety.js"),"output-safety debe seguir siendo una capa exterior posterior");

const printed=[];
global.window={};
global.print=(kind,prefix,text)=>printed.push({kind,prefix,text});
global.command=raw=>printed.push({kind:"legacy",prefix:"COMMAND>",text:raw});
global.short=(value,size=72)=>String(value||"").length<=size?String(value||""):String(value||"").slice(0,size-1)+"…";

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=0;
    this.identity={name:"NIA-01",purpose:"comprender el entorno"};
    this.relation={name:"Jugador",trust:.5};
    this.drives={amenaza:.04,curiosidad:.55,social:.34,proposito:.31,fatiga:.08};
    this.mood={valence:.1,arousal:.22};
    this.personality={caution:.48};
    this.cognition={facts:[]};
    this.dialogue={lastUser:"",lastIntent:null,topic:null};
    this.discourse={focus:[]};
    this.pragmatics={meaningfulTopic:null};
    this.understanding={lastFrame:null};
    this.mem=[];
    this.lastThoughts=[];
    this.baseCalls=[];
  }
  moodLabel(){return "neutral";}
  recall(){return [];}
  hear(text){
    this.baseCalls.push(`hear:${text}`);
    this.dialogue.lastUser=text;
    return text==="async"?Promise.resolve("base:async"):`base:${text}`;
  }
  event(text){
    this.baseCalls.push(`event:${text}`);
    this.mem.push({type:"world",text:`Mundo: ${text}`,salience:.8});
    return `event:${text}`;
  }
  tick(minutes=1){
    this.baseCalls.push(`tick:${minutes}`);
    this.time+=minutes;
    return `tick:${minutes}`;
  }
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

// Ejecuta el mismo tramo y en el mismo orden declarado por index.html.
for(const name of scripts.filter(name=>["brain-pipeline.js","mental-cycle.js","cognitive-state.js"].includes(name)))
  require(path.join(root,name));

const pipeline=window.NpcIntPipeline;
assert.ok(pipeline?.state.installed,"el pipeline debe instalarse antes de registrar módulos");
const expectedStages=[
  "cognitive-state:prepare",
  "mental-cycle:perceive",
  "mental-cycle:decide",
  "cognitive-state:refresh"
];
for(const kind of ["hear","event","tick"]){
  const stages=pipeline.state.stages[kind]
    .slice()
    .sort((a,b)=>(a.priority-b.priority)||(a.id-b.id));
  const actual=stages.map(stage=>stage.name);
  assert.deepStrictEqual(actual,expectedStages,`${kind} debe tener las cuatro etapas migradas en orden`);
  assert.strictEqual(stages.find(stage=>stage.name==="mental-cycle:perceive")?.phase,"before",`${kind}: perceive debe correr antes del legacy core`);
  assert.strictEqual(stages.find(stage=>stage.name==="mental-cycle:decide")?.phase,"after",`${kind}: decide debe correr después del legacy core`);
  assert.deepStrictEqual(stages.filter(stage=>stage.phase==="before").map(stage=>stage.name),["cognitive-state:prepare","mental-cycle:perceive"],`${kind}: las etapas before deben quedar explícitas`);
  assert.deepStrictEqual(stages.filter(stage=>stage.phase==="after").map(stage=>stage.name),["mental-cycle:decide","cognitive-state:refresh"],`${kind}: las etapas after deben quedar explícitas`);
}

async function main(){
  const b=new NpcBrain();

  const syncResult=b.hear("hay peligro detrás de la puerta?");
  assert.strictEqual(syncResult,"base:hay peligro detrás de la puerta?","hear síncrono debe conservar el resultado legacy");
  assert.strictEqual(b.mind.lastCycle.perception.type,"user");
  assert.strictEqual(b.cognitiveState.current.input,"hay peligro detrás de la puerta?");
  assert.ok(b.cognitiveState.current.goal,"el snapshot debe observar el ciclo mental ya calculado");
  assert.deepStrictEqual(pipeline.state.trace.at(-1).stages,expectedStages);

  const asyncResult=await b.hear("async");
  assert.strictEqual(asyncResult,"base:async","hear asíncrono debe conservar el resultado resuelto");
  assert.strictEqual(b.cognitiveState.current.input,"async","las etapas posteriores deben esperar la promesa legacy");
  assert.deepStrictEqual(pipeline.state.trace.at(-1).stages,expectedStages);

  assert.strictEqual(b.event("se abrió una puerta"),"event:se abrió una puerta");
  assert.strictEqual(b.mind.lastCycle.perception.type,"world");
  assert.strictEqual(b.cognitiveState.current.intent,"world_event");
  assert.deepStrictEqual(pipeline.state.trace.at(-1).stages,expectedStages);

  assert.strictEqual(b.tick(3),"tick:3");
  assert.strictEqual(b.time,3);
  assert.strictEqual(b.mind.lastCycle.perception.type,"time");
  assert.strictEqual(b.cognitiveState.current.intent,"internal_tick");
  assert.deepStrictEqual(pipeline.state.trace.at(-1).stages,expectedStages);

  printed.length=0;
  command("/pipeline");
  command("/mind");
  command("/cognitive");
  assert.ok(printed.some(item=>item.prefix==="PIPELINE>"&&/mental-cycle:decide/.test(item.text)),"/pipeline debe mostrar las etapas migradas");
  assert.ok(printed.some(item=>item.prefix==="MIND>"),"los comandos del ciclo mental deben conservarse");
  assert.ok(printed.some(item=>item.prefix==="COGNITIVE>"),"los comandos cognitivos deben conservarse");

  b.reset();
  assert.ok(b.mind,"reset debe volver a dejar disponible el estado mental");
  assert.ok(b.cognitiveState,"reset debe volver a dejar disponible el estado cognitivo");

  await verifyCompleteBrowserOrder();

  console.log("brain pipeline integration: ok");
}

function fakeElement(tag="div"){
  const element={
    tagName:String(tag).toUpperCase(),children:[],className:"",textContent:"",value:"",
    scrollTop:0,scrollHeight:0,style:{},dataset:{},attributes:{},disabled:false,
    appendChild(child){this.children.push(child);this.scrollHeight=this.children.length;return child;},
    addEventListener(){},focus(){},
    setAttribute(name,value){this.attributes[String(name)]=String(value);},
    getAttribute(name){return this.attributes[String(name)]??null;}
  };
  let html="";
  Object.defineProperty(element,"innerHTML",{
    get(){return html;},
    set(value){html=String(value);if(value==="")this.children.length=0;}
  });
  return element;
}

async function verifyCompleteBrowserOrder(){
  const elements=new Map();
  const getElement=id=>{
    if(!elements.has(id))elements.set(id,fakeElement(id));
    return elements.get(id);
  };
  const storage=new Map();
  const document={
    getElementById:getElement,
    createElement:tag=>fakeElement(tag),
    createTextNode:text=>({nodeType:3,textContent:String(text)}),
    addEventListener(){}
  };
  const localFetch=async url=>{
    const relative=String(url||"").replace(/^\.\//,"");
    const target=path.resolve(root,relative);
    const local=target.startsWith(root+path.sep)&&fs.existsSync(target)&&fs.statSync(target).isFile();
    return {
      ok:local,status:local?200:404,
      async json(){
        if(!local)throw new Error(`fixture local no encontrado: ${relative}`);
        return JSON.parse(fs.readFileSync(target,"utf8"));
      }
    };
  };
  const browser=vm.createContext({
    console:{log(){},info(){},warn(){},error(){}},document,fetch:localFetch,
    localStorage:{
      getItem:key=>storage.has(key)?storage.get(key):null,
      setItem:(key,value)=>storage.set(key,String(value)),
      removeItem:key=>storage.delete(key)
    },
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}
  });
  browser.window=browser;

  for(const name of scripts){
    const source=fs.readFileSync(path.join(root,name),"utf8");
    vm.runInContext(source,browser,{filename:name});
  }
  await new Promise(resolve=>setImmediate(resolve));

  const fullPipeline=browser.NpcIntPipeline;
  assert.ok(fullPipeline?.state.installed,"el pipeline debe seguir instalado tras cargar todo index.html");
  assert.strictEqual(vm.runInContext('NpcIntNeuralWeb.turnMode("que te gustaria crear una mision").needsHistory',browser),false,"un tema nuevo no debe heredar historial neural");
  assert.strictEqual(vm.runInContext('NpcIntNeuralWeb.turnMode("eso te habia preguntado?").needsHistory',browser),true,"una referencia explícita sí debe habilitar historial");
  const beforeHear=fullPipeline.state.trace.length;
  await Promise.resolve(vm.runInContext('brain.hear("me interesa construir un juego en Unity")',browser));
  assert.strictEqual(fullPipeline.state.trace.length,beforeHear+1,"el hear final debe atravesar dispatch aunque wrappers posteriores lo envuelvan");
  assert.strictEqual(fullPipeline.state.trace.at(-1).kind,"hear");
  assert.deepStrictEqual(Array.from(fullPipeline.state.trace.at(-1).stages),expectedStages);
  const hearState=JSON.parse(vm.runInContext("JSON.stringify({input:brain.cognitiveState.current.input,perception:brain.mind.lastCycle.perception.type,idea:!!brain.ideaEngine.current,companion:!!brain.companionState})",browser));
  assert.deepStrictEqual(hearState,{input:"me interesa construir un juego en Unity",perception:"user",idea:true,companion:true},"las capas registradas y los wrappers posteriores deben ejecutar en la misma llamada");

  const hostilityBefore=JSON.parse(vm.runInContext("JSON.stringify({relationTrust:brain.relation.trust,modelTrust:brain.relationshipModel.trust,comfort:brain.relationshipModel.comfort,tension:brain.relationshipModel.tension})",browser));
  const beforeHostility=fullPipeline.state.trace.length;
  await Promise.resolve(vm.runInContext('brain.hear("¡Eres una hpta!")',browser));
  assert.strictEqual(fullPipeline.state.trace.length,beforeHostility+1,"la hostilidad debe atravesar una sola ejecución completa del pipeline");
  assert.deepStrictEqual(Array.from(fullPipeline.state.trace.at(-1).stages),expectedStages);
  const hostilityState=JSON.parse(vm.runInContext("JSON.stringify({tags:brain.mind.lastCycle.perception.tags,act:brain.pragmatics.lastAct,tone:brain.pragmatics.lastTone,goals:brain.mind.lastCycle.goals.map(x=>x.id),decision:brain.mind.lastCycle.decision.id,cycleTrust:brain.mind.lastCycle.mentalState.trust,relationTrust:brain.relation.trust,modelTrust:brain.relationshipModel.trust,comfort:brain.relationshipModel.comfort,tension:brain.relationshipModel.tension,hostileStreak:brain.relationshipModel.hostileStreak})",browser));
  assert.ok(hostilityState.tags.includes("hostile"),"la percepción completa debe reconocer hpta");
  assert.strictEqual(hostilityState.act,"insult","pragmática debe clasificar hpta como insulto en el navegador completo");
  assert.strictEqual(hostilityState.tone,"hostil","pragmática debe exponer el tono hostil en el mismo turno");
  assert.ok(hostilityState.goals.includes("boundaries"),"el motor mental debe generar boundaries en el mismo turno");
  assert.strictEqual(hostilityState.decision,"set_boundary","la decisión auditable debe marcar un límite");
  assert.strictEqual(hostilityState.cycleTrust,hostilityState.relationTrust,"la decisión debe observar la confianza actualizada por la cadena legacy");
  assert.ok(hostilityState.relationTrust<hostilityBefore.relationTrust,"pragmática debe reducir la confianza base");
  assert.ok(hostilityState.modelTrust<hostilityBefore.modelTrust,"el modelo relacional debe reducir su confianza");
  assert.ok(hostilityState.comfort<hostilityBefore.comfort,"el modelo relacional debe reducir comodidad");
  assert.ok(hostilityState.tension>hostilityBefore.tension,"el modelo relacional debe aumentar tensión");
  assert.strictEqual(hostilityState.hostileStreak,1,"el modelo relacional debe registrar la racha hostil");

  const beforeEvent=fullPipeline.state.trace.length;
  await Promise.resolve(vm.runInContext('brain.event("se abrió una puerta")',browser));
  assert.strictEqual(fullPipeline.state.trace.length,beforeEvent+1,"el event final debe conservar el dispatcher dentro de la cadena");
  assert.strictEqual(fullPipeline.state.trace.at(-1).kind,"event");
  assert.deepStrictEqual(Array.from(fullPipeline.state.trace.at(-1).stages),expectedStages);
  assert.strictEqual(vm.runInContext("brain.cognitiveState.current.intent",browser),"world_event");

  const beforeTick=fullPipeline.state.trace.length;
  await Promise.resolve(vm.runInContext("brain.tick(2)",browser));
  assert.strictEqual(fullPipeline.state.trace.length,beforeTick+1,"el tick final debe conservar el dispatcher dentro de la cadena");
  assert.strictEqual(fullPipeline.state.trace.at(-1).kind,"tick");
  assert.deepStrictEqual(Array.from(fullPipeline.state.trace.at(-1).stages),expectedStages);
  assert.strictEqual(vm.runInContext("brain.cognitiveState.current.intent",browser),"internal_tick");

  const terminal=getElement("terminal");
  const beforeCommand=terminal.children.length;
  vm.runInContext('command("/pipeline")',browser);
  assert.strictEqual(terminal.children.length,beforeCommand+1,"/pipeline debe atravesar también la cadena completa de comandos");
  const nodeText=node=>String(node?.textContent||"")+(node?.children||[]).map(nodeText).join("");
  assert.match(nodeText(terminal.children.at(-1)),/pipeline=1\.1[\s\S]*mental-cycle:decide/);

  vm.runInContext("brain.reset()",browser);
  assert.strictEqual(vm.runInContext("!!brain.mind && !!brain.cognitiveState && !!brain.companionState",browser),true,"reset completo debe reconstruir los estados migrados y posteriores");
  const beforeResetHear=fullPipeline.state.trace.length;
  await Promise.resolve(vm.runInContext('brain.hear("hola")',browser));
  assert.strictEqual(fullPipeline.state.trace.length,beforeResetHear+1,"el primer mensaje después de reset debe seguir atravesando el pipeline");
  assert.strictEqual(vm.runInContext("Number.isFinite(brain.relation.respect)",browser),true,"reset debe reconstruir también la relación pragmática");
}

main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
