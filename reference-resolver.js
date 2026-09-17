"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();
  const META=/^(hola|buenas|hey|vale|ok|okay|gracias|aja|si|no|mm+|hmm+|entonces|dime|aja dime|si dime|dale|dale dime)$/;

  function ensure(b){
    if(b.referenceResolver)return b.referenceResolver;
    b.referenceResolver={version:1,last:null,history:[],seq:1};
    return b.referenceResolver;
  }

  function dialogueText(value){
    const s=String(value||"").trim();
    const i=s.indexOf(":");
    return i>=0?s.slice(i+1).trim():s;
  }

  function candidates(b,current){
    const ncur=norm(current),out=[];
    const add=(text,source,id,time=0,kind="user-turn")=>{
      text=dialogueText(text);
      const n=norm(text);
      if(!n||n===ncur||META.test(n))return;
      if(out.some(x=>norm(x.text)===n))return;
      out.push({id,source,kind,text,time});
    };

    const focus=b.discourse?.focus||[];
    for(let i=focus.length-1;i>=0;i--){
      const x=focus[i];
      if(x?.kind==="user")add(x.text,"discourse",`focus:${i}`,x.time||0,"discourse-focus");
    }
    add(b.discourse?.previousUser,"discourse","previous-user",b.time||0);
    add(b.companionState?.lastUserText,"companion-state","last-user",b.time||0);

    const mem=b.mem||[];
    for(let i=mem.length-1;i>=0&&out.length<12;i--){
      const m=mem[i];
      if(m?.type==="dialogue")add(m.text,"memory",`memory:${i}`,m.time||0,"episodic-turn");
    }
    return out.slice(0,12);
  }

  function explicitKind(n){
    if(/\b(lo que te dije|lo que dije|eso que te dije)(?: ahorita| ahora| antes)?\b/.test(n))return "prior-user-utterance";
    if(/\b(lo anterior|lo de antes|eso anterior|eso de antes)\b/.test(n))return "prior-context";
    if(/^(eso|esto|aquello)$/.test(n)||/\b(?:sobre|de|con) eso\b/.test(n))return "deictic";
    if(/\b(ahorita|hace un momento|reci[eé]n)\b/.test(n))return "recent-turn";
    return null;
  }

  function resolve(text,b){
    const s=ensure(b),raw=String(text||"").trim(),n=norm(raw),pool=candidates(b,raw);
    const kind=explicitKind(n);
    const refs=[];

    if(kind&&pool[0]){
      refs.push({
        id:`ref:${s.seq++}`,
        kind,
        mention:raw,
        target:{...pool[0]},
        confidence:kind==="prior-user-utterance"?.96:kind==="prior-context"?.9:.82
      });
    }else if(/^(aja|si|dale)(?: dime)?$/.test(n)&&s.last?.references?.length){
      const prior=s.last.references[0];
      refs.push({
        id:`ref:${s.seq++}`,
        kind:"continuation",
        mention:raw,
        target:{...prior.target},
        confidence:Math.min(.9,(prior.confidence||.8)+.02)
      });
    }

    return {
      input:raw,
      references:refs,
      candidates:pool.slice(0,5),
      resolved:refs.length>0,
      primary:refs[0]?.target||null
    };
  }

  function record(b,result){
    const s=ensure(b);
    s.last=result;
    s.history.push({...result,time:b.time||0});
    if(s.history.length>30)s.history.shift();
    if(result.references.length&&Array.isArray(b.lastThoughts)){
      const r=result.references[0];
      b.lastThoughts.push(`REFERENCIA SEMÁNTICA: ${r.kind} → «${r.target.text}» (${Math.round(r.confidence*100)}%)`);
    }
    return result;
  }

  function format(result){
    if(!result)return "Todavía no hay resolución de referencias.";
    const lines=[`entrada=${result.input||"—"}`,`resueltas=${result.references.length}`];
    for(const r of result.references)lines.push(`${r.id} ${r.kind}: «${r.mention}» → «${r.target.text}» | ${Math.round(r.confidence*100)}% | ${r.target.source}`);
    if(!result.references.length)lines.push("referencia primaria=—");
    if(result.candidates.length)lines.push(`candidatos=${result.candidates.map(x=>`«${x.text}»`).join(" | ")}`);
    return lines.join("\n");
  }

  const pipeline=window.NpcIntPipeline;
  if(pipeline?.register){
    pipeline.register("hear","reference-resolver",ctx=>{
      const input=String(ctx.args?.[0]||"");
      record(ctx.brain,resolve(input,ctx.brain));
    },{phase:"after",priority:820});
  }

  const oldCommand=command;
  command=function(raw){
    const head=(String(raw||"").trim().split(/\s+/)[0]||"").toLowerCase();
    if(head!=="/references"&&head!=="/refs")return oldCommand(raw);
    print("debug","REFERENCES>",format(ensure(brain).last));
  };

  ensure(brain);
  window.NpcIntReferenceResolver={ensure,candidates,resolve,record,format,norm};
  print("system","","resolutor de referencias v1.0 cargado · deícticos + turnos recientes + continuidad explícita");
})();
