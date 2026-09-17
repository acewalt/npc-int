"use strict";

(function(){
  const button=document.getElementById("copyChat");
  const terminal=document.getElementById("terminal");
  if(!button||!terminal)return;

  const label=button.querySelector(".copy-chat-label");
  const defaultLabelMarkup=label?.innerHTML||"Copiar";
  let feedbackTimer=null;

  function lineText(line){
    const clone=line.cloneNode(true);
    const prefix=clone.querySelector(".prefix");
    const lead=prefix?.textContent?.trim()||"";
    if(prefix)prefix.remove();
    const body=(clone.textContent||"").replace(/\u00a0/g," ").trim();
    return [lead,body].filter(Boolean).join(" ");
  }

  function serializeChat(){
    return [...terminal.querySelectorAll(".line")]
      .map(lineText)
      .filter(Boolean)
      .join("\n\n");
  }

  function legacyCopy(text){
    const area=document.createElement("textarea");
    area.value=text;
    area.setAttribute("readonly","");
    area.style.position="fixed";
    area.style.left="-9999px";
    area.style.top="0";
    area.style.opacity="0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0,area.value.length);
    let ok=false;
    try{ok=document.execCommand("copy");}catch(_){ok=false;}
    area.remove();
    return ok;
  }

  async function copyText(text){
    if(navigator.clipboard?.writeText && window.isSecureContext){
      await navigator.clipboard.writeText(text);
      return true;
    }
    return legacyCopy(text);
  }

  function feedback(text,state="idle"){
    if(label)label.textContent=text;
    button.dataset.state=state;
    button.setAttribute("aria-label",text);
    if(feedbackTimer)clearTimeout(feedbackTimer);
    feedbackTimer=setTimeout(()=>{
      if(label)label.innerHTML=defaultLabelMarkup;
      button.dataset.state="idle";
      button.setAttribute("aria-label","Copiar todo el chat");
    },1600);
  }

  button.addEventListener("click",async event=>{
    event.preventDefault();
    event.stopPropagation();
    const text=serializeChat();
    if(!text){feedback("Sin chat","empty");return;}
    try{
      const ok=await copyText(text);
      feedback(ok?"Copiado":"No se pudo",ok?"success":"error");
    }catch(err){
      console.warn("No se pudo copiar el chat",err);
      feedback("No se pudo","error");
    }
  });

  window.NpcIntCopyChat=Object.freeze({serializeChat});
})();
