'use strict';
const assert=require('node:assert/strict');
const B=require('./engine'),DATA=require('./public/pokemon-data.json');
const {server,leagues}=require('./server');
const roster=Object.fromEntries(B.SLOTS.map((s,i)=>[s.id,200+i]));
const a=B.seededOrder(roster,1234),b=B.seededOrder(roster,1234);
assert.deepEqual(a,b);assert.ok(B.validateBattingOrder(roster,a));
assert.equal(B.validateBattingOrder(roster,[...a.slice(1),a[1]]),false);
const state=B.createTeamState(DATA,roster);state.battingOrder=[...a];
const team=B.side(DATA,roster,'Test',state);
assert.deepEqual(team.batters.map(x=>x.id),a,'batting order is preserved by the simulator');
state.restNext=[roster.C];const day=B.dailyLineup(DATA,state);
const tired=B.side(DATA,day.roster,'Test',state);
assert.equal(tired.batters[a.indexOf(roster.C)].id,day.roster.C,'replacement inherits the exhausted starter batting slot');
assert.notEqual(day.roster.C,roster.C);
const season=B.singleSeason(DATA,roster,345,a);
assert.equal(season.games.length,162);assert.ok(Array.isArray(season.awards)&&season.awards.length===5);
assert.equal(season.stats.batters.length,15);assert.ok(season.stats.batters.every(x=>Number.isFinite(Number(x.ops))));
assert.ok(season.stats.batters.some(x=>x.rested>0),'rest day statistics should exist');
// Larger leagues receive an actual seeded postseason bracket, not only a final label.
for(const teamCount of [4,5,6]){
 const seats=Array.from({length:teamCount},(_,i)=>({id:'large'+i,name:'City '+i}));
 const squads=Object.fromEntries(seats.map((x,i)=>[x.id,Object.fromEntries(B.SLOTS.map((slot,j)=>[slot.id,100+i*15+j]))]));
 const season=B.leagueSeason(DATA,seats,squads,1234+teamCount);
 assert.ok(season.bracket.length>=3,'larger leagues must have multiple postseason series');
 assert.equal(season.bracket.at(-1).round,'World Series');
 assert.equal(season.bracket.at(-1).winner,season.champion);
 assert.ok(season.playoff.length>=4&&season.playoff.length<=7);
 assert.ok(season.standings.every(x=>x.w+x.l===162));
}
const other=B.singleSeason(DATA,roster,345,[...a].reverse());
assert.notDeepEqual(season.stats.batters.map(x=>x.pa),other.stats.batters.map(x=>x.pa),'batting order should influence individual plate appearances');
async function call(action,body={},method='POST'){
 const path='http://127.0.0.1:4001/api/game?a='+action+(method==='GET'?'&'+new URLSearchParams(body):'');
 const response=await fetch(path,method==='GET'?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const json=await response.json();return {...json,status:response.status};
}
(async()=>{
 await new Promise(resolve=>server.listen(4001,resolve));
 const host=await call('create',{name:'Starter A',settings:{mode:'kanto',size:3,order:'set',timer:60,legends:true}});
 const code=host.league.code,authA={code,seat:host.seat,token:host.token};
 const second=await call('join',{code,name:'Starter B'}),authB={code,seat:second.seat,token:second.token};
 const third=await call('join',{code,name:'Starter C'}),authC={code,seat:third.seat,token:third.token};
 const auth={[host.seat]:authA,[second.seat]:authB,[third.seat]:authC};
 let l=(await call('start',authA)).league;
 let nextId=1;
 for(let i=0;i<45;i++){
  const round=Math.floor(i/3),seat=l.seats[round%2?2-i%3:i%3];
  l=(await call('pick',{...auth[seat.id],p:nextId++,slot:B.SLOTS[round].id})).league;
 }
 assert.equal(l.status,'lineup');assert.ok(l.lineupDeadline>Date.now()+84000&&l.lineupDeadline<Date.now()+91000);
 for(const seat of l.seats)assert.ok(B.validateBattingOrder(l.teams[seat.id],l.battingOrders[seat.id]));
 const original=l.battingOrders[host.seat];
 const bad=await call('batting',{...authA,order:[...original.slice(1),original[1]]});assert.equal(bad.status,400);
 l=(await call('batting',{...authA,order:[...original].reverse()})).league;
 assert.deepEqual(l.battingOrders[host.seat],[...original].reverse());
 l=(await call('ready',{...authA,ready:true})).league;assert.equal(l.status,'lineup');
 const denied=await call('batting',{...authA,order:original});assert.equal(denied.status,409);
 l=(await call('ready',{...authB,ready:true})).league;assert.equal(l.status,'lineup');
 l=(await call('ready',{...authC,ready:true})).league;
 assert.equal(l.status,'season','all three humans ready must trigger early season start');
 assert.equal(l.season.games.length,243);assert.ok(l.season.awards.length===5);
 delete leagues[code];require('fs').writeFileSync(require('path').join(__dirname,'data/leagues.json'),JSON.stringify(leagues));
 console.log('PASS v6.0: shuffled batting lineup, substitute inherits batting place, 162 games, awards, rested games, 90s lineup, ready early start.');
 server.close();
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
