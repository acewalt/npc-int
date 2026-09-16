"use strict";

(function(){
  const G=globalThis.npcGrammar;
  const T=globalThis.npcTokenizer;
  if(!G||!T)return;

  const oldAnalyze=G.analyze.bind(G);
  const oldDescribe=G.describe.bind(G);

  function structureFrom(sentence){
    const f=sentence?.frame;
    if(!f?.predicate)return "estructura sin predicado verbal resuelto";
    if(f.subject&&f.object)return "sujeto + verbo + objeto/complementos";
    if(f.subject)return "sujeto + verbo + complementos";
    if(f.object)return "sujeto omitido + verbo + objeto/complementos";
    return "sujeto omitido + verbo";
  }

  G.analyze=function(text){
    if(!T.ready)return oldAnalyze(text);
    const doc=T.tokenize(text);
    const sentence=doc.sentences[0];
    if(!sentence)return oldAnalyze(text);
    const frame=sentence.frame||{};
    const predicate=frame.predicate;
    const rootToken=predicate?sentence.tokens.find(t=>t.id===predicate.tokenId):null;
    const connectors=[];

    for(const m of sentence.mwes||[]){
      if(["connector","reformulation"].includes(m.kind))connectors.push({kind:m.kind,text:m.text,lemma:m.lemma});
    }
    for(const t of sentence.tokens){
      if(t.upos==="CCONJ"||t.upos==="SCONJ"){
        if(!connectors.some(x=>x.text.toLowerCase()===t.text.toLowerCase()))connectors.push({kind:t.upos==="CCONJ"?"coordination":"subordination",text:t.text,lemma:t.lemma});
      }
    }

    const interrogative=(sentence.mwes||[]).find(x=>x.kind==="interrogative")?.text ||
      sentence.tokens.find(t=>t.feats?.PronType==="Int")?.text || null;

    const result={
      text:String(text||"").trim(),
      type:frame.speechType==="question"?"interrogativa":frame.speechType==="exclamation"?"exclamativa":"declarativa",
      negative:!!frame.negated,
      interrogative,
      subject:frame.subject?.text||null,
      verb:rootToken?{
        lemma:rootToken.lemma,
        tense:rootToken.feats?.Tense||null,
        mood:rootToken.feats?.Mood||null,
        person:rootToken.feats?.Person||null,
        number:rootToken.feats?.Number||null,
        slot:null,
        form:rootToken.text
      }:null,
      connectors,
      probableStructure:structureFrom(sentence),
      tokens:sentence.tokens.filter(t=>t.upos!=="PUNCT").map(t=>t.text),
      linguisticDocument:doc,
      tokenObjects:sentence.tokens,
      dependencies:sentence.dependencies,
      entities:sentence.entities,
      multiwordExpressions:sentence.mwes,
      semanticFrame:frame,
      advanced:true
    };
    return result;
  };

  G.describe=function(a){
    if(!a?.advanced)return oldDescribe(a);
    const pieces=[
      `tipo=${a.type}`,
      `negación=${a.negative?"sí":"no"}`,
      `estructura=${a.probableStructure}`
    ];
    if(a.interrogative)pieces.push(`interrogativo=${a.interrogative}`);
    if(a.subject)pieces.push(`sujeto=${a.subject}`);
    if(a.verb)pieces.push(`verbo=${a.verb.lemma}${a.verb.tense?` (${a.verb.tense})`:""}`);
    if(a.connectors.length)pieces.push(`conectores=${a.connectors.map(x=>x.text).join(", ")}`);
    if(a.entities.length)pieces.push(`entidades=${a.entities.map(x=>`${x.text}:${x.type}`).join(", ")}`);
    if(a.multiwordExpressions.length)pieces.push(`MWE=${a.multiwordExpressions.map(x=>x.text).join(", ")}`);
    return pieces.join(" | ");
  };

  globalThis.npcGrammarTokenizerBridge={active:true,version:"1.0"};
  print("system","","puente tokenizer→gramática v1 cargado · UPOS + lemas + morfología + dependencias + entidades");
})();
