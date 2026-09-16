"use strict";

(function(){
  const stripMarks=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const fold=s=>stripMarks(String(s||"").toLowerCase());
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

  const POS_PRIORITY=["PRON","DET","ADP","CCONJ","SCONJ","ADV","INTJ","PART"];
  const VERB_ENDINGS=[
    [/(aría|erías|irías)$/,"COND"],[/(aré|eré|iré|arás|erás|irás|ará|erá|irá|aremos|eremos|iremos|arán|erán|irán)$/,"FUT"],
    [/(aba|abas|ábamos|aban|ía|ías|íamos|ían)$/,"IMP"],[/(é|aste|ó|aron|í|iste|ió|ieron)$/,"PRET"],
    [/(ando|iendo|yendo)$/,"GER"],[/(ado|ido)$/,"PART"],
    [/(o|as|a|amos|an|es|e|emos|en|imos)$/,"PRES"]
  ];

  const MASTER_RE=new RegExp([
    String.raw`https?:\/\/[^\s<>]+`,
    String.raw`www\.[^\s<>]+`,
    String.raw`[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}`,
    String.raw`(?:\p{Sc}\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?%?`,
    String.raw`(?:\p{Sc}\s*)?\d+(?:[.,]\d+)?%?`,
    String.raw`\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}`,
    String.raw`\d{1,2}:\d{2}(?::\d{2})?`,
    String.raw`[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)+`,
    String.raw`[\p{L}\p{M}]+(?:[’'][\p{L}\p{M}]+)?`,
    String.raw`\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*`,
    String.raw`[\p{P}]`,
    String.raw`[\p{S}]`
  ].join("|"),"gu");

  class AdvancedSpanishTokenizer{
    constructor(){
      this.ready=false;
      this.lexicon=null;
      this.grammar=null;
      this.closed=new Map();
      this.verbForms=new Map();
      this.mwes=[];
      this.entityMap=new Map();
      this.slang=new Map();
      this.version="1.0";
    }

    async load(){
      try{
        const [lex,grammar]=await Promise.all([
          fetch("knowledge/tokenizer.es.json",{cache:"no-cache"}).then(r=>{if(!r.ok)throw new Error(`tokenizer HTTP ${r.status}`);return r.json();}),
          fetch("knowledge/grammar.es.json",{cache:"no-cache"}).then(r=>{if(!r.ok)throw new Error(`grammar HTTP ${r.status}`);return r.json();})
        ]);
        this.lexicon=lex;
        this.grammar=grammar;
        this.buildIndexes();
        this.ready=true;
        print("system","",`tokenizer español v${this.version} cargado · Unicode + MWE + lemas + UPOS + morfología + entidades + dependencias`);
      }catch(err){
        console.warn("Tokenizer load failed",err);
        print("error","TOKENIZER>","no pude cargar los recursos del tokenizer");
      }
    }

    buildIndexes(){
      this.closed.clear();
      for(const pos of POS_PRIORITY){
        for(const word of this.lexicon?.closedClass?.[pos]||[]){
          const k=String(word).toLowerCase();
          if(!this.closed.has(k))this.closed.set(k,[]);
          if(!this.closed.get(k).includes(pos))this.closed.get(k).push(pos);
        }
      }

      this.verbForms.clear();
      for(const [lemma,tenses] of Object.entries(this.grammar?.commonVerbs||{})){
        for(const [tense,forms] of Object.entries(tenses)){
          for(const [slot,form] of Object.entries(forms)){
            const [person,number]=slot==="1s"?[1,"Sing"]:slot==="2s"?[2,"Sing"]:slot==="1p"?[1,"Plur"]:[3,slot.endsWith("p")?"Plur":"Sing"];
            this.verbForms.set(String(form).toLowerCase(),{
              lemma,upos:"VERB",confidence:.99,
              feats:{VerbForm:"Fin",Mood:"Ind",Tense:tense==="present"?"Pres":tense==="past"?"Past":"Fut",Person:String(person),Number:number}
            });
          }
        }
      }

      const extra={
        hago:["hacer",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"1",Number:"Sing"}],haces:["hacer",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"2",Number:"Sing"}],hace:["hacer",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"3",Number:"Sing"}],
        digo:["decir",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"1",Number:"Sing"}],dices:["decir",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"2",Number:"Sing"}],dice:["decir",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"3",Number:"Sing"}],
        doy:["dar",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"1",Number:"Sing"}],das:["dar",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"2",Number:"Sing"}],da:["dar",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"3",Number:"Sing"}],
        veo:["ver",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"1",Number:"Sing"}],ves:["ver",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"2",Number:"Sing"}],ve:["ver",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"3",Number:"Sing"}],
        pienso:["pensar",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"1",Number:"Sing"}],piensas:["pensar",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"2",Number:"Sing"}],piensa:["pensar",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"3",Number:"Sing"}],
        hablo:["hablar",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"1",Number:"Sing"}],hablas:["hablar",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"2",Number:"Sing"}],habla:["hablar",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"3",Number:"Sing"}],
        como:["comer",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"1",Number:"Sing"}],comes:["comer",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"2",Number:"Sing"}],come:["comer",{VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"3",Number:"Sing"}]
      };
      for(const [form,[lemma,feats]] of Object.entries(extra))this.verbForms.set(form,{lemma,upos:"VERB",confidence:.96,feats});

      this.mwes=(this.lexicon?.multiwordExpressions||[]).map(x=>({
        ...x,
        words:String(x.text).toLowerCase().split(/\s+/)
      })).sort((a,b)=>b.words.length-a.words.length);

      this.entityMap.clear();
      for(const [name,type] of Object.entries(this.lexicon?.commonEntities||{}))this.entityMap.set(fold(name),{name,type});
      this.slang.clear();
      for(const [w,data] of Object.entries(this.lexicon?.slang||{}))this.slang.set(fold(w),data);
    }

    normalizeUnicode(text){
      return String(text||"")
        .normalize("NFC")
        .replace(/[\u200B-\u200D\uFEFF]/g,"")
        .replace(/\u00A0/g," ")
        .replace(/[“”]/g,'"')
        .replace(/[‘’]/g,"'")
        .replace(/[–—]/g,"—");
    }

    sentenceSegments(text){
      const clean=this.normalizeUnicode(text);
      if(typeof Intl!=="undefined"&&Intl.Segmenter){
        try{
          const seg=new Intl.Segmenter("es",{granularity:"sentence"});
          return [...seg.segment(clean)].map(x=>({text:x.segment,start:x.index,end:x.index+x.segment.length})).filter(x=>x.text.trim());
        }catch(_){ }
      }
      const out=[];
      const re=/[^.!?¡¿]+(?:[.!?]+|$)/gu;
      let m;
      while((m=re.exec(clean)))out.push({text:m[0],start:m.index,end:m.index+m[0].length});
      return out.length?out:[{text:clean,start:0,end:clean.length}];
    }

    rawTokens(sentence,offset=0){
      const out=[];
      MASTER_RE.lastIndex=0;
      let m;
      while((m=MASTER_RE.exec(sentence))){
        const surface=m[0];
        const start=offset+m.index,end=start+surface.length;
        const before=sentence.slice(0,m.index);
        const prevEnd=out.length?out[out.length-1].localEnd:0;
        const ws=sentence.slice(prevEnd,m.index);
        out.push({
          id:out.length+1,
          text:surface,
          norm:surface.toLowerCase().normalize("NFC"),
          folded:fold(surface),
          start,end,
          localStart:m.index,localEnd:m.index+surface.length,
          spaceBefore:/\s/.test(ws),
          spaceAfter:false,
          kind:this.surfaceKind(surface),
          lemma:null,upos:null,xpos:null,feats:{},entity:null,mwe:null,expansion:null,clitics:null,
          head:null,deprel:null,confidence:0
        });
      }
      for(let i=0;i<out.length;i++){
        const next=out[i+1];
        out[i].spaceAfter=next?next.localStart>out[i].localEnd:/\s$/.test(sentence);
      }
      return out;
    }

    surfaceKind(s){
      if(/^https?:\/\//iu.test(s)||/^www\./iu.test(s))return "URL";
      if(/^[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}$/u.test(s))return "EMAIL";
      if(/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/u.test(s))return "DATE";
      if(/^\d{1,2}:\d{2}(?::\d{2})?$/u.test(s))return "TIME";
      if(/^(?:\p{Sc}\s*)?\d/u.test(s))return s.endsWith("%")?"PERCENT":/^\p{Sc}/u.test(s)?"MONEY":"NUMBER";
      if(/^\p{Extended_Pictographic}/u.test(s))return "EMOJI";
      if(/^\p{P}$/u.test(s))return "PUNCT";
      if(/^\p{S}$/u.test(s))return "SYMBOL";
      return "WORD";
    }

    annotateSpecial(t){
      if(t.kind==="URL"){t.lemma=t.text;t.upos="X";t.entity={type:"URL",value:t.text};t.confidence=1;return true;}
      if(t.kind==="EMAIL"){t.lemma=t.text.toLowerCase();t.upos="X";t.entity={type:"EMAIL",value:t.text};t.confidence=1;return true;}
      if(["DATE","TIME","NUMBER","PERCENT","MONEY"].includes(t.kind)){
        t.lemma=t.text;t.upos="NUM";t.feats.NumType="Card";t.entity={type:t.kind,value:t.text};t.confidence=.99;return true;
      }
      if(t.kind==="EMOJI"){t.lemma=t.text;t.upos="SYM";t.feats.SymbolType="Emoji";t.confidence=1;return true;}
      if(t.kind==="PUNCT"){t.lemma=t.text;t.upos="PUNCT";t.confidence=1;return true;}
      if(t.kind==="SYMBOL"){t.lemma=t.text;t.upos="SYM";t.confidence=1;return true;}
      return false;
    }

    irregularVerb(word){return this.verbForms.get(String(word).toLowerCase())||null;}

    regularVerbGuess(word){
      const w=String(word).toLowerCase();
      if(/(ar|er|ir)$/.test(w))return {lemma:w,upos:"VERB",confidence:.94,feats:{VerbForm:"Inf"}};
      for(const [re,kind] of VERB_ENDINGS){
        if(!re.test(w))continue;
        let lemma=null,feats={VerbForm:"Fin"};
        if(kind==="GER"){
          lemma=w.replace(/ando$/,"ar").replace(/iendo$/,"er").replace(/yendo$/,"ir");
          return {lemma,upos:"VERB",confidence:.66,feats:{VerbForm:"Ger"}};
        }
        if(kind==="PART"){
          lemma=w.replace(/ado$/,"ar").replace(/ido$/,"er");
          return {lemma,upos:"VERB",confidence:.58,feats:{VerbForm:"Part"}};
        }
        if(kind==="FUT"){feats={VerbForm:"Fin",Mood:"Ind",Tense:"Fut"};}
        else if(kind==="COND"){feats={VerbForm:"Fin",Mood:"Cnd",Tense:"Pres"};}
        else if(kind==="PRET"){feats={VerbForm:"Fin",Mood:"Ind",Tense:"Past"};}
        else if(kind==="IMP"){feats={VerbForm:"Fin",Mood:"Ind",Tense:"Imp"};}
        else feats={VerbForm:"Fin",Mood:"Ind",Tense:"Pres"};
        const stems=[
          [/(amos|aban|aron)$/,"ar"],[/(emos|ieron)$/,"er"],[/(imos)$/,"ir"],[/(as|an|aba|aste|ó|é)$/,"ar"],[/(es|en|iste|ió|í)$/,"er"],[/(o|a|e)$/,"ar"]
        ];
        for(const [r,end] of stems){if(r.test(w)){lemma=w.replace(r,end);break;}}
        if(lemma&&lemma.length>=3)return {lemma,upos:"VERB",confidence:.42,feats};
      }
      return null;
    }

    nominalLemma(word,upos){
      let w=String(word).toLowerCase();
      if((upos==="NOUN"||upos==="ADJ")&&w.length>4){
        if(/ces$/.test(w))return w.replace(/ces$/,"z");
        if(/es$/.test(w)&&w.length>5)return w.slice(0,-2);
        if(/s$/.test(w)&&!/[áéíóú]s$/.test(w))return w.slice(0,-1);
      }
      return w;
    }

    classifyWord(t,index,tokens,sentenceIsQuestion){
      const w=t.norm,f=t.folded;
      const slang=this.slang.get(f);
      if(slang){
        t.lemma=slang.lemma||w;t.upos=slang.upos||"X";t.feats.Register=slang.register||"colloquial";t.feats.Pragmatics=slang.pragmatics||"";t.confidence=.98;return;
      }

      const entity=this.entityMap.get(f);
      if(entity){t.lemma=w;t.upos="PROPN";t.entity={type:entity.type,value:entity.name};t.feats.Proper="Yes";t.confidence=.99;return;}

      const verb=this.irregularVerb(w);
      if(verb){Object.assign(t,{lemma:verb.lemma,upos:verb.upos,confidence:verb.confidence});t.feats={...verb.feats};return;}

      const closed=this.closed.get(w)||this.closed.get(f)||[];
      if(closed.length){
        let pos=closed[0];
        const next=tokens[index+1];
        if(["el","la","los","las","un","una","unos","unas","este","esta","ese","esa","aquel","aquella","mi","mis","tu","tus","su","sus"].includes(w))pos="DET";
        if(["qué","que","quién","quien","cuál","cual","cuáles","cuales"].includes(w))pos=sentenceIsQuestion||index===0?"PRON":"SCONJ";
        if(w==="si")pos=sentenceIsQuestion?"SCONJ":"SCONJ";
        if(w==="no")pos="ADV";
        t.upos=pos;t.lemma=w;t.confidence=.94;
        if(pos==="PRON"){
          if(sentenceIsQuestion&&["qué","quién","quien","cuál","cual","cuáles","cuales"].includes(w))t.feats.PronType="Int";
          if(["yo","me","mí","mi"].includes(w)){t.feats.Person="1";t.feats.Number="Sing";}
          if(["tú","tu","te","ti"].includes(w)){t.feats.Person="2";t.feats.Number="Sing";}
        }
        if(pos==="DET")t.feats.PronType="Art";
        return;
      }

      const guessedVerb=this.regularVerbGuess(w);
      if(guessedVerb&&guessedVerb.confidence>=.55){Object.assign(t,{lemma:guessedVerb.lemma,upos:"VERB",confidence:guessedVerb.confidence});t.feats={...guessedVerb.feats};return;}

      if(/^\p{Lu}/u.test(t.text)&&index>0){t.lemma=w;t.upos="PROPN";t.feats.Proper="Yes";t.confidence=.72;return;}
      if(/mente$/u.test(w)){t.lemma=w.replace(/mente$/u,"");t.upos="ADV";t.confidence=.82;return;}
      if(/(ísimo|ísima|osos|osas|oso|osa|able|ible|al|ico|ica|ivo|iva)$/u.test(w)){t.upos="ADJ";t.lemma=this.nominalLemma(w,"ADJ");t.confidence=.64;return;}
      if(/(ción|sión|dad|tad|tud|aje|miento|mento|ura|ez|eza|ista|ismo)$/u.test(w)){t.upos="NOUN";t.lemma=this.nominalLemma(w,"NOUN");t.confidence=.78;return;}

      if(guessedVerb){Object.assign(t,{lemma:guessedVerb.lemma,upos:"VERB",confidence:guessedVerb.confidence});t.feats={...guessedVerb.feats};return;}

      t.upos="NOUN";t.lemma=this.nominalLemma(w,"NOUN");t.confidence=.38;
    }

    contractionExpansion(t){
      const c=this.lexicon?.contractions?.[t.norm];
      return c?c.map((x,i)=>({surface:x,lemma:x,virtual:true,index:i})):null;
    }

    splitClitics(t){
      if(t.kind!=="WORD")return null;
      const original=t.norm;
      const f=fold(original);
      const cl=(this.lexicon?.clitics||[]).slice().sort((a,b)=>b.length-a.length);
      const imperative=new Set(["di","da","haz","pon","sal","ven","ten","ve","se"]);
      let best=null;
      for(const c2 of cl){
        if(!f.endsWith(fold(c2)))continue;
        const r1=f.slice(0,-fold(c2).length);
        for(const c1 of [null,...cl]){
          let base=r1,parts=[c2];
          if(c1&&r1.endsWith(fold(c1))){base=r1.slice(0,-fold(c1).length);parts=[c1,c2];}
          if(base.length<2)continue;
          const valid=/(ar|er|ir|ando|iendo|yendo)$/u.test(base)||imperative.has(base);
          if(!valid)continue;
          const score=parts.length*10+base.length;
          if(!best||score>best.score)best={base,clitics:parts,score};
        }
      }
      if(!best)return null;
      return {base:best.base,clitics:best.clitics.map(x=>({text:x,lemma:x,upos:"PRON",feats:{PronType:"Prs",Clitic:"Yes"}}))};
    }

    detectMWEs(tokens){
      const lexical=tokens.filter(t=>!["PUNCT"].includes(t.kind));
      const found=[];
      for(let i=0;i<lexical.length;i++){
        for(const mwe of this.mwes){
          if(i+mwe.words.length>lexical.length)continue;
          let ok=true;
          for(let j=0;j<mwe.words.length;j++)if(lexical[i+j].norm!==mwe.words[j]){ok=false;break;}
          if(!ok)continue;
          const members=lexical.slice(i,i+mwe.words.length);
          const item={id:`mwe-${found.length+1}`,text:members.map(x=>x.text).join(" "),lemma:mwe.lemma,kind:mwe.kind,register:mwe.register||null,start:members[0].start,end:members[members.length-1].end,tokenIds:members.map(x=>x.id)};
          found.push(item);
          for(const x of members)x.mwe=item.id;
          break;
        }
      }
      return found;
    }

    detectEntities(tokens){
      const out=[];
      for(const t of tokens){
        if(t.entity){out.push({text:t.text,type:t.entity.type,start:t.start,end:t.end,tokenIds:[t.id],confidence:.99});continue;}
      }
      let i=0;
      while(i<tokens.length){
        if(tokens[i].upos!=="PROPN"||tokens[i].entity){i++;continue;}
        const group=[tokens[i]];let j=i+1;
        while(j<tokens.length&&tokens[j].upos==="PROPN"&&!tokens[j].entity){group.push(tokens[j]);j++;}
        out.push({text:group.map(x=>x.text).join(" "),type:"PROPER",start:group[0].start,end:group[group.length-1].end,tokenIds:group.map(x=>x.id),confidence:.62});
        i=j;
      }
      return out;
    }

    dependencies(tokens){
      const syntactic=tokens.filter(t=>t.upos!=="PUNCT"&&t.upos!=="SYM");
      if(!syntactic.length)return [];
      let root=syntactic.find(t=>t.upos==="VERB")||syntactic.find(t=>t.upos==="AUX")||syntactic[0];
      root.head=0;root.deprel="root";

      const indexById=new Map(tokens.map(t=>[t.id,t]));
      const nearestNounRight=(idx)=>tokens.slice(idx+1).find(x=>["NOUN","PROPN","PRON"].includes(x.upos));
      for(let i=0;i<tokens.length;i++){
        const t=tokens[i];
        if(t===root||t.head!==null)continue;
        if(t.upos==="PUNCT"){t.head=root.id;t.deprel="punct";continue;}
        if(t.upos==="DET"){
          const h=nearestNounRight(i);t.head=h?.id||root.id;t.deprel=h?"det":"dep";continue;
        }
        if(t.upos==="ADP"){
          const h=nearestNounRight(i);t.head=h?.id||root.id;t.deprel=h?"case":"dep";continue;
        }
        if(t.upos==="ADJ"){
          const left=[...tokens.slice(0,i)].reverse().find(x=>["NOUN","PROPN"].includes(x.upos));
          const right=nearestNounRight(i);const h=left||right;t.head=h?.id||root.id;t.deprel=h?"amod":"dep";continue;
        }
        if(t.norm==="no"){t.head=root.id;t.deprel="advmod:neg";continue;}
        if(t.upos==="CCONJ"){t.head=root.id;t.deprel="cc";continue;}
        if(t.upos==="SCONJ"){t.head=root.id;t.deprel="mark";continue;}
        if(t.upos==="ADV"){t.head=root.id;t.deprel="advmod";continue;}
        if(t.upos==="PRON"&&t.feats.PronType==="Int"){t.head=root.id;t.deprel="obj";continue;}
        if(["NOUN","PROPN","PRON"].includes(t.upos)){
          const before=t.start<root.start;
          const prev=tokens[i-1];
          if(prev?.upos==="ADP"){t.head=root.id;t.deprel="obl";}
          else {t.head=root.id;t.deprel=before?"nsubj":"obj";}
          continue;
        }
        if(t.upos==="VERB"){t.head=root.id;t.deprel=t.start>root.start?"conj":"advcl";continue;}
        t.head=root.id;t.deprel="dep";
      }
      return tokens.map(t=>({id:t.id,head:t.head,deprel:t.deprel}));
    }

    semanticFrame(tokens,mwes,sentenceText){
      const root=tokens.find(t=>t.deprel==="root")||null;
      const subj=tokens.find(t=>t.deprel==="nsubj")||null;
      const obj=tokens.find(t=>t.deprel==="obj"&&t!==subj)||null;
      const neg=tokens.some(t=>t.deprel==="advmod:neg"||t.norm==="no");
      const qword=tokens.find(t=>t.feats?.PronType==="Int")||null;
      const isQuestion=/¿|\?/.test(sentenceText)||!!qword;
      const isExclamation=/¡|!/.test(sentenceText);
      const modal=tokens.find(t=>["poder","querer","deber","tener"].includes(t.lemma)&&t.upos==="VERB");
      return {
        speechType:isQuestion?"question":isExclamation?"exclamation":"statement",
        predicate:root?{tokenId:root.id,text:root.text,lemma:root.lemma,tense:root.feats?.Tense||null,mood:root.feats?.Mood||null}:null,
        subject:subj?{tokenId:subj.id,text:subj.text,lemma:subj.lemma}:null,
        object:obj?{tokenId:obj.id,text:obj.text,lemma:obj.lemma}:null,
        negated:neg,
        questionWord:qword?.lemma||null,
        modality:modal?.lemma||null,
        expressions:mwes.map(x=>({lemma:x.lemma,kind:x.kind,text:x.text}))
      };
    }

    tokenizeSentence(segment,sentenceIndex){
      const tokens=this.rawTokens(segment.text,segment.start);
      const isQuestion=/¿|\?/.test(segment.text);
      for(let i=0;i<tokens.length;i++){
        const t=tokens[i];
        t.sentence=sentenceIndex;
        if(this.annotateSpecial(t))continue;
        t.expansion=this.contractionExpansion(t);
        t.clitics=this.splitClitics(t);
        this.classifyWord(t,i,tokens,isQuestion);
        if(t.clitics&&t.upos!=="VERB"){
          const v=this.regularVerbGuess(t.clitics.base)||this.irregularVerb(t.clitics.base);
          if(v){t.lemma=v.lemma;t.upos="VERB";t.feats={...(v.feats||{}),CliticAttached:"Yes"};t.confidence=Math.max(t.confidence,v.confidence||.6);}
        }
      }
      const mwes=this.detectMWEs(tokens);
      const entities=this.detectEntities(tokens);
      const deps=this.dependencies(tokens);
      const frame=this.semanticFrame(tokens,mwes,segment.text);
      return {index:sentenceIndex,text:segment.text.trim(),start:segment.start,end:segment.end,tokens,mwes,entities,dependencies:deps,frame};
    }

    tokenize(text){
      const original=String(text||"");
      const normalized=this.normalizeUnicode(original);
      const segments=this.sentenceSegments(normalized);
      const sentences=segments.map((s,i)=>this.tokenizeSentence(s,i));
      const tokens=sentences.flatMap(s=>s.tokens);
      const mwes=sentences.flatMap(s=>s.mwes);
      const entities=sentences.flatMap(s=>s.entities);
      return {
        version:this.version,
        language:"es",
        text:original,
        normalized,
        sentences,tokens,mwes,entities,
        frames:sentences.map(s=>s.frame),
        stats:{sentences:sentences.length,tokens:tokens.length,mwes:mwes.length,entities:entities.length,unknown:tokens.filter(t=>t.confidence<.5&&t.kind==="WORD").length}
      };
    }

    debug(doc){
      const lines=[`oraciones=${doc.stats.sentences} · tokens=${doc.stats.tokens} · MWE=${doc.stats.mwes} · entidades=${doc.stats.entities} · baja_confianza=${doc.stats.unknown}`];
      for(const s of doc.sentences){
        lines.push(`\nORACIÓN ${s.index+1}: ${s.text}`);
        for(const t of s.tokens){
          const feat=Object.keys(t.feats||{}).length?` ${JSON.stringify(t.feats)}`:"";
          const dep=t.deprel?` ${t.deprel}->${t.head}`:"";
          const mwe=t.mwe?` ${t.mwe}`:"";
          const cl=t.clitics?` clíticos=${t.clitics.clitics.map(x=>x.text).join("+")}`:"";
          lines.push(`${t.id}. ${t.text} | ${t.upos||"?"} | lemma=${t.lemma||"?"} | conf=${Math.round((t.confidence||0)*100)}%${feat}${dep}${mwe}${cl}`);
        }
        if(s.mwes.length)lines.push(`MWE: ${s.mwes.map(x=>`${x.text}→${x.lemma}[${x.kind}]`).join(" | ")}`);
        if(s.entities.length)lines.push(`NER: ${s.entities.map(x=>`${x.text}[${x.type}]`).join(" | ")}`);
        lines.push(`FRAME: ${JSON.stringify(s.frame)}`);
      }
      return lines.join("\n");
    }
  }

  const tokenizer=new AdvancedSpanishTokenizer();
  globalThis.npcTokenizer=tokenizer;

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const doc=tokenizer.ready?tokenizer.tokenize(text):null;
    this.lastLanguageDocument=doc;
    const result=oldHear.call(this,text);
    const finish=answer=>{
      if(doc&&Array.isArray(this.lastThoughts)){
        const f=doc.frames[0];
        this.lastThoughts.unshift(`TOKENIZER: ${doc.stats.tokens} tokens; acto=${f?.speechType||"—"}; predicado=${f?.predicate?.lemma||"—"}; sujeto=${f?.subject?.lemma||"—"}; objeto=${f?.object?.lemma||"—"}; MWE=${doc.stats.mwes}`);
      }
      return answer;
    };
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  const oldCommand=command;
  command=function(raw){
    const [head,...rest]=raw.trim().split(/\s+/);
    const h=(head||"").toLowerCase();
    if(h!=="/tokenize"&&h!=="/tokens")return oldCommand(raw);
    const text=rest.join(" ").trim();
    if(!tokenizer.ready){print("debug","TOKENIZER>","Los recursos todavía están cargando.");return;}
    if(!text){
      const doc=brain.lastLanguageDocument;
      if(!doc){print("debug","TOKENIZER>","Uso: /tokenize <texto> o conversa primero.");return;}
      print("debug","TOKENIZER>",tokenizer.debug(doc));
      return;
    }
    print("debug","TOKENIZER>",tokenizer.debug(tokenizer.tokenize(text)));
  };

  tokenizer.load();
  window.NpcIntTokenizer={tokenizer,tokenize:text=>tokenizer.tokenize(text)};
})();
