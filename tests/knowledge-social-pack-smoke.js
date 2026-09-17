"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

global.window={setTimeout};
global.print=()=>{};
global.command=()=>{};
global.send=()=>{};
global.clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
global.short=(s,n=72)=>String(s||"").slice(0,n);

class NpcBrain{
  hear(){return null;}
  say(text){return text;}
}
global.NpcBrain=NpcBrain;
global.brain=new NpcBrain();

global.fetch=async url=>{
  const local=path.join(__dirname,"..",String(url).replace(/\//g,path.sep));
  return {ok:true,json:async()=>JSON.parse(fs.readFileSync(local,"utf8"))};
};

require("../knowledge.js");

(async()=>{
  for(let i=0;i<20&&!global.npcKnowledge.ready;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.strictEqual(global.npcKnowledge.ready,true,"la carga de packs debe terminar");
  assert.ok(global.npcKnowledge.socialTopics.length>=60,"knowledge.js debe conservar el banco social ampliado en su colección propia");
  assert.ok(global.npcKnowledge.socialTopics.some(x=>x.id==="wow_pvp"));
  assert.ok(!global.npcKnowledge.encyclopedia.some(x=>x.id==="wow_pvp"),"los temas sociales no son hechos enciclopédicos");
  assert.ok(global.npcKnowledge.sources.some(x=>x.type==="social-topics"));
  console.log(`knowledge social pack smoke: ok (${global.npcKnowledge.socialTopics.length} topics)`);
})().catch(err=>{console.error(err);process.exitCode=1;});
