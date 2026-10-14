// Verify 15-person squads, energy from HP only, substitution/rest invariants and season stats by ID.
'use strict';
const assert=require('node:assert/strict');
const B=require('./engine'),data=require('./public/pokemon-data.json');
const roster=Object.fromEntries(B.SLOTS.map((s,i)=>[s.id,151+i]));
assert.equal(B.SLOTS.length,15);assert.equal(B.FIELD_SLOTS.length,10);assert.equal(B.BENCH_SLOTS.length,5);
assert.equal(B.STATS.includes('hp'),false);
for(const p of B.FIELD_SLOTS){assert.equal(Object.keys(B.ROLES[p.id].stats).includes('hp'),false);assert.ok(Math.abs(Object.values(B.ROLES[p.id].stats).reduce((a,b)=>a+b,0)-1)<1e-9);}
assert.ok(B.fatigueCost(data,151,'P')>B.fatigueCost(data,151,'C'));
assert.ok(B.fatigueCost(data,151,'C')>B.fatigueCost(data,151,'DH'));
const output=B.singleSeason(data,roster,97313);
assert.equal(output.games.length,162);
assert.equal(output.wins+output.losses,162);
assert.equal(output.stats.batters.length,15);assert.equal(output.stats.pitchers.length,15);
let tiredCount=0,subbed=0;
for(let i=0;i<output.games.length;i++){
 const game=output.games[i],next=output.games[i+1],following=output.games[i+2];
 assert.equal(new Set(Object.values(game.activeLineup)).size,10);
 for(const t of game.tired){tiredCount++;
  if(next){assert.ok(!Object.values(next.activeLineup).includes(t.id),`tired Pokémon ${t.id} unexpectedly played game ${i+2}`);}
  // If it belongs to a starting slot, it must return after exactly one missed game.
  const initialPosition=B.FIELD_IDS.find(k=>roster[k]===t.id);
  if(initialPosition&&following){assert.equal(following.activeLineup[initialPosition],t.id,`starter ${t.id} did not return after one game`);}
 }
 for(const s of game.substitutions){subbed++;assert.equal(s.in,game.activeLineup[s.position]);}
}
assert.ok(tiredCount>50&&subbed>50);
const appearances=output.stats.batters.reduce((a,p)=>a+p.g,0);
assert.equal(appearances,1620); // all 15 identities together filled 10 on-field spots for 162 games
console.log(`PASS: ${tiredCount} fatigue events, ${subbed} substitutions, mandatory one-game rest, 162 games, 15 player identities.`);
