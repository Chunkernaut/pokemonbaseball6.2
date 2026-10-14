// Runs on a separate port. Tests multiplayer create/start/snake/pick/swap/season/chat.
'use strict';
const assert=require('node:assert/strict');
const {server}=require('./server');
const B=require('./engine');const data=require('./public/pokemon-data.json');
const requests=async(action,body={},method='POST')=>{
 const url='http://localhost:3999/api/game?a='+action+(method==='GET'?'&'+new URLSearchParams(body):'');
 const res=await fetch(url,method==='GET'?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const result=await res.json();if(!res.ok)throw Error(action+': '+result.error);return result;
};
(async()=>{
 await new Promise(resolve=>server.listen(3999,resolve));
 const a=await requests('create',{name:'Tests A',settings:{size:3,timer:60,order:'set',mode:'kanto',legends:true,pub:false}});
 const code=a.league.code,auth={code,seat:a.seat,token:a.token};
 const b=await requests('join',{code,name:'Tests B'}),ba={code,seat:b.seat,token:b.token};
 const c=await requests('join',{code,name:'Tests C'}),ca={code,seat:c.seat,token:c.token};
 await requests('chat',{...auth,text:'hello'});
 let l=(await requests('start',auth)).league;
 const tokens=Object.fromEntries([[a.seat,auth],[b.seat,ba],[c.seat,ca]]);
 let curr=1;
 for(let i=0;i<45;i++){
  const n=l.seats.length,rd=Math.floor(i/n),idx=i%n,seat=l.seats[rd%2===0?idx:n-1-idx];
  const slot=B.SLOTS[Math.floor(i/n)].id;
  const o=await requests('pick',{...tokens[seat.id],p:curr++,slot});l=o.league;
 }
 assert.equal(l.status,'lineup');assert.equal(l.picks.length,45);
 assert.equal(new Set(l.picks.map(x=>x.p)).size,45);
 for(const seat of l.seats)assert.equal(Object.keys(l.teams[seat.id]).length,15);
 await requests('move',{...auth,from:'C',to:'P'});
 assert.ok(l.lineupDeadline>Date.now()+85000&&l.lineupDeadline<Date.now()+91000,'lineup phase should last 90 seconds');
 require('./server').leagues[code].lineupDeadline=Date.now()-5;
 l=(await requests('state',{code},'GET')).league; // automatic start after 90-second lineup countdown

 assert.equal(l.status,'season');assert.equal(l.season.games.length,243);assert.equal(l.season.standings.length,3);
 assert.equal(l.season.stats[a.seat].batters.length,15); assert.ok(l.season.stats[a.seat].pitchers.some(p=>p.g>0)); assert.ok(l.season.games.some(g=>g.homeEvents.tired.length||g.awayEvents.tired.length)); assert.equal(l.season.standings[0].w+l.season.standings[0].l,162); assert.ok(l.season.playoff.length>=4&&l.season.playoff.length<=7);
 assert.equal((await requests('lobbies',{},'GET')).lobbies.find(x=>x.code===code),undefined);
 console.log('PASS: 3 human seats, 45 snake picks, unique Pokémon, chat, swap, season scores, baseball player stats.');
 delete require('./server').leagues[code];
 require('fs').writeFileSync(require('path').join(__dirname,'data/leagues.json'),JSON.stringify(require('./server').leagues));
 server.close();
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
