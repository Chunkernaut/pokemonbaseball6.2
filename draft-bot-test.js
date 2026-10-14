'use strict';
const assert=require('node:assert/strict');
const {server,leagues}=require('./server'),B=require('./engine');
const base='http://localhost:3987/api/game?a=';
async function call(a,v={},get=false){const u=base+a+(get?'&'+new URLSearchParams(v):'');const r=await fetch(u,get?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v)});const x=await r.json();if(!r.ok)throw Error(a+': '+x.error);return x;}
(async()=>{await new Promise(ok=>server.listen(3987,ok));
 const a=await call('create',{name:'Host Test',settings:{size:3,timer:30,order:'set',mode:'wild',legends:true}}), code=a.league.code,au={code,seat:a.seat,token:a.token};
 const b=await call('join',{code,name:'Test Two'}),bu={code,seat:b.seat,token:b.token};
 const c=await call('join',{code,name:'Test Three'}),cu={code,seat:c.seat,token:c.token};
 let l=(await call('start',au)).league;
 leagues[code].deadline=Date.now()-1000;
 l=(await call('state',{code},true)).league;assert.equal(l.picks.length,1);assert.equal(l.seats[0].misses,1);assert.equal(l.seats[0].auto,false);
 const positions=['C','1B','2B'];
 for(const [u,id,slot] of [[bu,153,'C'],[cu,154,'C'],[cu,155,'1B'],[bu,156,'1B']]) l=(await call('pick',{...u,p:id,slot})).league;
 assert.equal(l.picks.length,5);
 leagues[code].deadline=Date.now()-1000;l=(await call('state',{code},true)).league;
 assert.equal(l.picks.length,6);assert.equal(l.seats[0].misses,2);assert.equal(l.seats[0].auto,true);
 // Next round begins on the same host seat and must NOT pick instantly.
 l=(await call('state',{code},true)).league;assert.equal(l.picks.length,6);
 leagues[code].turnAt=Date.now()-6000;l=(await call('state',{code},true)).league;
 assert.equal(l.picks.length,7);assert.equal(l.picks.at(-1).auto,true);
 l=(await call('activity',au)).league;assert.equal(l.seats[0].auto,false);assert.equal(l.seats[0].misses,0);
 // Dedicated CPU turns must also wait five seconds.
 delete leagues[code];require('fs').writeFileSync(require('path').join(__dirname,'data/leagues.json'),JSON.stringify(leagues));
 console.log('PASS: two missed turns trigger takeover, five-second bot gate, activity restores manual control.');
 server.close();
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
