"use strict";

(function(){
  const KEY="npc-int.companion.v1";
  function available(){try{return typeof localStorage!=="undefined";}catch(_){return false;}}
  function payload(b){
    return {
      version:1,savedAt:Date.now(),
      relationship:window.NpcIntRelationship?.snapshot?.(b)||null,
      socialMemory:window.NpcIntSocialMemory?.snapshot?.(b)||null,
      personality:window.NpcIntPersonality?.snapshot?.(b)||null,
      topics:window.NpcIntTopics?.snapshot?.(b)||null,
      pending:window.NpcIntPending?.snapshot?.(b)||null,
      initiative:window.NpcIntInitiative?.snapshot?.(b)||null
    };
  }
  function save(b){if(!available())return {ok:false,error:"localStorage no disponible"};try{const data=payload(b);localStorage.setItem(KEY,JSON.stringify(data));return {ok:true,data};}catch(err){return {ok:false,error:String(err?.message||err)};}}
  function load(b){
    if(!available())return {ok:false,error:"localStorage no disponible"};
    try{const raw=localStorage.getItem(KEY);if(!raw)return {ok:false,error:"sin estado guardado"};const d=JSON.parse(raw);if(d.version!==1)return {ok:false,error:"versión incompatible"};
      window.NpcIntRelationship?.restore?.(b,d.relationship);
      window.NpcIntSocialMemory?.restore?.(b,d.socialMemory);
      window.NpcIntPersonality?.restore?.(b,d.personality);
      window.NpcIntTopics?.restore?.(b,d.topics);
      window.NpcIntPending?.restore?.(b,d.pending);
      window.NpcIntInitiative?.restore?.(b,d.initiative);
      if(b.companionState)b.companionState.loadedFromStorage=true;
      return {ok:true,data:d};
    }catch(err){return {ok:false,error:String(err?.message||err)};}
  }
  function clear(b){if(available())try{localStorage.removeItem(KEY);}catch(_){ }window.NpcIntSocialMemory?.clear?.(b);window.NpcIntInitiative?.clear?.(b);return {ok:true};}
  function inspect(){if(!available())return null;try{const raw=localStorage.getItem(KEY);return raw?JSON.parse(raw):null;}catch(_){return null;}}
  window.NpcIntCompanionPersistence={KEY,available,payload,save,load,clear,inspect};
  print("system","","persistencia social v1.0 cargada · memoria seleccionada en localStorage");
})();
