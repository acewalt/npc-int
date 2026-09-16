"use strict";

(function(){
  const UNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ¿?¡! ]+/g," ").replace(/\s+/g," ").trim();

  const VOCAB=[
    "que","quien","como","cuando","donde","porque","por","para","tienes","tiene","tengo","entiendes","entendiste","comprendes","comprendiste",
    "inteligencia","informacion","cuenta","registraste","registro","sigues","siguiendo","añadir","agregar","sabes","puedes","capaz","capacidad",
    "recuerdas","piensas","quieres","necesitas","respondes","dices","dijiste","gusta","eres","soy","esto","eso","anterior","ultimo","significa"
  ];

  function ensureUnderstanding(b){
    if(b.understanding)return;
    b.understanding={lastFrame:null,lastCanonical:"",lastRepair:[],fragment:null,history:[]};
  }

  function distance(a,b){
    const m=a.length,n=b.length;
    const d=Array.from({length:m+1},()=>Array(n+1).fill(0));
    for(let i=0;i<=m;i++)d[i][0]=i;
    for(let j=0;j<=n;j++)d[0][j]=j;
    for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){
      const c=a[i-1]===b[j-1]?0:1;
      d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
    }
    return d[m][n];
  }

  function repairToken(w){
    const fixed={haci:"asi",teines:"tienes",tienees:"tienes",tienee:"tienes",encuenta:"en cuenta",intelijencia:"inteligencia",informasion:"informacion"};
    if(fixed[w])return fixed[w];
    if(w.length<4)return w;
    let best=w,score=99;
    for(const v of VOCAB){
      if(Math.abs(v.length-w.length)>2)continue;
      const x=distance(w,v);
      const limit=w.length>=8?2:1;
      if(x<score&&x<=limit){best=v;score=x;}
    }
    return best;
  }

  function canonical(text){
    const raw=UNorm(text).replace(/[¿?¡!]/g," ").split(/\s+/).filter(Boolean);
    const repaired=[];
    const out=[];
    for(const w of raw){
      const r=repairToken(w);
      if(r!==w)repaired.push(`${w}→${r}`);
      out.push(...r.split(" "));
    }
    return {text:out.join(" ").replace(/\s+/g," ").trim(),repaired};
  }

  function hasAll(tokens,...xs){return xs.every(x=>tokens.includes(x));}
  function hasAny(tokens,...xs){return xs.some(x=>tokens.includes(x));}

  function semanticFor(text,b){
    try{
      if(!b?.nlp?.lastAnalysis || b.nlp.lastText!==text)return null;
      return b.nlp.lastSemantic || window.NpcIntSemanticInterpreter?.interpret?.(text,b.nlp.lastAnalysis,b) || null;
    }catch(_){return null;}
  }

  function classify(text,b){
    const c=canonical(text);
    const n=c.text;
    const t=n.split(" ").filter(Boolean);
    const semantic=semanticFor(text,b);
    let intent=semantic?.intent||null;

    // Fallback rules remain useful when the neural NLP bridge is disabled or
    // when its semantic projection has low coverage. They are deliberately
    // second choice now, not the primary parser.
    if(!intent){
      if(/^(mm+|hm+|hmm+|uhm+|aja|ajá)$/.test(UNorm(text).replace(/[¿?¡!]/g,""))) intent="backchannel";
      else if((hasAny(t,"inteligencia","capacidad")&&hasAny(t,"tienes","tiene","eres")) || /que sabes hacer/.test(n)) intent="ask_capabilities";
      else if((hasAny(t,"entiendes","entendiste","comprendes","comprendiste")&&hasAny(t,"que","esto","eso")) || /^que entend/.test(n)) intent="ask_understanding";
      else if(hasAny(t,"registraste","registro")&&hasAny(t,"que","cual")) intent="ask_registered";
      else if(hasAll(t,"tienes","cuenta")&&hasAny(t,"que","cual")) intent="ask_considering";
      else if(hasAny(t,"informacion")&&hasAny(t,"para")&&hasAny(t,"que")) intent="ask_information_purpose";
      else if(hasAny(t,"sigues","siguiendo")&&hasAny(t,"que","por")) intent="ask_following";
      else if(hasAny(t,"añadir","agregar")&&hasAny(t,"que","cual")) intent="ask_what_add";
      else if(hasAny(t,"recuerdas")&&hasAny(t,"que","cual")) intent="ask_memory_semantic";
      else if(hasAll(t,"eres","gay") || hasAll(t,"eres","heterosexual") || hasAll(t,"eres","bisexual")) intent="ask_orientation";
      else if(hasAll(t,"te","gusta") || /^te gusta/.test(n)) intent="ask_preference";
      else if((hasAny(t,"porque")||hasAll(t,"por","que"))&&hasAny(t,"respondes","dices","dijiste")) intent="ask_reason";
    }

    return {
      raw:text,canonical:n,tokens:t,intent,repaired:c.repaired,
      semantic,
      source:semantic?.intent?semantic.source||"semantic-nlp":"heuristic-fallback",
      confidence:semantic?.intent?semantic.confidence:null
    };
  }

  function topGoal(b){
    const g=b.mind?.lastCycle?.goals?.[0];
    return g?`${g.label} (${Math.round((g.priority||0)*100)}%)`:null;
  }

  function decision(b){
    const d=b.mind?.lastCycle?.decision;
    return d?`${d.label} (${Math.round((d.score||0)*100)}%)`:null;
  }

  function previousRelevantUser(b){
    const d=b.discourse;
    if(d?.previousUser)return d.previousUser;
    const mem=[...(b.mem||[])].reverse().find(m=>m.type==="dialogue");
    return mem?String(mem.text).split(":").slice(1).join(":").trim():"";
  }

  function currentTopic(b){
    return b.pragmatics?.meaningfulTopic || b.dialogue?.topic || b.discourse?.lastRegistered?.source || previousRelevantUser(b) || "el contexto actual";
  }

  function answerFrame(b,f){
    const d=b.discourse||{};
    switch(f.intent){
      case "ask_capabilities":
        return "Mi inteligencia actual es híbrida. Mantengo contexto, memoria episódica, hechos y relaciones, conocimiento externo, estado mental, objetivos y decisiones. Cuando el NLP local está activo también puedo usar análisis contextual de lemas, morfología, dependencias y entidades; Nanochat puede encargarse de interpretación adicional y redacción neuronal.";

      case "ask_understanding": {
        const x=d.lastInterpretation;
        if(x&&x.source&&UNorm(x.source)!==UNorm(f.raw))return `De «${x.source}» entendí: ${x.interpretation}.`;
        const prev=previousRelevantUser(b);
        return prev?`Del turno anterior «${prev}» intento conservar su intención y relación con lo que veníamos hablando. Puedes inspeccionar mi lectura con /understanding y, si está activo, /nlp last.`:"No tengo una interpretación anterior suficientemente clara para señalarla sin inventar.";
      }

      case "ask_registered": {
        const r=d.lastRegistered;
        if(r)return `Lo último que registré de forma explícita fue «${r.source}» como ${r.kind}. Guardarlo como contexto no significa asumir que sea verdadero.`;
        const mem=[...(b.mem||[])].reverse().find(m=>["context","fact","social","world","knowledge"].includes(m.type));
        return mem?`Lo más reciente que conservé fuera del diálogo bruto fue: «${mem.text}» [${mem.type}].`:"No encuentro un registro semántico reciente; solo tengo los turnos de conversación.";
      }

      case "ask_considering": {
        const c=d.lastCommitment;
        if(c&&UNorm(c.source)!==UNorm(f.raw))return `Estoy teniendo en cuenta «${c.source}». Lo interpreté así: ${c.interpretation}.`;
        const r=d.lastRegistered;
        if(r)return `Ahora tengo en cuenta principalmente «${r.source}», que quedó como ${r.kind}, además de mi estado y objetivos actuales.`;
        const topic=currentTopic(b);
        return `Estoy teniendo en cuenta el tema «${topic}», mis recuerdos recientes y mi estado mental; no tengo un compromiso más específico guardado.`;
      }

      case "ask_information_purpose": {
        const g=topGoal(b),dec=decision(b);
        return `La información me sirve para reducir incertidumbre y elegir entre acciones con menos suposiciones.${g?` Mi objetivo dominante registrado es ${g}.`:""}${dec?` La última decisión evaluada fue ${dec}.`:""}`;
      }

      case "ask_following": {
        const p=d.previousNpc||b.dialogue?.lastNpc||"";
        if(/te sigo/i.test(p))return "Con «te sigo» quería decir que sigo el hilo de la conversación, no que te siga físicamente.";
        if(/sigo en el mismo punto/i.test(p))return "Con «sigo en el mismo punto» quería decir que mi conclusión no cambió porque no apareció información nueva suficiente.";
        return `Estoy siguiendo el contexto del tema «${currentTopic(b)}» y el objetivo activo de la conversación, no a una persona físicamente.`;
      }

      case "ask_what_add":
        return `Cuando digo que no tengo nada nuevo que añadir, me refiero a que no tengo evidencia, recuerdo o inferencia nueva sobre «${currentTopic(b)}». Repetir la misma frase no añadiría información.`;

      case "ask_memory_semantic": {
        const items=(b.mem||[]).filter(m=>m.type!=="npc-speech").slice(-5);
        return items.length?`Mis cinco registros recientes relevantes son: ${items.map(x=>`[${x.type}] ${x.text}`).join(" | ")}.`:"Todavía no tengo recuerdos suficientes.";
      }

      case "ask_orientation":
        return "No tengo orientación sexual: soy un NPC y no tengo cuerpo, sexualidad ni experiencias personales humanas. Puedo representar esos rasgos si el diseño de un personaje los define.";

      case "ask_preference": {
        const topic=currentTopic(b);
        return `No tengo gustos humanos estables por defecto. Si te refieres a «${topic}», puedo evaluar si encaja con mis objetivos, recuerdos o personalidad, que es distinto de sentir gusto como una persona.`;
      }

      case "ask_reason": {
        const g=topGoal(b),dec=decision(b);
        const prev=d.previousNpc||b.dialogue?.lastNpc||"";
        return `Mi respuesta anterior fue «${short(prev,100)}». La produje a partir de la interpretación del turno anterior${g?`, con el objetivo dominante ${g}`:""}${dec?` y una decisión mental de ${dec}`:""}. Esa explicación describe mi proceso simulado; puede haber interpretado mal tu frase.`;
      }
    }
    return null;
  }

  function noteDirect(b,f,answer){
    ensureUnderstanding(b);
    b.understanding.lastFrame=f;
    b.understanding.lastCanonical=f.canonical;
    b.understanding.lastRepair=f.repaired.slice();
    b.understanding.history.push({...f,time:b.time||0,answer});
    if(b.understanding.history.length>30)b.understanding.history.shift();
    b.silence=0;
    if(b.dialogue){
      b.dialogue.turn=(b.dialogue.turn||0)+1;
      b.dialogue.previousIntent=b.dialogue.lastIntent||"none";
      b.dialogue.lastIntent=f.intent||"semantic";
      b.dialogue.lastUser=f.raw;
    }
    if(typeof b.remember==="function")b.remember("dialogue",`${b.relation?.name||"Jugador"}: ${f.raw}`,.48);
    if(Array.isArray(b.lastThoughts)){
      const extra=f.semantic?`; NLP=${f.semantic.backend}; conf=${Math.round((f.semantic.confidence||0)*100)}%`:"";
      b.lastThoughts.unshift(`COMPRENSIÓN: intención=${f.intent}; fuente=${f.source}; canónico=«${f.canonical}»${extra}${f.repaired.length?`; reparaciones=${f.repaired.join(", ")}`:""}`);
    }
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){oldReset.call(this);ensureUnderstanding(this);};

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    ensureUnderstanding(this);
    const f=classify((text||"").trim(),this);
    this.understanding.lastFrame=f;
    this.understanding.lastCanonical=f.canonical;
    this.understanding.lastRepair=f.repaired.slice();

    if(f.intent==="backchannel"){
      noteDirect(this,f,null);
      return null;
    }

    if(f.intent){
      const answer=answerFrame(this,f);
      if(answer){
        noteDirect(this,f,answer);
        return this.say(answer);
      }
    }

    const result=oldHear.call(this,text);
    const finish=answer=>{
      this.understanding.history.push({...f,time:this.time||0,answer:answer||null});
      if(this.understanding.history.length>30)this.understanding.history.shift();
      if(Array.isArray(this.lastThoughts)){
        const nlp=f.semantic?`; NLP=${f.semantic.backend}; pred=${f.semantic.predicate?.lemma||"—"}`:"";
        this.lastThoughts.splice(1,0,`COMPRENSIÓN: fuente=${f.source}; canónico=«${f.canonical}»${nlp}${f.repaired.length?`; reparaciones=${f.repaired.join(", ")}`:""}`);
      }
      return answer;
    };
    if(result&&typeof result.then==="function")return result.then(finish);
    return finish(result);
  };

  const oldCommand=command;
  command=function(raw){
    const parts=raw.trim().split(/\s+/);
    const head=(parts.shift()||"").toLowerCase();
    if(head!=="/understanding"&&head!=="/understand")return oldCommand(raw);
    ensureUnderstanding(brain);
    const f=brain.understanding.lastFrame;
    if(!f){print("debug","UNDERSTANDING>","Todavía no hay un análisis.");return;}
    const lines=[
      `original: ${f.raw}`,
      `canónico: ${f.canonical}`,
      `intención: ${f.intent||"no resuelta"}`,
      `fuente: ${f.source||"—"}`,
      `confianza: ${f.confidence==null?"—":Math.round(f.confidence*100)+"%"}`,
      `reparaciones: ${f.repaired.length?f.repaired.join(", "):"—"}`,
      `tokens fallback: ${f.tokens.join(" | ")}`
    ];
    if(f.semantic){
      lines.push(`predicado: ${f.semantic.predicate?.lemma||"—"}`);
      lines.push(`polaridad: ${f.semantic.polarity||"—"}`);
      lines.push(`roles: ${(f.semantic.roles||[]).map(r=>`${r.role}:${r.text}`).join(" | ")||"—"}`);
      lines.push(`entidades: ${(f.semantic.entities||[]).map(e=>`${e.text}:${e.type}`).join(" | ")||"—"}`);
      lines.push(`coreferencias: ${(f.semantic.coreferences||[]).map(c=>`${c.mention}→${c.antecedent}`).join(" | ")||"—"}`);
    }
    print("debug","UNDERSTANDING>",lines.join("\n"));
  };

  ensureUnderstanding(brain);
  window.NpcIntUnderstanding={canonical,classify};
  print("system","","comprensión v1.0 cargada · NLP semántico primero · reglas tipográficas/heurísticas como fallback");
})();
