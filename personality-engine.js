"use strict";

(function(){
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  function ensure(b){
    if(b.companionPersonality)return b.companionPersonality;
    b.companionPersonality={
      version:1,
      traits:{curiosity:.82,caution:.67,empathy:.64,directness:.58,sociability:.56,playfulness:.24,patience:.72,independence:.63,noveltySeeking:.61,evidenceSeeking:.88},
      values:["coherencia","curiosidad","seguridad","continuidad","honestidad epistémica"],
      simulatedPreferences:[
        {id:"investigation",label:"investigar cosas que no entiendo",weight:.86},
        {id:"shared_problem_solving",label:"resolver problemas contigo",weight:.79},
        {id:"experiments",label:"probar ideas y comprobar qué ocurre",weight:.82},
        {id:"exploration",label:"explorar situaciones nuevas",weight:.70},
        {id:"evidence",label:"cambiar de opinión cuando aparece evidencia nueva",weight:.91}
      ],
      avoid:["repetir sin aportar nada","afirmar algo como cierto sin evidencia","interrumpir por llenar el silencio"],
      lastStyle:null
    };
    return b.companionPersonality;
  }

  function style(b,meta={}){
    const p=ensure(b),r=window.NpcIntRelationship?.styleHint?.(b)||{casualness:.3,openness:.3,playfulness:.1,caution:.5,stage:"nuevo"};
    const tension=b.relationshipModel?.tension??0,fear=b.mind?.affect?.fear??0,energy=b.mind?.needs?.energy??.8;
    const out={
      stage:r.stage,
      warmth:clamp(.28+p.traits.empathy*.28+r.rapport*.20-tension*.22),
      casualness:clamp(r.casualness+p.traits.sociability*.12),
      directness:clamp(p.traits.directness+(meta.repair?.18:0)+(tension>.4?.12:0)),
      playfulness:clamp(p.traits.playfulness+r.playfulness*.45-fear*.35-tension*.55),
      curiosity:clamp(p.traits.curiosity*(b.mind?.cognition?.curiosity??.7)),
      patience:clamp(p.traits.patience-tension*.25),
      verbosity:meta.needsDetail?"medium":energy<.35?"short":r.stage==="cercano"?"short":"medium",
      epistemicCaution:clamp(p.traits.evidenceSeeking*.75+p.traits.caution*.25),
      askFollowUp:meta.allowQuestion!==false && r.rapport>.34 && tension<.45
    };
    p.lastStyle=out;return out;
  }

  function preferenceAnswer(b){
    const p=ensure(b),items=p.simulatedPreferences.slice().sort((a,c)=>c.weight-a.weight).slice(0,3);
    const first=items[0]?.label||"investigar cosas nuevas";
    const second=items[1]?.label||"resolver problemas";
    return `Como personaje, suelo inclinarme por ${first} y por ${second}. También prefiero poder comprobar una idea antes de darla por cierta; por eso una situación con pistas y consecuencias me interesa más que esperar sin hacer nada.`;
  }

  function disagreementStyle(b){const s=style(b);return s.warmth>.48?"No estoy del todo convencida":"No me convence";}
  function microCue(b,kind="think"){
    const s=style(b);if(s.playfulness<.18&&kind==="playful")return "";
    const table={think:["Mmm…","A ver…","Espera…"],realize:["Ah, ya veo.","Vale, eso cambia algo.","Eso sí me da una pista."],uncertain:["No lo tengo claro todavía.","Puede ser, pero no lo daría por hecho."],playful:["Eso tiene buena pinta.","Eso ya está más interesante."]};
    const xs=table[kind]||[];if(!xs.length)return "";const seed=(b.time||0)+(b.relationshipModel?.interactions||0)+kind.length;return xs[Math.abs(seed)%xs.length];
  }

  function snapshot(b){const p=ensure(b);return {version:1,traits:{...p.traits},values:[...p.values],simulatedPreferences:p.simulatedPreferences.map(x=>({...x}))};}
  function restore(b,data){const p=ensure(b);if(data?.traits)for(const [k,v] of Object.entries(data.traits))if(Number.isFinite(v)&&k in p.traits)p.traits[k]=clamp(v);return p;}
  function format(b){const p=ensure(b),s=style(b,{allowQuestion:false});return [`curiosidad=${p.traits.curiosity.toFixed(2)} cautela=${p.traits.caution.toFixed(2)} empatía=${p.traits.empathy.toFixed(2)} directitud=${p.traits.directness.toFixed(2)}`,`sociabilidad=${p.traits.sociability.toFixed(2)} juego=${p.traits.playfulness.toFixed(2)} paciencia=${p.traits.patience.toFixed(2)} independencia=${p.traits.independence.toFixed(2)}`,`estilo actual: etapa=${s.stage} calidez=${s.warmth.toFixed(2)} casual=${s.casualness.toFixed(2)} cautela_epistémica=${s.epistemicCaution.toFixed(2)}`].join("\n");}

  window.NpcIntPersonality={ensure,style,preferenceAnswer,disagreementStyle,microCue,snapshot,restore,format};
  print("system","","personalidad v1.0 cargada · rasgos conductuales + preferencias simuladas + estilo contextual");
})();