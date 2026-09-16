"use strict";

(function(){
  const GNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ¿?¡! ]+/g," ").replace(/\s+/g," ").trim();

  class SpanishGrammar{
    constructor(){
      this.data=null;
      this.ready=false;
      this.formToVerb=new Map();
    }

    async load(){
      try{
        this.data=await fetch("knowledge/grammar.es.json",{cache:"no-cache"}).then(r=>{
          if(!r.ok)throw new Error(`grammar HTTP ${r.status}`);
          return r.json();
        });
        this.buildVerbIndex();
        this.ready=true;
        print("system","",`gramática española v${this.data.version} cargada · análisis + generación de oraciones`);
      }catch(err){
        console.warn("Grammar load failed",err);
        print("error","GRAMMAR>","no pude cargar las reglas gramaticales");
      }
    }

    buildVerbIndex(){
      this.formToVerb.clear();
      const verbs=this.data?.commonVerbs||{};
      for(const [lemma,tenses] of Object.entries(verbs)){
        for(const [tense,forms] of Object.entries(tenses)){
          for(const [slot,form] of Object.entries(forms)){
            this.formToVerb.set(GNorm(form),{lemma,tense,slot,form});
          }
        }
      }
    }

    pronounFeatures(subject){
      const p=this.data?.pronouns?.[GNorm(subject)];
      if(p)return p;
      return {person:3,number:"singular"};
    }

    slotFor(subject){
      const f=this.pronounFeatures(subject);
      if(f.person===1&&f.number==="singular")return "1s";
      if(f.person===2&&f.number==="singular")return "2s";
      if(f.person===1&&f.number==="plural")return "1p";
      return f.number==="plural"?"3p":"3s";
    }

    regularConjugate(lemma,tense,slot){
      const l=GNorm(lemma);
      const ending=l.endsWith("ar")?"ar":l.endsWith("er")?"er":l.endsWith("ir")?"ir":null;
      if(!ending)return lemma;
      const stem=lemma.slice(0,-2);
      const present={
        ar:{"1s":"o","2s":"as","3s":"a","1p":"amos","3p":"an"},
        er:{"1s":"o","2s":"es","3s":"e","1p":"emos","3p":"en"},
        ir:{"1s":"o","2s":"es","3s":"e","1p":"imos","3p":"en"}
      };
      const past={
        ar:{"1s":"é","2s":"aste","3s":"ó","1p":"amos","3p":"aron"},
        er:{"1s":"í","2s":"iste","3s":"ió","1p":"imos","3p":"ieron"},
        ir:{"1s":"í","2s":"iste","3s":"ió","1p":"imos","3p":"ieron"}
      };
      const future={"1s":"é","2s":"ás","3s":"á","1p":"emos","3p":"án"};
      if(tense==="future")return lemma+(future[slot]||future["3s"]);
      const table=tense==="past"?past:present;
      return stem+(table[ending][slot]||table[ending]["3s"]);
    }

    conjugate(lemma,{tense="present",subject="él"}={}){
      const slot=this.slotFor(subject);
      const irregular=this.data?.commonVerbs?.[GNorm(lemma)]?.[tense]?.[slot];
      return irregular||this.regularConjugate(lemma,tense,slot);
    }

    analyze(text){
      const raw=(text||"").trim();
      const n=GNorm(raw);
      const words=n.replace(/[¿?¡!]/g,"").split(" ").filter(Boolean);
      const result={
        text:raw,
        type:raw.includes("?")?"interrogativa":raw.includes("!")?"exclamativa":"declarativa",
        negative:words.includes("no"),
        interrogative:null,
        subject:null,
        verb:null,
        connectors:[],
        probableStructure:null,
        tokens:words
      };

      const inter=this.data?.interrogatives||[];
      result.interrogative=inter.find(x=>n.startsWith(GNorm(x)+" ")||n.startsWith("¿"+GNorm(x)+" "))||null;

      const pronouns=this.data?.pronouns||{};
      result.subject=words.find(w=>pronouns[w])||null;

      for(const w of words){
        const hit=this.formToVerb.get(w);
        if(hit){result.verb=hit;break;}
      }

      for(const [kind,list] of Object.entries(this.data?.connectors||{})){
        for(const c of list){
          if(n.includes(GNorm(c))){result.connectors.push({kind,text:c});break;}
        }
      }

      if(result.verb){
        if(result.verb.lemma==="ser"||result.verb.lemma==="estar")result.probableStructure="sujeto + verbo copulativo + atributo";
        else if(words.length<=3)result.probableStructure="sujeto + verbo";
        else result.probableStructure="sujeto + verbo + complementos";
      }else if(/^hay\b/.test(n)){
        result.probableStructure="oración impersonal con haber";
      }else{
        result.probableStructure="estructura no resuelta con las reglas actuales";
      }
      return result;
    }

    compose({subject="yo",verb="estar",tense="present",complement="",negative=false,question=false,interrogative=""}={}){
      const form=this.conjugate(verb,{tense,subject});
      const visibleSubject=subject&&GNorm(subject)!=="yo"?subject:"";
      const neg=negative?"no ":"";
      let core=[visibleSubject,neg+form,complement].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
      if(interrogative)core=`${interrogative} ${core}`;
      if(question)return `¿${core.charAt(0).toUpperCase()+core.slice(1)}?`;
      return core.charAt(0).toUpperCase()+core.slice(1)+".";
    }

    describe(a){
      const pieces=[
        `tipo=${a.type}`,
        `negación=${a.negative?"sí":"no"}`,
        `estructura=${a.probableStructure}`
      ];
      if(a.interrogative)pieces.push(`interrogativo=${a.interrogative}`);
      if(a.subject)pieces.push(`sujeto_detectado=${a.subject}`);
      if(a.verb)pieces.push(`verbo=${a.verb.lemma} (${a.verb.tense}, ${a.verb.slot})`);
      if(a.connectors.length)pieces.push(`conectores=${a.connectors.map(x=>x.text).join(", ")}`);
      return pieces.join(" | ");
    }
  }

  const grammar=new SpanishGrammar();
  globalThis.npcGrammar=grammar;

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const analysis=grammar.ready?grammar.analyze(text):null;
    const reply=oldHear.call(this,text);
    if(analysis&&Array.isArray(this.lastThoughts)){
      const msg=`GRAMÁTICA: ${grammar.describe(analysis)}`;
      const i=Math.min(2,this.lastThoughts.length);
      this.lastThoughts.splice(i,0,msg);
    }
    return reply;
  };

  const previousCommand=command;
  command=function(raw){
    const [head,...rest]=raw.split(" ");
    const arg=rest.join(" ").trim();
    const h=head.toLowerCase();

    if(h==="/grammar"){
      if(!grammar.ready){print("debug","GRAMMAR>","Las reglas todavía están cargando.");return;}
      if(!arg){print("error","ERROR>","Uso: /grammar La puerta está cerrada");return;}
      const a=grammar.analyze(arg);
      print("debug","GRAMMAR>",`${grammar.describe(a)}\ntokens: ${a.tokens.join(" | ")}`);
      return;
    }

    if(h==="/compose"){
      if(!grammar.ready){print("debug","GRAMMAR>","Las reglas todavía están cargando.");return;}
      const parts=arg.split("|").map(x=>x.trim());
      if(parts.length<3){
        print("error","ERROR>","Uso: /compose yo | querer | aprender más");
        return;
      }
      const [subject,verb,complement]=parts;
      print("debug","GRAMMAR>",grammar.compose({subject,verb,complement}));
      return;
    }

    if(h==="/help"){
      previousCommand(raw);
      print("system","","gramática: /grammar <oración> · /compose sujeto | verbo | complemento");
      return;
    }
    return previousCommand(raw);
  };

  grammar.load();
})();
