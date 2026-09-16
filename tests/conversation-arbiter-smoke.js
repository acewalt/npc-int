"use strict";

const assert=require("assert");

global.window={};
global.print=()=>{};
global.command=()=>{};
global.short=(s,n=72)=>String(s||"").length<=n?String(s||""):String(s||"").slice(0,n-1)+"…";
global.npcKnowledge=null;

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.time=12;
    this.identity={name:"NIA-01",purpose:"comprender el entorno, conservar continuidad y actuar según mis experiencias"};
    this.relation={name:"Jugador",trust:.55};
    this.dialogue={lastUser:"",lastNpc:"Qué tal.",topic:null};
    this.discourse={previousNpc:"Qué tal.",lastRegistered:null,focus:[]};
    this.pragmatics={meaningfulTopic:"un golpe detrás de la puerta"};
    this.mem=[{type:"world",text:"se escuchó un golpe detrás de la puerta",salience:.8}];
    this.cognition={facts:[]};
    this.lastThoughts=[];
    this.mind={
      affect:{fear:.08},
      cognition:{curiosity:.78,certainty:.5},
      needs:{energy:.82},
      lastCycle:{
        goals:[{id:"understand",label:"reducir incertidumbre",priority:.72}],
        decision:{id:"observe",label:"observar el entorno",score:.61,risk:.04},
        options:[{id:"observe",label:"observar el entorno",score:.61,risk:.04}]
      }
    };
    this.cognitiveState={
      current:{intent:"world_event",topic:"un golpe detrás de la puerta",goal:{id:"understand",label:"reducir incertidumbre"},action:{id:"observe",label:"observar el entorno"},unresolved:[],workingMemory:[{kind:"topic",text:"un golpe detrás de la puerta",weight:.8}]},
      workingMemory:[],unresolved:[],history:[]
    };
    this.ideaEngine={current:{focus:"un golpe detrás de la puerta",synthesis:{claim:"hay varias causas posibles"}},history:[{focus:"un golpe detrás de la puerta"}]};
    this.hypothesisEngine={current:{focus:"un golpe detrás de la puerta"},history:[{focus:"un golpe detrás de la puerta"}]};
    this.conceptGraph={current:{source:"un golpe detrás de la puerta"},history:[{source:"un golpe detrás de la puerta"}]};
    this.responsePlanner={lastPlan:null};
  }
  moodLabel(){return "neutral";}
  say(x){this.dialogue.lastNpc=x;this.discourse.previousNpc=x;return x;}
  hear(text){
    // Simula los fallos reales de las capturas y la contaminación de foco que
    // producían las capas inferiores antes del arbitraje final.
    this.dialogue.lastUser=text;
    this.cognitiveState.current={intent:"fallback",topic:text,goal:{id:"understand",label:"reducir incertidumbre"},action:{id:"observe",label:"observar el entorno"},unresolved:[`no tengo conocimiento suficiente sobre «${text}»`],workingMemory:[{kind:"topic",text,weight:.9}]};
    this.ideaEngine.current={focus:text,synthesis:{claim:"hipótesis contaminada"}};this.ideaEngine.history.push(this.ideaEngine.current);
    this.hypothesisEngine.current={focus:text};this.hypothesisEngine.history.push(this.hypothesisEngine.current);
    this.conceptGraph.current={source:text};this.conceptGraph.history.push(this.conceptGraph.current);
    if(/yo bien/i.test(text))return this.say("No lo sé todavía. No tengo información suficiente para responder eso sin inventar.");
    if(/puedes hacer/i.test(text))return this.say("Entiendo. Lo voy a conservar como contexto.");
    if(/contexto de que/i.test(text))return this.say("No estoy seguro de qué relación quieres expresar con «Contexto de que».");
    if(/^no$/i.test(text))return this.say("Entendido. Tomo «No» como parte del contexto.");
    if(/piensas de alberto/i.test(text))return this.say("Ahora mismo tengo en mente «Paso del tiempo».");
    return this.say(`fallback inferior para ${text}`);
  }
}

global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

require("../conversation-arbiter.js");

const b=new NpcBrain();
const originalIdea=b.ideaEngine.current;

let r=b.hear("Yo bien, y tu ?");
assert.match(r,/tranquilo|curiosidad|foco/i);
assert.doesNotMatch(r,/no lo sé todavía|sin inventar$/i);
assert.strictEqual(b.cognitiveState.current.topic,"un golpe detrás de la puerta");
assert.strictEqual(b.ideaEngine.current,originalIdea,"una pregunta social no debe sustituir la idea causal activa");

r=b.hear("Entonces que me puedes decir tú? Que quisieras hacer ?");
assert.match(r,/preferiría|situación concreta|observar/i);
assert.doesNotMatch(r,/más relacionado que recuerdo|NIA-01: Qué tal/i);

r=b.hear("Entonces que puedes hacer ahora");
assert.match(r,/conversar|recordar|razonar|hipótesis/i);
assert.doesNotMatch(r,/conservar como contexto/i);

r=b.hear("Contexto de que");
assert.match(r,/contexto|golpe detrás de la puerta|no tengo un contexto sustantivo/i);
assert.doesNotMatch(r,/qué relación quieres expresar/i);

r=b.hear("No");
assert.match(r,/descarto|no voy a tratar/i);
assert.doesNotMatch(r,/parte del contexto/i);

r=b.hear("que quisieras hacer ahora");
assert.match(r,/preferiría|situación concreta|observar/i);
assert.doesNotMatch(r,/no necesito preguntarte/i);

r=b.hear("que quisieras crear");
assert.match(r,/crear|escenario|objetivo|reglas/i);
assert.doesNotMatch(r,/frase incompleta/i);

r=b.hear("como quisieras crear un nivel");
assert.match(r,/nivel|jugador|reglas|obstáculos|probar/i);
assert.doesNotMatch(r,/cambia un poco lo que sé/i);

r=b.hear("a donde nos quieres llevar");
assert.match(r,/destino|rumbo|situación concreta/i);
assert.doesNotMatch(r,/queda registrado/i);

r=b.hear("llevar a mexico");
assert.match(r,/propones mexico como destino/i);
assert.strictEqual(b.conversationArbiter.destination,"mexico");

r=b.hear("a donde nos quieres llevar");
assert.match(r,/mexico/i);
assert.match(r,/tú lo propusiste|tu lo propusiste/i);

r=b.hear("dime todo lo que sabes");
assert.match(r,/sé quién soy|hechos|relaciones|hipótesis|observaciones/i);
assert.doesNotMatch(r,/conservar como contexto/i);

r=b.hear("que piensas de alberto");
assert.match(r,/alberto/i);
assert.match(r,/no tengo hechos suficientes|sin inventar/i);
assert.doesNotMatch(r,/Paso del tiempo/i);

b.cognition.facts.push({subject:"Alberto",predicate:"vive en",object:"una ciudad costera"});
r=b.hear("que piensas de alberto");
assert.match(r,/realmente tengo registrado|Alberto vive en/i);
assert.doesNotMatch(r,/Paso del tiempo/i);

console.log("conversation arbiter smoke: ok");
