"use strict";

const $ = id => document.getElementById(id);
const terminal = $("terminal");
const input = $("input");
const statusText = $("statusText");

const clamp = (v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const pick = arr => arr[Math.floor(Math.random()*arr.length)];
const short = (s,n=72)=>s.length<=n?s:s.slice(0,n-1).trim()+"…";

function print(kind,prefix,text){
  const div=document.createElement("div");
  div.className=`line ${kind}`;
  if(prefix){
    const span=document.createElement("span");
    span.className="prefix";
    span.textContent=prefix;
    div.appendChild(span);
  }
  div.appendChild(document.createTextNode(text));
  terminal.appendChild(div);
  terminal.scrollTop=terminal.scrollHeight;
}

class NpcBrain{
  constructor(){this.reset();}
  reset(){
    this.identity={name:"NIA-01",kind:"NPC cognitivo local",purpose:"comprender el entorno, conservar continuidad y actuar según mis experiencias"};
    this.time=0;
    this.auto=true;
    this.silence=0;
    this.seq=1;
    this.lastThoughts=[];
    this.mem=[];
    this.learned=[];
    this.relation={name:"Jugador",familiarity:.05,trust:.46};
    this.drives={curiosidad:.48,social:.30,autonomia:.26,proposito:.34,fatiga:.08,amenaza:.03};
    this.mood={valence:.08,arousal:.20};
    this.remember("self",`Soy ${this.identity.name}. Mi propósito es ${this.identity.purpose}.`,.95);
  }
  remember(type,text,salience=.5){
    const m={id:this.seq++,type,text,salience,time:this.time};
    this.mem.push(m);
    if(this.mem.length>200)this.mem.shift();
    return m;
  }
  dominant(){return Object.entries(this.drives).sort((a,b)=>b[1]-a[1])[0][0];}
  moodLabel(){
    if(this.drives.amenaza>.65)return "alerta";
    if(this.mood.valence>.35)return "receptivo";
    if(this.mood.valence<-.30)return "incómodo";
    if(this.mood.arousal<.18)return "calmado";
    return "neutral";
  }
  similarity(a,b){
    const A=new Set(norm(a).split(/[^a-z0-9ñ]+/).filter(x=>x.length>2));
    const B=new Set(norm(b).split(/[^a-z0-9ñ]+/).filter(x=>x.length>2));
    if(!A.size||!B.size)return 0;
    let hit=0;A.forEach(x=>B.has(x)&&hit++);
    return hit/Math.max(A.size,B.size);
  }
  recall(q,count=3){
    return this.mem.map(m=>({m,s:this.similarity(q,m.text)+m.salience*.12}))
      .filter(x=>x.s>.12).sort((a,b)=>b.s-a.s).slice(0,count).map(x=>x.m);
  }
  thoughts(observation){
    const related=this.recall(observation,2);
    const out=[`OBSERVACIÓN: ${observation}`];
    if(related.length)out.push(`RECUERDO: ${related[0].text}`);
    out.push(`ESTADO: ánimo=${this.moodLabel()}, impulso=${this.dominant()}`);
    out.push(`META: ${this.goalFor(this.dominant())}`);
    this.lastThoughts=out;
  }
  goalFor(d){
    return ({curiosidad:"reducir incertidumbre",social:"mantener contacto",autonomia:"hacer algo sin esperar una orden",proposito:"actuar de acuerdo con mi propósito",fatiga:"conservar recursos",amenaza:"reducir riesgo"})[d]||"mantener estabilidad";
  }
  extractName(text){
    const m=text.match(/(?:me llamo|mi nombre es)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ]+)/i);
    if(!m)return null;
    const n=m[1]; return n[0].toUpperCase()+n.slice(1).toLowerCase();
  }
  threat(text){
    const n=norm(text);
    return /(matar|mata|arma|fuego|explosion|peligro|sangre|ataque|atacar|auxilio)/.test(n)?.75:0;
  }
  taught(text){
    let best=null,score=0;
    for(const x of this.learned){const s=this.similarity(text,x.trigger);if(s>score){score=s;best=x;}}
    return score>.55?best:null;
  }
  hear(text){
    text=text.trim();
    this.silence=0;
    this.relation.familiarity=clamp(this.relation.familiarity+.025);
    const danger=this.threat(text);
    this.drives.amenaza=clamp(this.drives.amenaza+danger);
    this.drives.social=clamp(this.drives.social-.15);
    this.drives.curiosidad=clamp(this.drives.curiosidad+.025);
    this.mood.arousal=clamp(this.mood.arousal+.05+danger*.4);
    this.remember("dialogue",`${this.relation.name}: ${text}`,.62);
    this.thoughts(`${this.relation.name} dijo «${short(text,100)}»`);

    const n=norm(text);
    const learned=this.taught(text);
    if(learned)return learned.response;

    const name=this.extractName(text);
    if(name){
      this.relation.name=name;
      this.remember("fact",`El interlocutor se llama ${name}.`,.9);
      return `Entendido. Te llamaré ${name}.`;
    }

    if(/quien eres|quien sos/.test(n))return `Soy ${this.identity.name}. Soy un ${this.identity.kind}. Tengo memoria, estado interno, impulsos y reglas de decisión.`;
    if(/que eres/.test(n))return `Soy un ${this.identity.kind}. No soy una persona real; soy una simulación de agente para un NPC.`;
    if(/proposito|para que existes|por que existes/.test(n))return `Mi propósito actual es ${this.identity.purpose}.`;
    if(/que quieres|que deseas/.test(n))return `Ahora mismo domina mi ${this.dominant()}. Eso empuja mis decisiones más que una respuesta predefinida.`;
    if(/como estas|como te sientes/.test(n))return `Estoy ${this.moodLabel()}. Mi impulso dominante es ${this.dominant()}.`;
    if(/que recuerdas|que sabes de mi/.test(n)){
      const facts=this.mem.filter(m=>m.type==="fact").slice(-5);
      return facts.length?`Recuerdo esto: ${facts.map(x=>x.text).join(" ")}`:"Todavía sé muy poco de ti.";
    }
    if(/hola|buenas|hey|saludos/.test(n))return pick(["Hola. Estoy escuchando.","Hola. ¿Qué quieres probar conmigo?","Te escucho. Estaba observando el entorno."]);
    if(text.includes("?")){
      const r=this.recall(text,3);
      return r.length>1?`No tengo una respuesta segura. Lo más relacionado que recuerdo es: «${r[1].text}».`:"Todavía no sé responder eso con seguridad. Necesito más contexto o conocimiento.";
    }
    if(this.drives.curiosidad>.52)return `Dices «${short(text)}». ¿Qué parte de eso debería considerar importante?`;
    return pick(["Lo recordaré.","Entiendo. Puede afectar decisiones futuras.","Queda registrado en mi contexto."]);
  }
  event(text){
    const danger=this.threat(text);
    this.remember("world",`Mundo: ${text}`,.72);
    this.drives.curiosidad=clamp(this.drives.curiosidad+.13);
    this.drives.amenaza=clamp(this.drives.amenaza+danger);
    this.thoughts(`Percibí un evento del mundo: «${short(text,100)}»`);
    if(this.drives.amenaza>.62)return "Eso parece peligroso. Necesito evaluar el entorno antes de hacer otra cosa.";
    if(this.drives.curiosidad>.62)return "Eso cambió el entorno. Quiero averiguar qué lo causó.";
    return null;
  }
  tick(minutes=1){
    this.time+=minutes;
    this.silence+=minutes;
    this.drives.social=clamp(this.drives.social+minutes*.016);
    this.drives.curiosidad=clamp(this.drives.curiosidad+minutes*.009);
    this.drives.autonomia=clamp(this.drives.autonomia+minutes*.008);
    this.drives.proposito=clamp(this.drives.proposito+minutes*.007);
    this.drives.fatiga=clamp(this.drives.fatiga+minutes*.003);
    this.drives.amenaza=clamp(this.drives.amenaza-minutes*.012);
    this.thoughts(`Han pasado ${this.silence} minutos sin conversación directa.`);

    if(this.drives.amenaza>.68)return "No puedo ignorar la sensación de peligro. Necesito comprobar qué está ocurriendo.";
    if(this.silence>6&&this.drives.social>.68){
      const r=[...this.mem].reverse().find(x=>x.type==="dialogue"||x.type==="world");
      this.drives.social=clamp(this.drives.social-.34);
      return r?`Sigo pensando en «${short(r.text,58)}». ¿Debería hacer algo con eso?`:"Ha pasado bastante tiempo. ¿Sigues ahí?";
    }
    if(this.drives.autonomia>.76){
      this.drives.autonomia=clamp(this.drives.autonomia-.36);
      return "No quiero limitarme a esperar una orden. Voy a intentar decidir qué debería observar a continuación.";
    }
    if(this.drives.curiosidad>.82){
      this.drives.curiosidad=clamp(this.drives.curiosidad-.30);
      return "Tengo demasiadas preguntas y poca información. Quiero aprender algo nuevo del entorno.";
    }
    return null;
  }
  teach(trigger,response){this.learned.push({trigger,response});this.remember("learned",`Aprendí: ${trigger} => ${response}`,.8);}
}

const brain=new NpcBrain();
let autoTimer=null;

function setAuto(on){
  brain.auto=on;
  statusText.textContent=`ONLINE · ${on?"AUTO":"MANUAL"}`;
  if(autoTimer)clearInterval(autoTimer);
  autoTimer=null;
  if(on){
    autoTimer=setInterval(()=>{
      const reply=brain.tick(2);
      if(reply)print("npc",brain.identity.name+">",reply);
    },4000);
  }
}

function showHelp(){
  print("system","",`Comandos disponibles:\n/help                ayuda\n/state               estado interno\n/thoughts            último razonamiento estructurado\n/memory [n]          recuerdos recientes\n/tick [min]          avanzar tiempo\n/event <texto>       inyectar evento del mundo\n/teach a => b        enseñar asociación\n/auto on|off         iniciativa autónoma\n/clear               limpiar terminal\n/reset               reiniciar NPC`);
}

function command(raw){
  const [head,...rest]=raw.split(" ");
  const arg=rest.join(" ").trim();
  switch(head.toLowerCase()){
    case "/help": showHelp(); break;
    case "/state":
      print("debug","STATE>",`t=${brain.time}m | ánimo=${brain.moodLabel()} | dominante=${brain.dominant()} | familiaridad=${brain.relation.familiarity.toFixed(2)} | recuerdos=${brain.mem.length}\ncuriosidad=${brain.drives.curiosidad.toFixed(2)} social=${brain.drives.social.toFixed(2)} autonomía=${brain.drives.autonomia.toFixed(2)} propósito=${brain.drives.proposito.toFixed(2)} amenaza=${brain.drives.amenaza.toFixed(2)}`);
      break;
    case "/thoughts":
      print("debug","THOUGHT>",brain.lastThoughts.length?brain.lastThoughts.join("\n"):"Todavía no hay un ciclo cognitivo registrado.");
      break;
    case "/memory":{
      const n=Math.max(1,Math.min(20,Number(arg)||8));
      const items=brain.mem.slice(-n).map(m=>`#${m.id} [${m.type}] t+${m.time}m  ${m.text}`);
      print("debug","MEMORY>",items.join("\n"));
      break;
    }
    case "/tick":{
      const n=Math.max(1,Number(arg)||1);
      const reply=brain.tick(n);
      print("system","",`tiempo simulado +${n}m`);
      if(reply)print("npc",brain.identity.name+">",reply);
      break;
    }
    case "/event":{
      if(!arg){print("error","ERROR>","Uso: /event se apagaron las luces");break;}
      print("world","WORLD>",arg);
      const reply=brain.event(arg);
      if(reply)print("npc",brain.identity.name+">",reply);
      break;
    }
    case "/teach":{
      const parts=arg.split("=>");
      if(parts.length<2){print("error","ERROR>","Uso: /teach buenos días => Buenos días.");break;}
      brain.teach(parts[0].trim(),parts.slice(1).join("=>").trim());
      print("system","","asociación aprendida");
      break;
    }
    case "/auto":
      if(!/^(on|off)$/i.test(arg)){print("system","",`auto=${brain.auto?"on":"off"}. Uso: /auto on|off`);break;}
      setAuto(arg.toLowerCase()==="on");
      print("system","",`modo autónomo ${brain.auto?"activado":"desactivado"}`);
      break;
    case "/clear": terminal.innerHTML=""; break;
    case "/reset":
      brain.reset(); setAuto(true); terminal.innerHTML=""; boot();
      break;
    default: print("error","ERROR>","Comando desconocido. Usa /help.");
  }
}

function send(text){
  text=text.trim();
  if(!text)return;
  if(text.startsWith("/")){command(text);return;}
  print("user",brain.relation.name+">",text);
  const reply=brain.hear(text);
  if(reply)window.setTimeout(()=>print("npc",brain.identity.name+">",reply),120);
}

function boot(){
  print("system","","npc-int cognitive terminal v0.2");
  print("system","","motor local iniciado · memoria activa · autonomía activa");
  print("npc",brain.identity.name+">","Estoy activo. Puedes hablarme. Si no lo haces, mi estado seguirá cambiando.");
  print("system","","escribe /help para ver comandos");
}

$("chatForm").addEventListener("submit",e=>{
  e.preventDefault();
  const text=input.value;
  input.value="";
  send(text);
  input.focus();
});

document.addEventListener("click",()=>input.focus());
boot();
setAuto(true);
