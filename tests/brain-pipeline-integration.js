"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const root=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const appSource=fs.readFileSync(path.join(root,"app.js"),"utf8");
const styleSource=fs.readFileSync(path.join(root,"style.css"),"utf8");
const companionUiSource=fs.readFileSync(path.join(root,"companion-ui.js"),"utf8");
assert.match(html,/id="companionForget"/,"la barra superior debe incluir el botón directo de companion forget");
assert.match(companionUiSource,/command\("\/companion forget"\)/,"el botón debe reutilizar exactamente el comando /companion forget");
assert.match(appSource,/print\("initiative",brain\.identity\.name\+" · iniciativa>"/,"las salidas autónomas deben llevar un prefijo distinto de una respuesta directa");
assert.match(styleSource,/\.line\.initiative/,"la iniciativa debe tener una presentación visual diferenciada");
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match=>match[1]);
const position=name=>scripts.indexOf(name);

for(const name of ["local-wiki.js","brain-pipeline.js","mental-cycle.js","cognitive-state.js","concept-graph.js","output-safety.js","intent-router.js"])
  assert.notStrictEqual(position(name),-1,`${name} debe estar declarado en index.html`);
assert.ok(position("local-wiki.js")<position("brain-pipeline.js"),"el pipeline debe encapsular las capas heredadas anteriores");
assert.ok(position("brain-pipeline.js")<position("mental-cycle.js"),"el pipeline debe existir antes del primer módulo migrado");
assert.ok(position("mental-cycle.js")<position("cognitive-state.js"),"el ciclo mental debe terminar antes del snapshot cognitivo");
assert.ok(position("cognitive-state.js")<position("concept-graph.js"),"los wrappers posteriores deben conservar su posición exterior");
assert.ok(position("brain-pipeline.js")<position("output-safety.js"),"output-safety debe seguir siendo una capa exterior posterior");
assert.ok(position("conversation-quality.js")<position("intent-router.js"),"intent-router debe envolver a los clasificadores legacy y decidir primero en runtime");
assert.ok(position("intent-router.js")<position("copy-chat.js"),"intent-router debe cargarse antes de utilidades finales sin alterar la UI");

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
  assert.ok(browser.NpcIntIntentRouter,"el navegador completo debe exponer un router de intención único");

  const paraphrasePet=JSON.parse(vm.runInContext('JSON.stringify(NpcIntIntentRouter.resolve("me podrías recordar cuál era el nombre de mi mascota?",brain,{record:false}))',browser));
  assert.strictEqual(paraphrasePet.intent,"ask_pet_name","una paráfrasis debe resolverse semánticamente sin depender de una frase exacta");
  assert.ok(["local-embedding","understanding+embedding","structural"].includes(paraphrasePet.source),"la paráfrasis debe venir del router semántico");

  await Promise.resolve(vm.runInContext('brain.hear("mi color favorito es el negro")',browser));
  const preferenceRoute=JSON.parse(vm.runInContext('JSON.stringify(brain.intentRouter.current)',browser));
  assert.strictEqual(preferenceRoute.intent,"personal_fact_statement","los favoritos deben usar memoria personal genérica, incluso para color");
  assert.strictEqual(vm.runInContext('brain.cognition.facts.some(f=>/color favorito/i.test(f.subject))',browser),false,"cognition no debe convertir un favorito personal en hecho objetivo");
  assert.strictEqual(vm.runInContext('NpcIntSocialMemory.personalFact(brain,"color","favorite").value',browser),"negro","el color favorito debe vivir en personal_fact");
  const favoriteColor=String(await Promise.resolve(vm.runInContext('brain.hear("cual es mi color favorito?")',browser)));
  assert.match(favoriteColor,/negro/i);

  await Promise.resolve(vm.runInContext('brain.hear("Los gatos son mamíferos")',browser));
  assert.strictEqual(vm.runInContext('brain.intentRouter.current.intent',browser),"fact_statement");
  assert.strictEqual(vm.runInContext('brain.cognition.facts.some(f=>/gatos/i.test(f.subject)&&/mamíferos|mamiferos/i.test(f.object))',browser),true,"una proposición objetiva sí debe entrar a cognition");

  await Promise.resolve(vm.runInContext('brain.hear("¿Los gatos son mamíferos?")',browser));
  assert.strictEqual(vm.runInContext('brain.intentRouter.current.intent',browser),"fact_verification");
  assert.strictEqual(vm.runInContext('brain.queryFrame.current.intent',browser),"fact_verification","QueryFrame debe usar la intención central y no reclasificarla");
  assert.strictEqual(vm.runInContext('NpcIntNeuralWeb.turnMode("que te gustaria crear una mision").needsHistory',browser),false,"un tema nuevo no debe heredar historial neural");
  assert.strictEqual(vm.runInContext('NpcIntNeuralWeb.turnMode("eso te habia preguntado?").needsHistory',browser),true,"una referencia explícita sí debe habilitar historial");

  const badScript=JSON.parse(vm.runInContext('JSON.stringify(NpcIntNeuralWeb.neuralQuality("cuéntame algo","El perro me conecta que我喜欢.",""))',browser));
  assert.strictEqual(badScript.ok,false,"Qwen no debe poder sacar escritura no latina al jugador");
  assert.strictEqual(badScript.reason,"non_latin_script");
  const badLanguage=JSON.parse(vm.runInContext('JSON.stringify(NpcIntNeuralWeb.neuralQuality("cuéntame algo","This response is entirely written in English without Spanish markers.",""))',browser));
  assert.strictEqual(badLanguage.ok,false,"una salida larga claramente no española debe caer al simbólico");
  assert.strictEqual(badLanguage.reason,"language_mismatch");
  const goodSpanish=JSON.parse(vm.runInContext('JSON.stringify(NpcIntNeuralWeb.neuralQuality("los gatos son mamíferos?","Sí. Los gatos son mamíferos y tienen pelo.",""))',browser));
  assert.strictEqual(goodSpanish.ok,true);

  const compactMessages=JSON.parse(vm.runInContext('JSON.stringify(NpcIntNeuralWeb.browserMessages("los gatos son mamíferos?","Sí. Los gatos son mamíferos."))',browser));
  assert.ok(compactMessages[1].content.includes("Mensaje actual del jugador:"),"el prompt Qwen debe ser texto natural compacto");
  assert.ok(!compactMessages[1].content.includes('"cognitiveState"'),"el prompt Qwen no debe volcar el estado cognitivo JSON completo");
  assert.ok(compactMessages[1].content.length<4000,"el contexto browser de Qwen debe permanecer pequeño para 0.6B");

  const firstMission=String(await Promise.resolve(vm.runInContext('brain.hear("que te gustaria crear ?")',browser)));
  assert.match(firstMission,/La sala que cambia de reglas/i);
  await Promise.resolve(vm.runInContext('brain.hear("me gusta esa idea")',browser));
  const likedIdea=String(await Promise.resolve(vm.runInContext('brain.hear("que idea es la que me gusta ?")',browser)));
  assert.match(likedIdea,/sala que cambia de reglas/i,"la referencia «esa idea» debe resolverse hacia la misión anterior");

  const secondMission=String(await Promise.resolve(vm.runInContext('brain.hear("dime otra idea")',browser)));
  assert.match(secondMission,/Crearía una misión llamada/i,"«dime otra idea» debe continuar el hilo de misiones");
  assert.doesNotMatch(secondMission,/La sala que cambia de reglas/i,"otra idea debe evitar repetir inmediatamente la misma misión");

  const acknowledgement=String(await Promise.resolve(vm.runInContext('brain.hear("vale")',browser)));
  assert.doesNotMatch(acknowledgement,/Crearía una misión llamada/i,"«vale» nunca debe disparar ask_mission_idea por colisión hash");
  assert.strictEqual(vm.runInContext('brain.intentRouter.current.intent',browser),"reaction");

  const beforeDisclosureTopics=vm.runInContext('brain.topicManager.topics.length',browser);
  const disclosure=String(await Promise.resolve(vm.runInContext('brain.hear("te quiero contar algo")',browser)));
  assert.match(disclosure,/Te escucho|Cuéntame/i,"una apertura de confidencia debe invitar a continuar, no registrarse como dato vacío");
  assert.strictEqual(vm.runInContext('brain.topicManager.topics.length',browser),beforeDisclosureTopics,"«te quiero contar algo» no debe persistirse como tópico");

  const tomorrowAction=String(await Promise.resolve(vm.runInContext('brain.hear("qué te gustaría hacer mañana?")',browser)));
  assert.match(tomorrowAction,/Mañana me gustaría/i,"la pregunta temporal debe llegar a ask_desired_action");
  assert.doesNotMatch(tomorrowAction,/Decido comparando/i,"preguntar qué quiere hacer mañana no debe responder con el proceso general de decisión");

  const numberStored=String(await Promise.resolve(vm.runInContext('brain.hear("mi numero favorito es el 3")',browser)));
  assert.match(numberStored,/número favorito|numero favorito/i,"una categoría arbitraria debe guardarse como hecho personal");
  let numberAnswer=String(await Promise.resolve(vm.runInContext('brain.hear("cual es mi numero favorito?")',browser)));
  assert.match(numberAnswer,/3/);
  assert.doesNotMatch(numberAnswer,/color/i,"número favorito nunca debe caer sobre la memoria de color");
  await Promise.resolve(vm.runInContext('brain.hear("mi numero favorito es el 2")',browser));
  numberAnswer=String(await Promise.resolve(vm.runInContext('brain.hear("cual es mi numero favorito?")',browser)));
  assert.match(numberAnswer,/2/);
  assert.doesNotMatch(numberAnswer,/3/,"el slot personal genérico debe reemplazar el valor anterior de la misma categoría");

  await Promise.resolve(vm.runInContext('brain.hear("me gustan el color negro y el blanco")',browser));
  await Promise.resolve(vm.runInContext('brain.hear("te dije que no me gusta el negro, me gusta es el blanco")',browser));
  const correctedColor=String(await Promise.resolve(vm.runInContext('brain.hear("que color me gusta?")',browser)));
  assert.match(correctedColor,/blanco/i);
  assert.doesNotMatch(correctedColor,/negro/i,"una corrección explícita debe retirar el color negado");

  const niaColor=String(await Promise.resolve(vm.runInContext('brain.hear("que color te gusta a ti?")',browser)));
  assert.match(niaColor,/No tengo un color favorito propio definido/i,"me/te debe distinguir gustos del jugador de preferencias de NIA");
  assert.doesNotMatch(niaColor,/te gustan los colores/i);

  vm.runInContext('brain.conversationArbiter.lastSubstantiveTopic="dije gusta negro gusta"; brain.pragmatics.meaningfulTopic="dije gusta negro gusta"; brain.dialogue.topic="dije gusta negro gusta";',browser);
  const todayAction=String(await Promise.resolve(vm.runInContext('brain.hear("que te gustaria hacer hoy?")',browser)));
  assert.doesNotMatch(todayAction,/dije gusta negro gusta/i,"una etiqueta interna de topicFrom nunca debe citarse al jugador");
  const beforeHear=fullPipeline.state.trace.length;
  await Promise.resolve(vm.runInContext('brain.hear("me interesa construir un juego en Unity")',browser));
  assert.strictEqual(fullPipeline.state.trace.length,beforeHear+1,"el hear final debe atravesar dispatch aunque wrappers posteriores lo envuelvan");
  assert.strictEqual(fullPipeline.state.trace.at(-1).kind,"hear");
  assert.deepStrictEqual(Array.from(fullPipeline.state.trace.at(-1).stages),expectedStages);
  const hearState=JSON.parse(vm.runInContext("JSON.stringify({input:brain.cognitiveState.current.input,perception:brain.mind.lastCycle.perception.type,idea:!!brain.ideaEngine.current,companion:!!brain.companionState})",browser));
  assert.deepStrictEqual(hearState,{input:"me interesa construir un juego en Unity",perception:"user",idea:true,companion:true},"las capas registradas y los wrappers posteriores deben ejecutar en la misma llamada");

  vm.runInContext("brain.reset()",browser);
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

  await Promise.resolve(vm.runInContext('brain.hear("mi comida favorita es la pizza")',browser));
  assert.ok(vm.runInContext("brain.socialMemory.items.length>0",browser));
  vm.runInContext('command("/companion forget")',browser);
  assert.strictEqual(vm.runInContext("brain.socialMemory.items.length",browser),0,"/companion forget debe vaciar también la memoria social activa");

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
