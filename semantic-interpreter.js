"use strict";

(function(){
  const fold=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

  function flatTokens(analysis){
    return (analysis?.sentences||[]).flatMap((s,si)=>(s.tokens||[]).map(t=>({...t,sentence:si})));
  }

  function lemmas(tokens){return tokens.map(t=>fold(t.lemma||t.text));}
  function words(tokens){return tokens.map(t=>fold(t.text));}
  function question(analysis,text){
    return /[?¿]/.test(text||"") || (analysis?.frames||[]).some(f=>f?.speechType==="question");
  }
  function qwords(analysis,tokens){
    const a=(analysis?.frames||[]).flatMap(f=>f?.questionWords||[]).map(fold);
    if(a.length)return [...new Set(a)];
    const qs=new Set(["que","quien","cual","como","cuando","donde","cuanto"]);
    return lemmas(tokens).filter(x=>qs.has(x));
  }
  function predicate(analysis,tokens){
    const p=(analysis?.frames||[]).map(f=>f?.predicate).find(Boolean);
    if(p)return p;
    const t=tokens.find(x=>x.deprel==="root"&&["VERB","AUX"].includes(x.upos)) || tokens.find(x=>["VERB","AUX"].includes(x.upos));
    return t?{token:t.id,text:t.text,lemma:t.lemma||t.text,upos:t.upos,feats:t.feats||{}}:null;
  }
  function secondPerson(tokens){
    if(tokens.some(t=>String(t.feats?.Person||"")==="2"))return true;
    const w=new Set(words(tokens));
    return w.has("tu")||w.has("tú")||w.has("usted");
  }
  function futureLike(tokens,pred){
    if(String(pred?.feats?.Tense||"").toLowerCase()==="fut")return true;
    for(let i=0;i<tokens.length-2;i++){
      if(fold(tokens[i].lemma)==="ir" && fold(tokens[i+1].lemma||tokens[i+1].text)==="a" && ["VERB","AUX"].includes(tokens[i+2].upos))return true;
    }
    return false;
  }
  function objectSlots(analysis){
    const roles=(analysis?.frames||[]).flatMap(f=>f?.roles||[]);
    return {
      agent:roles.find(r=>r.role==="agent")?.text||null,
      patient:roles.find(r=>r.role==="patient")?.text||null,
      recipient:roles.find(r=>r.role==="recipient")?.text||null,
      circumstances:roles.filter(r=>["circumstance","time","location"].includes(r.role)).map(r=>r.text)
    };
  }

  function conceptUnderstandingTopic(normalized){
    const m=normalized.match(/^que (?:entiendes|comprendes)(?: tu| usted)? (?:como|por|sobre|de) (.+)$/);
    if(!m)return null;
    const topic=m[1].trim();
    if(/^(?:esto|eso|lo anterior|lo que dije|lo que te dije|mi mensaje)$/.test(topic))return null;
    return topic||null;
  }

  function understandingRefersBack(normalized){
    return /^(?:me )?(?:entiendes|comprendes)$/.test(normalized)
      || /^que (?:entiendes|comprendes|entendiste|comprendiste)$/.test(normalized)
      || /\b(?:esto|eso|lo anterior|lo que dije|lo que te dije|mi mensaje)\b/.test(normalized);
  }

  function preferenceTopic(normalized){
    let m=normalized.match(/^que (.+?) te gusta(?:n)?(?: mas)?$/);
    if(m&&m[1]!=="te")return m[1].trim();
    m=normalized.match(/^que te gusta (?:de|sobre) (.+)$/);
    if(m)return m[1].trim();
    m=normalized.match(/^(?:a ti )?te gusta(?:n)? (.+)$/);
    return m?m[1].trim():null;
  }

  function inferIntent(text,analysis){
    const tokens=flatTokens(analysis);
    const ls=lemmas(tokens),ws=words(tokens);
    const isQ=question(analysis,text),q=qwords(analysis,tokens),pred=predicate(analysis,tokens),target2=secondPerson(tokens);
    const has=x=>ls.includes(fold(x));
    const any=(...xs)=>xs.some(has);
    const contains=(...xs)=>xs.every(x=>ws.includes(fold(x))||ls.includes(fold(x)));
    let intent=null,confidence=.58,basis=[],topic=null;

    const normalized=fold(text).replace(/[^a-z0-9ñ ]/g," ").replace(/\s+/g," ").trim();
    const conceptTopic=conceptUnderstandingTopic(normalized);
    const prefTopic=preferenceTopic(normalized);
    if(/^(mm+|hm+|hmm+|aja|uhm+)$/.test(normalized))return {intent:"backchannel",confidence:.99,basis:["discourse-marker"],topic:null};
    if(/^(vale|ok|okay|listo|de acuerdo|entendido)$/.test(normalized))return {intent:"ack",confidence:.98,basis:["acknowledgement"],topic:null};
    if(/^(hola|buenas|hey|ey|que onda|que tal)$/.test(normalized))return {intent:"greeting",confidence:.98,basis:["greeting"],topic:null};

    // Specific intents have precedence over generic predicates such as hacer.
    if(isQ && any("recordar") && target2){intent="ask_memory_semantic";confidence=.93;basis=["question","recordar","2nd-person"];}
    else if(isQ && any("entender","comprender") && target2 && conceptTopic){
      intent="ask_concept_understanding";topic=conceptTopic;confidence=.98;basis=["question","understand","2nd-person","explicit-topic"];
    }
    else if(isQ && any("entender","comprender") && target2 && understandingRefersBack(normalized)){
      intent="ask_understanding";confidence=.94;basis=["question","understand","2nd-person","anaphoric"];
    }
    else if(isQ && any("registrar") && target2){intent="ask_registered";confidence=.91;basis=["question","registrar","2nd-person"];}
    else if(isQ && (contains("tener","cuenta")||normalized.includes("en cuenta")) && target2){intent="ask_considering";confidence=.9;basis=["tener-en-cuenta","2nd-person"];}
    else if((isQ||q.length>0) && target2 && (any("pensar") || (any("tener") && ws.includes("mente")))){
      intent="ask_current_thought";confidence=.96;basis=["question","mental-state","2nd-person"];
    }
    else if(isQ && any("seguir") && target2){intent="ask_following";confidence=.88;basis=["seguir","2nd-person"];}
    else if(isQ && any("añadir","agregar") && target2){intent="ask_what_add";confidence=.88;basis=["add","2nd-person"];}
    else if(isQ && any("poder","saber") && target2){intent="ask_capabilities";confidence=.91;basis=["modal-capability","2nd-person"];}
    else if(isQ && ws.some(x=>["inteligencia","capacidad","capacidades"].includes(x))){intent="ask_capabilities";confidence=.9;basis=["capability-noun"];}
    else if(isQ && any("querer") && target2){intent="ask_desired_action";confidence=.95;basis=["question","querer","2nd-person"];}
    else if(isQ && any("gustar") && target2){intent="ask_preference";topic=prefTopic;confidence=.9;basis=["question","gustar",prefTopic?"explicit-topic":"contextual-topic"];}
    else if(isQ && any("hacer") && target2){
      intent=futureLike(tokens,pred)||any("ir")?"ask_future_action":"ask_activity";
      confidence=.95;basis=["question","hacer","2nd-person",intent==="ask_future_action"?"future":"present"];
    }
    else if(isQ && any("estar","sentir") && target2 && q.includes("como")){intent="ask_state";confidence=.94;basis=["question","state","cómo"];}
    else if(isQ && any("pasar","ocurrir")){intent="ask_situation";confidence=.93;basis=["question","situation"];}
    else if(isQ && ws.includes("informacion") && (ws.includes("para")||ws.includes("por"))){intent="ask_information_purpose";confidence=.88;basis=["information-purpose"];
    }
    else if(isQ && (normalized.startsWith("por que ")||normalized.startsWith("porque ")) && any("decir","responder","hablar")){intent="ask_reason";confidence=.9;basis=["why","speech-verb"];
    }
    else if(isQ && q.includes("como") && any("estar")){intent="ask_state";confidence=.76;basis=["question","cómo","estar"];
    }
    else if(isQ && normalized==="que pasa"){intent="ask_situation";confidence=.96;basis=["fixed-question"];
    }

    return {intent,confidence,basis,topic};
  }

  function interpret(text,analysis,brain){
    if(!analysis?.sentences?.length)return null;
    const tokens=flatTokens(analysis),p=predicate(analysis,tokens),guess=inferIntent(text,analysis);
    const frames=analysis.frames||analysis.sentences.map(s=>s.semanticFrame).filter(Boolean);
    const negated=frames.some(f=>!!f?.negated);
    const slots=objectSlots(analysis);
    const entities=(analysis.entities||[]).map(e=>({text:e.text,type:e.type,start:e.start,end:e.end}));
    const coreferences=analysis.coreferences||[];
    const output={
      source:analysis.backend==="stanza"?"neural-nlp":"hybrid-nlp",
      backend:analysis.backend||"unknown",model:analysis.model||null,
      intent:guess.intent,confidence:guess.confidence,basis:guess.basis,topic:guess.topic||null,
      speechType:question(analysis,text)?"question":(frames[0]?.speechType||"statement"),
      predicate:p?{lemma:fold(p.lemma||p.text),text:p.text,tense:p.feats?.Tense||null,mood:p.feats?.Mood||null,person:p.feats?.Person||null,number:p.feats?.Number||null}:null,
      polarity:negated?"negative":"positive",slots,questionWords:qwords(analysis,tokens),entities,coreferences,
      roles:frames.flatMap(f=>f?.roles||[]),
      tokens:tokens.map(t=>({id:t.id,text:t.text,lemma:t.lemma,upos:t.upos,feats:t.feats||{},head:t.head,deprel:t.deprel,ner:t.ner||null,sentence:t.sentence})),
      rawAnalysis:analysis
    };
    if(brain?.discourse?.lastRegistered)output.discourseFocus=brain.discourse.lastRegistered.source||null;
    return output;
  }

  window.NpcIntSemanticInterpreter={interpret,inferIntent,conceptUnderstandingTopic,understandingRefersBack,preferenceTopic};
  print("system","","intérprete semántico v1.3 cargado · tema explícito + anáfora + UD + roles + entidades");
})();
