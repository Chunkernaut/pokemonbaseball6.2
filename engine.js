/* Pokémon Baseball 2.0: fit definitions, scoring, inning-by-inning baseball season engine.
   No third party packages. All role percentages below total 100. */
(function(root,factory){const x=factory();if(typeof module==='object'&&module.exports)module.exports=x;root.Baseball=x;})(typeof globalThis==='object'?globalThis:this,function(){'use strict';
const SLOTS=[
{id:'C',name:'Catcher',x:50,y:89},{id:'1B',name:'First base',x:69,y:72},
{id:'2B',name:'Second base',x:57,y:52},{id:'3B',name:'Third base',x:30,y:72},
{id:'SS',name:'Shortstop',x:40,y:54},{id:'LF',name:'Left field',x:27,y:34},
{id:'CF',name:'Center field',x:50,y:26},{id:'RF',name:'Right field',x:73,y:34},
{id:'DH',name:'Designated hitter',x:88,y:87},{id:'P',name:'Pitcher',x:50,y:73},
{id:'BN1',name:'Bench 1'},{id:'BN2',name:'Bench 2'},{id:'BN3',name:'Bench 3'},{id:'BN4',name:'Bench 4'},{id:'BN5',name:'Bench 5'}];
const FIELD_SLOTS=SLOTS.slice(0,10),BENCH_SLOTS=SLOTS.slice(10);const FIELD_IDS=FIELD_SLOTS.map(s=>s.id);const BENCH_IDS=BENCH_SLOTS.map(s=>s.id);
const REGIONS={'1':'Kanto','2':'Johto','3':'Hoenn','4':'Sinnoh','5':'Unova','6':'Kalos','7':'Alola','8':'Galar','9':'Paldea'};const GENS=Object.keys(REGIONS);
const MODES={kanto:{name:'Kanto',gens:['1']},retro:{name:'Retro (Gen 1–4)',gens:['1','2','3','4']},wild:{name:'All generations',gens:GENS}};for(const g of GENS.slice(1))MODES['gen'+g]={name:REGIONS[g],gens:[g]};
const TYPES=['normal','fighting','flying','poison','ground','rock','bug','ghost','steel','fire','water','grass','electric','psychic','ice','dragon','dark','fairy'];
const STATS=['atk','def','spa','spd','spe','m','kg'];
const STAT_NAMES={hp:'HP',atk:'Attack',def:'Defense',spa:'Sp. Attack',spd:'Sp. Defense',spe:'Speed',m:'Height',kg:'Weight'};
// Relative importance of each Pokémon attribute BY BASEBALL POSITION; each row adds to 1.00.
// Type bonuses: each of the 18 types benefits exactly 4 roles, max +3 per role.
// Their team-weighted bonus opportunities differ by at most 0.05 points.
// Dual-types use the single largest bonus, never a sum. Fit is clamped to 0–100.
const ROLES={
 C:{stats:{atk:.10,def:.26,spa:.15,spd:.20,spe:.08,m:.11,kg:.10},types:{normal:2,poison:3,rock:3,steel:3,psychic:1,dragon:1,fairy:3}},
 '1B':{stats:{atk:.26,def:.15,spa:.10,spd:.11,spe:.08,m:.15,kg:.15},types:{normal:3,fighting:1,ground:3,rock:2,steel:1,grass:3,ice:2}},
 '2B':{stats:{atk:.10,def:.27,spa:.11,spd:.21,spe:.21,m:.06,kg:.04},types:{poison:1,bug:3,ghost:1,water:3,electric:3,psychic:3,fairy:2}},
 '3B':{stats:{atk:.23,def:.26,spa:.12,spd:.15,spe:.12,m:.07,kg:.05},types:{fighting:1,poison:2,ground:1,rock:2,steel:2,fire:2,dark:2}},
 SS:{stats:{atk:.09,def:.30,spa:.10,spd:.20,spe:.24,m:.05,kg:.02},types:{flying:2,ground:2,bug:2,ghost:3,electric:1,psychic:2,dark:3}},
 LF:{stats:{atk:.21,def:.19,spa:.12,spd:.15,spe:.22,m:.06,kg:.05},types:{normal:2,flying:1,poison:3,bug:1,ghost:2,fire:2,grass:1,dark:2}},
 CF:{stats:{atk:.10,def:.26,spa:.12,spd:.17,spe:.29,m:.04,kg:.02},types:{flying:3,bug:2,water:1,electric:2,ice:3,dragon:3,fairy:2}},
 RF:{stats:{atk:.25,def:.22,spa:.12,spd:.14,spe:.17,m:.06,kg:.04},types:{flying:2,rock:2,steel:3,fire:2,water:3,grass:2,ice:1,dragon:1}},
 DH:{stats:{atk:.38,def:.05,spa:.13,spd:.10,spe:.23,m:.06,kg:.05},types:{normal:2,fighting:2,fire:3,grass:3,dragon:3,dark:1,fairy:1}},
 P:{stats:{atk:.15,def:.07,spa:.40,spd:.18,spe:.04,m:.09,kg:.07},types:{fighting:2,ground:1,ghost:1,water:1,electric:1,psychic:1,ice:1}}
};
// Positional contribution to overall rating; pitcher dominates outcomes, but all ten matter.
const WEIGHTS={C:.095,'1B':.085,'2B':.085,'3B':.085,SS:.110,LF:.075,CF:.100,RF:.075,DH:.090,P:.200};
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));const norm=(v,l,h)=>clamp((v-l)/(h-l),0,1);
function gen(id){const ends=[151,251,386,493,649,721,809,905,1025];return String(ends.findIndex(v=>id<=v)+1);}
function pool(data,mode='wild',legends=true){const gs=(MODES[mode]||MODES.wild).gens;return data.names.map((_,i)=>i+1).filter(id=>gs.includes(gen(id))&&(legends||!data.leg.includes(id)));}
// Consistent transparent normalization, with logarithmic weight to prevent Wailord dominating.
function features(data,id){const p=data.mons[id-1],m=data.heights[id-1]/10;return {hp:norm(p.hp,20,150),atk:norm(p.atk,20,140),def:norm(p.def,20,140),spa:norm(p.spa,20,140),spd:norm(p.spd,20,140),spe:norm(p.spe,20,130),m:norm(m,.3,2.2),kg:norm(Math.log(Math.max(p.kg,.1)),Math.log(5),Math.log(400))};}
function breakdown(data,id,slot){if(!id||!ROLES[slot])return null;const role=ROLES[slot],f=features(data,id),parts=STATS.map(k=>({stat:k,label:STAT_NAMES[k],weight:role.stats[k],normalized:f[k],points:f[k]*role.stats[k]*100}));const types=data.mons[id-1].types;const bonus=Math.max(0,...types.map(t=>role.types[t]||0));const base=parts.reduce((s,x)=>s+x.points,0);return {slot,parts,base,bonus,fit:Math.round(clamp(base+bonus,0,100)),types,matchedTypes:types.filter(t=>role.types[t])};}
function positionScore(data,id,slot){return breakdown(data,id,slot)?.fit||0;}
// Internal game probabilities use original data; no synthesized baseball attributes are exposed to players.
function hiddenSkills(data,id){const f=features(data,id);return {power:(f.atk*.78+f.spa*.22)*100,contact:(f.atk*.42+f.spa*.28+f.spd*.18+f.spe*.12)*100,fielding:(f.def*.60+f.spd*.21+f.m*.10+f.kg*.09)*100,speed:f.spe*100,control:(f.spa*.63+f.spd*.23+f.def*.14)*100,velocity:(f.atk*.58+f.spa*.29+f.m*.08+f.kg*.05)*100};}

function scoreTeam(data,roster){const fits=FIELD_SLOTS.map(s=>({id:s.id,fit:positionScore(data,roster[s.id],s.id),weight:WEIGHTS[s.id]}));if(fits.some(x=>!roster[x.id]))return null;const weighted=fits.reduce((a,x)=>a+x.fit*x.weight,0);const bottom=[...fits].sort((a,b)=>a.fit-b.fit).slice(0,2);const weak=bottom.reduce((a,x)=>a+x.fit,0)/2;const raw=weighted*.84+weak*.16;
  const to1000=x=>Math.round(clamp((x-14)/78*1000,0,1000));const field=fits.filter(x=>!['P','DH'].includes(x.id)),bat=fits.filter(x=>x.id!=='P');const average=(a)=>a.reduce((s,x)=>s+x.fit,0)/a.length;
  return {score:to1000(raw),offense:to1000(average(bat)),defense:to1000(average(field)),pitching:to1000(fits.find(x=>x.id==='P').fit),raw:+raw.toFixed(2),weighted:+weighted.toFixed(2),weak:+weak.toFixed(2),fits};}
function rand(seed,i){let t=(seed+Math.imul(i+1,0x9e3779b9))|0;t=Math.imul(t^(t>>>16),0x21f0aaad);t=Math.imul(t^(t>>>15),0x735a2d97);return((t^(t>>>15))>>>0)/4294967296;}
function random(seed){let i=0;return()=>rand(seed,++i);}
function roll(data,seed,index,taken,mode='wild',legends=true){const a=pool(data,mode,legends).filter(id=>!taken.includes(id));const gs=[...new Set(a.map(gen))];if(!gs.length)return null;const g=gs[Math.floor(rand(seed,index*2)*gs.length)];const ts=[...new Set(a.filter(id=>gen(id)===g).flatMap(id=>data.mons[id-1].types))];return {gen:g,type:ts[Math.floor(rand(seed,index*2+1)*ts.length)]};}
function choicesFor(data,r,taken,mode='wild',legends=true){if(!r)return [];return pool(data,mode,legends).filter(id=>gen(id)===r.gen&&data.mons[id-1].types.includes(r.type)&&!taken.includes(id));}
function rerollType(data,o,seed,i,taken,mode='wild',legends=true){const a=pool(data,mode,legends).filter(id=>gen(id)===o.gen&&!taken.includes(id));const ts=[...new Set(a.flatMap(id=>data.mons[id-1].types))].filter(t=>t!==o.type);return ts.length?{gen:o.gen,type:ts[Math.floor(rand(seed,i)*ts.length)]}:null;}
function rerollGen(data,o,seed,i,taken,mode='wild',legends=true){const a=pool(data,mode,legends).filter(id=>data.mons[id-1].types.includes(o.type)&&!taken.includes(id));const gs=[...new Set(a.map(gen))].filter(g=>g!==o.gen);return gs.length?{gen:gs[Math.floor(rand(seed,i)*gs.length)],type:o.type}:null;}
// ----- Real rosters and season fatigue -----
const HITTERS=['CF','SS','1B','DH','RF','3B','LF','2B','C'];
// The order lists nine distinct starting Pokemon IDs. Never include the pitcher or bench.
function battingStarters(roster){return HITTERS.map(slot=>roster[slot]).filter(Boolean);}
function seededOrder(roster,seed){const ids=battingStarters(roster),a=[...ids];for(let i=a.length-1;i>0;i--){const j=Math.floor(rand(seed,i)* (i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function normalizeBattingOrder(roster,order){const ids=battingStarters(roster),seen=new Set();return [...(Array.isArray(order)?order:[]),...ids].filter(id=>ids.includes(id)&&!seen.has(id)&&seen.add(id));}
function validateBattingOrder(roster,order){const expected=battingStarters(roster);return Array.isArray(order)&&order.length===9&&new Set(order).size===9&&order.every(id=>expected.includes(id));}
// DH is the offensive specialist: prefill the completed lineup with its strongest
// hitter (using the simulator's hidden power/contact model), not simply the best fielder.
// This is a one-time suggestion at lineup start; players may still swap any two slots.
function strongestHitter(data,roster){
 const candidates=[...HITTERS,...BENCH_IDS].map(slot=>roster[slot]).filter(Boolean);
 return candidates.reduce((best,id)=>{
  const skill=hiddenSkills(data,id),value=.62*skill.power+.38*skill.contact;
  return !best||value>best.value?{id,value}:best;
 },null)?.id||null;
}
function preferStrongestDH(data,roster){
 const strongest=strongestHitter(data,roster);
 if(!strongest||roster.DH===strongest)return roster;
 const slot=[...HITTERS,...BENCH_IDS].find(k=>roster[k]===strongest);
 if(slot){const old=roster.DH;roster.DH=strongest;roster[slot]=old;}
 return roster;
}

const blankBatter=()=>({pa:0,ab:0,h:0,singles:0,doubles:0,triples:0,hr:0,bb:0,k:0,r:0,rbi:0,sb:0,cs:0});
const blankPitcher=()=>({outs:0,h:0,er:0,bb:0,k:0,bf:0,hr:0,w:0,l:0,qs:0,cg:0});
const OPPONENTS=['Pallet Town','Viridian City','Pewter City','Cerulean City','Vermilion City','Lavender Town','Celadon City','Fuchsia City','Saffron City','Cinnabar Island','New Bark','Goldenrod City','Rustboro City','Mauville City','Littleroot Town','Snowpoint City','Indigo Plateau','Castelia City'];
function createTeamState(data,roster,name='Team'){
 if(SLOTS.some(s=>!roster[s.id]))throw Error('All 15 roster positions must be filled.');
 if(new Set(SLOTS.map(s=>roster[s.id])).size!==15)throw Error('Each Pokémon can only appear once.');
 return {name,roster:{...roster},battingOrder:null,energy:Object.fromEntries(SLOTS.map(s=>[roster[s.id],100])),restNext:[],played:Object.fromEntries(SLOTS.map(s=>[roster[s.id],0])),score:scoreTeam(data,roster)};
}
function fatigueCost(data,id,slot){const hp=data.mons[id-1].hp;const base=slot==='P'?45:slot==='C'?19:slot==='DH'?11:16;return clamp(Math.round(base*100/(hp+25)),4,80);}
function dailyLineup(data,state){
 const rest=new Set(state.restNext),assigned=new Set(),roster={},substitutions=[];
 for(const slot of FIELD_IDS){const starter=state.roster[slot];if(!rest.has(starter)){roster[slot]=starter;continue;}
   const bench=BENCH_IDS.map(k=>state.roster[k]).filter(id=>!rest.has(id)&&!assigned.has(id));
   if(!bench.length)throw Error('Not enough available bench Pokémon for mandatory rest.');
   bench.sort((a,b)=>positionScore(data,b,slot)-positionScore(data,a,slot)||a-b);
   roster[slot]=bench[0];assigned.add(bench[0]);substitutions.push({position:slot,out:starter,in:bench[0]});
 }
 return {roster,substitutions,rested:[...rest]};
}
function side(data,roster,name='Team',state=null){
 const sc=scoreTeam(data,roster);if(!sc)throw Error('Starting lineup is incomplete.');
 const energy=id=>state?state.energy[id]??100:100;
 // An exhausted starter loses some effectiveness before mandatory rest; HP itself does not raise fit.
 const effectiveness=id=>energy(id)>=40?1:clamp(.75+energy(id)/160,.75,1);
 const batters=HITTERS.map(slot=>{const id=roster[slot],r=hiddenSkills(data,id),mult=effectiveness(id);return {slot,id,fit:positionScore(data,id,slot),r:{...r,power:r.power*mult,contact:r.contact*mult,speed:r.speed*mult}};});
 if(state?.battingOrder){
  // Resolve original lineup IDs through field slots so mandatory fatigue substitutes
  // inherit the resting starter's batting place instead of dropping out of the order.
  const order=normalizeBattingOrder(state.roster,state.battingOrder);
  const slotOf=Object.fromEntries(HITTERS.map(slot=>[state.roster[slot],slot]));
  const priority=Object.fromEntries(order.map((id,i)=>[slotOf[id],i]));
  batters.sort((a,b)=>(priority[a.slot]??99)-(priority[b.slot]??99));
 }else batters.sort((a,b)=>(b.r.contact*.50+b.r.speed*.20+b.r.power*.30)-(a.r.contact*.50+a.r.speed*.20+a.r.power*.30));
 const pId=roster.P,pR=hiddenSkills(data,pId),mult=effectiveness(pId);
 return {name,team:sc,batters,p:{slot:'P',id:pId,fit:positionScore(data,pId,'P'),r:{control:pR.control*mult,velocity:pR.velocity*mult}},fielding:sc.defense};
}
function mockSide(rating,name='Opponent'){
 const k=clamp(rating/1000,0,1),v=clamp(22+66*k,10,94);
 return {name,team:{score:rating,offense:rating,defense:rating,pitching:rating},fielding:rating,batters:HITTERS.map((slot,i)=>({slot,id:-(i+1),fit:v,r:{power:clamp(v+(i%3-1)*8,0,100),contact:clamp(v+((i*5)%13-6),0,100),speed:v,fielding:v}})),p:{id:-99,slot:'P',fit:v,r:{control:v,velocity:v}}};
}
// Every special moment is derived from the scored at-bats or the intentional late-inning
// arcade events. Metadata is carried into both solo and fantasy season playback.
function simulateMatch(away,home,seed){
 const rnd=random(seed),squads=[away,home],forceExtras=rnd()<.15,walkoffRoll=rnd()<.20;
 const noHitTarget=rnd()<.004?(rnd()<.5?0:1):-1; // ~0.4% preselected, pitcher must still win
 const box=squads.map(s=>({runs:0,hits:0,errors:0,fielderErrors:{},innings:[],batters:Object.fromEntries(s.batters.map(b=>[b.id,blankBatter()])),pitcher:blankPitcher()}));
 const orders=[0,0],moments=[],worstDeficit=[0,0];let inning=1,walkOff=null;
 const recordDeficit=()=>{worstDeficit[0]=Math.max(worstDeficit[0],box[1].runs-box[0].runs);worstDeficit[1]=Math.max(worstDeficit[1],box[0].runs-box[1].runs);};
 function half(off,def){const s=squads[off],p=squads[def].p,pitcher=box[def].pitcher,out=box[off];let outs=0,bases=[null,null,null],runs=0,guard=0;
  const move=(index,runner)=>{if(index>2){runs++;out.runs++;if(runner!=null)out.batters[runner].r++;}else bases[index]=runner;};
  while(outs<3&&guard++<50){const hitter=s.batters[orders[off]++%9],st=out.batters[hitter.id],r=hitter.r,pr=p.r;st.pa++;pitcher.bf++;
   const pitching=pr.control*.42+pr.velocity*.40+p.fit*.18,defense=squads[def].fielding/10;
   // A scoreless offense gets a modest late-game rally chance. This lowers the
   // previously excessive shutout rate without simply fabricating a run.
   const rally=inning>=5&&out.runs===0&&noHitTarget!==def?Math.min(1,(inning-4)/3):0;
   const walk=clamp(.086+(r.contact-pitching)*.00043+rally*.025,.035,.16),strike=clamp(.225+(pitching-r.contact)*.0015-rally*.06,.07,.37);
   const hr=clamp(.029+(r.power-pitching)*.00052+(hitter.fit-60)/180*.045+rally*.015,.007,.115);
   const hit=clamp(.255+(r.contact-pitching)*.00125-defense*.0015+rally*.115,.16,.45);
   const runners=bases.filter(x=>x!=null).length,oldRuns=runs;
   const eligibleWalkoff=off===1&&inning>=9&&(!forceExtras||inning>9)&&walkoffRoll&&!walkOff&&box[1].runs<=box[0].runs&&(box[0].runs-box[1].runs)<runners+1;
   const z=eligibleWalkoff?walk+strike+hr/2:rnd();
   if(z<walk){st.bb++;pitcher.bb++;if(bases[0]!=null&&bases[1]!=null&&bases[2]!=null){move(3,bases[2]);bases[2]=null;}if(bases[0]!=null&&bases[1]!=null){bases[2]=bases[1];bases[1]=null;}if(bases[0]!=null){bases[1]=bases[0];bases[0]=null;}bases[0]=hitter.id;}
   else{st.ab++;if(z<walk+strike||noHitTarget===def){outs++;st.k++;pitcher.k++;}
    else if(z<walk+strike+hr){st.h++;st.hr++;out.hits++;pitcher.h++;pitcher.hr++;const loaded=runners===3;for(let x=2;x>=0;x--)if(bases[x]!=null){move(3,bases[x]);bases[x]=null;}move(3,hitter.id);
     if(loaded)moments.push({type:'grand_slam',team:off,player:hitter.id,inning});
     if(off===1&&inning>=9&&out.runs>box[0].runs)walkOff={type:'walkoff',team:1,player:hitter.id,inning};
    }
    else if(z<walk+strike+hr+hit){st.h++;out.hits++;pitcher.h++;const extra=rnd(),kind=extra<.71?1:extra<.945?2:3;if(kind===1)st.singles++;else if(kind===2)st.doubles++;else st.triples++;
     for(let x=2;x>=0;x--)if(bases[x]!=null){const next=x+kind+(kind===1&&x===0&&rnd()<.19?1:0);move(next,bases[x]);bases[x]=null;}bases[kind-1]=hitter.id;
    }else{
      // A misplayed ball can put a hitter aboard without counting as a hit.
      const chances=clamp(.027-squads[def].fielding*.000023,.003,.027);
      const defenders=squads[def].batters.filter(x=>x.slot!=='DH');
      if(defenders.length&&rnd()<chances){
        const who=defenders[Math.floor(rnd()*defenders.length)];
        box[def].errors++;box[def].fielderErrors[who.id]=(box[def].fielderErrors[who.id]||0)+1;
        if(bases[0]!=null&&bases[1]!=null&&bases[2]!=null){move(3,bases[2]);bases[2]=null;}
        if(bases[0]!=null&&bases[1]!=null){bases[2]=bases[1];bases[1]=null;}
        if(bases[0]!=null){bases[1]=bases[0];bases[0]=null;}bases[0]=hitter.id;
      }else outs++;
     }
   }
   st.rbi+=runs-oldRuns;pitcher.er+=runs-oldRuns;
   if(outs<3&&bases[0]!=null&&bases[1]==null&&rnd()<clamp((s.batters.find(x=>x.id===bases[0])?.r.speed||40)*.00032,0,.03)){
     const runner=bases[0],speed=s.batters.find(x=>x.id===runner)?.r.speed||40;
     if(rnd()<clamp(.52+speed*.004,.55,.96)){out.batters[runner].sb++;bases[1]=runner;}
     else{out.batters[runner].cs++;outs++;}
     bases[0]=null;
   }
   if(off===1&&inning>=9&&(!forceExtras||inning>9)&&box[1].runs>box[0].runs)break;
  }
  pitcher.outs+=outs;recordDeficit();return runs;
 }
 while(inning<=15){const first=half(0,1);box[0].innings.push(first);
  if(inning>=9&&(!forceExtras||inning>9)&&box[1].runs>box[0].runs){box[1].innings.push(null);break;}
  const second=half(1,0);box[1].innings.push(second);
  if(inning===9&&forceExtras&&box[0].runs!==box[1].runs){
   // A deliberate late rally forces the selected 15% extra-innings scenario. Credit
   // the tying runs as bases-loaded walks to keep score, RBI and pitcher ER in sync.
   const behind=box[0].runs<box[1].runs?0:1,need=Math.abs(box[0].runs-box[1].runs),ahead=1-behind;
   const batter=squads[behind].batters[(orders[behind]-1+9)%9].id,bt=box[behind].batters[batter];
   box[behind].runs+=need;box[behind].innings.at(-1);box[behind].innings[box[behind].innings.length-1]+=need;
   bt.pa+=need;bt.bb+=need;bt.rbi+=need;box[ahead].pitcher.bb+=need;box[ahead].pitcher.bf+=need;box[ahead].pitcher.er+=need;
   moments.push({type:'ninth_inning_rally',team:behind,inning:9});recordDeficit();
  }
  if(inning>=9&&(!forceExtras||inning>9)&&box[0].runs!==box[1].runs)break;
  inning++;
 }
 if(box[0].runs===box[1].runs){const win=rnd()<.5?0:1,batter=squads[win].batters[orders[win]%9].id;box[win].runs++;box[win].innings[box[win].innings.length-1]++;box[win].batters[batter].rbi++;box[win].batters[batter].pa++;box[win].batters[batter].bb++;box[1-win].pitcher.bb++;box[1-win].pitcher.er++;}
 const winner=box[0].runs>box[1].runs?0:1,loser=1-winner;
 // Every team has one pitcher per game; credit decisions and quality starts.
 for(let team=0;team<2;team++){
  const stats=box[team].pitcher;
  if(team===winner)stats.w++;else stats.l++;
  if(stats.outs>=18&&stats.er<=3)stats.qs++;
  if(stats.outs>=27)stats.cg++;
 }
 if(walkOff&&winner===1)moments.push(walkOff);
 if(box[loser].hits===0&&box[winner].pitcher.outs>=27)moments.push({type:'no_hitter',team:winner,player:squads[winner].p.id,inning:box[0].innings.length});
 // Dominant Game replaces the old shutout/complete-game-shutout event.
 // Only genuine 5–0-or-better wins are highlighted; no extra runs are added.
 if(box[loser].runs===0&&box[winner].runs>=5)moments.push({type:'dominant',team:winner,player:squads[winner].p.id,margin:box[winner].runs});
 if(worstDeficit[winner]>=5)moments.push({type:'comeback',team:winner,deficit:worstDeficit[winner]});
 for(let team=0;team<2;team++)for(const [id,st] of Object.entries(box[team].batters))if(st.hr>=3)moments.push({type:'three_homers',team,player:Number(id),count:st.hr});
 return {away:box[0],home:box[1],winner:winner===0?'away':'home',innings:box[0].innings.length,special:moments};
}
function emptyStats(state){return {players:Object.fromEntries(Object.values(state.roster).map(id=>[id,{id,b:blankBatter(),p:blankPitcher(),g:0,rested:0,errors:0,starts:0,positions:{}}])),games:0};}
function addStats(agg,box,active,report=null){agg.games++;for(const id of report?.rested||[])if(agg.players[id])agg.players[id].rested++;
 for(const [slot,id] of Object.entries(active)){
  const x=agg.players[id];if(!x)continue;x.g++;x.errors+=(box.fielderErrors?.[id]||0);x.positions[slot]=(x.positions[slot]||0)+1;
  const stats=slot==='P'?box.pitcher:box.batters[id];if(!stats)continue;
  if(slot==='P')for(const k of Object.keys(stats))x.p[k]+=stats[k];else for(const k of Object.keys(stats))x.b[k]+=stats[k];
 }
}
function finalizeStats(state,agg){const batters=[],pitchers=[];for(const id of Object.values(state.roster)){
 const x=agg.players[id],b={...x.b},p=x.p;b.id=id;b.g=x.g;b.rested=x.rested;b.e=x.errors;b.sbpct=(b.sb+b.cs)?((b.sb/(b.sb+b.cs))*100).toFixed(1)+'%':'—';b.positions=x.positions;b.avg=b.ab?(b.h/b.ab).toFixed(3):'.000';b.obp=b.ab+b.bb?((b.h+b.bb)/(b.ab+b.bb)).toFixed(3):'.000';b.slg=b.ab?(b.singles+2*b.doubles+3*b.triples+4*b.hr)/b.ab:0;b.slg=Number(b.slg).toFixed(3);b.ops=(Number(b.obp)+Number(b.slg)).toFixed(3);batters.push(b);
 pitchers.push({id,g:x.positions.P||0,rested:x.rested,ip:`${Math.floor(p.outs/3)}.${p.outs%3}`,era:p.outs?+(p.er*27/p.outs).toFixed(2):0,whip:p.outs?+((p.bb+p.h)*3/p.outs).toFixed(2):0,so:p.k,bb:p.bb,er:p.er,h:p.h,hr:p.hr,w:p.w,l:p.l,qs:p.qs,cg:p.cg});
 }
 return {batters,pitchers,games:agg.games};}
function finishDay(data,state,daily,batting={}){const used=Object.entries(daily.roster),tired=[],oldRest=[...state.restNext];
 // A Pokémon missing this game recovers fully and is eligible to return next game.
 for(const id of oldRest)state.energy[id]=100;
 // Unused bench Pokémon recover between games (one mandatory rest fully restores energy).
 const activeIds=new Set(used.map(([,id])=>id));for(const slot of BENCH_IDS){const id=state.roster[slot];if(!activeIds.has(id))state.energy[id]=Math.min(100,state.energy[id]+30);}
 const fatigue=[];for(const [position,id] of used){const before=state.energy[id],usedEnergy=fatigueCost(data,id,position)+(position!=='P'&&((batting[id]?.pa||0)>=5)?1:0);state.energy[id]=Math.max(0,before-usedEnergy);state.played[id]++;if(state.energy[id]<=25)fatigue.push({id,position,energy:state.energy[id],cost:usedEnergy});}
 const benchId=new Set(BENCH_IDS.map(k=>state.roster[k]));const benchTired=fatigue.filter(x=>benchId.has(x.id));const startersTired=fatigue.filter(x=>!benchId.has(x.id)).sort((a,b)=>a.energy-b.energy);
 // Every exhausted bench Pokémon is automatically off for the following game, too.
 // Never schedule more starter rest days than the eligible bench can actually cover.
 const availableBench=5-benchTired.length;
 const scheduled=startersTired.slice(0,Math.max(0,availableBench));
 for(const deferred of startersTired.slice(availableBench))state.energy[deferred.id]=26; // reaches threshold on its next appearance
 const restNext=[...scheduled,...benchTired];state.restNext=restNext.map(t=>t.id);
 for(const t of restNext)tired.push({id:t.id,position:t.position,energy:t.energy});
 return {tired,substitutions:daily.substitutions,rested:oldRest,energy:Object.fromEntries(used.map(([slot,id])=>[id,state.energy[id]]))};
}
function playGame(data,awayState,homeState,seed){
 const da=dailyLineup(data,awayState),dh=dailyLineup(data,homeState);
 const away=side(data,da.roster,awayState.name,awayState),home=side(data,dh.roster,homeState.name,homeState);
 const g=simulateMatch(away,home,seed),ae=finishDay(data,awayState,da,g.away.batters),he=finishDay(data,homeState,dh,g.home.batters);
 return {...g,awayLineup:da.roster,homeLineup:dh.roster,awayEvents:ae,homeEvents:he};
}
function singleSeason(data,roster,seed,battingOrder=null){const state=createTeamState(data,roster,'Your Team');state.battingOrder=validateBattingOrder(roster,battingOrder)?[...battingOrder]:null;const agg=emptyStats(state),games=[];let wins=0;
 for(let i=0;i<162;i++){const n=i%OPPONENTS.length,rating=370+n*30+(Math.floor(i/18)%3)*14,opp=mockSide(rating,OPPONENTS[n]);const home=i%2===0;
  const daily=dailyLineup(data,state),team=side(data,daily.roster,'Your Team',state);
  const g=home?simulateMatch(opp,team,seed+i*9871):simulateMatch(team,opp,seed+i*9871);
  const result=home?g.home:g.away,other=home?g.away:g.home;addStats(agg,result,daily.roster,{rested:[...state.restNext]});
  const report=finishDay(data,state,daily,result.batters),win=home?g.winner==='home':g.winner==='away';wins+=+win;
  games.push({number:i+1,opponent:opp.name,rating,home,win,us:result.runs,them:other.runs,hits:result.hits,innings:g.innings,line:{us:result.innings,them:other.innings},...report,activeLineup:daily.roster,special:g.special});
 }
 const stats=finalizeStats(state,agg);return {rating:state.score,wins,losses:162-wins,games,stats,awards:seasonAwards(data,{'solo':stats},{solo:roster}),seasonLength:162,perfect:wins===162};
}
// Awards are computed from the recorded season totals, not randomized after the fact.
// Gold Glove is a defensive-usage proxy (fit + field games); there are no individual error records yet.
// Rookie eligibility uses BST <= 400 as an explicit fan-game rule, not evolution stage.
function seasonAwards(data,statsByTeam,rosters){
 const players=[];
 for(const [team,stats] of Object.entries(statsByTeam)){
  const pitcher=Object.fromEntries((stats.pitchers||[]).map(x=>[x.id,x]));
  for(const b of stats.batters||[]){
   const p=pitcher[b.id]||{},pokemon=data.mons[b.id-1];if(!pokemon)continue;
   const baseTotal=['hp','atk','def','spa','spd','spe'].reduce((n,k)=>n+pokemon[k],0);
   const starts=Object.keys(b.positions||{}).filter(x=>B_IS_FIELD(x));
   const fieldGames=starts.filter(x=>x!=='P'&&x!=='DH').reduce((n,k)=>n+b.positions[k],0);
   const glove=fieldGames?starts.filter(x=>x!=='P'&&x!=='DH').reduce((n,k)=>n+(b.positions[k]||0)*positionScore(data,b.id,k),0)/Math.max(1,fieldGames):0;
   const ops=Number(b.ops)||0;
   players.push({team,id:b.id,b,p,bst:baseTotal,fieldGames,glove,
    slugger:ops*Math.min(1,b.pa/350),mvp:(ops*85+b.rbi*.22+b.r*.12+(p.so||0)*.1-(p.er||0)*.06)*Math.min(1,Math.max(b.pa/400,(p.g||0)/80)),
    cy:(p.g||0)>=3? ((p.so||0)*.65+(p.g||0)*.55-(p.era||0)*9-(p.whip||0)*14): -9999});
  }
 }
 const best=(filter,score)=>players.filter(filter).sort((a,b)=>score(b)-score(a)||a.id-b.id)[0]||null;
 const out=[
  {key:'mvp',name:'Most Valuable Pokémon',why:'Best all-around season contribution',p:best(x=>x.b.pa>=50||x.p.g>=3,x=>x.mvp)},
  {key:'cy',name:'Cy Young',why:'Top season pitching performance',p:best(x=>x.p.g>=3,x=>x.cy)},
  {key:'glove',name:'Gold Glove',why:'Defensive fit, playing time, and fewer errors',p:best(x=>x.fieldGames>=10,x=>(x.glove-Math.min(25,((x.b.e||0)/Math.max(x.fieldGames,1))*120))*x.fieldGames/(x.fieldGames+15))},
  {key:'slugger',name:'Silver Slugger',why:'Highest OPS with playing-time adjustment',p:best(x=>x.b.pa>=20,x=>x.slugger)},
  {key:'rookie',name:'Rookie of the Year',why:'Best season among Pokémon with base-stat total of 400 or less',p:best(x=>x.bst<=400&&(x.b.pa>=20||x.p.g>=3),x=>x.mvp)}
 ];return out.map(({p,...x})=>({...x,team:p?.team||null,id:p?.id||null}));
}
function B_IS_FIELD(s){return FIELD_IDS.includes(s);}
function winChance(a,b){return 1/(1+Math.exp(-(a-b)/110));}
function game(data,rosterA,rosterB,seed){const x=simulateMatch(side(data,rosterA),side(data,rosterB),seed);return {a:x.away.runs,b:x.home.runs,winner:x.winner==='away'?'a':'b',lineA:x.away.innings,lineB:x.home.innings,detail:x};}
function seasonStats(data,roster,games,seed){const state=createTeamState(data,roster),agg=emptyStats(state);for(let i=0;i<games;i++){const daily=dailyLineup(data,state),g=simulateMatch(side(data,daily.roster,'Team',state),mockSide(550+(i%6)*60),seed+i*1009);addStats(agg,g.away,daily.roster);finishDay(data,state,daily);}return finalizeStats(state,agg);}
function schedulePairs(count){const pairs=[];const full=Math.floor(162/(count-1));for(let c=0;c<full;c++)for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)pairs.push({a:i,b:j,cycle:c});const remain=162-full*(count-1);if(remain===2){for(let i=0;i<count;i++)pairs.push({a:i,b:(i+1)%count,cycle:full});}return pairs;}
function leagueSeason(data,seats,teams,seed,battingOrders={}){
 const states=seats.map(s=>{const state=createTeamState(data,teams[s.id],s.name);state.battingOrder=validateBattingOrder(teams[s.id],battingOrders[s.id])?[...battingOrders[s.id]]:null;return state;}),agg=states.map(emptyStats);
 const rows=seats.map((s,i)=>({id:s.id,name:s.name,w:0,l:0,rs:0,ra:0,score:states[i].score})),games=[];
 const pairs=schedulePairs(seats.length);let idx=0;
 for(const pair of pairs){const home=(pair.cycle+pair.a+pair.b)%2?pair.a:pair.b,away=home===pair.a?pair.b:pair.a;
   const g=playGame(data,states[away],states[home],seed+idx++*9137);
   addStats(agg[away],g.away,g.awayLineup,g.awayEvents);addStats(agg[home],g.home,g.homeLineup,g.homeEvents);
   const x=rows[away],y=rows[home];x.rs+=g.away.runs;x.ra+=g.home.runs;y.rs+=g.home.runs;y.ra+=g.away.runs;
   if(g.winner==='away'){x.w++;y.l++;}else{y.w++;x.l++;}
   games.push({n:idx,h:seats[home].id,a:seats[away].id,hs:g.home.runs,as:g.away.runs,hi:g.home.hits,ai:g.away.hits,inningsHome:g.home.innings,inningsAway:g.away.innings,extras:g.innings>9,homeEvents:g.homeEvents,awayEvents:g.awayEvents,homeLineup:g.homeLineup,awayLineup:g.awayLineup,special:g.special});
 }
 rows.sort((a,b)=>b.w-a.w||(b.rs-b.ra)-(a.rs-a.ra)||b.score.score-a.score.score);
 // Postseason bracket: 3 teams -> best-of-seven final; 4 teams -> semifinals;
 // 5–6 teams -> wildcard round plus semifinals. Top seeds receive byes.
 const indexOf=id=>seats.findIndex(s=>s.id===id);
 const bracket=[];let playoffSeed=0;
 function series(idA,idB,round,winsNeeded){
  const ia=indexOf(idA),ib=indexOf(idB);let wa=0,wb=0;const seriesGames=[];
  while(wa<winsNeeded&&wb<winsNeeded){
   const i=seriesGames.length,home=i%2?ib:ia,away=i%2?ia:ib;
   const g=playGame(data,states[away],states[home],seed+923847+(playoffSeed++)*3907);
   addStats(agg[away],g.away,g.awayLineup,g.awayEvents);addStats(agg[home],g.home,g.homeLineup,g.homeEvents);
   const winnerIndex=g.winner==='home'?home:away;
   if(winnerIndex===ia)wa++;else wb++;
   seriesGames.push({game:i+1,round,h:seats[home].id,a:seats[away].id,hs:g.home.runs,as:g.away.runs,inningsHome:g.home.innings,inningsAway:g.away.innings,homeEvents:g.homeEvents,awayEvents:g.awayEvents,special:g.special});
  }
  const winner=wa===winsNeeded?idA:idB;
  bracket.push({round,teamA:idA,teamB:idB,winA:wa,winB:wb,winner,games:seriesGames});
  return winner;
 }
 const seedId=n=>rows[n-1].id;
 let finalists;
 if(seats.length===3){finalists=[seedId(1),seedId(2)];}
 else if(seats.length===4){
  const semi1=series(seedId(1),seedId(4),'Semifinal',3);
  const semi2=series(seedId(2),seedId(3),'Semifinal',3);
  finalists=[semi1,semi2];
 }else if(seats.length===5){
  const wild=series(seedId(4),seedId(5),'Wild Card',2);
  const semi1=series(seedId(1),wild,'Semifinal',3);
  const semi2=series(seedId(2),seedId(3),'Semifinal',3);
  finalists=[semi1,semi2];
 }else{
  const wildA=series(seedId(3),seedId(6),'Wild Card',2);
  const wildB=series(seedId(4),seedId(5),'Wild Card',2);
  const semi1=series(seedId(1),wildB,'Semifinal',3);
  const semi2=series(seedId(2),wildA,'Semifinal',3);
  finalists=[semi1,semi2];
 }
 const champion=series(finalists[0],finalists[1],'World Series',4);
 const playoff=bracket.at(-1).games;
 const stats={};seats.forEach((s,i)=>{stats[s.id]=finalizeStats(states[i],agg[i]);});
 return {seed,seasonLength:162,weekCount:162,games,standings:rows,playoff,bracket,final:playoff.at(-1),champion,stats,awards:seasonAwards(data,stats,teams)};
}
return {SLOTS,FIELD_SLOTS,BENCH_SLOTS,FIELD_IDS,BENCH_IDS,REGIONS,GENS,MODES,TYPES,STATS,STAT_NAMES,ROLES,WEIGHTS,gen,pool,features,breakdown,positionScore,scoreTeam,rand,roll,choicesFor,rerollType,rerollGen,winChance,game,seasonStats,singleSeason,simulateMatch,side,mockSide,schedulePairs,leagueSeason,battingStarters,seededOrder,normalizeBattingOrder,validateBattingOrder,seasonAwards,fatigueCost,strongestHitter,preferStrongestDH,createTeamState,dailyLineup,finishDay};
});
