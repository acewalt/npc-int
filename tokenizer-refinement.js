"use strict";

(function(){
  const T=globalThis.npcTokenizer;
  if(!T)return;
  const fold=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

  const RE=new RegExp([
    String.raw`https?:\/\/[^\s<>]+`,
    String.raw`www\.[^\s<>]+`,
    String.raw`[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}`,
    String.raw`@[\p{L}\p{N}_]+`,
    String.raw`#[\p{L}\p{M}\p{N}_]+`,
    String.raw`\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}`,
    String.raw`\d{1,2}:\d{2}(?::\d{2})?`,
    String.raw`(?:\p{Sc}\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?%?`,
    String.raw`(?:\p{Sc}\s*)?\d+(?:[.,]\d+)?%?`,
    String.raw`[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)+`,
    String.raw`[\p{L}\p{M}]+(?:[’'][\p{L}\p{M}]+)?`,
    String.raw`\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*`,
    String.raw`[\p{P}]`,
    String.raw`[\p{S}]`
  ].join("|"),"gu");

  const originalSurfaceKind=T.surfaceKind.bind(T);
  T.surfaceKind=function(s){
    if(/^@[\p{L}\p{N}_]+$/u.test(s))return "MENTION";
    if(/^#[\p{L}\p{M}\p{N}_]+$/u.test(s))return "HASHTAG";
    return originalSurfaceKind(s);
  };

  T.rawTokens=function(sentence,offset=0){
    const out=[];
    RE.lastIndex=0;
    let lastEnd=0,m;
    const push=(surface,localStart,kindOverride=null)=>{
      const start=offset+localStart,end=start+surface.length;
      const ws=sentence.slice(lastEnd,localStart);
      const t={
        id:out.length+1,text:surface,norm:surface.toLowerCase().normalize("NFC"),folded:fold(surface),
        start,end,localStart,localEnd:localStart+surface.length,spaceBefore:/\s/.test(ws),spaceAfter:false,
        kind:kindOverride||this.surfaceKind(surface),lemma:null,upos:null,xpos:null,feats:{},entity:null,mwe:null,
        expansion:null,clitics:null,head:null,deprel:null,confidence:0
      };
      out.push(t);lastEnd=t.localEnd;
    };

    while((m=RE.exec(sentence))){
      let surface=m[0],localStart=m.index;
      const kind=this.surfaceKind(surface);
      if(kind==="URL"){
        const trail=surface.match(/[.,;:!?]+$/u);
        if(trail&&surface.length>trail[0].length){
          const core=surface.slice(0,-trail[0].length);
          push(core,localStart,"URL");
          let p=localStart+core.length;
          for(const ch of trail[0]){push(ch,p,"PUNCT");p+=ch.length;}
          continue;
        }
      }
      push(surface,localStart,kind);
    }
    for(let i=0;i<out.length;i++){
      const next=out[i+1];
      out[i].spaceAfter=next?next.localStart>out[i].localEnd:/\s$/.test(sentence);
    }
    return out;
  };

  const oldSpecial=T.annotateSpecial.bind(T);
  T.annotateSpecial=function(t){
    if(t.kind==="MENTION"){t.lemma=t.folded;t.upos="PROPN";t.entity={type:"MENTION",value:t.text.slice(1)};t.feats.Proper="Yes";t.confidence=1;return true;}
    if(t.kind==="HASHTAG"){t.lemma=t.folded;t.upos="X";t.entity={type:"HASHTAG",value:t.text.slice(1)};t.confidence=1;return true;}
    return oldSpecial(t);
  };

  const imperativeLemma={di:"decir",da:"dar",haz:"hacer",pon:"poner",sal:"salir",ven:"venir",ten:"tener",ve:"ir",se:"ser"};
  const oldSplit=T.splitClitics.bind(T);
  T.splitClitics=function(t){
    const hit=oldSplit(t);
    if(hit&&imperativeLemma[hit.base])hit.baseLemma=imperativeLemma[hit.base];
    return hit;
  };

  const oldSentence=T.tokenizeSentence.bind(T);
  T.tokenizeSentence=function(segment,sentenceIndex){
    const s=oldSentence(segment,sentenceIndex);
    const toks=s.tokens;
    const question=/¿|\?/.test(segment.text);

    for(let i=0;i<toks.length;i++){
      const t=toks[i],prev=toks[i-1],next=toks[i+1];

      if(t.clitics?.baseLemma){
        t.lemma=t.clitics.baseLemma;t.upos="VERB";t.confidence=.97;
        t.feats={VerbForm:"Fin",Mood:"Imp",CliticAttached:"Yes"};
      }

      if(t.folded==="como"){
        const atQuestionHead=i===0||toks.slice(0,i).every(x=>x.upos==="PUNCT");
        const followsVerb=next?.upos==="VERB";
        const prevFirstPerson=prev&&["yo"].includes(prev.folded);
        if((question||atQuestionHead)&&followsVerb){
          t.lemma="cómo";t.upos="ADV";t.feats={PronType:"Int"};t.confidence=.93;
        }else if(prevFirstPerson){
          t.lemma="comer";t.upos="VERB";t.feats={VerbForm:"Fin",Mood:"Ind",Tense:"Pres",Person:"1",Number:"Sing"};t.confidence=.96;
        }else if(!question){
          t.lemma="como";t.upos="SCONJ";t.feats={};t.confidence=.82;
        }
      }

      if(t.norm==="qué"||t.norm==="quién"||t.norm==="cuál"){
        t.upos="PRON";t.feats={...t.feats,PronType:"Int"};t.confidence=Math.max(t.confidence,.98);
      }
      if(t.norm==="cómo"||t.norm==="cuándo"||t.norm==="dónde"){
        t.upos="ADV";t.feats={...t.feats,PronType:"Int"};t.confidence=Math.max(t.confidence,.98);
      }
    }

    for(const t of toks){t.head=null;t.deprel=null;}
    s.dependencies=this.dependencies(toks);
    s.frame=this.semanticFrame(toks,s.mwes,segment.text);
    return s;
  };

  const oldDebug=T.debug.bind(T);
  T.debug=function(doc){return `scanner=advanced-refined\n${oldDebug(doc)}`;};
  T.version="1.1";
})();
