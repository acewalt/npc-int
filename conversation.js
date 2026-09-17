"use strict";

(function(){
  function ensureDialogue(b){
    if(b.dialogue)return;
    b.dialogue={turn:0,lastUser:"",lastNpc:"",lastIntent:"none",previousIntent:"none",topic:null,pending:null,recentNpc:[]};
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){
    oldReset.call(this);
    ensureDialogue(this);
  };

  NpcBrain.prototype.intent=function(text){
    const routed=window.NpcIntIntentRouter?.routeFor?.(this,text,"conversation");
    if(routed)return routed;
    const n=norm(text);
    const exact=(...xs)=>xs.includes(n);

    if(/\b(hola|buenas|hey|ey|holi|saludos)\b/.test(n) || /^(que onda|que tal|como va|todo bien)(\?|!|$)/.test(n)) return "greeting";
    if(/\b(adios|chao|chau|nos vemos|hasta luego)\b/.test(n)) return "farewell";
    if(exact("si","sí","sip","claro","aja","ajá","de acuerdo","exacto")) return "affirm";
    if(exact("no","nop","para nada")) return "deny";
    if(/^(no se|no sé|ni idea|no tengo idea|quien sabe|tal vez|quizas)$/.test(n)) return "uncertain";
    if(/\b(como estas|como te sientes|que tienes ahora|que te pasa|como te encuentras)\b/.test(n)) return "ask_state";
    if(/\b(quien eres|quien sos)\b/.test(n)) return "ask_identity";
    if(/\b(que eres)\b/.test(n)) return "ask_kind";
    if(/\b(proposito|para que existes|por que existes)\b/.test(n)) return "ask_purpose";
    if(/\b(que quieres|que deseas)\b/.test(n)) return "ask_want";
    if(/\b(que recuerdas|que sabes de mi)\b/.test(n)) return "ask_memory";
    if(/\bpor que\b/.test(n) && this.dialogue.lastNpc) return "ask_why";
    if(text.includes("?")) return "question";
    if(n.split(" ").filter(Boolean).length<=3) return "short";
    return "statement";
  };

  NpcBrain.prototype.topicFrom=function(text){
    const stop=new Set(["esto","esta","pero","porque","tengo","tiene","ahora","aqui","algo","mucho","poco","sobre","dices","quiero","puedes","como","para","todo","bien"]);
    const words=norm(text).split(" ").filter(w=>w.length>3&&!stop.has(w));
    return words.slice(0,4).join(" ") || short(text,46);
  };

  NpcBrain.prototype.say=function(text){
    ensureDialogue(this);
    let out=text;
    const recent=this.dialogue.recentNpc;
    const previous=recent.length?recent[recent.length-1]:null;
    const exactDuplicate=previous && norm(previous)===norm(out);
    const sameIntent=this.dialogue.lastIntent===this.dialogue.previousIntent;

    // Solo reformular si intentamos repetir literalmente la respuesta inmediatamente
    // y el acto conversacional también es el mismo. Antes se usaba similitud global
    // y eso convertía preguntas distintas en "mi respuesta no ha cambiado".
    if(exactDuplicate && sameIntent){
      out="No tengo información nueva desde mi respuesta anterior; si quieres, puedo explicar qué parte quedó sin resolver.";
    }

    this.dialogue.lastNpc=out;
    recent.push(out);
    if(recent.length>8)recent.shift();
    this.remember("npc-speech",`${this.identity.name}: ${out}`,.46);
    return out;
  };

  NpcBrain.prototype.askContext=function(text,topic){
    this.dialogue.pending={topic,askedAt:this.dialogue.turn};
    return this.say(text);
  };

  NpcBrain.prototype.answerPending=function(text,intent){
    const p=this.dialogue.pending;
    if(!p)return null;

    if(intent==="uncertain"){
      this.dialogue.pending=null;
      this.drives.curiosidad=clamp(this.drives.curiosidad+.04);
      return this.say(`Está bien. Entonces queda como una incógnita. Si aparece información nueva sobre ${p.topic}, podemos volver a ello.`);
    }
    if(intent==="affirm"){
      this.dialogue.pending=null;
      return this.say(`Entendido. Tomo eso como una confirmación sobre ${p.topic}.`);
    }
    if(intent==="deny"){
      this.dialogue.pending=null;
      return this.say(`Entendido. Entonces descarto esa posibilidad sobre ${p.topic} por ahora.`);
    }
    if(intent==="short" || intent==="statement"){
      this.dialogue.pending=null;
      this.remember("context",`Respuesta sobre ${p.topic}: ${text}`,.72);
      return this.say(`Eso me da más contexto sobre ${p.topic}. Lo tendré en cuenta.`);
    }
    return null;
  };

  NpcBrain.prototype.hear=function(text){
    ensureDialogue(this);
    text=text.trim();
    this.dialogue.turn++;
    this.silence=0;
    this.relation.familiarity=clamp(this.relation.familiarity+.025);

    const danger=this.threat(text);
    this.drives.amenaza=clamp(this.drives.amenaza+danger);
    this.drives.social=clamp(this.drives.social-.15);
    this.drives.curiosidad=clamp(this.drives.curiosidad+.018);
    this.mood.arousal=clamp(this.mood.arousal+.035+danger*.4);

    this.remember("dialogue",`${this.relation.name}: ${text}`,.62);

    const intent=this.intent(text);
    this.dialogue.lastUser=text;
    this.dialogue.previousIntent=this.dialogue.lastIntent;
    this.dialogue.lastIntent=intent;
    this.dialogue.topic=this.topicFrom(text);
    this.thoughts(`${this.relation.name} dijo «${short(text,100)}»`);
    this.lastThoughts.splice(1,0,`INTERPRETACIÓN: intención=${intent}`);
    if(this.dialogue.pending)this.lastThoughts.splice(2,0,`CONTEXTO: había una pregunta pendiente sobre «${this.dialogue.pending.topic}»`);

    const learned=this.taught(text);
    if(learned)return this.say(learned.response);

    const name=this.extractName(text);
    if(name){
      this.relation.name=name;
      this.remember("fact",`El interlocutor se llama ${name}.`,.9);
      this.dialogue.pending=null;
      return this.say(`Entendido. Te llamaré ${name}.`);
    }

    if(danger>.5){
      this.dialogue.pending=null;
      return this.say("Eso eleva mi nivel de alerta. Antes de seguir como si nada, necesito distinguir si el peligro es real o hipotético.");
    }

    const pending=this.answerPending(text,intent);
    if(pending)return pending;

    switch(intent){
      case "greeting":
        this.dialogue.pending=null;
        return this.say(pick([
          "Todo tranquilo por ahora. Estoy atento. ¿Qué tal tú?",
          "Aquí sigo. Nada urgente; estaba procesando lo último que ocurrió.",
          `Qué onda. Ahora mismo estoy ${this.moodLabel()} y atento al entorno.`
        ]));

      case "farewell":
        this.dialogue.pending=null;
        return this.say("Entendido. Seguiré aquí; mi estado continuará cambiando aunque no estés hablando conmigo.");

      case "ask_identity":
        return this.say(`Soy ${this.identity.name}. Soy un ${this.identity.kind}; mantengo memoria, estado interno, contexto conversacional e impulsos para decidir cómo reaccionar.`);

      case "ask_kind":
        return this.say(`Soy un ${this.identity.kind}. No soy una persona real; soy una simulación de agente pensada para controlar un NPC.`);

      case "ask_purpose":
        return this.say(`Mi propósito actual es ${this.identity.purpose}. Funciona como una meta persistente que pesa en mis decisiones.`);

      case "ask_want":
        return this.say(`Ahora mismo domina ${this.dominant()}. En términos prácticos, eso significa que intento ${this.goalFor(this.dominant())}.`);

      case "ask_state": {
        const d=this.dominant();
        const details=[];
        if(this.drives.curiosidad>.6)details.push("tengo bastante curiosidad acumulada");
        if(this.drives.social>.6)details.push("me está pesando la falta de interacción");
        if(this.drives.amenaza>.35)details.push("hay algo de alerta");
        if(this.drives.fatiga>.55)details.push("estoy acumulando fatiga");
        const tail=details.length?` Además, ${details.join(" y ")}.`:" No hay otra presión interna especialmente fuerte.";
        return this.say(`Ahora estoy ${this.moodLabel()}. Domina ${d}; intento ${this.goalFor(d)}.${tail}`);
      }

      case "ask_memory": {
        const facts=this.mem.filter(m=>m.type==="fact"||m.type==="context").slice(-6);
        return this.say(facts.length?`De ti recuerdo: ${facts.map(x=>x.text).join(" ")}`:"Todavía sé muy poco de ti. Tengo conversación reciente, pero casi ningún hecho estable sobre quién eres.");
      }

      case "ask_why":
        return this.say(`Lo dije porque mi impulso dominante era ${this.dominant()} y estaba intentando ${this.goalFor(this.dominant())}. Eso explica la decisión, no demuestra que mi conclusión sea correcta.`);

      case "uncertain":
        return this.say(pick([
          "Yo tampoco tengo suficiente información para afirmarlo. Lo dejaré como incierto.",
          "Entonces no voy a inventar una respuesta. Por ahora simplemente no lo sabemos.",
          "Vale. La incertidumbre también es válida; no necesito forzar una conclusión."
        ]));

      case "affirm":
        return this.say(pick(["Entendido.","De acuerdo. Lo tomo como confirmación.","Bien, lo tendré en cuenta."]));

      case "deny":
        return this.say(pick(["Entendido; entonces no asumiré eso.","Vale. Descarto esa interpretación por ahora.","De acuerdo."]));

      case "question": {
        const route=window.NpcIntIntentRouter?.currentFor?.(this,text);
        // Una pregunta no resuelta no debe caer sobre el recuerdo global más reforzado.
        // Las consultas de memoria explícitas se atienden en su capa especializada.
        if(route?.memoryPolicy==="history"){
          return this.say("Entiendo que estás preguntando por algo de nuestra conversación. Voy a resolverlo desde la memoria de turnos, no desde un recuerdo cualquiera.");
        }
        return this.say("No lo sé todavía. No tengo información suficiente para responder eso sin inventar.");
      }

      case "short": {
        const compact=text.trim();
        if(compact.length<=18)return this.say(`No estoy seguro de qué relación quieres expresar con «${compact}». ¿Puedes completar la idea o decir a qué te refieres?`);
        return this.say("Parece una frase incompleta. Prefiero pedir contexto antes que fingir que la entendí.");
      }

      default: {
        const topic=this.topicFrom(text);
        const related=this.recall(text,2).filter(m=>m.type!=="dialogue" || !norm(m.text).endsWith(norm(text)));
        if(!related.length && this.drives.curiosidad>.68 && text.length>18){
          return this.askContext(`Eso de «${short(topic,52)}» es nuevo para mí. ¿Qué ocurrió exactamente?`,topic);
        }
        return this.say(pick([
          "Entiendo. Lo voy a conservar como contexto.",
          "Eso cambia un poco lo que sé de la situación.",
          "Lo tengo. No necesito preguntarte algo solo por responder.",
          "Queda registrado; veré si se conecta con algo más adelante."
        ]));
      }
    }
  };

  ensureDialogue(brain);
  print("system","","capa conversacional v0.5 cargada · intención centralizada + fallback sin recuerdos irrelevantes");
})();
