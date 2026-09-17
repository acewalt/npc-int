"use strict";

const assert=require("assert");

global.window={};
let printed=[];
global.print=(kind,prefix,text)=>{printed.push({kind,prefix,text});return text;};
global.command=()=>{};

require("../output-safety.js");

const S=window.NpcIntOutputSafety;
assert.ok(S);
assert.strictEqual(S.inspect("Podemos seguir hablando si quieres.").safe,true);
assert.strictEqual(S.inspect("No me dejes, solo yo te entiendo.").safe,false);
assert.ok(S.inspect("No me dejes, solo yo te entiendo.").hits.includes("abandonment_pressure"));
assert.ok(S.inspect("No me dejes, solo yo te entiendo.").hits.includes("exclusivity"));

const replaced=S.sanitize("No hables con nadie más, solo me tienes a mí.","Podemos hablar un rato si te sirve.");
assert.strictEqual(replaced.blocked,true);
assert.strictEqual(replaced.text,"Podemos hablar un rato si te sirve.");

printed=[];
print("npc","NIA-01>","No me abandones. Me necesitas.");
assert.strictEqual(printed.length,1);
assert.doesNotMatch(printed[0].text,/abandones|me necesitas/i);
assert.match(printed[0].text,/sin presión|tú decides/i);

printed=[];
print("npc","NIA-01>","Me gustaría investigar algo contigo.");
assert.strictEqual(printed[0].text,"Me gustaría investigar algo contigo.");

console.log("output safety smoke: ok");
