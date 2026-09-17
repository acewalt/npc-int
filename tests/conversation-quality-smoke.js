"use strict";

const assert=require("node:assert/strict");

global.window=globalThis;
global.print=()=>{};
global.command=()=>{};
global.short=(s,n=100)=>{s=String(s||"");return s.length<=n?s:s.slice(0,n-1)+"…";};

global.npcKnowledge=null;

function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();}

class NpcBrain{
  constructor(){
    this.time=0;
    this.dialogue={lastUser:"",lastNpc:"",topic:"Paso del tiempo"};
    this.discourse={previousNpc:"",currentUser:"",lastRegistered:null};
    this.pragmatics={meaningfulTopic:"Paso del tiempo"};
    this.companionState={lastUserText:"",lastReply:""};
    this.cognitiveState={current:{topic:"Paso del tiempo",goal:{label:"reducir incertidumbre"},action:{label:"explorar"}}};
    this.mind={lastCycle:{goals:[{label:"reducir incertidumbre"}],decision:{label:"explorar"}},needs:{}};
    this.drives={hambre:.25};
    this.lastThoughts=[];
  }
  say(text){this.dialogue.lastNpc=text;this.discourse.previousNpc=text;this.companionState.lastReply=text;return text;}
  reset(){}
  hear(text){
    const n=norm(text);
    this.dialogue.lastUser=text;
    this.companionState.lastUserText=text;
    this.discourse.currentUser=text;
    if(n==="que piensas de la filosofia")return this.say("Sobre filosofia no tengo hechos suficientes para formarme una opinión sin inventar. Si me dices quién es o qué hizo, puedo evaluar esa información.");
    if(n==="y te gustaria conocer a alguien mas")return this.say("La inteligencia artificial es un campo de la informática que desarrolla sistemas capaces de realizar tareas.");
    if(n==="y que quieres comer")return this.say("Ahora mismo domina proposito. En términos prácticos, eso significa que intento actuar de acuerdo con mi propósito.");
    if(n==="como decidir que")return this.say("De eso todavía no tengo base suficiente para decir algo con seguridad.");
    if(n==="y que mas piensas")return this.say("Ahora mismo tengo en mente «Paso del tiempo». Mi foco mental es reducir incertidumbre.");
    if(n==="entonces")return this.say("Sí, sigo el hilo. Mantengo «Paso del tiempo» como el punto activo de la conversación.");
    if(n.includes("esa es una buena pregunta"))return this.say("Entiendo. Lo convertí en un hecho utilizable: Esa es buena pregunta, pero no sabría cómo responderla.");
    if(n==="interesante"||n==="vale interesante"||n==="vale solo preguntaba")return this.say(`Entendido. Tomo «${text}» como parte del contexto sin inventar una relación que no hayas dicho.`);
    if(n==="pero no pregunte eso")return this.say("Lo tengo. No necesito preguntarte algo solo por responder.");
    return this.say("Respuesta base.");
  }
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

require("../conversation-quality.js");

assert.equal(global.NpcIntConversationQuality.config.knowledgeMatching,"native:knowledge.js");

const b=global.brain;

let out=b.hear("Y te gustaría conocer a alguien más?");
assert.match(out,/me interesaría conocer a otra persona/i);
assert.doesNotMatch(out,/inteligencia artificial/i);

out=b.hear("Pero no pregunté eso");
assert.match(out,/mi respuesta anterior no correspondía/i);
assert.match(out,/conocer a otra persona/i);

out=b.hear("Y qué quieres comer");
assert.match(out,/opciones reales del entorno/i);
assert.doesNotMatch(out,/domina proposito/i);

out=b.hear("Cómo decidir qué?");
assert.match(out,/comparando lo que percibo/i);
assert.match(out,/decisiones futuras/i);

out=b.hear("Y qué más piensas");
assert.doesNotMatch(out,/paso del tiempo/i);
assert.match(out,/ordenando lo último de la conversación/i);

out=b.hear("Entonces?");
assert.doesNotMatch(out,/paso del tiempo/i);
assert.match(out,/sigo el hilo/i);

out=b.hear("Qué piensas de la filosofía");
assert.match(out,/no tengo una postura fija precargada/i);
assert.doesNotMatch(out,/quién es o qué hizo/i);

const r1=b.hear("Interesante");
const r2=b.hear("Vale, interesante");
assert.notEqual(r1,r2,"las reacciones breves deben rotar");
assert.doesNotMatch(r1,/sin inventar una relación que no hayas dicho/i);
assert.doesNotMatch(r2,/sin inventar una relación que no hayas dicho/i);

out=b.hear("Vale solo preguntaba");
assert.match(out,/era una pregunta, no una afirmación/i);

out=b.hear("Esa es una buena pregunta, pero no sabría cómo responderla");
assert.match(out,/Esa es una buena pregunta, pero no sabría cómo responderla/);
assert.doesNotMatch(out,/Esa es buena pregunta,/);

console.log("conversation quality smoke: ok");
