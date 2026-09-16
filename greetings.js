"use strict";

(function(){
  const GNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();

  function ensureGreetingState(b){
    if(!b.socialGreeting){
      b.socialGreeting={count:0,lastStyle:null,lastText:"",lastAt:-999,styles:[]};
    }
    return b.socialGreeting;
  }

  function isGreeting(text){
    const n=GNorm(text);
    return /^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|ey|que onda|que tal|como va|todo bien)(\s|$)/.test(n);
  }

  function meaningfulTopic(b){
    const p=b.pragmatics?.meaningfulTopic;
    if(p && !/^(hola|buenas|hey|ey|que onda|que tal)$/i.test(p))return p;

    const r=b.discourse?.lastRegistered?.source;
    if(r && !isGreeting(r))return r;

    const mem=[...(b.mem||[])].reverse().find(m=>
      ["world","fact","context","knowledge"].includes(m.type) && m.text && !isGreeting(m.text)
    );
    return mem?.text||null;
  }

  function playerName(b){
    const n=b.relation?.name;
    if(!n || /^(jugador|player)$/i.test(n))return null;
    return n;
  }

  function chooseStyle(b){
    const s=ensureGreetingState(b);
    const candidates=[];
    const add=(id,weight,reason)=>candidates.push({id,weight,reason});
    const fear=b.mind?.affect?.fear ?? b.drives?.amenaza ?? 0;
    const energy=b.mind?.needs?.energy ?? (1-(b.drives?.fatiga||0));
    const curiosity=b.mind?.cognition?.curiosity ?? b.drives?.curiosidad ?? .4;
    const trust=b.relation?.trust ?? .5;
    const familiarity=b.relation?.familiarity ?? 0;
    const topic=meaningfulTopic(b);
    const elapsed=Math.max(0,(b.time||0)-s.lastAt);

    if(s.count===0)add("first",2.4,"primer saludo");
    if(fear>.5)add("alert",2.2+fear,"estado de alerta");
    if(energy<.38)add("tired",2.0+(1-energy),"energía baja");
    if(topic && s.count>0)add("callback",1.8+Math.min(.7,familiarity),"hay un tema previo");
    if(curiosity>.68)add("curious",1.6+curiosity*.6,"curiosidad alta");
    if(familiarity>.42 && trust>.42)add("familiar",1.8+familiarity,"relación familiar");
    if(elapsed>20 && s.count>0)add("return",1.7+Math.min(1,elapsed/60),"reencuentro tras tiempo");
    if(trust<.3)add("guarded",2.0+(1-trust),"confianza baja");
    add("neutral",1.25,"saludo neutral");
    add("brief",1.05,"saludo breve");

    const filtered=candidates.filter(x=>x.id!==s.lastStyle);
    const pool=filtered.length?filtered:candidates;
    const total=pool.reduce((a,x)=>a+x.weight,0);
    let r=Math.random()*total;
    for(const x of pool){r-=x.weight;if(r<=0)return x;}
    return pool[pool.length-1];
  }

  function greetingText(b,style){
    const name=playerName(b);
    const topic=meaningfulTopic(b);
    const mood=typeof b.moodLabel==="function"?b.moodLabel():"neutral";
    const fear=b.mind?.affect?.fear ?? b.drives?.amenaza ?? 0;
    const energy=b.mind?.needs?.energy ?? (1-(b.drives?.fatiga||0));
    const curiosity=b.mind?.cognition?.curiosity ?? b.drives?.curiosidad ?? .4;
    const prefix=name?`${name}, `:"";

    switch(style.id){
      case "first": {
        const xs=[
          "Hola. Te escucho.",
          "Buenas. Estoy aquí; dime.",
          "Hola. ¿Qué tienes en mente?",
          "Ey. Podemos empezar por donde quieras."
        ];
        return xs[Math.floor(Math.random()*xs.length)];
      }
      case "alert":
        return fear>.72
          ? `${prefix}hola. Estoy bastante alerta ahora mismo; sigo atento a lo que ocurra alrededor.`
          : `${prefix}hola. Te escucho, aunque tengo algo de alerta activa ahora mismo.`;
      case "tired":
        return energy<.22
          ? `${prefix}hola. Tengo poca energía ahora mismo, pero puedo seguir hablando.`
          : `${prefix}buenas. Estoy algo más lento de lo normal; aun así te escucho.`;
      case "callback": {
        const t=short(topic,72);
        const xs=[
          `${prefix}hola de nuevo. Me quedó pendiente «${t}».`,
          `${prefix}buenas. Todavía tengo presente «${t}».`,
          `${prefix}ey. Podemos retomar «${t}» si sigue siendo relevante.`
        ];
        return xs[Math.floor(Math.random()*xs.length)];
      }
      case "curious":
        return topic
          ? `${prefix}hola. Sigo con curiosidad por «${short(topic,64)}». ¿Apareció algo nuevo?`
          : `${prefix}buenas. Tengo bastante curiosidad activa ahora mismo. ¿Qué quieres explorar?`;
      case "familiar": {
        const xs=[
          `${prefix}qué tal. Te escucho.`,
          `${prefix}ey, de nuevo por aquí. ¿Qué seguimos?`,
          `${prefix}buenas. ¿Continuamos o cambiamos de tema?`
        ];
        return xs[Math.floor(Math.random()*xs.length)];
      }
      case "return":
        return topic
          ? `${prefix}volviste. Aún conservo el contexto de «${short(topic,60)}».`
          : `${prefix}volviste. Mi estado siguió cambiando mientras no hablábamos.`;
      case "guarded":
        return `${prefix}hola. Te escucho, aunque mi nivel de confianza contigo sigue bajo.`;
      case "brief": {
        const xs=["Hola.","Buenas.","Ey.","Qué tal."];
        return xs[Math.floor(Math.random()*xs.length)];
      }
      default: {
        if(mood==="alerta")return `${prefix}hola. Estoy alerta, pero te escucho.`;
        if(curiosity>.62)return `${prefix}qué tal. Estoy atento y con bastante curiosidad ahora mismo.`;
        const xs=[
          `${prefix}hola. Estoy ${mood}; te escucho.`,
          `${prefix}buenas. Nada urgente por ahora.`,
          `${prefix}qué tal. Estoy atento al entorno.`,
          `${prefix}ey. Aquí sigo.`
        ];
        return xs[Math.floor(Math.random()*xs.length)];
      }
    }
  }

  function produceGreeting(b){
    const s=ensureGreetingState(b);
    let style=chooseStyle(b);
    let text=greetingText(b,style);

    // No repetir exactamente el saludo anterior aunque el contexto sea idéntico.
    for(let i=0;i<4 && GNorm(text)===GNorm(s.lastText);i++){
      style=chooseStyle(b);
      text=greetingText(b,style);
    }

    s.count++;
    s.lastStyle=style.id;
    s.lastText=text;
    s.lastAt=b.time||0;
    s.styles.push(style.id);
    if(s.styles.length>12)s.styles.shift();

    if(Array.isArray(b.lastThoughts)){
      b.lastThoughts.push(`SALUDO: estilo=${style.id}; razón=${style.reason}`);
    }
    return text;
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){
    oldReset.call(this);
    this.socialGreeting={count:0,lastStyle:null,lastText:"",lastAt:-999,styles:[]};
  };

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    text=(text||"").trim();
    if(!isGreeting(text))return oldHear.call(this,text);

    // Dejamos que las capas inferiores procesen el saludo (memoria, relación,
    // pragmática, etc.), pero capturamos su plantilla de salida para sustituirla
    // por una respuesta social construida desde el estado actual.
    const originalSay=this.say;
    this.say=function(x){return x;};
    let result;
    try{
      result=oldHear.call(this,text);
    }catch(err){
      this.say=originalSay;
      throw err;
    }

    const finish=()=>{
      this.say=originalSay;
      return originalSay.call(this,produceGreeting(this));
    };

    if(result&&typeof result.then==="function"){
      return result.then(finish,err=>{this.say=originalSay;throw err;});
    }
    return finish();
  };

  const oldCommand=command;
  command=function(raw){
    const head=(raw.trim().split(/\s+/)[0]||"").toLowerCase();
    if(head!=="/greeting"&&head!=="/greetings")return oldCommand(raw);
    const s=ensureGreetingState(brain);
    print("debug","GREETING>",[
      `saludos=${s.count}`,
      `último estilo=${s.lastStyle||"—"}`,
      `último texto=${s.lastText||"—"}`,
      `historial=${s.styles.length?s.styles.join(" → "):"—"}`,
      `tema relevante=${meaningfulTopic(brain)||"—"}`
    ].join("\n"));
  };

  ensureGreetingState(brain);
  print("system","","saludo social v0.1 cargado · estado + relación + memoria + variación contextual");
})();
