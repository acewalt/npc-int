"use strict";

(function(){
  const KNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const KStop=new Set(["que","qué","es","son","un","una","el","la","los","las","de","del","y","o","en","para","por","como","cómo","me","dime","explica","define","significa","sobre","hablame","háblame"]);
  const KTokens=s=>KNorm(s).split(" ").filter(w=>w.length>2&&!KStop.has(w));

  class KnowledgeStore{
    constructor(){this.encyclopedia=[];this.dictionary=[];this.ready=false;this.sources=[];}

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
        print("system","",`conocimiento v0.1 cargado · ${this.encyclopedia.length} conceptos · ${this.dictionary.length} entradas léxicas`);
      }catch(err){
        console.warn("Knowledge load failed",err);
        print("error","KNOWLEDGE>","no pude cargar los packs de conocimiento; continuaré con memoria conversacional");
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

    answer(text){
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

    stats(){return {concepts:this.encyclopedia.length,words:this.dictionary.length,sources:this.sources.length,ready:this.ready};}
  }

  const store=new KnowledgeStore();
  globalThis.npcKnowledge=store;

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const q=(text||"").trim();
    const n=KNorm(q);
    const personal=/^(quien eres|que eres|como estas|que quieres|que recuerdas|que sabes de mi|cual es tu proposito)/.test(n);
    const knowledgeQuery=store.ready&&!personal&&(store.isDefinitionQuery(q)||((q.includes("?")||/^que\b/.test(n))&&!!store.encyclopediaMatch(q)?.score));

    if(!knowledgeQuery)return oldHear.call(this,text);

    const hit=store.answer(q);
    if(!hit)return oldHear.call(this,text);

    this.dialogue.turn++;
    this.silence=0;
    this.relation.familiarity=clamp(this.relation.familiarity+.02);
    this.drives.social=clamp(this.drives.social-.12);
    this.drives.curiosidad=clamp(this.drives.curiosidad-.045);
    this.remember("dialogue",`${this.relation.name}: ${q}`,.62);
    this.remember("knowledge",`${hit.title}: ${hit.text}`,.78);
    this.dialogue.lastUser=q;
    this.dialogue.lastIntent="knowledge_query";
    this.dialogue.topic=hit.title;
    this.thoughts(`${this.relation.name} preguntó por conocimiento: «${short(q,100)}»`);
    this.lastThoughts.splice(1,0,`FUENTE: ${hit.source}; concepto=${hit.title}; confianza_recuperación=${hit.confidence.toFixed(2)}`);

    return this.say(hit.text);
  };

  const oldCommand=globalThis.command;
  if(typeof oldCommand==="function"){
    globalThis.command=function(raw){
      const [head,...rest]=raw.split(" ");
      const arg=rest.join(" ").trim();
      if(head.toLowerCase()==="/knowledge"){
        const s=store.stats();
        print("debug","KNOWLEDGE>",`ready=${s.ready} | conceptos=${s.concepts} | diccionario=${s.words} | fuentes=${s.sources}`);
        return;
      }
      if(head.toLowerCase()==="/define"){
        if(!arg){print("error","ERROR>","Uso: /define ajá");return;}
        const d=store.lexiconMatch(arg);
        if(!d||d.score<.72){print("debug","DICT>",`No encuentro «${arg}» en el lexicón cargado.`);return;}
        const e=d.entry;
        print("debug","DICT>",`${e.word}: ${(e.meanings||[]).join("; ")}\ncontexto: ${(e.contexts||[]).join(" ")}\nregistro: ${e.register||"sin especificar"}`);
        return;
      }
      return oldCommand(raw);
    };
  }

  store.load();
})();
