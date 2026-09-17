"use strict";

(function(){
  function ensure(b){if(b.socialTiming)return b.socialTiming;b.socialTiming={version:2,lastUserWallMs:0,lastNpcWallMs:0,lastInitiativeWallMs:0,initiativeCount:0,suppressed:0,lastDecision:null};return b.socialTiming;}
  function noteUser(b,now=Date.now()){const s=ensure(b);s.lastUserWallMs=now;return s;}
  function noteNpc(b,now=Date.now(),initiative=false){const s=ensure(b);s.lastNpcWallMs=now;if(initiative){s.lastInitiativeWallMs=now;s.initiativeCount++;}return s;}
  function evaluate(b,meta={}){
    const s=ensure(b),now=meta.now??Date.now();
    const sinceUser=now-(s.lastUserWallMs||0),sinceNpc=now-(s.lastNpcWallMs||0),sinceInitiative=now-(s.lastInitiativeWallMs||0);
    const urgent=!!meta.urgent,novelty=Math.max(0,Math.min(1,meta.novelty??.4)),score=Math.max(0,Math.min(1,meta.score??.5));
    const relation=b.relationshipModel||{};
    // La simulación avanza minutos cada pocos segundos, pero la cortesía conversacional se
    // mide con reloj real. NIA no debe interrumpir solo porque el tick interno corrió rápido.
    const minAfterUser=urgent?0:Math.round(38000+(1-(relation.comfort??.35))*26000);
    const minAfterNpc=urgent?0:26000;
    const initiativeCooldown=urgent?0:Math.round(90000+(1-(relation.familiarity??.1))*70000);
    let canSpeak=true,reason="ok";
    if(!urgent&&sinceUser<minAfterUser){canSpeak=false;reason="usuario reciente";}
    else if(!urgent&&sinceNpc<minAfterNpc){canSpeak=false;reason="NIA habló hace poco";}
    else if(!urgent&&sinceInitiative<initiativeCooldown){canSpeak=false;reason="cooldown de iniciativa";}
    else if(!urgent&&score<.58){canSpeak=false;reason="contenido poco valioso";}
    else if(!urgent&&novelty<.30){canSpeak=false;reason="poca novedad";}
    if(!canSpeak)s.suppressed++;
    s.lastDecision={canSpeak,reason,sinceUser,sinceNpc,sinceInitiative,minAfterUser,minAfterNpc,initiativeCooldown,score,novelty,urgent};
    return s.lastDecision;
  }
  function format(b){const s=ensure(b),d=s.lastDecision;return [`iniciativas=${s.initiativeCount} | suprimidas=${s.suppressed}`,d?`última: hablar=${d.canSpeak?"sí":"no"} · motivo=${d.reason} · score=${d.score.toFixed(2)} · novedad=${d.novelty.toFixed(2)} · desde_usuario=${Math.round(d.sinceUser/1000)}s · cooldown=${Math.round(d.initiativeCooldown/1000)}s`:"sin decisión todavía"].join("\n");}
  window.NpcIntSocialTiming={ensure,noteUser,noteNpc,evaluate,format};
  print("system","","timing social v1.1 cargado · reloj real + silencio deliberado + cooldown largo");
})();