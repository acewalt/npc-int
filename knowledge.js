"use strict";

(function(){
  const KNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const KStop=new Set(["que","qué","es","son","un","una","el","la","los","las","de","del","y","o","en","para","por","como","cómo","me","dime","explica","define","significa","sobre","hablame","háblame"]);
  const KTokens=s=>KNorm(s).split(" ").filter(w=>w.length>2&&!KStop.has(w));

  class KnowledgeStore{
    constructor(){
      this.encyclopedia=[];
      this.dictionary=[];
      this.ready=false;
      this.sources=[];
      this.wikipediaCache=new Map();
    }

    async load(){
      try{
        const manifest=await fetch("knowledge/manifest.json",{cache:"no-cache"}).then(r=>r.json());
        for(const pack of manifest.packs||[]){
          const data=await fetch(pack.path,{cache:"no-cache"}).then(r=>r.json());
          if(pack.type==="dictionary")this.dictionary.push(...(data.entries||[]));
          else this.encyclopedia.push(...(data.entries||[]));
          this.sources.push({type:pack.type,path:pack.path,name:data.name||pack.path});
        }
        this.ready=true;
        print("system","",`conocimiento v0.2 cargado · ${this.encyclopedia.length} conceptos · ${this.dictionary.length} entradas léxicas · Wikipedia online disponible`);
      }catch(err){
        console.warn("Knowledge load failed",err);
        print("error","KNOWLEDGE>","no pude cargar los packs locales; Wikipedia online seguirá disponible si hay conexión");
        this.ready=true;
      }
    }

    lexiconMatch(query){
      const q=KNorm(query);
      let best=null,score=0;
      for(const e of this.dictionary){
        for(const v of [e.word,...(e.variants||[])]){
          const nv=KNorm(v);
          let s=0;
          if(q===nv)s=1;
          else if(q.includes(nv))s=.86+Math.min(.1,nv.length/100);
          if(s>score){score=s;best=e;}
        }
      }
      return best?{entry:best,score}:null;
    }

    encyclopediaMatch(query){
      const q=KNorm(query);
      const qt=KTokens(query);
      let best=null,score=0;
      for(const e of this.encyclopedia){
        const names=[e.title,...(e.aliases||[])];
        let s=0;
        for(const name of names){
          const n=KNorm(name);
          if(q===n)s=Math.max(s,1);
          else if(q.includes(n))s=Math.max(s,.88+Math.min(.08,n.length/100));
        }
        const hay=KTokens(`${e.title} ${(e.aliases||[]).join(" ")} ${(e.tags||[]).join(" ")}`);
        if(qt.length){
          const hit=qt.filter(t=>hay.includes(t)).length;
          s=Math.max(s,hit/qt.length*.78);
        }
        if(s>score){score=s;best=e;}
      }
      return best?{entry:best,score}:null;
    }

    isDefinitionQuery(text){
      const n=KNorm(text);
      return /^(que es|que son|que significa|define|explica|dime sobre|hablame de|para que sirve|quien es|quien fue)\b/.test(n);
    }

    isFactualQuery(text){
      const n=KNorm(text);
      return /^(que es|que son|que significa|quien es|quien fue|donde esta|donde queda|cuando fue|cuando ocurrio|cuantos|cuantas|define|explica|dime sobre|hablame de|para que sirve)\b/.test(n);
    }

    topicFromQuestion(text){
      return (text||"")
        .replace(/^[¿?\s]*/u,"")
        .replace(/^(qué|que)\s+(es|son|significa)\s+/i,"")
        .replace(/^(quién|quien)\s+(es|fue)\s+/i,"")
        .replace(/^(dónde|donde)\s+(está|esta|queda)\s+/i,"")
        .replace(/^(cuándo|cuando)\s+(fue|ocurrió|ocurrio)\s+/i,"")
        .replace(/^(define|explica)\s+/i,"")
        .replace(/^(dime sobre|háblame de|hablame de)\s+/i,"")
        .replace(/^(para qué sirve|para que sirve)\s+/i,"")
        .replace(/[?¿!]+$/g,"")
        .trim();
    }

    localAnswer(text){
      const n=KNorm(text);
      const wantsMeaning=/^(que significa|define)\b/.test(n);
      if(wantsMeaning){
        const d=this.lexiconMatch(text);
        if(d&&d.score>.72){
          const e=d.entry;
          const context=(e.contexts||[]).length?` Contexto: ${e.contexts.join(" ")}`:"";
          return {kind:"dictionary",title:e.word,text:`${e.word}: ${(e.meanings||[]).join("; ")}.${context}`,confidence:d.score,source:"diccionario local"};
        }
      }

      const k=this.encyclopediaMatch(text);
      if(k&&k.score>.58){
        return {kind:"encyclopedia",title:k.entry.title,text:k.entry.text,confidence:k.score,source:k.entry.source||"conocimiento semántico local"};
      }

      const d=this.lexiconMatch(text);
      if(d&&d.score>.9&&this.isDefinitionQuery(text)){
        const e=d.entry;
        return {kind:"dictionary",title:e.word,text:`${e.word}: ${(e.meanings||[]).join("; ")}. ${(e.contexts||[]).join(" ")}`,confidence:d.score,source:"diccionario local"};
      }
      return null;
    }

    async wikipediaAnswer(text){
      const topic=this.topicFromQuestion(text);
      if(!topic||topic.length<2)return null;
      const key=KNorm(topic);
      if(this.wikipediaCache.has(key))return this.wikipediaCache.get(key);

      try{
        const params=new URLSearchParams({
          origin:"*",
          action:"query",
          generator:"search",
          gsrsearch:topic,
          gsrlimit:"1",
          prop:"extracts",
          exintro:"1",
          explaintext:"1",
          exsentences:"4",
          format:"json",
          formatversion:"2"
        });
        const url=`https://es.wikipedia.org/w/api.php?${params.toString()}`;
        const data=await fetch(url,{headers:{"Accept":"application/json"}}).then(r=>{
          if(!r.ok)throw new Error(`Wikipedia HTTP ${r.status}`);
          return r.json();
        });
        const page=data?.query?.pages?.[0];
        if(!page||!page.extract)return null;

        const textOut=page.extract.trim().replace(/\s+/g," ");
        const hit={
          kind:"wikipedia",
          title:page.title,
          text:`${textOut} [Fuente: Wikipedia — ${page.title}]`,
          confidence:.78,
          source:`Wikipedia/es: ${page.title}`,
          pageid:page.pageid
        };
        this.wikipediaCache.set(key,hit);
        this.encyclopedia.push({id:`wiki:${page.pageid}`,title:page.title,aliases:[topic],text:textOut,tags:["Wikipedia"],source:hit.source});
        return hit;
      }catch(err){
        console.warn("Wikipedia lookup failed",err);
        return null;
      }
    }

    stats(){return {concepts:this.encyclopedia.length,words:this.dictionary.length,sources:this.sources.length,ready:this.ready,cachedWikipedia:this.wikipediaCache.size};}
  }

  const store=new KnowledgeStore();
  globalThis.npcKnowledge=store;

  function applyKnowledge(brain,q,hit){
    brain.dialogue.turn++;
    brain.silence=0;
    brain.relation.familiarity=clamp(brain.relation.familiarity+.02);
    brain.drives.social=clamp(brain.drives.social-.12);
    brain.drives.curiosidad=clamp(brain.drives.curiosidad-.045);
    brain.remember("dialogue",`${brain.relation.name}: ${q}`,.62);
    brain.remember("knowledge",`${hit.title}: ${hit.text}`,.78);
    brain.dialogue.lastUser=q;
    brain.dialogue.lastIntent="knowledge_query";
    brain.dialogue.topic=hit.title;
    brain.thoughts(`${brain.relation.name} preguntó por conocimiento: «${short(q,100)}»`);
    brain.lastThoughts.splice(1,0,`FUENTE: ${hit.source}; concepto=${hit.title}; confianza_recuperación=${hit.confidence.toFixed(2)}`);
    return brain.say(hit.text);
  }

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const q=(text||"").trim();
    const n=KNorm(q);
    const personal=/^(quien eres|que eres|como estas|que quieres|que recuerdas|que sabes de mi|cual es tu proposito)/.test(n);
    if(personal)return oldHear.call(this,text);

    const localHit=store.localAnswer(q);
    if(localHit&&(store.isDefinitionQuery(q)||q.includes("?")))return applyKnowledge(this,q,localHit);

    if(store.isFactualQuery(q)){
      return store.wikipediaAnswer(q).then(hit=>{
        if(hit)return applyKnowledge(this,q,hit);
        return oldHear.call(this,text);
      });
    }

    const reply=oldHear.call(this,text);
    const lex=store.lexiconMatch(q);
    if(lex&&lex.score>.88&&this.lastThoughts){
      const e=lex.entry;
      this.lastThoughts.splice(2,0,`LÉXICO: «${e.word}» = ${(e.meanings||[])[0]||"entrada contextual"}`);
    }
    return reply;
  };

  // La terminal original esperaba respuestas síncronas. Esta versión admite Promises
  // para poder consultar Wikipedia sin bloquear la interfaz.
  send=function(text){
    text=(text||"").trim();
    if(!text)return;
    if(text.startsWith("/")){command(text);return;}
    print("user",brain.relation.name+">",text);
    const reply=brain.hear(text);
    if(reply&&typeof reply.then==="function"){
      print("system","","consultando conocimiento...");
      reply.then(answer=>{
        if(answer)print("npc",brain.identity.name+">",answer);
      }).catch(err=>{
        console.error(err);
        print("npc",brain.identity.name+">","No pude consultar esa fuente ahora mismo. Puedo seguir usando mi memoria y conocimiento local.");
      });
      return;
    }
    if(reply)window.setTimeout(()=>print("npc",brain.identity.name+">",reply),120);
  };

  const oldCommand=command;
  command=function(raw){
    const [head,...rest]=raw.split(" ");
    const arg=rest.join(" ").trim();
    const h=head.toLowerCase();

    if(h==="/help"){
      oldCommand(raw);
      print("system","","conocimiento: /knowledge · /define <palabra>");
      return;
    }
    if(h==="/knowledge"){
      const s=store.stats();
      print("debug","KNOWLEDGE>",`ready=${s.ready} | conceptos_locales/cache=${s.concepts} | diccionario=${s.words} | Wikipedia_cache=${s.cachedWikipedia} | packs=${s.sources}`);
      return;
    }
    if(h==="/define"){
      if(!arg){print("error","ERROR>","Uso: /define ajá");return;}
      const d=store.lexiconMatch(arg);
      if(!d||d.score<.72){print("debug","DICT>",`No encuentro «${arg}» en el lexicón cargado.`);return;}
      const e=d.entry;
      print("debug","DICT>",`${e.word}: ${(e.meanings||[]).join("; ")}\ncontexto: ${(e.contexts||[]).join(" ")}\nregistro: ${e.register||"sin especificar"}`);
      return;
    }
    return oldCommand(raw);
  };

  store.load();
})();
