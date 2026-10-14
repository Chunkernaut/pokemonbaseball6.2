'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const B=require('./engine');
const data=require('./public/pokemon-data.json');
const roster=Object.fromEntries(B.SLOTS.map((s,i)=>[s.id,1+i]));
// A power hitter can be on the bench, and must be moved into DH initially.
roster.BN5=68;roster['1B']=16; // ensure all unique and a recognizably strong hitter available
const target=B.strongestHitter(data,roster);
assert.ok(target,'hitter identified');
const formerDH=roster.DH;
const originalSlot=B.SLOTS.find(s=>roster[s.id]===target).id;
B.preferStrongestDH(data,roster);
assert.equal(roster.DH,target);
assert.equal(new Set(Object.values(roster)).size,15);
if(originalSlot!=='DH')assert.equal(roster[originalSlot],formerDH);
assert.equal(B.validateBattingOrder(roster,B.seededOrder(roster,4141)),true);
// With the same HP the pitcher is charged the new higher baseline; no positional fit uses HP.
const id=68,hp=data.mons[id-1].hp;
const expected=Math.max(4,Math.min(80,Math.round(45*100/(hp+25))));
assert.equal(B.fatigueCost(data,id,'P'),expected);
assert.ok(B.fatigueCost(data,id,'P')>B.fatigueCost(data,id,'C'));
const ui=fs.readFileSync('./public/app.js','utf8');
const css=fs.readFileSync('./public/style.css','utf8');
assert.ok(ui.includes('function showRosterScout('));
assert.ok(ui.includes('.field-spot[data-inspect], .bench-spot[data-inspect]'));
assert.ok(ui.includes('function statsDropdown(stats)'));
assert.ok(ui.includes('Swap Pokémon and customize your batting order'));
assert.ok(css.includes('#roster-scout')&&css.includes('.stats-dropdown'));
assert.ok(ui.includes('statsDropdown(ss)')&&ui.includes('statsDropdown(solo.result.stats)'));
console.log('PASS v6.1: DH selection, pitcher 45 fatigue, compact roster scouting, lineup help, collapsible season statistics.');
