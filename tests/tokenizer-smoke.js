"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

global.window={};
global.print=()=>{};
global.command=()=>{};

class NpcBrain{
  constructor(){this.lastThoughts=[];}
  hear(){return null;}
}
global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

global.fetch=async function(url){
  const file=path.join(__dirname,"..",String(url));
  return {
    ok:fs.existsSync(file),
    status:fs.existsSync(file)?200:404,
    json:async()=>JSON.parse(fs.readFileSync(file,"utf8"))
  };
};

require("../tokenizer.js");
require("../tokenizer-refinement.js");

(async()=>{
  await global.npcTokenizer.load();
  const T=global.npcTokenizer;

  let d=T.tokenize("¿Por qué NIA-01 no va al pasillo?");
  assert.ok(d.tokens.length>=7,"debe conservar signos y palabras");
  assert.ok(d.mwes.some(x=>x.lemma==="por_qué"),"debe reconocer MWE 'por qué'");
  assert.ok(d.entities.some(x=>x.text==="NIA-01"&&x.type==="AGENT"),"debe reconocer entidad NIA-01");
  const al=d.tokens.find(x=>x.norm==="al");
  assert.deepStrictEqual(al.expansion.map(x=>x.surface),["a","el"],"debe expandir contracción al");
  assert.strictEqual(d.frames[0].speechType,"question");

  d=T.tokenize("Dímelo y después revisa la puerta.");
  const dimelo=d.tokens.find(x=>x.folded==="dimelo");
  assert.ok(dimelo&&dimelo.clitics,"debe detectar clíticos adjuntos en dímelo");
  assert.deepStrictEqual(dimelo.clitics.clitics.map(x=>x.text),["me","lo"]);
  assert.strictEqual(dimelo.lemma,"decir","debe recuperar el lema verbal de dímelo");
  assert.strictEqual(dimelo.upos,"VERB");

  d=T.tokenize("Qué onda, parce. Todo bien.");
  assert.ok(d.mwes.some(x=>x.lemma==="qué_onda"),"debe reconocer saludo multipalabra");
  assert.ok(d.mwes.some(x=>x.lemma==="todo_bien"),"debe reconocer fórmula social");
  const parce=d.tokens.find(x=>x.folded==="parce");
  assert.strictEqual(parce.feats.Register,"colombian_colloquial");

  d=T.tokenize("Escríbeme a prueba@example.com el 16/09/2026 a las 10:21 y mira https://example.com/test.");
  assert.ok(d.tokens.some(x=>x.kind==="EMAIL"),"debe reconocer email");
  assert.ok(d.tokens.some(x=>x.kind==="DATE"),"debe reconocer fecha como un token");
  assert.ok(d.tokens.some(x=>x.kind==="TIME"),"debe reconocer hora como un token");
  assert.ok(d.tokens.some(x=>x.kind==="URL"),"debe reconocer URL");
  assert.ok(d.tokens.some(x=>x.text==="."&&x.kind==="PUNCT"),"la URL no debe tragarse el punto final");

  d=T.tokenize("Hola @andres, revisa #puerta.");
  assert.ok(d.tokens.some(x=>x.kind==="MENTION"&&x.text==="@andres"));
  assert.ok(d.tokens.some(x=>x.kind==="HASHTAG"&&x.text==="#puerta"));

  d=T.tokenize("¿Cómo estás?");
  const como=d.tokens.find(x=>x.folded==="como");
  assert.strictEqual(como.upos,"ADV");
  assert.strictEqual(como.feats.PronType,"Int");

  d=T.tokenize("No quiero abrir la puerta.");
  assert.strictEqual(d.frames[0].negated,true,"debe conservar negación");
  assert.ok(d.frames[0].predicate,"debe producir predicado semántico");
  assert.ok(d.tokens.every(x=>Number.isInteger(x.start)&&Number.isInteger(x.end)&&x.end>x.start),"cada token debe conservar offsets");

  console.log("advanced tokenizer smoke: ok");
})().catch(err=>{console.error(err);process.exit(1);});
