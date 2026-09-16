"use strict";

(function(){
  const LNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const factual=text=>/^(que es|que son|que significa|quien es|quien fue|donde esta|donde queda|cuando fue|cuando ocurrio|cuantos|cuantas|define|explica|dime sobre|hablame de|para que sirve)\b/.test(LNorm(text));
  const personal=text=>/^(quien eres|que eres|como estas|que quieres|que recuerdas|que sabes de mi|cual es tu proposito)/.test(LNorm(text));

  function applyLocalKnowledge(brain,q,hit){
    brain.dialogue.turn++;
    brain.silence=0;
    brain.relation.familiarity=clamp(brain.relation.familiarity+.02);
    brain.drives.social=clamp(brain.drives.social-.12);
    brain.drives.curiosidad=clamp(brain.drives.curiosidad-.05);
    brain.remember("dialogue",`${brain.relation.name}: ${q}`,.62);
    brain.remember("knowledge",`${hit.title}: ${hit.text}`,.82);
    brain.dialogue.lastUser=q;
    brain.dialogue.lastIntent="knowledge_query";
    brain.dialogue.topic=hit.title;
    brain.thoughts(`${brain.relation.name} preguntó por conocimiento: «${short(q,100)}»`);
    brain.lastThoughts.splice(1,0,`FUENTE: ${hit.source}; tema=${hit.topic||"general"}; confianza_recuperación=${hit.confidence.toFixed(2)}`);
    if(globalThis.npcGrammar?.ready){
      const a=globalThis.npcGrammar.analyze(q);
      brain.lastThoughts.splice(2,0,`GRAMÁTICA: ${globalThis.npcGrammar.describe(a)}`);
    }
    return brain.say(hit.text);
  }

  const previousHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const q=(text||"").trim();
    if(!q||personal(q)||!factual(q)||!globalThis.npcWikiPacks?.ready){
      return previousHear.call(this,text);
    }

    return globalThis.npcWikiPacks.search(q).then(hit=>{
      if(hit)return applyLocalKnowledge(this,q,hit);
      return previousHear.call(this,text);
    }).catch(err=>{
      console.warn("Local Wikipedia search failed",err);
      return previousHear.call(this,text);
    });
  };

  const previousCommand=command;
  command=function(raw){
    const [head]=raw.split(" ");
    if(head.toLowerCase()==="/wiki"){
      const s=globalThis.npcWikiPacks?.stats?.()||{};
      print("debug","WIKI>",`local=${!!s.ready} | tamaño=${s.mib||0} MiB | artículos=${s.articles||0} | chunks=${s.chunks||0} | temas=${s.topics||0} | índices_cargados=${s.loadedIndexes||0} | shards_cache=${s.loadedShards||0}`);
      return;
    }
    if(head.toLowerCase()==="/help"){
      previousCommand(raw);
      print("system","","Wikipedia local: /wiki");
      return;
    }
    return previousCommand(raw);
  };
})();
