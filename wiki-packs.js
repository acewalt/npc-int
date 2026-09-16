"use strict";

(function(){
  const WNorm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const WStop=new Set(["que","qué","es","son","un","una","el","la","los","las","de","del","y","o","en","para","por","como","cómo","me","dime","explica","define","significa","sobre","quien","quién","donde","dónde"]);
  const WTokens=s=>WNorm(s).split(" ").filter(w=>w.length>2&&!WStop.has(w));

  class WikiPackStore{
    constructor(){
      this.manifest=null;
      this.topicMap=null;
      this.ready=false;
      this.indexCache=new Map();
      this.shardCache=new Map();
      this.loading=null;
    }

    async load(){
      if(this.loading)return this.loading;
      this.loading=(async()=>{
        try{
          const [manifest,topicMap]=await Promise.all([
            fetch("knowledge/wiki/manifest.json",{cache:"no-cache"}).then(r=>{if(!r.ok)throw new Error("no wiki packs");return r.json();}),
            fetch("knowledge/topic-map.es.json",{cache:"no-cache"}).then(r=>r.json())
          ]);
          this.manifest=manifest;
          this.topicMap=topicMap;
          this.ready=true;
          print("system","",`Wikipedia local cargada · ${manifest.actual_mib||"?"} MiB · ${manifest.articles||0} artículos · ${Object.keys(manifest.topics||{}).length} temas`);
        }catch(err){
          this.ready=false;
          console.info("Wikipedia local packs not present yet",err);
        }
      })();
      return this.loading;
    }

    routeTopics(query){
      if(!this.ready)return [];
      const q=WNorm(query);
      const tokens=WTokens(query);
      const scores=[];
      for(const [key,cfg] of Object.entries(this.topicMap?.topics||{})){
        if(!this.manifest.topics?.[key])continue;
        let score=0;
        for(const kw0 of cfg.keywords||[]){
          const kw=WNorm(kw0);
          if(!kw)continue;
          if(q.includes(kw))score+=kw.includes(" ")?9:6;
          else if(tokens.includes(kw))score+=4;
        }
        scores.push({key,score});
      }
      scores.sort((a,b)=>b.score-a.score);
      const positive=scores.filter(x=>x.score>0).slice(0,2);
      if(positive.length)return positive.map(x=>x.key);
      const fallbacks=[];
      if(this.manifest.topics?.otros)fallbacks.push("otros");
      for(const x of scores.slice(0,1))if(!fallbacks.includes(x.key))fallbacks.push(x.key);
      return fallbacks;
    }

    async loadTopicIndex(topic){
      if(this.indexCache.has(topic))return this.indexCache.get(topic);
      const cfg=this.manifest?.topics?.[topic];
      if(!cfg)return [];
      const all=[];
      for(const f of cfg.files||[]){
        const path=`knowledge/wiki/${f.index}`;
        const rows=await fetch(path).then(r=>{if(!r.ok)throw new Error(`index HTTP ${r.status}`);return r.json();});
        for(const row of rows)all.push({...row,_topic:topic,_data:f.data});
      }
      this.indexCache.set(topic,all);
      return all;
    }

    score(query,row){
      const q=WNorm(query);
      const title=WNorm(row.title||"");
      const qt=WTokens(query);
      const terms=(row.terms||[]).map(WNorm);
      let s=0;
      if(title===q)s+=100;
      if(q.includes(title)&&title.length>3)s+=32;
      if(title.includes(q)&&q.length>3)s+=26;
      const titleTokens=WTokens(title);
      for(const t of qt){
        if(titleTokens.includes(t))s+=10;
        if(terms.includes(t))s+=4;
      }
      return s;
    }

    async loadShard(dataPath){
      if(this.shardCache.has(dataPath))return this.shardCache.get(dataPath);
      const rows=await fetch(`knowledge/wiki/${dataPath}`).then(r=>{if(!r.ok)throw new Error(`shard HTTP ${r.status}`);return r.json();});
      this.shardCache.set(dataPath,rows);
      // Mantener una caché pequeña en móviles.
      while(this.shardCache.size>5){
        const first=this.shardCache.keys().next().value;
        this.shardCache.delete(first);
      }
      return rows;
    }

    async search(query){
      if(!this.ready)return null;
      const topics=this.routeTopics(query);
      let best=null;
      for(const topic of topics){
        const index=await this.loadTopicIndex(topic);
        for(const row of index){
          const score=this.score(query,row);
          if(!best||score>best.score)best={row,score};
        }
      }
      if(!best||best.score<8)return null;
      const shard=await this.loadShard(best.row._data);
      const hit=shard.find(x=>x.id===best.row.id);
      if(!hit)return null;
      return {
        kind:"wikipedia-local",
        title:hit.title,
        text:hit.text,
        confidence:Math.min(.98,.55+best.score/100),
        source:`Wikipedia local/${hit.topic}: ${hit.title}`,
        topic:hit.topic,
        chunk:hit.chunk
      };
    }

    stats(){
      return {
        ready:this.ready,
        mib:this.manifest?.actual_mib||0,
        articles:this.manifest?.articles||0,
        chunks:this.manifest?.chunks||0,
        topics:Object.keys(this.manifest?.topics||{}).length,
        loadedIndexes:this.indexCache.size,
        loadedShards:this.shardCache.size
      };
    }
  }

  const store=new WikiPackStore();
  globalThis.npcWikiPacks=store;
  store.load();
})();
