"use strict";

(function(){
  const service={enabled:false,endpoint:"http://127.0.0.1:8766",ready:false,backend:null,model:null,lastError:null,checking:false};

  function ensureBrain(b){
    if(b.nlp)return b.nlp;
    b.nlp={lastAnalysis:null,lastSemantic:null,lastText:null,history:[],service};
    return b.nlp;
  }

  async function health(silent=false){
    if(service.checking)return service.ready;
    service.checking=true;
    try{
      const r=await fetch(service.endpoint+"/health",{cache:"no-store"});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      service.ready=!!d.ok&&!!d.ready;
      service.backend=d.backend||null;
      service.model=d.model||null;
      service.lastError=d.fallbackReason||null;
      if(!silent)print("system","NLP>",`bridge disponible · backend=${service.backend||"—"} · model=${service.model||"—"}`);
      return service.ready;
    }catch(err){
      service.ready=false;service.backend=null;service.model=null;service.lastError=String(err?.message||err);
      if(!silent)print("error","NLP>",`bridge no disponible en ${service.endpoint} · ${service.lastError}`);
      return false;
    }finally{service.checking=false;}
  }

  async function analyze(text){
    if(!service.ready){const ok=await health(true);if(!ok)return null;}
    try{
      const r=await fetch(service.endpoint+"/v1/analyze",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text})
      });
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      if(!d.ok)throw new Error(d.error||"análisis NLP inválido");
      service.backend=d.backend||service.backend;service.model=d.model||service.model;service.lastError=null;
      return d;
    }catch(err){service.ready=false;service.lastError=String(err?.message||err);return null;}
  }

  function summarize(a){
    if(!a)return "Sin análisis.";
    const lines=[`backend=${a.backend||"—"} | model=${a.model||"—"} | ${a.elapsedMs??"?"} ms`];
    for(const s of a.sentences||[]){
      lines.push(`\nORACIÓN ${Number(s.id)+1}: ${s.text}`);
      for(const t of s.tokens||[]){
        const feats=Object.entries(t.feats||{}).map(([k,v])=>`${k}=${v}`).join("|");
        lines.push(`${t.id}. ${t.text} → ${t.lemma||"—"} | ${t.upos||"—"} | head=${t.head??"—"}/${t.deprel||"—"}${feats?` | ${feats}`:""}${t.ner?` | NER=${t.ner}`:""}`);
      }
      const f=s.semanticFrame;
      if(f)lines.push(`FRAME: ${f.speechType} | pred=${f.predicate?.lemma||"—"} | neg=${f.negated?"sí":"no"} | roles=${(f.roles||[]).map(r=>`${r.role}:${r.text}`).join(", ")||"—"}`);
    }
    if((a.entities||[]).length)lines.push(`\nENTIDADES: ${a.entities.map(e=>`${e.text}:${e.type}`).join(" | ")}`);
    if((a.coreferences||[]).length)lines.push(`COREFERENCIAS: ${a.coreferences.map(c=>`${c.mention}→${c.antecedent}(${Math.round((c.confidence||0)*100)}%)`).join(" | ")}`);
    return lines.join("\n");
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){oldReset.call(this);this.nlp=null;ensureBrain(this);};

  // Async pre-analysis. All previously installed cognitive layers run only after
  // the neural/heuristic linguistic representation is available on this.nlp.
  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    ensureBrain(this);
    if(!service.enabled)return oldHear.call(this,text);
    const self=this;
    return analyze(text).then(a=>{
      if(a){
        self.nlp.lastAnalysis=a;self.nlp.lastText=text;
        try{self.nlp.lastSemantic=window.NpcIntSemanticInterpreter?.interpret?.(text,a,self)||null;}catch(_){self.nlp.lastSemantic=null;}
        self.nlp.history.push({text,analysis:a,semantic:self.nlp.lastSemantic,time:self.time||0});
        if(self.nlp.history.length>20)self.nlp.history.shift();
        if(Array.isArray(self.lastThoughts)&&self.nlp.lastSemantic){
          self.lastThoughts.unshift(`NLP: ${a.backend}; acto=${self.nlp.lastSemantic.intent||"no resuelto"}; pred=${self.nlp.lastSemantic.predicate?.lemma||"—"}`);
        }
      }
      return oldHear.call(self,text);
    });
  };

  // Base app.js assumes hear() is synchronous. Replace send so NLP mode can await it.
  const previousSend=send;
  send=async function(text){
    text=(text||"").trim();
    if(!text)return;
    if(!service.enabled){previousSend(text);return;}
    if(text.startsWith("/")){command(text);return;}
    print("user",brain.relation.name+">",text);
    let reply=brain.hear(text);
    if(reply&&typeof reply.then==="function")reply=await reply;
    if(service.lastError&&!service.ready)print("system","NLP>",`fallback lingüístico local · ${service.lastError}`);
    if(reply)window.setTimeout(()=>print("npc",brain.identity.name+">",reply),120);
  };

  const oldCommand=command;
  command=function(raw){
    const parts=raw.trim().split(/\s+/);const head=(parts.shift()||"").toLowerCase();
    if(head!=="/nlp")return oldCommand(raw);
    const sub=(parts.shift()||"status").toLowerCase();
    if(sub==="on"){service.enabled=true;print("system","NLP>","análisis NLP activado; comprobando bridge local...");health(false);return;}
    if(sub==="off"){service.enabled=false;print("system","NLP>","análisis NLP local desactivado; se mantiene el tokenizer JS de fallback.");return;}
    if(sub==="check"){health(false);return;}
    if(sub==="status"){print("debug","NLP>",`enabled=${service.enabled} | ready=${service.ready} | endpoint=${service.endpoint} | backend=${service.backend||"—"} | model=${service.model||"—"} | error=${service.lastError||"—"}`);return;}
    if(sub==="endpoint"){
      const value=parts.join(" ").trim().replace(/\/$/,"");
      if(!/^https?:\/\//i.test(value)){print("error","NLP>","Uso: /nlp endpoint http://127.0.0.1:8766");return;}
      service.endpoint=value;service.ready=false;print("system","NLP>",`endpoint=${value}`);return;
    }
    if(sub==="analyze"||sub==="analizar"){
      const text=parts.join(" ").trim();if(!text){print("error","NLP>","Uso: /nlp analyze <texto>");return;}
      analyze(text).then(a=>print(a?"debug":"error","NLP>",a?summarize(a):`falló el análisis: ${service.lastError||"desconocido"}`));return;
    }
    if(sub==="last"){
      const n=ensureBrain(brain);print("debug","NLP>",summarize(n.lastAnalysis));return;
    }
    print("error","NLP>","Uso: /nlp on|off|status|check|last|endpoint <url>|analyze <texto>");
  };

  ensureBrain(brain);
  window.NpcIntNlpWeb={service,health,analyze,summarize};
  print("system","","puente NLP v1.0 cargado · /nlp on para Stanza local · fallback tokenizer JS siempre disponible");
})();
