"use strict";

(function(){
  const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9ñ ]+/g," ").replace(/\s+/g," ").trim();

  // ReferenceResolver y QueryFrame pertenecen a la frontera lenguaje→planificación,
  // no al ciclo mental general. Si se registraron provisionalmente como stages,
  // los retiramos del dispatcher y los ejecutamos aquí, después de toda la cadena
  // cognitiva previa y justo antes de ResponsePlanner.
  const pipeline=window.NpcIntPipeline;
  if(pipeline?.state?.stages?.hear&&pipeline?.unregister){
    const ids=pipeline.state.stages.hear
      .filter(x=>x.name==="reference-resolver"||x.name==="query-frame")
      .map(x=>x.id);
    for(const id of ids)pipeline.unregister(id);
  }

  function buildSemanticFrame(b,text){
    const refsApi=window.NpcIntReferenceResolver;
    const frameApi=window.NpcIntQueryFrame;
    if(refsApi?.resolve&&refsApi?.record){
      const previous=b.referenceResolver?.last;
      if(!previous||norm(previous.input)!==norm(text))refsApi.record(b,refsApi.resolve(text,b));
    }
    if(frameApi?.build&&frameApi?.record){
      const previous=b.queryFrame?.current;
      if(!previous||norm(previous.input)!==norm(text))frameApi.record(b,frameApi.build(text,b));
    }
    return b.queryFrame?.current||null;
  }

  const oldReset=NpcBrain.prototype.reset;
  NpcBrain.prototype.reset=function(){
    oldReset.call(this);
    this.referenceResolver=null;
    this.queryFrame=null;
    window.NpcIntReferenceResolver?.ensure?.(this);
    window.NpcIntQueryFrame?.ensure?.(this);
  };

  const oldHear=NpcBrain.prototype.hear;
  NpcBrain.prototype.hear=function(text){
    const result=oldHear.call(this,text);
    const finish=answer=>{
      buildSemanticFrame(this,String(text||""));
      return answer;
    };
    return result&&typeof result.then==="function"?result.then(finish):finish(result);
  };

  window.NpcIntSemanticFrameBridge={buildSemanticFrame};
  buildSemanticFrame(brain,brain.dialogue?.lastUser||"");
  print("system","","semantic frame bridge v1.0 cargado · comprensión → referencias → QueryFrame → ResponsePlanner");
})();
