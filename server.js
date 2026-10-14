// Self-contained multiplayer server. npm start; no npm packages or accounts necessary.
// Local persistence uses data/leagues.json; free cloud instances can erase it on restart.
'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const B=require('./engine'),DATA=require('./public/pokemon-data.json');
const PUBLIC=path.join(__dirname,'public'),DB=path.join(__dirname,'data','leagues.json');
const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SLOTS=B.SLOTS.map(s=>s.id), MIN=3,MAX=6;
let leagues={};try{leagues=JSON.parse(fs.readFileSync(DB,'utf8'))}catch{}
const now=()=>Date.now();
const uid=()=>crypto.randomBytes(9).toString('hex');
function code(){let s;do{s=Array.from({length:5},()=>CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('')}while(leagues[s]);return s;}
function save(){fs.mkdirSync(path.dirname(DB),{recursive:true});fs.writeFileSync(DB,JSON.stringify(leagues));}
function err(status,msg){const e=new Error(msg);e.status=status;throw e;}
function validName(v){const s=String(v||'').trim().replace(/\s+/g,' ');if(s.length<2||s.length>24)err(400,'Team name must be 2–24 characters');return s;}
function sanitize(l){const v=JSON.parse(JSON.stringify(l));v.seats.forEach(s=>delete s.token);return {...v,now:now()};}
function belongs(l,body){const seat=l.seats.find(s=>s.id===body.seat&&s.token===body.token);if(!seat)err(403,'This browser is not a member of the league');return seat;}
function host(l,body){const s=belongs(l,body);if(!s.host)err(403,'Only the host may do that');return s;}
function get(code){const l=leagues[String(code||'').trim().toUpperCase()];if(!l)err(404,'League not found (it may have expired)');return l;}
function touch(l){l.updated=now();l.ver=(l.ver||0)+1;save();return {league:sanitize(l)};}
function allowedPool(l){return B.pool(DATA,l.set.mode,l.set.legends);}
function atTurn(l){if(l.status!=='draft')return null;const k=l.picks.length,n=l.seats.length;if(k>=n*SLOTS.length)return null;const round=Math.floor(k/n),idx=k%n;return l.seats[round%2===0?idx:n-1-idx];}
function nextClock(l){l.turnAt=now();l.deadline=l.set.timer?l.turnAt+l.set.timer*1000:0;} // CPU and takeover turns wait five seconds
function doPick(l,seat,id,slot,automated=false){if(!seat||atTurn(l)?.id!==seat.id)err(409,'Not your turn');
  id=Number(id);if(!allowedPool(l).includes(id))err(400,'Pokémon is outside the selected draft pool');
  if(l.picks.some(p=>p.p===id))err(409,'That Pokémon was already drafted');
  if(!SLOTS.includes(slot)||l.teams[seat.id][slot])err(400,'Choose an empty position');
  if(!automated){seat.misses=0;seat.auto=false;}
  l.teams[seat.id][slot]=id;
  const shiny=crypto.randomInt(8192)===0;
  l.picks.push({s:seat.id,p:id,slot,at:now(),shiny,auto:automated});
  if(shiny)l.shinies.push(id);
  if(l.picks.length===l.seats.length*SLOTS.length){l.status='lineup';l.deadline=0;l.lineupDeadline=now()+90000;
    l.battingOrders={};l.readySeats=[];
    for(const seat of l.seats){B.preferStrongestDH(DATA,l.teams[seat.id]);l.battingOrders[seat.id]=B.seededOrder(l.teams[seat.id],crypto.randomInt(1,2**30));}
    l.chat.push({sys:true,t:'Draft complete! 90 seconds to set your batting order and lineups. All players may click I’m ready to start earlier.',at:now()});}
  else nextClock(l);
}
function cpuPick(l){const seat=atTurn(l);if(!seat)return;const available=allowedPool(l).filter(id=>!l.picks.some(p=>p.p===id));if(!available.length)err(409,'No Pokémon remaining');
  const open=SLOTS.filter(s=>!l.teams[seat.id][s]);
  // Seek a strong fit but allow occasional surprising selections.
  const index=Math.floor(Math.random()*Math.min(40,available.length));
  const candidates=available.map(id=>{const choices=open.map(slot=>({slot,fit:slot.startsWith('BN')?B.FIELD_SLOTS.map(p=>B.positionScore(DATA,id,p.id)).sort((a,b)=>b-a).slice(0,3).reduce((a,b)=>a+b,0)/3*.85:B.positionScore(DATA,id,slot)})).sort((a,b)=>b.fit-a.fit);return {id,slot:choices[0].slot,fit:choices[0].fit};}).sort((a,b)=>b.fit-a.fit);
  const best=candidates[Math.min(index,candidates.length-1)];doPick(l,seat,best.id,best.slot,true);
}
function advance(l){
  if(l.status==='lineup'&&l.lineupDeadline&&now()>=l.lineupDeadline){makeSeason(l);l.lineupDeadline=0;l.ver++;l.updated=now();save();return true;}
  if(l.status!=='draft')return false;let changed=false,guard=0;
  if(!l.turnAt)l.turnAt=now();
  while(l.status==='draft'&&guard++<50){const seat=atTurn(l);if(!seat)break;
    if(seat.cpu||seat.auto){if(now()-l.turnAt<5000)break;cpuPick(l);changed=true;continue;}
    if(!l.deadline||now()<l.deadline)break;
    seat.misses=(seat.misses||0)+1;
    if(seat.misses>=2){seat.auto=true; l.chat.push({sys:true,t:`${seat.name} missed two consecutive picks — Auto-Draft enabled.`,at:now()});}
    // The missed pick is recorded as an automatic choice; future bot picks wait 5 seconds.
    cpuPick(l);changed=true;
  }
  if(changed){l.ver++;l.updated=now();save();}return changed;
}
function standings(l,games){const rows=l.seats.map(s=>({id:s.id,name:s.name,w:0,l:0,rs:0,ra:0,score:B.scoreTeam(DATA,l.teams[s.id])}));const map=Object.fromEntries(rows.map(x=>[x.id,x]));
  for(const g of games){const a=map[g.a],b=map[g.b];a.rs+=g.as;a.ra+=g.bs;b.rs+=g.bs;b.ra+=g.as;if(g.as>g.bs){a.w++;b.l++;}else{b.w++;a.l++;}}
  return rows.sort((a,b)=>b.w-a.w||(b.rs-b.ra)-(a.rs-a.ra)||b.score.score-a.score.score);
}
function makeSeason(l){
  // 162 regular-season games per team; all games use an inning-by-inning simulator.
  // Best-of-seven series between the top two regular-season teams.
  const seed=crypto.randomInt(1,2**30);
  l.season=B.leagueSeason(DATA,l.seats,l.teams,seed,l.battingOrders||{});
  l.status='season';l.chat.push({sys:true,t:'162-game baseball regular season complete! Best-of-seven championship results are posted.',at:now()});
}

async function api(action,body,query){if(action==='lobbies'){return {lobbies:Object.values(leagues).filter(l=>l.status==='lobby'&&l.set.pub&&l.seats.length<l.set.size).map(l=>({code:l.code,size:l.set.size,joined:l.seats.length,mode:l.set.mode,timer:l.set.timer,legends:l.set.legends})).slice(-30).reverse()};}
  if(action==='create'){
    const settings=body.settings||{},size=Number(settings.size),timer=Number(settings.timer||0);
    if(size<MIN||size>MAX||!Number.isInteger(size))err(400,'Choose 3–6 teams');
    const mode=B.MODES[settings.mode]?settings.mode:'wild',legends=settings.legends!==false;
    if(B.pool(DATA,mode,legends).length<size*SLOTS.length)err(400,'Not enough Pokémon for these settings');
    if(![0,30,60,120].includes(timer))err(400,'Invalid pick timer');
    const seat={id:uid(),token:uid(),name:validName(body.name),host:true,cpu:false,auto:false,misses:0};
    const l={code:code(),ver:1,created:now(),updated:now(),status:'lobby',set:{mode,legends,size,order:settings.order==='set'?'set':'random',timer,pub:!!settings.pub},seats:[seat],teams:{[seat.id]:{}},battingOrders:{},readySeats:[],picks:[],chat:[],shinies:[],deadline:0,season:null};
    leagues[l.code]=l;save();return {league:sanitize(l),seat:seat.id,token:seat.token};
  }
  const l=get(body.code||query.get('code'));advance(l);
  if(action==='state')return {league:sanitize(l)};
  if(action==='activity'){
    const seat=belongs(l,body);
    if(seat.cpu)return {league:sanitize(l)};
    if(seat.auto||seat.misses){seat.auto=false;seat.misses=0;
      if(l.status==='draft'&&atTurn(l)?.id===seat.id)nextClock(l);
      l.chat.push({sys:true,t:`${seat.name} returned — manual drafting restored.`,at:now()});
      return touch(l);
    }
    return {league:sanitize(l)};
  }
  if(action==='join'){
    if(l.status!=='lobby')err(409,'Draft already started');if(l.seats.length>=l.set.size)err(409,'League is full');
    const seat={id:uid(),token:uid(),name:validName(body.name),host:false,cpu:false,auto:false,misses:0};l.seats.push(seat);l.teams[seat.id]={};return {...touch(l),seat:seat.id,token:seat.token};
  }
  if(action==='cpu'){host(l,body);if(l.status!=='lobby')err(409,'Cannot add computer after draft starts');if(l.seats.length>=l.set.size)err(409,'League is full');
    const seat={id:uid(),name:'CPU '+(l.seats.filter(s=>s.cpu).length+1),cpu:true,host:false,auto:false,misses:0};l.seats.push(seat);l.teams[seat.id]={};return touch(l);
  }
  if(action==='seats'){host(l,body);if(l.status!=='lobby')err(409,'Lobby only');const ix=l.seats.findIndex(s=>s.id===body.target);if(ix<0)err(404,'Seat not found');
    if(body.op==='kick'&&!l.seats[ix].host){delete l.teams[l.seats[ix].id];l.seats.splice(ix,1);}
    else if(['up','down'].includes(body.op)&&l.set.order==='set'){const j=ix+(body.op==='up'?-1:1);if(j<0||j>=l.seats.length)err(409,'Cannot move further');[l.seats[j],l.seats[ix]]=[l.seats[ix],l.seats[j]];}
    else err(400,'Invalid seat command');return touch(l);
  }
  if(action==='settings'){host(l,body);if(l.status!=='lobby')err(409,'Lobby only');
    const nextMode=body.mode!==undefined?body.mode:l.set.mode;
    const nextSize=body.size!==undefined?Number(body.size):l.set.size;
    const nextLegends=body.legends!==undefined?!!body.legends:l.set.legends;
    if(!B.MODES[nextMode])err(400,'Invalid Pokémon pool');
    if(!Number.isInteger(nextSize)||nextSize<MIN||nextSize>MAX||nextSize<l.seats.length)err(400,'Team size must fit the current seats (3–6)');
    if(B.pool(DATA,nextMode,nextLegends).length<nextSize*SLOTS.length)err(400,'Not enough Pokémon for that many teams');
    l.set.mode=nextMode;l.set.size=nextSize;l.set.legends=nextLegends;
    if(body.pub!==undefined)l.set.pub=!!body.pub;
    if(['set','random'].includes(body.order))l.set.order=body.order;
    if(body.timer!==undefined&&[0,30,60,120].includes(Number(body.timer)))l.set.timer=Number(body.timer);
    return touch(l);
  }
  if(action==='start'){host(l,body);if(l.status!=='lobby')err(409,'Draft has already started');if(l.seats.length!==l.set.size)err(409,'Fill every seat first');
    if(l.set.order==='random')l.seats.sort(()=>Math.random()-.5);
    l.status='draft';l.started=now();nextClock(l);l.chat.push({sys:true,t:'The snake draft is underway!',at:now()});advance(l);return touch(l);
  }
  if(action==='pick'){const seat=belongs(l,body);if(l.status!=='draft')err(409,'Draft is not active');doPick(l,seat,body.p,body.slot);advance(l);return touch(l);}
  if(action==='move'){const seat=belongs(l,body);if(!['draft','lineup'].includes(l.status))err(409,'Lineup is locked');if(l.status==='lineup'&&(l.readySeats||[]).includes(seat.id))err(409,'You are ready; unready to edit your lineup');const from=String(body.from),to=String(body.to);if(!SLOTS.includes(from)||!SLOTS.includes(to))err(400,'Invalid position');
    if(!l.teams[seat.id][from])err(409,'Nothing in that position');
    const t=l.teams[seat.id];const previous=t[to];t[to]=t[from];if(previous)t[from]=previous;else delete t[from];if(l.status==='lineup')l.battingOrders[seat.id]=B.normalizeBattingOrder(t,l.battingOrders[seat.id]);return touch(l);
  }
  if(action==='batting'){
    const seat=belongs(l,body);if(l.status!=='lineup')err(409,'Batting order can only change during lineup phase');
    if((l.readySeats||[]).includes(seat.id))err(409,'Unready before making changes');
    const order=body.order;if(!B.validateBattingOrder(l.teams[seat.id],order))err(400,'Order must contain each of your nine current batters once');
    l.battingOrders=l.battingOrders||{};l.battingOrders[seat.id]=[...order];return touch(l);
  }
  if(action==='ready'){
    const seat=belongs(l,body);if(l.status!=='lineup')err(409,'Not in lineup stage');
    l.readySeats=l.readySeats||[];
    if(body.ready===false)l.readySeats=l.readySeats.filter(id=>id!==seat.id);
    else if(!l.readySeats.includes(seat.id))l.readySeats.push(seat.id);
    const everyone=l.seats.every(s=>s.cpu||s.auto||l.readySeats.includes(s.id));
    if(everyone){makeSeason(l);l.lineupDeadline=0;}
    return touch(l);
  }
  if(action==='rename'){const seat=belongs(l,body);if(l.status==='season')err(409,'Season already complete');seat.name=validName(body.name);return touch(l);}
  if(action==='chat'){const seat=belongs(l,body);const message=String(body.text||'').trim().slice(0,220);if(!message)err(400,'Message is empty');
    l.chat.push({s:seat.id,t:message,at:now()});l.chat=l.chat.slice(-100);return touch(l);
  }
  if(action==='simulate'){host(l,body);if(l.status!=='lineup')err(409,'Finish the draft first');if(now()<l.lineupDeadline)err(409,'Wait until the lineup phase finishes');makeSeason(l);return touch(l);}
  err(404,'Unknown action');
}
function send(res,status,data){const s=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(s);}
const FILETYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
  if(pathname==='/api/health')return send(res,200,{ok:true,leagues:Object.keys(leagues).length});
  if(pathname==='/api/game'){
    if(req.method!=='POST'&&req.method!=='GET')err(405,'Method not allowed');
    let body={};if(req.method==='POST'){
      let input='';for await(const part of req){input+=part;if(input.length>20000)err(413,'Request too large');}
      try{body=JSON.parse(input||'{}')}catch{err(400,'Invalid JSON')}
    }
    return send(res,200,await api(url.searchParams.get('a')||'state',body,url.searchParams));
  }
  if(req.method!=='GET')err(405,'Method not allowed');
  const rel=(pathname==='/'||pathname==='/draft')?'index.html':pathname==='/engine.js'?'../engine.js':pathname.replace(/^\//,'');
  let file=path.resolve(PUBLIC,rel);
  if(rel==='../engine.js')file=path.resolve(__dirname,'engine.js');
  else if(!file.startsWith(PUBLIC+path.sep))err(403,'Forbidden');
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())err(404,'Not found');
  const ext=path.extname(file);res.writeHead(200,{'Content-Type':FILETYPES[ext]||'application/octet-stream','Cache-Control':ext==='.png'?'public,max-age=86400':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);
}catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Internal server error'});else res.end();}});
// Timers can also be enforced on read, so sleeping free hosts don't get stuck.
setInterval(()=>{for(const l of Object.values(leagues))advance(l);},1000).unref();
const port=Number(process.env.PORT||3000);if(require.main===module)server.listen(port,()=>console.log(`Pokémon Baseball is running at http://localhost:${port}`));
module.exports={server,leagues};
