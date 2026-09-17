"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const slug=s=>norm(s).replace(/\b(el|la|los|las|un|una|unos|unas)\b/g," ").replace(/\s+/g," ").trim().replace(/ /g,"_")||"desconocido";
  const concepts=new Map();
  const aliases=new Map();

  const TYPE_HINTS={
    animal:new Set(["gato","gatos","gatito","perro","perros","murcielago","murcielagos","mamifero","mamiferos","ave","aves"]),
    need:new Set(["hambre","sed","frio","sueño","sueno","dolor"]),
    action:new Set(["comer","beber","dormir","descansar","explorar","observar"]),
    object:new Set(["cuchara","llave","puerta","cama","piedra","comida","alimento"]),
    abstract:new Set(["conciencia","filosofia","realidad","color","incertidumbre","informacion"])
  };

  function inferType(label,hint){
    if(hint)return hint;
    const n=norm(label);
    for(const [type,set] of Object.entries(TYPE_HINTS))if(set.has(n))return type;
    return "entity";
  }

  function aliasKey(value,language="es"){return `${language}:${norm(value)}`;}

  function register(value={}){
    const label=String(value.label||value.name||"").trim();
    if(!label)return null;
    const language=value.language||"es";
    const type=inferType(label,value.type);
    const id=value.id||`concept:${type}:${slug(label)}`;
    let concept=concepts.get(id);
    if(!concept){
      concept={id,type,label,language,aliases:[],sources:[]};
      concepts.set(id,concept);
    }
    const candidates=[label,...(value.aliases||[])].map(String).map(x=>x.trim()).filter(Boolean);
    for(const candidate of candidates){
      const key=aliasKey(candidate,language);
      aliases.set(key,id);
      if(norm(candidate)!==norm(concept.label)&&!concept.aliases.some(x=>norm(x)===norm(candidate)))concept.aliases.push(candidate);
    }
    if(value.source&&!concept.sources.includes(value.source))concept.sources.push(value.source);
    return concept;
  }

  function resolve(value,options={}){
    if(!value)return null;
    if(typeof value==="object"&&value.id&&concepts.has(value.id))return concepts.get(value.id);
    const language=options.language||"es";
    const key=aliasKey(value,language);
    const id=aliases.get(key);
    if(id)return concepts.get(id)||null;
    if(options.create===false)return null;
    return register({label:String(value),language,type:options.type,source:options.source||"runtime"});
  }

  function mention(value,options={}){
    const c=resolve(value,options);
    return c?{kind:"concept",id:c.id,label:c.label,type:c.type,language:c.language}:null;
  }

  function findInText(text){
    const n=` ${norm(text)} `,found=[];
    for(const [key,id] of aliases){
      const [,alias]=key.split(":",2);
      if(!alias||!n.includes(` ${alias} `))continue;
      const c=concepts.get(id);
      if(c&&!found.some(x=>x.id===c.id))found.push(mention(c));
    }
    return found;
  }

  function importCommonsense(relations,meta={}){
    for(const r of relations||[]){
      register({label:String(r.subject||"").replaceAll("_"," "),source:meta.source||"commonsense"});
      register({label:String(r.object||"").replaceAll("_"," "),source:meta.source||"commonsense"});
    }
  }

  [
    ["gato","animal",["gatos","gatito"]],["perro","animal",["perros"]],["murciélago","animal",["murcielago","murciélagos","murcielagos"]],
    ["mamífero","animal",["mamifero","mamíferos","mamiferos"]],["ave","animal",["aves"]],["hambre","need",[]],["comer","action",[]],
    ["comida","object",["alimento","alimentos"]],["cuchara","object",[]],["llave","object",[]],["cama","object",[]],
    ["conciencia","abstract",[]],["filosofía","abstract",["filosofia"]],["realidad","abstract",[]],["color","abstract",[]]
  ].forEach(([label,type,a])=>register({label,type,aliases:a,source:"core-seed"}));

  if(typeof globalThis.NpcIntSubscribeCommonsense==="function")globalThis.NpcIntSubscribeCommonsense(importCommonsense);
  else{
    const pending=globalThis.NpcIntPendingCommonsenseSubscribers||(globalThis.NpcIntPendingCommonsenseSubscribers=[]);
    pending.push(importCommonsense);
  }

  function stats(){return {concepts:concepts.size,aliases:aliases.size};}
  function get(id){return concepts.get(id)||null;}
  function all(){return [...concepts.values()].map(x=>({...x,aliases:x.aliases.slice(),sources:x.sources.slice()}));}

  window.NpcIntConceptRegistry={register,resolve,mention,findInText,get,all,stats,norm};
  if(typeof print==="function")print("system","",`registro conceptual v1.0 cargado · ${concepts.size} conceptos base · identidad estable por ID`);
})();
