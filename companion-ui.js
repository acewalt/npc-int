"use strict";

(function(){
  const originalPrint=print;
  const technicalLog=[];
  let technicalVisible=false;

  function isTechnical(kind,prefix,text){
    if(kind!=="system"||prefix)return false;
    const s=String(text||"").toLowerCase();
    return /cargad[oa]|puente |tokenizer|intérprete|interprete|gramática|gramatica|razonamiento v|conocimiento v|estado cognitivo|modelo de sí|modelo de si|gestor de |motor local iniciado|cognitive terminal|relación social|relacion social|memoria social|personalidad v|pendientes v|timing social|iniciativa social|persistencia social|companion engine/.test(s);
  }

  print=function(kind,prefix,text){
    if(isTechnical(kind,prefix,text)){
      technicalLog.push({kind,prefix,text:String(text||""),time:Date.now()});
      if(!technicalVisible)return;
    }
    return originalPrint(kind,prefix,text);
  };

  function renderModules(){
    if(!technicalLog.length){originalPrint("debug","MODULES>","Todavía no se registraron mensajes técnicos de arranque.");return;}
    originalPrint("debug","MODULES>",technicalLog.map((x,i)=>`${i+1}. ${x.text}`).join("\n"));
  }

  function bindForgetButton(){
    const button=document.getElementById("companionForget");
    if(!button||button.dataset.bound==="1")return;
    button.dataset.bound="1";
    button.addEventListener("click",()=>{
      button.disabled=true;
      try{
        command("/companion forget");
        button.dataset.state="done";
        const label=button.querySelector(".companion-forget-label");
        if(label)label.textContent="BORRADO";
        window.setTimeout(()=>{
          button.dataset.state="";
          button.disabled=false;
          if(label)label.textContent="FORGET";
        },900);
      }catch(err){
        button.dataset.state="error";
        button.disabled=false;
        originalPrint("error","FORGET>",String(err?.message||err));
      }
    });
  }

  const oldCommand=command;
  command=function(raw){
    const head=(String(raw||"").trim().split(/\s+/)[0]||"").toLowerCase();
    if(head==="/modules"||head==="/bootlog"){
      renderModules();
      return;
    }
    if(head==="/technical"){
      const arg=String(raw||"").trim().split(/\s+/)[1]||"status";
      if(arg==="on"){technicalVisible=true;originalPrint("system","","mensajes técnicos visibles a partir de ahora");return;}
      if(arg==="off"){technicalVisible=false;originalPrint("system","","mensajes técnicos de módulos ocultos");return;}
      originalPrint("debug","TECHNICAL>",`visible=${technicalVisible?"sí":"no"} · registros=${technicalLog.length}`);
      return;
    }
    return oldCommand(raw);
  };

  // app.js arranca antes que el resto de módulos. Sustituimos esa presentación
  // de consola por una entrada conversacional, sin eliminar el diagnóstico.
  if(typeof terminal!=="undefined"&&terminal){
    terminal.innerHTML="";
    originalPrint("npc",brain.identity.name+">","Hola. Estoy aquí. Podemos hablar, pensar algo juntos o simplemente ir viendo qué surge.");
    originalPrint("system","","/help para comandos · /modules para diagnóstico técnico");
  }

  bindForgetButton();
  window.NpcIntCompanionUi={technicalLog,renderModules,bindForgetButton,get technicalVisible(){return technicalVisible;}};
})();