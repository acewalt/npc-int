"use strict";

(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.NpcIntKnowledgeArchitectureCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const fold=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const norm=s=>fold(s).replace(/[^a-z0-9ñ:_ ]+/g," ").replace(/\s+/g," ").trim();
  const slug=s=>norm(String(s||"").replaceAll("_"," ")).replace(/[: ]+/g,"_").replace(/^_+|_+$/g,"")||"unknown";
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(Number(v))?Number(v):0));
  const nowTurn=ctx=>Number(ctx?.brain?.time||ctx?.time||0);
  const ISA=new Set(["es","es_un","is_a","isa"]);
  const SOURCE_TRUST={
    wikidata:.96,
    factual_local:.91,
    encyclopedia:.88,
    conceptnet:.78,
    commonsense:.76,
    dictionary:.86,
    lexical:.84,
    social:.58,
    player_statement:null,
    conversation:null,
    inference:.62,
    memory:.55
  };

  const TYPE_HINTS={
    need:new Set(["hambre","sed","sueño","sueno","dolor","frio","calor","seguridad"]),
    action:new Set(["comer","beber","dormir","cortar","abrir","cerrar","caminar","correr","hablar","explorar","observar","investigar","atacar","defender"]),
    animal:new Set(["animal","mamifero","mamífero","ave","pez","reptil","gato","perro","lobo","caballo","murcielago","murciélago"]),
    person:new Set(["persona","jugador","npc","humano","hombre","mujer"]),
    place:new Set(["lugar","ciudad","pais","país","barranquilla","colombia"]),
    object:new Set(["objeto","silla","mesa","puerta","llave","cuchillo","cuchara","destornillador","herramienta"]),
    state:new Set(["feliz","triste","hambriento","cansado","abierto","cerrado","frio","frío","caliente"])
  };

  function inferType(label,explicit){
    if(explicit)return slug(explicit);
    const n=norm(label).replace(/ /g,"_");
    for(const [type,items] of Object.entries(TYPE_HINTS))if(items.has(n)||items.has(n.replaceAll("_"," ")))return type;
    if(/^(comer|beber|abrir|cerrar|buscar|usar|hacer|ir|venir|mirar|escuchar|decir|pensar|recordar)/.test(n))return "action";
    return "entity";
  }

  class ConceptRegistry{
    constructor(){
      this.byId=new Map();
      this.aliasToId=new Map();
    }
    makeId(label,type){return `concept:${inferType(label,type)}:${slug(label)}`;}
    register(input,type=null,aliases=[]){
      const raw=typeof input==="object"&&input?input:{};
      const label=typeof input==="string"?String(input).replaceAll("_"," "):String(raw.label||raw.name||raw.id||"").replace(/^concept:[^:]+:/,"").replaceAll("_"," ");
      const explicitId=typeof raw.id==="string"&&raw.id.startsWith("concept:")?raw.id:null;
      const id=explicitId||this.makeId(label,raw.type||type);
      const concept=this.byId.get(id)||{
        id,
        type:(id.split(":")[1]||inferType(label,type)),
        label:label||id.split(":").at(-1).replaceAll("_"," "),
        language:raw.language||"es",
        aliases:[]
      };
      const merged=[concept.label,...concept.aliases,...(raw.aliases||[]),...(aliases||[])].filter(Boolean);
      concept.aliases=[...new Set(merged.map(x=>String(x).trim()).filter(Boolean))];
      this.byId.set(id,concept);
      for(const alias of concept.aliases)this.aliasToId.set(norm(alias).replace(/ /g,"_"),id);
      this.aliasToId.set(norm(concept.label).replace(/ /g,"_"),id);
      this.aliasToId.set(id,id);
      return concept;
    }
    resolve(value,{create=true,type=null}={}){
      if(!value)return null;
      if(typeof value==="object"&&value.conceptId)return this.byId.get(value.conceptId)||this.register({id:value.conceptId,label:value.label||value.conceptId,type:value.type||type});
      if(typeof value==="object"&&value.id?.startsWith?.("concept:"))return this.byId.get(value.id)||this.register(value);
      const text=String(value);
      if(text.startsWith("concept:"))return this.byId.get(text)||this.register({id:text,label:text.split(":").at(-1).replaceAll("_"," "),type:text.split(":")[1]});
      const key=norm(text).replace(/ /g,"_");
      const id=this.aliasToId.get(key);
      if(id)return this.byId.get(id)||null;
      return create?this.register(text,type):null;
    }
    alias(alias,target){
      const concept=this.resolve(target);
      if(!concept||!alias)return null;
      const key=norm(alias).replace(/ /g,"_");
      this.aliasToId.set(key,concept.id);
      if(!concept.aliases.includes(alias))concept.aliases.push(alias);
      return concept;
    }
    label(id){return this.byId.get(id)?.label||String(id||"").split(":").at(-1).replaceAll("_"," ");}
    stats(){return {concepts:this.byId.size,aliases:this.aliasToId.size};}
  }

  class IndexedStore{
    constructor(name){this.name=name;this.items=[];this.bySubject=new Map();this.byObject=new Map();this.byPredicate=new Map();}
    _push(map,key,value){if(!key)return;if(!map.has(key))map.set(key,[]);map.get(key).push(value);}
    add(item){
      this.items.push(item);
      this._push(this.bySubject,item.proposition?.subject,item);
      this._push(this.byObject,item.proposition?.object,item);
      this._push(this.byPredicate,item.proposition?.predicate,item);
      return item;
    }
    clear(){this.items=[];this.bySubject.clear();this.byObject.clear();this.byPredicate.clear();}
  }

  class CommonsenseStore extends IndexedStore{
    constructor(registry){super("commonsense");this.registry=registry;this.keys=new Set();}
    ingest(relations=[],meta={}){
      let added=0;
      for(const relation of relations||[]){
        if(!relation||!relation.subject||!relation.predicate||!relation.object)continue;
        const subject=this.registry.resolve(relation.subject);
        const object=this.registry.resolve(relation.object);
        const predicate=slug(relation.predicate);
        const key=`${subject.id}|${predicate}|${object.id}`;
        if(this.keys.has(key))continue;
        this.keys.add(key);
        const provenance=relation.provenance||{};
        const source=provenance.source||meta.sourceType||relation.source||"commonsense";
        const item={
          proposition:{subject:subject.id,predicate,object:object.id},
          source:{type:source,id:provenance.sourceId||relation.sourceId||null},
          confidence:clamp(relation.confidence??.7),
          sourceTrust:SOURCE_TRUST[source]??SOURCE_TRUST.commonsense,
          rawWeight:Number.isFinite(Number(provenance.rawWeight))?Number(provenance.rawWeight):(Number.isFinite(Number(relation.rawWeight))?Number(relation.rawWeight):null),
          domain:relation.domain||null,
          status:"accepted",
          store:this.name
        };
        this.add(item);added++;
      }
      return {added,total:this.items.length};
    }
    relationCandidates(subject,predicate=null){
      const s=this.registry.resolve(subject,{create:false});
      if(!s)return [];
      return (this.bySubject.get(s.id)||[]).filter(x=>!predicate||x.proposition.predicate===slug(predicate));
    }
    queryRelation(subject,predicate,object,{maxDepth=3}={}){
      const s=this.registry.resolve(subject,{create:false})||this.registry.resolve(subject);
      const o=this.registry.resolve(object,{create:false})||this.registry.resolve(object);
      if(!s||!o)return null;
      const p=slug(predicate||"es_un");
      const direct=(this.bySubject.get(s.id)||[]).find(x=>x.proposition.predicate===p&&x.proposition.object===o.id);
      if(direct)return {matched:true,derived:false,confidence:direct.confidence,path:[s.id,o.id],evidence:[direct]};
      if(!ISA.has(p))return null;
      const queue=[{id:s.id,depth:0,confidence:1,path:[s.id],evidence:[]}],seen=new Set([s.id]);
      while(queue.length){
        const cur=queue.shift();
        if(cur.depth>=maxDepth)continue;
        const edges=(this.bySubject.get(cur.id)||[]).filter(x=>ISA.has(x.proposition.predicate));
        for(const edge of edges){
          const next=edge.proposition.object;
          const confidence=clamp(cur.confidence*edge.confidence*.96);
          const path=[...cur.path,next],evidence=[...cur.evidence,edge];
          if(next===o.id)return {matched:true,derived:true,confidence,path,evidence};
          if(!seen.has(next)){seen.add(next);queue.push({id:next,depth:cur.depth+1,confidence,path,evidence});}
        }
      }
      return null;
    }
    retrieve(frame,{limit=16}={}){
      const ids=new Set();
      for(const x of [frame?.subject?.conceptId,frame?.object?.conceptId,...(frame?.references||[]).map(r=>r.conceptId)].filter(Boolean))ids.add(x);
      const out=[];
      for(const id of ids){
        out.push(...(this.bySubject.get(id)||[]),...(this.byObject.get(id)||[]));
      }
      if(frame?.predicate)out.push(...(this.byPredicate.get(slug(frame.predicate))||[]));
      return [...new Map(out.map(x=>[`${x.proposition.subject}|${x.proposition.predicate}|${x.proposition.object}`,x])).values()].slice(0,limit);
    }
  }

  class BeliefStore extends IndexedStore{
    constructor(registry){super("beliefs");this.registry=registry;this.seq=1;}
    addBelief(value){
      if(!value?.proposition)return null;
      const subject=this.registry.resolve(value.proposition.subject||value.proposition.subjectId);
      const object=this.registry.resolve(value.proposition.object||value.proposition.objectId);
      if(!subject||!object)return null;
      const item={
        id:value.id||`belief:${this.seq++}`,
        proposition:{subject:subject.id,predicate:slug(value.proposition.predicate||"related_to"),object:object.id},
        source:value.source||{type:"memory",id:null},
        status:value.status||"reported",
        confidence:clamp(value.confidence??.7),
        sourceTrust:value.sourceTrust??SOURCE_TRUST[value.source?.type]??null,
        time:value.time??0,
        derived:!!value.derived,
        store:this.name
      };
      const existing=this.items.find(x=>x.proposition.subject===item.proposition.subject&&x.proposition.predicate===item.proposition.predicate&&x.proposition.object===item.proposition.object&&x.source?.type===item.source?.type&&x.source?.id===item.source?.id);
      if(existing){existing.confidence=Math.max(existing.confidence,item.confidence);existing.time=Math.max(existing.time,item.time);return existing;}
      return super.add(item);
    }
    retrieve(frame,{limit=20}={}){
      const ids=new Set([frame?.subject?.conceptId,frame?.object?.conceptId,...(frame?.references||[]).map(r=>r.conceptId)].filter(Boolean));
      const out=[];
      for(const id of ids)out.push(...(this.bySubject.get(id)||[]),...(this.byObject.get(id)||[]));
      if(!ids.size&&frame?.intent?.startsWith?.("ask_memory"))out.push(...this.items.slice(-limit));
      return [...new Map(out.map(x=>[x.id,x])).values()].slice(-limit);
    }
  }

  class MemoryStore{
    constructor(registry){this.name="memory";this.registry=registry;}
    retrieve(frame,{brain,beliefs,limit=16}={}){
      const out=[];
      if(beliefs)out.push(...beliefs.retrieve(frame,{limit}));
      const topicIds=new Set([frame?.subject?.conceptId,frame?.object?.conceptId].filter(Boolean));
      const topicLabels=[...topicIds].map(id=>norm(this.registry.label(id)));
      const mem=brain?.mem||[];
      for(const m of mem.slice(-40)){
        const text=String(m.text||"");
        const hit=!topicLabels.length||topicLabels.some(x=>x&&norm(text).includes(x));
        if(!hit)continue;
        out.push({
          proposition:null,
          source:{type:"memory",id:m.id||null},
          text,
          confidence:clamp(m.salience??.55),
          sourceTrust:SOURCE_TRUST.memory,
          time:m.time??brain?.time??0,
          status:"remembered",
          store:this.name
        });
      }
      return out.slice(-limit);
    }
  }

  class FactualKnowledgeStore{
    constructor(registry){this.name="factual";this.registry=registry;}
    retrieve(frame,{knowledge,limit=12}={}){
      const out=[];
      const labels=[frame?.object?.conceptId,frame?.subject?.conceptId].filter(Boolean).map(id=>norm(this.registry.label(id))).filter(Boolean);
      for(const e of knowledge?.encyclopedia||[]){
        const names=[e.title,...(e.aliases||[])].map(norm);
        if(labels.length&&!labels.some(x=>names.includes(x)||names.some(n=>n.includes(x)||x.includes(n))))continue;
        const concept=this.registry.resolve(e.title||labels[0]||"concepto");
        out.push({
          proposition:{subject:concept.id,predicate:"described_as",object:this.registry.resolve(e.id?`descripcion ${e.id}`:`descripcion ${e.title||"concepto"}`,{type:"description"}).id},
          source:{type:e.source?.toLowerCase?.().includes("wikidata")?"wikidata":"factual_local",id:e.id||null},
          text:e.text||null,
          confidence:.86,
          sourceTrust:e.source?.toLowerCase?.().includes("wikidata")?SOURCE_TRUST.wikidata:SOURCE_TRUST.factual_local,
          status:"accepted",
          store:this.name
        });
        if(out.length>=limit)break;
      }
      return out;
    }
  }

  class LexicalStore{
    constructor(registry){this.name="lexical";this.registry=registry;}
    retrieve(frame,{knowledge,limit=10}={}){
      const labels=[frame?.object?.conceptId,frame?.subject?.conceptId].filter(Boolean).map(id=>norm(this.registry.label(id))).filter(Boolean);
      const out=[];
      for(const e of knowledge?.dictionary||[]){
        const names=[e.word,...(e.variants||[])].map(norm);
        if(labels.length&&!labels.some(x=>names.includes(x)))continue;
        const concept=this.registry.resolve(e.word||labels[0]||"palabra");
        out.push({proposition:{subject:concept.id,predicate:"means",object:this.registry.resolve(`sentido ${e.word||"lexico"}`,{type:"meaning"}).id},source:{type:"dictionary",id:e.id||null},text:(e.meanings||[]).join("; "),confidence:.88,sourceTrust:SOURCE_TRUST.dictionary,status:"accepted",store:this.name});
        if(out.length>=limit)break;
      }
      return out;
    }
  }

  class SocialKnowledgeStore{
    constructor(registry){this.name="social";this.registry=registry;}
    retrieve(frame,{knowledge,limit=10}={}){
      const label=norm(this.registry.label(frame?.object?.conceptId||frame?.subject?.conceptId||""));
      const out=[];
      for(const e of knowledge?.socialTopics||[]){
        const hay=norm(`${e.label||""} ${(e.tags||[]).join(" ")} ${(e.relatedTo||[]).join(" ")}`);
        if(label&&!hay.includes(label))continue;
        out.push({proposition:null,source:{type:"social",id:e.id||null},text:e.opinion||e.hook||null,confidence:clamp(e.weight??.55),sourceTrust:SOURCE_TRUST.social,status:"contextual",store:this.name});
        if(out.length>=limit)break;
      }
      return out;
    }
  }

  class ReferenceResolver{
    constructor(registry){this.registry=registry;}
    resolve(text,{brain=null}={}){
      const n=norm(text);
      const refs=[];
      const add=(kind,raw,resolved,source)=>{
        if(!resolved)return;
        const concept=typeof resolved==="string"&&resolved.length<90?this.registry.resolve(resolved):null;
        refs.push({kind,raw,resolved,source,conceptId:concept?.id||null,confidence:source==="discourse-focus"?.9:.78});
      };
      const anaphoric=/\b(eso|esto|esa|ese|lo anterior|eso ultimo|eso último|lo que dije|lo que te dije|mi mensaje|lo de antes|ahorita|hace un momento)\b/.exec(n);
      if(anaphoric){
        const focus=[...(brain?.discourse?.focus||[])].reverse().find(x=>x.kind==="user"||x.kind==="interpretation");
        const previous=brain?.discourse?.previousUser||brain?.dialogue?.lastUser||"";
        add("anaphora",anaphoric[1],focus?.text||previous,focus?"discourse-focus":"previous-user");
      }
      const pronouns=[...n.matchAll(/\b(el|ella|ellos|ellas|este|esta|aquel|aquella)\b/g)];
      for(const match of pronouns.slice(0,2)){
        const entity=brain?.cognition?.lastEntity||brain?.dialogue?.topic||null;
        if(entity)add("pronoun",match[1],entity,"active-entity");
      }
      return refs;
    }
  }

  class QueryFrameBuilder{
    constructor(registry,resolver){this.registry=registry;this.resolver=resolver;}
    build(text,{brain=null,semantic=null}={}){
      const n=norm(text);
      const refs=this.resolver.resolve(text,{brain});
      let intent=semantic?.intent||null;
      let subject=null,predicate=semantic?.predicate?.lemma||null,object=null;
      let m;
      if((m=n.match(/^tengo (.+)$/))){intent=intent||"state_statement";subject={kind:"player"};predicate="has_state";object={conceptId:this.registry.resolve(m[1],{type:"need"}).id};}
      else if((m=n.match(/^(?:yo )?(?:estoy|me siento) (.+)$/))){intent=intent||"state_statement";subject={kind:"player"};predicate="has_state";object={conceptId:this.registry.resolve(m[1],{type:"state"}).id};}
      else if((m=n.match(/^(?:que|qué) te gusta(?:n)?(?: de| sobre)? ?(.+)?$/))){intent="ask_preference";subject={kind:"self"};predicate="likes";if(m[1])object={conceptId:this.registry.resolve(m[1]).id};}
      else if((m=n.match(/^(?:para que sirve|para qué sirve) (.+)$/))){intent=intent||"ask_factual_purpose";subject={conceptId:this.registry.resolve(m[1]).id};predicate="used_for";}
      else if((m=n.match(/^(?:que es|qué es|que son|qué son) (.+)$/))){intent=intent||"ask_definition";subject={conceptId:this.registry.resolve(m[1]).id};predicate="is_a";}
      else if(/[?¿]/.test(text)&&(m=n.match(/^(.+?) (?:es|son) (.+)$/))){intent=intent||"ask_factual_relation";subject={conceptId:this.registry.resolve(m[1]).id};predicate="is_a";object={conceptId:this.registry.resolve(m[2]).id};}
      else if(/\b(que te dije|qué te dije|lo que te dije|recuerdas|recordar)\b/.test(n)){intent=intent||"ask_memory_semantic";subject={kind:"player"};predicate="remembered_statement";}

      if(!subject){
        const topic=semantic?.topic||semantic?.slots?.patient||semantic?.slots?.agent||null;
        if(topic)subject={conceptId:this.registry.resolve(topic).id};
      }
      if(!object&&semantic?.slots?.patient&&(!subject?.conceptId||norm(semantic.slots.patient)!==norm(this.registry.label(subject.conceptId))))object={conceptId:this.registry.resolve(semantic.slots.patient).id};

      const requestedEvidence=this.requestedEvidence(intent,n);
      return {
        intent:intent||(/[?¿]/.test(text)?"question":"statement"),
        speechAct:semantic?.speechType||(/[?¿]/.test(text)?"question":"statement"),
        subject,
        predicate:slug(predicate||"related_to"),
        object,
        references:refs,
        requestedEvidence,
        confidence:clamp(semantic?.confidence??(intent?.startsWith?.("ask_")?.84:.7)),
        source:semantic?.source||"symbolic-frame",
        raw:text
      };
    }
    requestedEvidence(intent,n){
      if(intent==="ask_memory_semantic"||/que te dije|lo anterior|ahorita/.test(n))return ["memory","beliefs"];
      if(intent==="ask_preference")return ["memory","beliefs","social","personality"];
      if(intent==="ask_definition")return ["lexical","factual","commonsense"];
      if(intent==="ask_factual_purpose"||intent==="ask_factual_relation")return ["commonsense","factual"];
      if(intent==="state_statement")return ["memory","commonsense"];
      return ["memory","commonsense","factual","lexical"];
    }
  }

  class ContradictionResolver{
    constructor(registry){
      this.registry=registry;
      this.exclusivePredicates=new Set(["estado","has_state","capital_of","birth_date","located_exactly_at","current_owner"]);
    }
    resolve(candidates=[]){
      const groups=new Map();
      for(const item of candidates){
        const p=item.proposition;if(!p)continue;
        const key=`${p.subject}|${p.predicate}`;
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(item);
      }
      const conflicts=[];
      for(const [key,items] of groups){
        const objects=[...new Set(items.map(x=>x.proposition.object))];
        if(objects.length<2)continue;
        const predicate=items[0].proposition.predicate;
        conflicts.push({key,predicate,kind:this.exclusivePredicates.has(predicate)?"hard-conflict":"competing-claims",objects,items});
      }
      return conflicts;
    }
  }

  class EvidenceRetriever{
    constructor({registry,commonsense,memory,factual,lexical,social,contradictions}){
      this.registry=registry;this.commonsense=commonsense;this.memory=memory;this.factual=factual;this.lexical=lexical;this.social=social;this.contradictions=contradictions;
    }
    retrieve(frame,ctx={}){
      const requested=new Set(frame?.requestedEvidence||[]),candidates=[];
      if(requested.has("memory")||requested.has("beliefs"))candidates.push(...this.memory.retrieve(frame,ctx));
      if(requested.has("commonsense"))candidates.push(...this.commonsense.retrieve(frame,ctx));
      if(requested.has("factual"))candidates.push(...this.factual.retrieve(frame,ctx));
      if(requested.has("lexical"))candidates.push(...this.lexical.retrieve(frame,ctx));
      if(requested.has("social"))candidates.push(...this.social.retrieve(frame,ctx));
      const ranked=candidates.map(x=>this.score(x,frame,ctx)).sort((a,b)=>b.score-a.score).slice(0,24);
      const conflicts=this.contradictions.resolve(ranked);
      return {candidates:ranked,accepted:ranked.filter(x=>x.score>=.42&&!this.isRejectedByConflict(x,conflicts)).slice(0,10),conflicts};
    }
    score(item,frame,ctx){
      const ids=new Set([frame?.subject?.conceptId,frame?.object?.conceptId,...(frame?.references||[]).map(r=>r.conceptId)].filter(Boolean));
      const p=item.proposition;
      let relevance=.28;
      if(p&&ids.has(p.subject))relevance+=.28;
      if(p&&ids.has(p.object))relevance+=.22;
      if(p&&frame?.predicate&&p.predicate===frame.predicate)relevance+=.18;
      if(!p&&item.text&&[...ids].some(id=>norm(item.text).includes(norm(this.registry.label(id)))))relevance+=.25;
      relevance=clamp(relevance);
      const confidence=clamp(item.confidence??.6);
      const sourceTrust=item.sourceTrust==null?.5:clamp(item.sourceTrust);
      const age=Math.max(0,nowTurn(ctx)-Number(item.time??nowTurn(ctx)));
      const recency=item.time==null?.5:clamp(1-age/100);
      const personalRelevance=["beliefs","memory"].includes(item.store)?1:.35;
      const score=clamp(relevance*.42+confidence*.24+sourceTrust*.18+recency*.06+personalRelevance*.10);
      return {...item,relevance,recency,personalRelevance,score};
    }
    isRejectedByConflict(item,conflicts){
      for(const conflict of conflicts){
        if(conflict.kind!=="hard-conflict"||!item.proposition)continue;
        if(!conflict.items.includes(item))continue;
        const best=[...conflict.items].sort((a,b)=>(b.sourceTrust??.5)-(a.sourceTrust??.5)||b.confidence-a.confidence)[0];
        if(best!==item&&(best.sourceTrust??.5)>(item.sourceTrust??.5)+.15)return true;
      }
      return false;
    }
  }

  function createArchitecture(){
    const registry=new ConceptRegistry();
    const commonsense=new CommonsenseStore(registry);
    const resolver=new ReferenceResolver(registry);
    const frameBuilder=new QueryFrameBuilder(registry,resolver);
    const memory=new MemoryStore(registry);
    const factual=new FactualKnowledgeStore(registry);
    const lexical=new LexicalStore(registry);
    const social=new SocialKnowledgeStore(registry);
    const contradictions=new ContradictionResolver(registry);
    const retriever=new EvidenceRetriever({registry,commonsense,memory,factual,lexical,social,contradictions});
    return {registry,commonsense,resolver,frameBuilder,memory,factual,lexical,social,contradictions,retriever};
  }

  return {
    norm,slug,clamp,inferType,SOURCE_TRUST,
    ConceptRegistry,CommonsenseStore,BeliefStore,MemoryStore,FactualKnowledgeStore,LexicalStore,SocialKnowledgeStore,
    ReferenceResolver,QueryFrameBuilder,ContradictionResolver,EvidenceRetriever,createArchitecture
  };
});
