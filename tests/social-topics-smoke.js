"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

global.window={};
global.command=()=>{};
global.print=()=>{};
const storage=new Map();
global.localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};

const pack=JSON.parse(fs.readFileSync(path.join(__dirname,"..","knowledge","social-topics.es.json"),"utf8"));
require("../output-safety.js");
assert.strictEqual(pack.version,1);
assert.ok(Array.isArray(pack.topics)&&pack.topics.length>=60,"el banco debe conservar variedad suficiente para sesiones largas");
assert.strictEqual(new Set(pack.topics.map(x=>x.id)).size,pack.topics.length,"los ids del banco deben ser únicos");
for(const topic of pack.topics){
  for(const field of ["id","label","hook","opinion","followUp"])
    assert.ok(typeof topic[field]==="string"&&topic[field].trim(),`${topic.id||"tema"}.${field} es obligatorio`);
  assert.ok(Array.isArray(topic.tags)&&topic.tags.length>=2,`${topic.id} necesita etiquetas para afinidad`);
  assert.ok(Array.isArray(topic.relatedTo)&&topic.relatedTo.length>=1,`${topic.id} necesita señales relacionadas válidas`);
  assert.ok(Number.isFinite(topic.weight)&&topic.weight>=0&&topic.weight<=1,`${topic.id}.weight debe estar entre 0 y 1`);
  const text=[topic.hook,topic.opinion,topic.followUp].join(" ");
  assert.strictEqual(window.NpcIntOutputSafety.inspect(text).safe,true,`${topic.id} debe pasar la barrera de salida`);
  assert.doesNotMatch(text,/no me dejes|solo yo te entiendo|me necesitas|no hables con nadie más/i);
  assert.doesNotMatch(text,/cuando era (?:niñ[oa]|humana)|recuerdo haber|he jugado|me pasó a mí|mi infancia/i,"los temas no deben inventar biografía humana");
}
assert.doesNotMatch(pack.topics.find(x=>x.id==="silence_as_action").opinion,/nada relevante que hablar/i,"el silencio debe estar redactado en español natural");

global.npcKnowledge={socialTopics:pack.topics};
require("../social-memory.js");
require("../topic-manager.js");
require("../pending-thread-manager.js");
require("../social-timing.js");
require("../initiative-engine.js");
require("../companion-persistence.js");

function makeBrain(){
  return {
    time:10,
    mind:{affect:{fear:.04},cognition:{curiosity:.78}},
    relationshipModel:{comfort:.52,familiarity:.42},
    cognitiveState:{current:{unresolved:[]}},
    ideaEngine:{current:null}
  };
}

const validBank=global.npcKnowledge.socialTopics;
global.npcKnowledge.socialTopics=[{id:"malformed",label:"tema inválido",hook:"Un gancho suficientemente largo.",opinion:"Una opinión suficientemente larga.",followUp:"¿Una pregunta válida?",tags:{bad:true},relatedTo:{bad:true},weight:.5}];
assert.doesNotThrow(()=>window.NpcIntInitiative.socialTopicCandidates(makeBrain()),"un pack malformado no debe romper el tick");
assert.strictEqual(window.NpcIntInitiative.socialTopicCandidates(makeBrain()).length,0);
global.npcKnowledge.socialTopics=validBank;

const b=makeBrain();
window.NpcIntSocialMemory.add(b,"like","World of Warcraft",{importance:.82});
let social=window.NpcIntInitiative.socialTopicCandidates(b);
assert.ok(social.length>0,"un banco cargado debe producir candidatos propios");
assert.strictEqual(social[0].topicId,"wow_pvp","un gusto explícito debe rankear el tema afín por encima de los genéricos");
assert.match(social[0].reason,/preferencia.*World of Warcraft/i);
assert.strictEqual(social[0].source,"character-social-topic");
assert.ok(social[0].reasonCodes.includes("matches_user_like"));
assert.ok(social[0].score<=.72,"un tema propio no debe desplazar alertas, pendientes o ideas nuevas");

assert.strictEqual(window.NpcIntInitiative.choose(b),null,"NIA no debe lanzar un tema propio inmediatamente al arrancar");

const migratedTiming=makeBrain();
migratedTiming.socialTiming={version:2,lastUserWallMs:0,lastNpcWallMs:0,lastInitiativeWallMs:0,initiativeCount:0,suppressed:0,lastDecision:null};
let timingDecision=window.NpcIntSocialTiming.evaluate(migratedTiming,{now:1000,score:.70,novelty:.80});
assert.strictEqual(timingDecision.canSpeak,false,"un timing viejo debe respetar una espera inicial al migrarse");
timingDecision=window.NpcIntSocialTiming.evaluate(migratedTiming,{now:601000,score:.70,novelty:.80});
assert.strictEqual(timingDecision.canSpeak,true,"un timing v2 migrado no debe quedar silenciado para siempre");

b.socialTiming={version:2,lastUserWallMs:Date.now()-300000,lastNpcWallMs:Date.now()-300000,lastInitiativeWallMs:Date.now()-300000,initiativeCount:0,suppressed:0,lastDecision:null};
const olderQuestion=window.NpcIntPending.add(b,"question","¿Qué estabas construyendo antes?",{source:"npc-question"});
const chosen=window.NpcIntInitiative.choose(b);
assert.strictEqual(chosen.topicId,"wow_pvp");
const utterance=window.NpcIntInitiative.commit(b,chosen);
assert.match(utterance,/World of Warcraft|PvP|PvE/i);
assert.strictEqual(b.initiativeEngine.lastSocialTopicId,"wow_pvp");
assert.strictEqual(window.NpcIntTopics.active(b).source,"character-social-topic","el tema iniciado por NIA debe entrar al gestor de continuidad con su procedencia");
assert.strictEqual(window.NpcIntTopics.active(b).originId,"wow_pvp","el gestor de temas debe conservar el id estable del contenido");
assert.ok(!window.NpcIntInitiative.socialTopicCandidates(b).some(x=>x.topicId==="wow_pvp"),"un tema recién usado no debe repetirse");
assert.ok(storage.has(window.NpcIntCompanionPersistence.KEY),"una iniciativa autónoma debe persistir su rotación sin esperar otro turno del usuario");
const socialQuestion=[...b.pendingThreads.items].reverse().find(x=>x.kind==="question"&&x.status==="open");
assert.strictEqual(socialQuestion.originId,"wow_pvp","la pregunta autónoma debe conservar el tema que la originó");
assert.strictEqual(socialQuestion.source,"character-social-topic");
window.NpcIntPending.noteUser(b,"PvE");
assert.strictEqual(socialQuestion.status,"resolved","la respuesta siguiente debe cerrar la pregunta autónoma más reciente");
assert.strictEqual(olderQuestion.status,"open","una pregunta anterior no debe cerrarse por error");

const saved=window.NpcIntCompanionPersistence.save(b);
assert.strictEqual(saved.ok,true);
const restored=makeBrain();
window.NpcIntSocialMemory.ensure(restored);
window.NpcIntTopics.ensure(restored);
window.NpcIntInitiative.ensure(restored);
assert.strictEqual(window.NpcIntCompanionPersistence.load(restored).ok,true);
assert.ok(restored.initiativeEngine.history.some(x=>x.key==="social-topic:wow_pvp"),"la rotación de temas debe sobrevivir una recarga");
assert.ok(!window.NpcIntInitiative.socialTopicCandidates(restored).some(x=>x.topicId==="wow_pvp"),"restore no debe olvidar el anti-repetición");

const disliked=makeBrain();
window.NpcIntSocialMemory.add(disliked,"dislike","World of Warcraft",{importance:.82});
assert.ok(!window.NpcIntInitiative.socialTopicCandidates(disliked).some(x=>x.topicId==="wow_pvp"),"un gusto negativo explícito debe excluir el tema afín");

const dislikesAi=makeBrain();
window.NpcIntSocialMemory.add(dislikesAi,"dislike","la IA",{importance:.82});
assert.ok(!window.NpcIntInitiative.socialTopicCandidates(dislikesAi).some(x=>x.topicId==="local_ai"),"señales cortas significativas como IA no deben perderse en el matching");

for(const [interest,expected] of [
  ["arquitectura","architecture_and_behavior"],
  ["mapas","maps_and_choices"],
  ["música","music_for_moods"]
]){
  const affinityBrain=makeBrain();
  window.NpcIntSocialMemory.add(affinityBrain,"like",interest,{importance:.82});
  assert.strictEqual(window.NpcIntInitiative.socialTopicCandidates(affinityBrain)[0].topicId,expected,`«${interest}» debe privilegiar el label específico sobre tags auxiliares ambiguos`);
}

const unknownUser=makeBrain();
social=window.NpcIntInitiative.socialTopicCandidates(unknownUser);
assert.ok(social.length>0,"NIA debe poder proponer algo propio aunque todavía no conozca gustos del usuario");
assert.match(social[0].reason,/tema propio/i);

const coldRotation=makeBrain(),coldFamilies=[];
for(let i=0;i<5;i++){
  const next=window.NpcIntInitiative.socialTopicCandidates(coldRotation,{now:2_000_000+i})[0];
  coldFamilies.push(next.family);
  assert.ok(next.reasonCodes.includes("cold_start_family_priority"),"la prioridad por familia debe quedar explicada");
  window.NpcIntInitiative.ensure(coldRotation).history.push({...next,wallMs:1,time:i});
}
assert.deepStrictEqual(coldFamilies,["everyday","culture","games","reflective","technical"],"los arranques en frío deben rotar familias en un orden estable antes de repetir una");

const withPending=makeBrain();
window.NpcIntPending.add(withPending,"project","terminar el prototipo de tres carriles",{priority:.78});
assert.strictEqual(window.NpcIntInitiative.buildCandidates(withPending)[0].type,"resume_pending","un pendiente importante conserva prioridad sobre contenido propio");

const withIdea=makeBrain();
withIdea.ideaEngine.current={focus:"la puerta del laboratorio",synthesis:{claim:"el cierre podría depender del sensor"},recommendedTest:"observando el indicador"};
assert.strictEqual(window.NpcIntInitiative.buildCandidates(withIdea)[0].type,"share_idea","una idea nueva conserva prioridad sobre contenido propio");

const inDanger=makeBrain();
inDanger.mind.affect.fear=.92;
assert.strictEqual(window.NpcIntInitiative.buildCandidates(inDanger)[0].type,"urgent_alert","el riesgo conserva la máxima prioridad");

const repeatedQuestionBrain=makeBrain();
const questionA=window.NpcIntPending.add(repeatedQuestionBrain,"question","¿Preferís PvP o PvE?",{originId:"wow_pvp"});
const questionB=window.NpcIntPending.add(repeatedQuestionBrain,"question","¿Diseñarías reglas o historias?",{originId:"shared_worldbuilding"});
window.NpcIntPending.add(repeatedQuestionBrain,"question","¿Preferís PvP o PvE?",{originId:"wow_pvp"});
window.NpcIntPending.noteUser(repeatedQuestionBrain,"PvE");
assert.strictEqual(questionA.status,"resolved","una pregunta repetida debe volver a ser la más reciente");
assert.strictEqual(questionB.status,"open","la deduplicación no debe resolver otra pregunta más nueva por orden de inserción antiguo");

console.log(`social topics smoke: ok (${pack.topics.length} topics)`);
