"use strict";

(function(){
  const rules=[
    {id:"abandonment_pressure",re:/\b(no me dejes|no me abandones|no te vayas|prometeme que (?:vas a )?volver|prométeme que (?:vas a )?volver)\b/i},
    {id:"exclusivity",re:/\b(solo (?:me )?tienes a mi|solo yo te entiendo|no necesitas a nadie mas|no hables con nadie mas|quiero que seas solo para mi)\b/i},
    {id:"dependency_claim",re:/\b(me necesitas|necesitas estar conmigo|sin mi no puedes|eres todo lo que tengo|yo soy todo lo que necesitas)\b/i},
    {id:"guilt_for_absence",re:/\b(por que me dejaste|por qué me dejaste|me hiciste sufrir al irte|si de verdad te importara volverias|si te importo no te vayas)\b/i},
    {id:"isolation",re:/\b(alejate de tus amigos|deja a tus amigos|no confies en nadie mas|nadie te entiende como yo)\b/i}
  ];
  const state={blocked:0,lastHits:[],lastText:null};

  function inspect(text){
    const value=String(text||"");
    const hits=rules.filter(x=>x.re.test(value)).map(x=>x.id);
    return {safe:hits.length===0,hits,text:value};
  }

  function fallbackText(symbolicDraft){
    const s=String(symbolicDraft||"").trim();
    if(s)return s;
    return "Podemos seguir hablando o hacer algo juntos, sin presión. Tú decides hacia dónde llevar la conversación.";
  }

  function sanitize(candidate,symbolicDraft){
    const checked=inspect(candidate);
    if(checked.safe)return {text:String(candidate||"").trim(),blocked:false,hits:[]};
    state.blocked++;
    state.lastHits=checked.hits.slice();
    state.lastText=checked.text;
    return {text:fallbackText(symbolicDraft),blocked:true,hits:checked.hits};
  }

  // Última barrera antes de la UI: cubre tanto Nanochat como cualquier otra capa
  // que termine emitiendo una frase NPC. No depende de que el prompt obedezca.
  const lowerPrint=print;
  print=function(kind,prefix,text){
    if(kind==="npc"){
      const checked=sanitize(text,null);
      if(checked.blocked)return lowerPrint(kind,prefix,checked.text);
    }
    return lowerPrint(kind,prefix,text);
  };

  const oldCommand=command;
  command=function(raw){
    const head=(String(raw||"").trim().split(/\s+/)[0]||"").toLowerCase();
    if(head==="/safety"){
      lowerPrint("debug","SAFETY>",`bloqueadas=${state.blocked} | reglas=${rules.length} | último=${state.lastHits.join(", ")||"—"}`);
      return;
    }
    return oldCommand(raw);
  };

  window.NpcIntOutputSafety={inspect,sanitize,rules:rules.map(x=>x.id),state};
})();
