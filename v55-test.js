'use strict';
const assert=require('node:assert/strict');
const B=require('./engine');
const DATA=require('./public/pokemon-data.json');
const roster=Object.fromEntries(B.SLOTS.map((s,i)=>[s.id,201+i]));
const a=B.side(DATA,roster),b=B.mockSide(550);
let scoreless=0,dominant=0,eventsWithPlayers=0;
for(let i=0;i<400;i++){
 const g=B.simulateMatch(a,b,i*31+19),scores=[g.away.runs,g.home.runs];
 if(Math.min(...scores)===0)scoreless++;
 for(const event of g.special){
  assert.notEqual(event.type,'shutout','Previous shutout event must be retired');
  if(event.type==='dominant'){
   dominant++;
   assert.ok(scores[event.team]>=5,'Dominant side must score 5+');
   assert.equal(scores[1-event.team],0,'Losing side must be held scoreless');
   assert.ok(scores[event.team]>scores[1-event.team]);
  }
  if(event.player>0)eventsWithPlayers++;
 }
}
assert.ok(dominant>0,'Dominant games should still be possible');
// Baseline old build: 112/400 shutouts with these precise seeds and rosters.
assert.ok(scoreless<90,`Scoreless finishes were not reduced enough: ${scoreless}/400`);
const source=require('fs').readFileSync(require('path').join(__dirname,'public/app.js'),'utf8');
assert.ok(source.includes('event-pokemon-sprite'),'Event scorer sprite UI missing');
assert.ok(source.includes('play-replay'),'Replay control UI missing');
assert.ok(source.includes('id="solo-season-results"'),'Solo results were not moved before the lineup');
assert.ok(source.includes("view==='solo'?.5:1"),'Solo game playback is not twice the fantasy speed');
console.log(`PASS v5.5: ${scoreless}/400 scoreless games (previously 112), ${dominant} valid Dominant Games, ${eventsWithPlayers} scorer attributions, replay and solo UI hooks.`);
