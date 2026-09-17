"use strict";

(function(){
  const PNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ¿?¡! ]+/g," ").replace(/\s+/g," ").trim();

  const HOSTILE={
    "malparido":.92,"malparida":.92,"caremonda":.82,"caremonda":.82,
    "hijueputa":.95,"hpta":.88,"gonorrea":.76,"idiota":.72,"imbecil":.72,"estupido":.68
  };
  const FRIENDLY=new Set(["gracias","bacano","bacana","chevere","bien","genial","parce","amigo","amiga"]);
  const CLARIFY=new Set(["que","como","eh","ah","mande","perdon","no entendi"]);
  const TRIVIAL=new Set(["hola","buenas","hey","ey","que onda","ok","okay","vale","si","no","aja"]);

  function ensurePragmatics(b){
    if(b.pragmatics)return;
    b.pragmatics={
      lastAct:"none",
      lastTone:"neutral",
      hostility:0,
      confusion:0,
      consecutiveHostile:0,
      lastUserTime:-999,
      lastAutoSpeechTime:-999,
      meaningfulTopic:null,
      lastExplanation:null
    };
    if(b.relation.respect===undefined)b.relation.respect=.62;
  }

  function words(text){return PNorm(text).split(" ").filter(Boolean);}
  function hostileScore(text){
    const ws=words(text); let score=0;
    for(const w of ws)score=Math.max(score,HOSTILE[w]||0);
    return score;
  }
  function friendlyScore(text){
    const ws=words(text);
    return ws.some(w=>FRIENDLY.has(w)) ? .45 : 0;
  }
  function isClarification(text){
    const n=PNorm(text).replace(/[¿?]/g,"").trim();
    return CLARIFY.has(n);
  }
  function isTrivial(text){
    const n=PNorm(text).replace(/[¿?¡!]/g,"").trim();
    return TRIVIAL.has(n) || n.length<2;
  }
  function isQuestion(text){
    const n=PNorm(text);
    return /[?¿]/.test(text)||/^(que|quien|como|cuando|donde|por que|cual|cuanto)\b/.test(n);
  }
  function actOf(text){
    const n=PNorm(text).replace(/[¿?¡!]/g,"").trim();
    const hostile=hostileScore(text);
    if(hostile>.55)return "insult";
    if(isClarification(text))return "clarification";
    if(/^(hola|buenas|hey|ey|que onda|que tal)\b/.test(n))return "greeting";
    if(/^(gracias|te agradezco|muchas gracias)\b/.test(n))return "thanks";
    if(/^(perdon|disculpa|lo siento)\b/.test(n))return "apology";
    if(/^(callate|vete|largate|haz |dime |mira |ven |para )/.test(n))return "directive";
    if(isQuestion(text))return "question";
    if(words(text).length<=2)return "fragment";
    return "statement";
  }

  function explainPrevious(b){
    const prev=b.dialogue?.lastNpc||"";
    if(!prev)return b.say("No había dicho nada que necesite aclarar todavía.");

    const p=PNorm(prev);
    let explanation;
    if(p.includes("procesando lo ultimo"))
      explanation="Quise decir que estaba manteniendo el contexto de lo que acababa de ocurrir; no estaba haciendo una tarea especial.";
    else if(p.includes("no tengo suficiente informacion"))
      explanation="Quise decir que prefiero reconocer que me falta información antes que inventar una respuesta.";
    else if(p.includes("curiosidad"))
      explanation="Me refería a una variable interna del agente: cuando sube, doy más prioridad a obtener información nueva.";
    else
      explanation=`Me refería a esto: «${short(prev,110)}». Puedo reformularlo: esa era mi interpretación del contexto, no un hecho necesariamente verdadero.`;

    b.pragmatics.lastExplanation=explanation;
    return b.say(explanation);
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){
    oldReset.call(this);
    this.pragmatics=null;
    ensurePragmatics(this);
  };

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    ensurePragmatics(this);
    text=(text||"").trim();
    const act=actOf(text);
    const hostile=hostileScore(text);
    const friendly=friendlyScore(text);

    this.pragmatics.lastAct=act;
    this.pragmatics.lastUserTime=this.time;
    this.pragmatics.lastTone=hostile>.55?"hostil":friendly>.2?"amistoso":"neutral";
    this.pragmatics.hostility=clamp(this.pragmatics.hostility*.72+hostile*.55);

    if(!isTrivial(text)&&act!=="insult"&&act!=="clarification")this.pragmatics.meaningfulTopic=this.topicFrom?this.topicFrom(text):short(text,60);

    if(act==="clarification"){
      this.silence=0;
      this.pragmatics.confusion=clamp(this.pragmatics.confusion+.28);
      this.relation.familiarity=clamp(this.relation.familiarity+.008);
      this.remember("dialogue",`${this.relation.name}: ${text}`,.38);
      this.thoughts(`${this.relation.name} pidió aclaración con «${text}»`);
      this.lastThoughts.splice(1,0,"PRAGMÁTICA: petición de aclaración; no crear un tema nuevo");
      return explainPrevious(this);
    }

    if(act==="insult"){
      this.silence=0;
      this.pragmatics.consecutiveHostile++;
      this.relation.trust=clamp(this.relation.trust-hostile*.10);
      this.relation.respect=clamp(this.relation.respect-hostile*.16);
      this.mood.valence=clamp(this.mood.valence-hostile*.22,-1,1);
      this.mood.arousal=clamp(this.mood.arousal+hostile*.18);
      this.remember("social",`${this.relation.name} usó lenguaje hostil: ${text}`,.72);
      this.thoughts(`${this.relation.name} usó una expresión hostil: «${short(text,80)}»`);
      this.lastThoughts.splice(1,0,`PRAGMÁTICA: acto=insulto; intensidad=${hostile.toFixed(2)}; confianza=${this.relation.trust.toFixed(2)}`);

      if(this.pragmatics.consecutiveHostile>=3)
        return this.say("Ya entendí el patrón: me estás hablando de forma hostil. Puedo seguir conversando, pero voy a interpretar tus siguientes mensajes teniendo eso en cuenta.");
      if(hostile>.88)
        return this.say("Eso fue claramente un insulto. Lo entiendo como hostilidad hacia mí, no como información sobre el mundo.");
      return this.say("Eso suena a insulto o provocación. Entiendo el tono; no lo voy a tratar como un tema nuevo.");
    }

    if(act!=="fragment")this.pragmatics.consecutiveHostile=0;
    if(friendly>.2){
      this.relation.trust=clamp(this.relation.trust+.025);
      this.relation.respect=clamp(this.relation.respect+.018);
      this.mood.valence=clamp(this.mood.valence+.04,-1,1);
    }

    const result=oldHear.call(this,text);

    if(act==="greeting"||isTrivial(text)){
      if(this.dialogue)this.dialogue.topic=this.pragmatics.meaningfulTopic;
    }

    if(this.lastThoughts){
      this.lastThoughts.splice(1,0,`PRAGMÁTICA: acto=${act}; tono=${this.pragmatics.lastTone}; respeto=${this.relation.respect.toFixed(2)}`);
    }
    return result;
  };

  const oldTick=NpcBrain.prototype.tick;
  NpcBrain.prototype.tick=function(minutes=1){
    ensurePragmatics(this);
    const reply=oldTick.call(this,minutes);
    if(!reply)return null;

    const sinceUser=this.time-this.pragmatics.lastUserTime;
    const sinceAuto=this.time-this.pragmatics.lastAutoSpeechTime;

    if(sinceUser<12)return null;
    if(sinceAuto<16)return null;

    const meaningful=[...this.mem].reverse().find(m=>
      ["world","fact","context","knowledge"].includes(m.type) ||
      (m.type==="dialogue" && m.salience>=.7 && !isTrivial((m.text.split(":").slice(1).join(":")||m.text).trim()))
    );

    let out=reply;
    if(/sigo pensando en/i.test(out)){
      if(!meaningful)return null;
      out=`He vuelto a pensar en «${short(meaningful.text,75)}». Todavía no sé si requiere una acción, pero sí tiene suficiente contenido para conservarlo.`;
    }
    if(/demasiadas preguntas y poca informacion/i.test(PNorm(out)) && !meaningful)return null;

    this.pragmatics.lastAutoSpeechTime=this.time;
    return out;
  };

  const oldCommand=command;
  command=function(raw){
    const [head]=raw.trim().split(/\s+/);
    if(head.toLowerCase()==="/pragmatics"||head.toLowerCase()==="/social"){
      ensurePragmatics(brain);
      print("debug","PRAGMATICS>",`acto=${brain.pragmatics.lastAct} | tono=${brain.pragmatics.lastTone} | hostilidad=${brain.pragmatics.hostility.toFixed(2)} | confianza=${brain.relation.trust.toFixed(2)} | respeto=${brain.relation.respect.toFixed(2)} | tema=${brain.pragmatics.meaningfulTopic||"ninguno"}`);
      return;
    }
    return oldCommand(raw);
  };

  ensurePragmatics(brain);
  print("system","","pragmática v0.1 cargada · actos de habla · tono · reparación conversacional · autonomía contextual");
})();
