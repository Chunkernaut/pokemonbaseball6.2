// Type bonus balance guard: all types have four roles; all role weights unchanged.
'use strict';
const assert=require('node:assert/strict');
const B=require('./engine');
const data=require('./public/pokemon-data.json');
assert.equal(B.SLOTS.length,15);
assert.equal(B.TYPES.length,18);
const counts=Object.fromEntries(B.TYPES.map(t=>[t,0]));
const reach=Object.fromEntries(B.TYPES.map(t=>[t,0]));
for(const {id} of B.FIELD_SLOTS){
  const role=B.ROLES[id];
  assert.ok(Math.abs(Object.values(role.stats).reduce((s,v)=>s+v,0)-1)<1e-9,id+' stats');
  assert.ok([7,8].includes(Object.keys(role.types).length),id+' type coverage');
  for(const [t,n] of Object.entries(role.types)){
    assert.ok(B.TYPES.includes(t),'unknown type '+t);
    assert.ok(Number.isInteger(n)&&n>=1&&n<=3,'invalid bonus '+t+':'+n);
    counts[t]++;reach[t]+=B.WEIGHTS[id]*n;
  }
}
for(const t of B.TYPES){ assert.equal(counts[t],4,t+' appearance count'); }
const v=Object.values(reach);assert.ok(Math.max(...v)-Math.min(...v)<=0.05,'type balance spread');
for(const id of [1,6,25,94,150,248,405,890,1025])for(const role of B.FIELD_SLOTS){
 const x=B.breakdown(data,id,role.id);assert.ok(x.fit>=0&&x.fit<=100);assert.ok(!x.parts.some(p=>p.stat==='hp'));assert.ok(x.bonus>=0&&x.bonus<=3);
}
console.log('PASS: 18 types × 4 positions, 7–8 per role, max +3, weighted opportunity %.3f–%.3f (Flying %.3f).'.replace('%.3f',Math.min(...v).toFixed(3)).replace('%.3f',Math.max(...v).toFixed(3)).replace('%.3f',reach.flying.toFixed(3)));
