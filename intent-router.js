"use strict";

(function(){
  const FEATURE_SPACES={
    word:{offset:0,size:1024},
    bigram:{offset:1024,size:1024},
    char:{offset:2048,size:2048}
  };
  const DIM=4096;
  const VERSION="1.3";

  function repairInput(s){
    return String(s||"")
      .replace(/\bmme\b/gi,"me")
      .replace(/\bmcuando\b/gi,"cuando")
      .replace(/\bquequ[eé]\b/gi,"qué")
      .replace(/\bquemuri[oó]\b/gi,"que murió");
  }
  const norm=s=>repairInput(s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();

  const synonym={
    preguntaste:"preguntar",pregunte:"preguntar",pregunté:"preguntar",preguntado:"preguntar",pregunta:"preguntar",
    dijiste:"decir",dije:"decir",dicho:"decir",dices:"decir",
    murio:"morir",murió:"morir",fallecio:"morir",falleció:"morir",muerto:"morir",
    llamaba:"llamar",llama:"llamar",llamo:"llamar",nombre:"llamar",
    gustaria:"querer",gustaría:"querer",quisieras:"querer",querrias:"querer",querrías:"querer",quieres:"querer",
    mision:"mision",misión:"mision",misiones:"mision",
    primero:"primero",primera:"primero",inicio:"primero",principio:"primero",
    ultimo:"ultimo",último:"ultimo",ultima:"ultimo",última:"ultimo",
    perro:"mascota",perra:"mascota",gato:"mascota",gata:"mascota",
    color:"color",favorito:"preferencia",favorita:"preferencia",prefiero:"preferencia",gusta:"preferencia",
    cambiastes:"cambiar",cambiaste:"cambiar",cambiado:"cambiar",opinion:"opinion",opinión:"opinion"
  };

  const stop=new Set(["el","la","los","las","un","una","unos","unas","de","del","a","al","en","y","o","que","por","para","con","se","lo","le","ya"]);

  function words(text){
    return norm(text).split(" ").filter(Boolean).map(w=>synonym[w]||w);
  }

  function hash(s){
    let h=2166136261;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return h>>>0;
  }

  function addFeature(v,key,weight,space){
    const h=hash(key),cfg=FEATURE_SPACES[space],idx=cfg.offset+(h%cfg.size),sign=(h&1)?1:-1;
    v[idx]+=sign*weight;
  }

  function usefulWords(text){
    return words(text).filter(w=>!stop.has(w)&&w.length>1);
  }

  function embed(text){
    const useful=usefulWords(text),v=new Float32Array(DIM);
    for(const w of useful)addFeature(v,w,1,"word");
    for(let i=0;i<useful.length-1;i++)addFeature(v,useful[i]+"_"+useful[i+1],.72,"bigram");
    const compact=useful.join("_");
    for(let i=0;i<compact.length-2;i++)addFeature(v,compact.slice(i,i+3),.08,"char");
    let mag=0;for(const x of v)mag+=x*x;mag=Math.sqrt(mag)||1;
    for(let i=0;i<v.length;i++)v[i]/=mag;
    return v;
  }

  function cosine(a,b){
    let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;
  }

  const PROTOTYPES={
    repair_wrong_answer:[
      "no te pregunté eso","esa no era mi pregunta","pero yo no te pregunté eso","mira lo que te dije","respondiste otra cosa"
    ],
    repair_repeat_question:[
      "eso te pregunté","eso te había preguntado","te pregunté que cuándo pasó","eso era lo que te preguntaba","te pregunté eso antes"
    ],
    repair_topic_drift:[
      "ya no te estoy hablando de eso","cambié de tema","no estamos hablando de eso","deja ese tema","ya te hablo de otra cosa"
    ],
    ask_first_user_message:[
      "qué fue lo primero que te dije","cuál fue mi primer mensaje","qué te dije al inicio","qué dije cuando empezamos a hablar"
    ],
    ask_last_user_question:[
      "qué fue lo último que te pregunté","cuál fue mi última pregunta","qué te pregunté antes","recuerdas mi pregunta anterior"
    ],
    ask_pet_name:[
      "cómo se llamaba mi perro","cómo se llama la mascota que tuve","recuerdas el nombre de mi perro","cuál era el nombre de mi mascota"
    ],
    ask_pet_death_time:[
      "cuándo murió mi perro","cuándo se murió mi mascota","en qué momento falleció mi perro","qué edad tenía cuando murió mi mascota","a qué edad murió","a qué edad tenía yo cuando murió mi perro"
    ],
    ask_user_color_preference:[
      "qué color me gusta","qué colores me gustan","cuál es mi color favorito","qué color prefiero","recuerdas mis colores","cuál otro color me gusta"
    ],
    ask_liked_idea:[
      "qué idea es la que me gusta","cuál era la idea que me gustó","qué idea dije que me gustaba","recuerdas qué idea me gustó"
    ],
    ask_mission_idea:[
      "qué misión te gustaría crear","qué misión se te ocurre","inventa una misión","qué tipo de misión crearías"
    ],
    ask_another_mission_idea:[
      "dime otra misión","dame otra idea para una misión","otra misión diferente","propón otra misión"
    ],
    ask_another_idea:[
      "dime otra idea","dame otra idea","otra idea","se te ocurre otra"
    ],
    ask_changed_mind:[
      "alguna vez cambiaste de opinión","has cambiado de parecer","alguna vez corregiste una idea tuya"
    ],
    ask_current_thought:[
      "qué piensas ahora","en qué estás pensando","qué tienes en mente"
    ],
    ask_decision_process:[
      "cómo decides qué hacer","cómo eliges una opción","cómo tomas decisiones"
    ],
    ask_companion_preference:[
      "qué te gusta","qué cosas prefieres","cuáles son tus gustos"
    ],
    ask_shared_activity:[
      "qué hacemos juntos","qué podemos hacer","qué propones hacer"
    ],
    ask_state:[
      "cómo te sientes","cómo estás","qué estado tienes ahora"
    ],
    ask_identity:[
      "quién eres","quién sos","dime quién eres"
    ],
    ask_purpose:[
      "cuál es tu propósito","para qué existes","por qué existes"
    ],
    ask_memory:[
      "qué recuerdas de mí","qué sabes de mí","te acuerdas de mí"
    ],
    greeting:["hola","buenas","hey","qué tal"],
    farewell:["adiós","chao","nos vemos","hasta luego"],
    thanks:["gracias","muchas gracias","te agradezco"],
    apology:["perdón","disculpa","lo siento"],
    request_company:["habla conmigo","acompáñame","quiero conversar contigo"],
    offer_disclosure:["te quiero contar algo","quiero contarte algo","te cuento algo"],
    ask_personality:["cómo eres","cómo es tu personalidad","descríbete"],
    ask_relationship:["qué piensas de mí","cómo va nuestra relación","somos amigos"]
  };

  const protoVectors={};
  for(const [intent,examples] of Object.entries(PROTOTYPES))protoVectors[intent]=examples.map(embed);

  function isQuestion(raw,n){
    return /[?¿]/.test(raw)||/^(que|como|cuando|donde|por que|porque|cual|cuales|quien|quienes|cuanto|cuanta|cuantos|cuantas|alguna vez|a que edad|y a que edad)\b/.test(n);
  }

  function personalSubject(subject){
    const n=norm(subject);
    return /^(yo|me|mi|mis|nosotros|nosotras|tu|tus|usted|ustedes|que|cual|cuales)\b/.test(n) ||
      /\b(me|mi|mis|te|tu|tus|color favorito|preferencia|gusto|gusta|gustan|nombre|perro|mascota|idea)\b/.test(n);
  }

  function structural(text){
    const raw=String(text||"").trim(),n=norm(raw),question=isQuestion(raw,n);
    let m;

    if(/^(vale|ok|okay|bien|aja|entiendo)$/.test(n))
      return {intent:"reaction",confidence:.995,source:"structural",domain:"social"};

    if(/^(?:te quiero contar algo|quiero contarte algo|te cuento algo)$/.test(n))
      return {intent:"offer_disclosure",confidence:.995,source:"structural",domain:"social"};

    if(/\bno te pregunte eso\b/.test(n)||/\besa no era mi pregunta\b/.test(n)||/\brespondiste otra cosa\b/.test(n)||(/\bmira lo que te dije\b/.test(n)&&/\bpregunte\b/.test(n)))
      return {intent:"repair_wrong_answer",confidence:.995,source:"structural",domain:"repair"};
    if(/\b(?:eso )?te (?:pregunte|habia preguntado)\b/.test(n)||/\bte pregunte que cuando paso\b/.test(n))
      return {intent:"repair_repeat_question",confidence:.995,source:"structural",domain:"repair"};
    if(/\b(?:ya )?no te estoy hablando de eso\b/.test(n)||/\bcambie de tema\b/.test(n)||/\bya estamos hablando de otra cosa\b/.test(n))
      return {intent:"repair_topic_drift",confidence:.995,source:"structural",domain:"repair"};

    if(/^(?:que fue|cual fue) (?:lo )?primero que te dije(?: cuando hable contigo)?$/.test(n)||/^que te dije (?:al inicio|al principio)$/.test(n))
      return {intent:"ask_first_user_message",confidence:.995,source:"structural",domain:"memory"};
    if(/^(?:que fue|cual fue) (?:lo )?ultimo que te pregunte$/.test(n)||/^(?:que|cual) fue mi ultima pregunta$/.test(n)||/^que te pregunte (?:antes|anteriormente)$/.test(n))
      return {intent:"ask_last_user_question",confidence:.995,source:"structural",domain:"memory"};

    if(/^(?:vale )?(?:como se llamaba|como se llama|cual era el nombre de) mi (?:perro|perra|gato|gata|mascota)(?: que tuve)?$/.test(n))
      return {intent:"ask_pet_name",confidence:.995,source:"structural",domain:"memory"};

    // Preferencias de NIA y del jugador se distinguen por el pronombre explícito.
    if((m=n.match(/^(?:que|cual)\s+(.{2,40}?)\s+te gusta(?:n)?(?: a ti)?$/)) ||
       (m=n.match(/^cual es tu\s+(.{2,40}?)\s+favorit[oa]$/))){
      return {intent:"ask_companion_preference",confidence:.995,source:"structural",domain:"social",slots:{category:m[1].trim()}};
    }
    if(/^(?:vale )?(?:cuando se murio|cuando murio|cuando fallecio|en que momento murio) mi (?:perro|perra|gato|gata|mascota)(?: que tuve)?$/.test(n) ||
       /^(?:y )?a que edad (?:yo )?tenia cuando murio mi (?:perro|perra|gato|gata|mascota)$/.test(n) ||
       /^(?:y )?a que edad murio(?: mi (?:perro|perra|gato|gata|mascota))?$/.test(n))
      return {intent:"ask_pet_death_time",confidence:.995,source:"structural",domain:"memory"};

    if(/^(?:que|cuales?) colores? (?:me gusta|me gustan|prefiero)(?: a mi)?$/.test(n) ||
       /^cual es mi color favorito$/.test(n) ||
       /^(?:y )?cual otro color me gusta(?: a mi)?$/.test(n))
      return {intent:"ask_user_color_preference",confidence:.995,source:"structural",domain:"memory"};

    // Consulta personal genérica. La categoría sale de la frase, no de similitud con "color".
    if((m=n.match(/^cual es mi\s+(.{2,48}?)\s+favorit[oa]$/)) ||
       (m=n.match(/^que\s+(.{2,48}?)\s+es mi favorit[oa]$/)) ||
       (m=n.match(/^recuerdas mi\s+(.{2,48}?)\s+favorit[oa]$/))){
      return {intent:"ask_personal_fact",confidence:.995,source:"structural",domain:"memory",slots:{category:m[1].trim(),qualifier:"favorite"}};
    }
    if((m=n.match(/^cual es mi\s+(.{2,48})$/)) ||
       (m=n.match(/^recuerdas mi\s+(.{2,48})$/))){
      const category=m[1].trim();
      if(!/^(?:proposito|propósito|estado|nombre del perro|perro)$/.test(category))
        return {intent:"ask_personal_fact",confidence:.97,source:"structural",domain:"memory",slots:{category,qualifier:"value"}};
    }

    if(/^(?:que|cual) idea (?:es )?(?:la )?que me gusta$/.test(n) ||
       /^(?:que|cual) idea dije que me gustaba$/.test(n))
      return {intent:"ask_liked_idea",confidence:.995,source:"structural",domain:"memory"};

    if((m=n.match(/^(?:y )?que te gustaria hacer(?: (hoy|ahora|manana|esta tarde|esta noche))?$/)) ||
       (m=n.match(/^(?:y )?que quisieras hacer(?: (hoy|ahora|manana|esta tarde|esta noche))?$/)))
      return {intent:"ask_desired_action",confidence:.99,source:"structural",domain:"self",slots:{when:m[1]||"ahora"}};

    if(/^(?:dime|dame|propone|proponme) (?:alguna )?otra (?:idea )?(?:para )?(?:otra )?mision$/.test(n) ||
       /^(?:dime|dame) otra mision(?: diferente)?$/.test(n))
      return {intent:"ask_another_mission_idea",confidence:.995,source:"structural",domain:"creation"};

    if(/^(?:dime|dame) (?:alguna )?otra idea$/.test(n) || /^otra idea$/.test(n))
      return {intent:"ask_another_idea",confidence:.99,source:"structural",domain:"creation"};

    if(/^(?:vale )?(?:que|cual) mision (?:te gustaria|quisieras|quieres) crear$/.test(n)||/^(?:vale )?que mision se te ocurre(?: crear)?$/.test(n))
      return {intent:"ask_mission_idea",confidence:.99,source:"structural",domain:"creation"};

    if(/^(?:alguna vez )?(?:cambiaste|has cambiado) de opinion(?: sobre algo)?$/.test(n) ||
       /^alguna vez has cambiado de parecer(?: sobre algo)?$/.test(n) ||
       /^(?:alguna vez )?(?:tuviste que |has tenido que )?(?:corregir|revisar|cambiar) (?:una )?opinion tuya$/.test(n))
      return {intent:"ask_changed_mind",confidence:.99,source:"structural",domain:"self"};

    if((m=n.match(/^te cree con (?:la )?finalidad de (.+)$/)))
      return {intent:"creator_purpose_statement",confidence:.99,source:"structural",domain:"identity",slots:{purpose:m[1]}};

    if(!question&&(m=n.match(/^mi\s+(.{2,48}?)\s+favorit[oa]s?\s+(?:es|son)\s+(.+)$/))){
      return {intent:"personal_fact_statement",confidence:.995,source:"structural",domain:"personal",slots:{category:m[1].trim(),qualifier:"favorite",value:m[2].trim()}};
    }
    if(!question&&(m=n.match(/^mi\s+(.{2,48}?)\s+(?:es|son)\s+(.+)$/))&&!/\b(?:gusta|prefier)\b/.test(m[1])){
      return {intent:"personal_fact_statement",confidence:.97,source:"structural",domain:"personal",slots:{category:m[1].trim(),qualifier:"value",value:m[2].trim()}};
    }
    if(!question&&/\bme gusta(?:n)?\b/.test(n)){
      return {intent:"preference_statement",confidence:.985,source:"structural",domain:"personal"};
    }

    if(!question&&/\b(?:murio|fallecio|se murio)\b/.test(n)&&/\b(?:perro|perra|gato|gata|mascota)\b/.test(n))
      return {intent:"personal_event",confidence:.98,source:"structural",domain:"personal",slots:{kind:"pet_loss"}};

    if((m=n.match(/^(.+?)\s+(?:es|son)\s+(.+)$/))&&question&&!personalSubject(m[1])&&!personalSubject(m[2]))
      return {intent:"fact_verification",confidence:.82,source:"structural",domain:"knowledge",slots:{subject:m[1].trim(),object:m[2].trim()}};

    if(question&&(m=n.match(/^que (?:es|son) (.+)$/)))
      return {intent:"factual_query",confidence:.96,source:"structural",domain:"knowledge",slots:{topic:m[1].trim(),question:"definition"}};

    if(!question&&(m=n.match(/^(.+?)\s+(?:es|son)\s+(.+)$/))&&!personalSubject(m[1]))
      return {intent:"fact_statement",confidence:.88,source:"structural",domain:"knowledge",slots:{subject:m[1].trim(),object:m[2].trim()}};

    if(/^(hola|buenas|hey|ey|holi|saludos|que tal|que onda)$/.test(n))
      return {intent:"greeting",confidence:.99,source:"structural",domain:"social"};
    if(/^(adios|chao|chau|nos vemos|hasta luego)$/.test(n))
      return {intent:"farewell",confidence:.99,source:"structural",domain:"social"};
    if(/^(gracias|muchas gracias|te agradezco)(?: .*)?$/.test(n))
      return {intent:"thanks",confidence:.99,source:"structural",domain:"social"};
    if(/^(perdon|disculpa|lo siento)(?: .*)?$/.test(n))
      return {intent:"apology",confidence:.98,source:"structural",domain:"social"};

    if(/\b(como estas|como te sientes|como te encuentras)\b/.test(n))
      return {intent:"ask_state",confidence:.97,source:"structural",domain:"self"};
    if(/\b(quien eres|quien sos)\b/.test(n))
      return {intent:"ask_identity",confidence:.99,source:"structural",domain:"self"};
    if(/\b(que eres)\b/.test(n))
      return {intent:"ask_kind",confidence:.96,source:"structural",domain:"self"};
    if(/\b(proposito|para que existes|por que existes)\b/.test(n))
      return {intent:"ask_purpose",confidence:.95,source:"structural",domain:"self"};
    if(/\b(que recuerdas de mi|que sabes de mi|te acuerdas de mi)\b/.test(n))
      return {intent:"ask_memory",confidence:.96,source:"structural",domain:"memory"};
    if(/\bcomo (?:decides|eliges|tomas decisiones)\b/.test(n))
      return {intent:"ask_decision_process",confidence:.95,source:"structural",domain:"self"};
    if(/\b(?:que piensas ahora|en que estas pensando|que tienes en mente)\b/.test(n))
      return {intent:"ask_current_thought",confidence:.95,source:"structural",domain:"self"};

    return null;
  }

  function semanticPrototype(text){
    const useful=usefulWords(text);
    // Una palabra aislada ("vale", "sí", "ok") no tiene señal suficiente para
    // autorizar una intención por similitud vectorial: las colisiones dominan.
    if(useful.length<2)return null;
    const v=embed(text);
    let best=null,second=null;
    for(const [intent,vectors] of Object.entries(protoVectors)){
      let score=-1;
      for(const p of vectors)score=Math.max(score,cosine(v,p));
      const row={intent,score};
      if(!best||row.score>best.score){second=best;best=row;}
      else if(!second||row.score>second.score)second=row;
    }
    if(!best)return null;
    const margin=best.score-(second?.score??0);
    const minScore=useful.length===2?.66:.56;
    const minMargin=useful.length===2?.08:.045;
    if(best.score<minScore||margin<minMargin)return null;
    return {intent:best.intent,confidence:Math.min(.91,.56+best.score*.32),source:"local-embedding",domain:domainFor(best.intent),embedding:{type:"hashed-feature-v2",score:best.score,margin,terms:useful.length}};
  }

  function domainFor(intent){
    if(!intent)return "unknown";
    if(intent.startsWith("repair_"))return "repair";
    if(intent.includes("memory")||intent.includes("pet")||intent.includes("first_user")||intent.includes("last_user")||intent.includes("color_preference")||intent==="ask_liked_idea"||intent==="ask_personal_fact")return "memory";
    if(intent.includes("fact")||intent==="factual_query")return "knowledge";
    if(intent.includes("mission")||intent.includes("creation")||intent==="ask_another_idea")return "creation";
    if(["greeting","farewell","thanks","apology","request_company","offer_disclosure","reaction","ask_relationship","ask_shared_activity","ask_companion_preference"].includes(intent))return "social";
    if(intent.startsWith("ask_")||intent==="creator_purpose_statement")return "self";
    if(intent==="preference_statement"||intent==="personal_fact_statement"||intent==="personal_event")return "personal";
    return "conversation";
  }

  function understandingSignal(text,b){
    try{
      const f=window.NpcIntUnderstanding?.classify?.(text,b);
      if(!f?.intent)return null;
      const map={
        ask_memory_semantic:"ask_memory",
        ask_preference:"ask_companion_preference",
        ask_current_thought:"ask_current_thought",
        ask_capabilities:"ask_capabilities",
        ask_understanding:"ask_understanding",
        ask_concept_understanding:"ask_concept_understanding",
        ask_self_concept:"ask_self_concept",
        ask_internet_access:"ask_internet_access",
        ask_reason:"ask_reason"
      };
      const intent=map[f.intent]||f.intent;
      return {intent,confidence:Math.max(.72,Number(f.confidence)||.78),source:"understanding-signal",domain:domainFor(intent),slots:f.topic?{topic:f.topic}:{}};
    }catch(_){return null;}
  }

  function memoryPolicy(intent){
    if(!intent)return "none";
    if(intent.startsWith("repair_")||["ask_first_user_message","ask_last_user_question","ask_pet_name","ask_pet_death_time","ask_user_color_preference","ask_liked_idea","ask_personal_fact","ask_memory"].includes(intent))return "history";
    if(intent==="fact_verification"||intent==="factual_query")return "knowledge";
    return "none";
  }

  function routesFor(intent,isQ){
    const conversationMap={
      greeting:"greeting",farewell:"farewell",ask_state:"ask_state",ask_identity:"ask_identity",ask_kind:"ask_kind",ask_purpose:"ask_purpose",
      ask_memory:"ask_memory",ask_reason:"ask_why"
    };
    const companionSet=new Set(["greeting","farewell","thanks","apology","offer_disclosure","ask_companion_preference","ask_personality","ask_relationship","request_company","ask_shared_activity","ask_user_color_preference","ask_personal_fact"]);
    const qualitySet=new Set(["reaction","repair_wrong_answer","repair_repeat_question","repair_topic_drift","ask_first_user_message","ask_last_user_question","ask_pet_name","ask_pet_death_time","ask_liked_idea","ask_mission_idea","ask_another_mission_idea","ask_another_idea","ask_changed_mind","creator_purpose_statement","ask_current_thought","ask_decision_process"]);
    const arbiterSet=new Set(["ask_self_state","ask_self_summary","ask_capabilities","ask_knowledge_summary","ask_desired_action","ask_creation_preference","ask_creation_method","ask_destination","destination_proposal","ask_context_reference","ask_opinion_about"]);
    const understandingSet=new Set(["ask_capabilities","ask_understanding","ask_concept_understanding","ask_self_concept","ask_internet_access","ask_reason","ask_current_thought"]);
    const refinementMap={personal_event:"express_grief"};
    return {
      conversation:conversationMap[intent]||(isQ?"question":"statement"),
      companion:companionSet.has(intent)?(intent==="greeting"?"social_greeting":intent):null,
      refinement:refinementMap[intent]||null,
      quality:qualitySet.has(intent)?intent:null,
      arbiter:arbiterSet.has(intent)?intent:null,
      understanding:understandingSet.has(intent)?intent:null,
      cognition:["fact_verification","factual_query","fact_statement"].includes(intent)?intent:null
    };
  }

  function ensure(b){
    if(b.intentRouter)return b.intentRouter;
    b.intentRouter={version:VERSION,turn:0,current:null,history:[]};
    return b.intentRouter;
  }

  function resolve(text,b,{record=false}={}){
    const raw=String(text||"").trim(),n=norm(raw),q=isQuestion(raw,n);
    let frame=structural(raw);
    if(!frame){
      const u=understandingSignal(raw,b);
      const e=semanticPrototype(raw);
      if(u&&e&&u.intent===e.intent)frame={...u,confidence:Math.min(.97,Math.max(u.confidence,e.confidence)+.03),source:"understanding+embedding",embedding:e.embedding};
      else if(u&&u.confidence>=.88)frame=u;
      else frame=e||u;
    }
    if(!frame)frame={intent:q?"question":"statement",confidence:.35,source:"fallback",domain:"conversation"};

    frame={
      version:VERSION,input:raw,canonical:n,speechAct:q?"question":"statement",
      slots:frame.slots||{},memoryPolicy:memoryPolicy(frame.intent),
      ...frame
    };
    frame.routes=routesFor(frame.intent,q);

    if(record&&b){
      const s=ensure(b);s.turn++;frame.turn=s.turn;s.current=frame;s.history.push(frame);if(s.history.length>50)s.history.shift();
      if(Array.isArray(b.lastThoughts))b.lastThoughts.unshift(`INTENT ROUTER: ${frame.intent} · ${frame.source} · conf=${Math.round(frame.confidence*100)}% · memory=${frame.memoryPolicy}`);
    }
    return frame;
  }

  function currentFor(b,text){
    const current=ensure(b).current;
    if(current&&current.canonical===norm(text))return current;
    return resolve(text,b,{record:false});
  }

  function authoritative(frame){
    return !!frame && frame.intent!=="question" && frame.intent!=="statement" && (frame.confidence||0)>=.54;
  }

  function routeFor(b,text,layer){
    return currentFor(b,text)?.routes?.[layer]||null;
  }

  function format(b){
    const f=ensure(b).current;
    if(!f)return "Todavía no hay una intención resuelta.";
    return [
      `input=${f.input}`,`intent=${f.intent}`,`domain=${f.domain}`,`confidence=${Math.round((f.confidence||0)*100)}%`,
      `source=${f.source}`,`speechAct=${f.speechAct}`,`memoryPolicy=${f.memoryPolicy}`,
      `embedding=${f.embedding?f.embedding.type+" score="+f.embedding.score.toFixed(3)+" margin="+f.embedding.margin.toFixed(3):"—"}`,
      `routes=${JSON.stringify(f.routes)}`,`slots=${JSON.stringify(f.slots||{})}`
    ].join("\n");
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){oldReset.call(this);this.intentRouter=null;ensure(this);};

  function syncQueryFrame(b,text){
    try{
      const api=window.NpcIntQueryFrame;
      if(!api?.build||!api?.record)return;
      const current=b.queryFrame?.current;
      if(current&&norm(current.input)===norm(text)&&current.intent===b.intentRouter?.current?.intent)return;
      api.record(b,api.build(text,b));
    }catch(_){}
  }

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const raw=String(text||"").trim();
    resolve(raw,this,{record:true});
    const result=oldHear.call(this,text);
    const finish=value=>{syncQueryFrame(this,raw);return value;};
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  const oldCommand=command;
  command=function(raw){
    const head=(String(raw||"").trim().split(/\s+/)[0]||"").toLowerCase();
    if(head!=="/intent"&&head!=="/route")return oldCommand(raw);
    print("debug","INTENT>",format(brain));
  };

  ensure(brain);
  window.NpcIntIntentRouter={version:VERSION,ensure,resolve,currentFor,routeFor,authoritative,embed,cosine,semanticPrototype,format,domainFor,syncQueryFrame,repairInput,usefulWords};
  print("system","","intent router v1.3 cargado · pronombres preservados + hechos personales genéricos + routing por sujeto");
})();