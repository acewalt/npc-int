"use strict";

(function(){
  const BNorm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();

  function classify(text){
    const n=BNorm(text);
    if(/^(que opinas|que piensas de esto|que crees|que crees que pasa|que crees que paso|que idea tienes|que se te ocurre|cual es tu teoria|formula una idea|piensa una idea)(?: .*)?$/.test(n))return "ask_idea";
    if(/^(que podria ser|que pudo causar(?:lo| eso)?|que podria haberlo causado|que posibilidades (?:hay|ves)|que explicaciones (?:hay|tienes|ves)|que hipotesis (?:hay|tienes|ves)|cuales son tus hipotesis)(?: .*)?$/.test(n))return "ask_hypotheses";
    if(/^(que estas pensando|que piensas|en que piensas|en que estas pensando|que tienes en mente|que pasa por tu mente)(?: .*)?$/.test(n))return "ask_current_thought";
    return null;
  }

  function explicitTopic(text){
    const n=BNorm(text);
    const m=n.match(/\b(?:sobre|de|con|acerca de) (.{3,})$/);
    if(!m)return null;
    const topic=m[1].trim();
    if(/^(esto|eso|lo anterior|ello)$/.test(topic))return null;
    return topic;
  }

  function currentIdea(brain,text,intent){
    const api=window.NpcIntIdeaEngine;
    if(!api)return brain.ideaEngine?.current||null;
    const explicit=explicitTopic(text);
    if(explicit)return api.refresh(brain,text,{source:"dialogue",focus:explicit});
    const current=brain.ideaEngine?.current;
    if(current?.focus)return current;
    return api.refresh(brain,text,{source:"dialogue"});
  }

  function naturalHypothesis(h){
    if(!h)return null;
    let s=String(h.claim||"").trim();
    if(!s)return null;
    return s.charAt(0).toUpperCase()+s.slice(1).replace(/[.]$/,".");
  }

  function ideaAnswer(idea){
    if(!idea)return "Todavía no tengo una situación concreta sobre la que pueda formular una idea sin inventar datos.";
    const parts=[];
    if(idea.synthesis?.claim)parts.push(idea.synthesis.claim);
    if(idea.critique)parts.push(idea.critique);
    if(idea.recommendedTest)parts.push(`Para distinguir mejor las posibilidades, ${idea.recommendedTest}.`);
    return parts.join(" ");
  }

  function hypothesesAnswer(idea){
    const hs=idea?.hypotheses||[];
    if(!hs.length)return "No tengo todavía hipótesis concretas que pueda defender con evidencia. Necesito una percepción o un hecho del mundo sobre el que razonar.";
    const top=hs.slice(0,3).map(naturalHypothesis).filter(Boolean);
    let text="No elegiría una sola explicación todavía. ";
    if(top.length===1)text+=`La posibilidad activa es: ${top[0]}`;
    else text+=`Estoy considerando ${top.map((x,i)=>`${i+1}) ${x}`).join(" ")}`;
    if(idea.critique)text+=` ${idea.critique}`;
    if(idea.recommendedTest)text+=` La prueba que más ayudaría ahora sería ${idea.recommendedTest}.`;
    return text;
  }

  function thoughtAnswer(idea,lower){
    if(!idea?.hypotheses?.length)return lower;
    const top=idea.hypotheses[0],second=idea.hypotheses[1];
    const parts=[`Ahora mismo estoy intentando explicar «${String(idea.focus||"").slice(0,90)}».`];
    if(top)parts.push(`Una posibilidad que estoy evaluando es que ${String(top.claim).replace(/^./,c=>c.toLowerCase())}.`);
    if(second)parts.push(`También estoy comparándola con la posibilidad de que ${String(second.claim).replace(/^./,c=>c.toLowerCase())}.`);
    parts.push("No las trato como hechos mientras no aparezca evidencia que las distinga.");
    if(idea.recommendedTest)parts.push(`Lo siguiente que comprobaría es ${idea.recommendedTest}.`);
    return parts.join(" ");
  }

  function updatePlan(brain,intent,text,idea){
    const p=brain.responsePlanner?.lastPlan;
    if(!p)return;
    p.intent=intent;
    p.intentSource="idea-engine";
    p.act=intent==="ask_hypotheses"?"compare_hypotheses":intent==="ask_idea"?"state_idea":"report_current_thought";
    p.content=p.content||{};
    p.content.idea=idea?{
      focus:idea.focus,
      claim:idea.synthesis?.claim||null,
      critique:idea.critique||null,
      recommendedTest:idea.recommendedTest||null,
      recommendedAction:idea.recommendedAction||null,
      hypotheses:(idea.hypotheses||[]).slice(0,4).map(h=>({claim:h.claim,status:h.status,confidence:h.confidence}))
    }:null;
    p.text=text;
    p.exposeMetrics=false;
  }

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const intent=classify(text);
    if(!intent)return oldHear.call(this,text);

    const originalSay=this.say;
    this.say=function(x){return x;};
    let lower;
    try{lower=oldHear.call(this,text);}catch(err){this.say=originalSay;throw err;}

    const finish=lowerReply=>{
      this.say=originalSay;
      const idea=currentIdea(this,text,intent);
      let reply=lowerReply;
      if(intent==="ask_idea")reply=ideaAnswer(idea);
      else if(intent==="ask_hypotheses")reply=hypothesesAnswer(idea);
      else if(intent==="ask_current_thought")reply=thoughtAnswer(idea,lowerReply);
      updatePlan(this,intent,reply,idea);
      if(Array.isArray(this.lastThoughts))this.lastThoughts.push(`PUENTE DE IDEAS: intención=${intent}; hipótesis=${idea?.hypotheses?.length||0}`);
      return reply?originalSay.call(this,reply):null;
    };
    return lower&&typeof lower.then==="function"?lower.then(finish,err=>{this.say=originalSay;throw err;}):finish(lower);
  };

  window.NpcIntIdeaResponse={classify,ideaAnswer,hypothesesAnswer};
  print("system","","puente de ideas v1.0 cargado · ideas/hipótesis → conversación natural sin exponer métricas");
})();
