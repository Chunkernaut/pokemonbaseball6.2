'use strict';
const assert=require('node:assert/strict'),B=require('./engine'),data=require('./public/pokemon-data.json');
const roster=Object.fromEntries(B.SLOTS.map((s,i)=>[s.id,201+i]));
const result=B.singleSeason(data,roster,17412);
assert.equal(result.games.length,162);
const events={};for(const g of result.games){assert.ok(g.innings>=9&&g.innings<=15,`Invalid ${g.innings} innings`);assert.notEqual(g.us,g.them);for(const ev of g.special||[]){events[ev.type]=(events[ev.type]||0)+1;if(ev.type==='walkoff'){assert.equal(ev.team,1);assert.equal(g.win,g.home);}}
 if(g.special.some(ev=>ev.type==='no_hitter'&&ev.team===(g.home?1:0))){assert.ok(g.win);}}
assert.ok(result.games.some(g=>g.innings>9));
assert.ok(Object.keys(events).length>=3);
console.log('PASS: scored-event metadata, valid winners, 9–15 inning limits, walk-off winner, 162 results.',events);
