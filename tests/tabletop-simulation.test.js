import assert from 'node:assert/strict';
import test from 'node:test';
import {createJailbreak,reduceJailbreak,getLegalMoves,JAILBREAK_MAP,SKILLS} from '../src/tabletop/engine.js';
import {rangeDistance,isInFormRange} from '../src/tabletop/battle-rules.js';
test('150 seeded encounters terminate and preserve physical dice, health and cooldown invariants', () => {
let wins=0,losses=0;
for(let seed=1;seed<=150;seed++){
 let n=seed;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296};
 let s=createJailbreak();let steps=0;
 const act=a=>{s=reduceJailbreak(s,a,{random});steps++;
  const tracks=s.heroes.flatMap(h=>h.cooldown);
  assert.equal(s.supply.light+tracks.filter(d=>d.kind==='light-fatigue').length,20);
  assert.equal(s.supply.over+tracks.filter(d=>d.kind==='overfatigue').length,12);
  for(const h of s.heroes){assert.ok(h.hp>=0&&h.hp<=h.maxHp);assert.ok(h.cooldown.length<=13);assert.ok(h.dice.filter(d=>d.state==='active').length<=4);if(!h.hp)assert.equal(h.dice.filter(d=>d.state==='active').length,0);for(const d of h.dice)assert.equal(h.cooldown.filter(q=>q.id===d.id).length,d.state==='cooldown'?1:0);}
 };
 while(s.phase!=='complete'&&steps<220){
  const h=s.heroes[s.activeHero];
  if(s.phase==='start'){act({type:'begin-turn'});continue;}
  if(s.phase==='roll'){
   const active=h.dice.filter(d=>d.state==='active');if(active.length){act({type:'dismiss-active',diceIds:active.map(d=>d.id)});continue;}
   const hp=s.heroes.filter(h=>h.hp>0&&!h.escaped).sort((a,b)=>b.hp-a.hp);let skip=[],backlashTargets={};let remaining=hp.map(h=>h.hp);
   for(const r of s.pending.results)if(r.face.backlash){const i=remaining.indexOf(Math.max(...remaining));if(remaining[i]<=1){skip.push(r.dieId);}else{backlashTargets[r.dieId]=hp[i].id;remaining[i]--;}}
   act({type:'resolve',skip,backlashTargets});continue;
  }
  if(s.phase==='enemy-defense'){const h=s.heroes.find(h=>h.id===s.pending.heroId);act({type:'defend',diceIds:h.dice.filter(d=>d.state==='active').map(d=>d.id)});continue;}
  if(s.turn.engages){act({type:'end-turn'});continue;}
  const form=h.id==='argonian'?'light-weapon':'magic';
  let targets=s.enemies.filter(e=>e.hp>0);
  if(!targets.length){act({type:'end-turn'});continue;}
  if(!s.turn.moves){const moves=getLegalMoves(s);moves.sort((a,b)=>Math.min(...targets.map(t=>rangeDistance(JAILBREAK_MAP,a,t.position)))-Math.min(...targets.map(t=>rangeDistance(JAILBREAK_MAP,b,t.position))));if(moves.length&&!targets.some(t=>isInFormRange(JAILBREAK_MAP,h.position,t.position,{...h,form}))){act({type:'move',to:moves[0]});continue;}}
  targets=targets.filter(t=>isInFormRange(JAILBREAK_MAP,h.position,t.position,{...h,form}));
  const dice=h.dice.filter(d=>d.state==='available'&&(d.skill==='combat'?form!=='magic':SKILLS[d.skill].forms.includes(form)));
  if(targets.length&&dice.length){act({type:'engage',form,targetId:targets[0].id,diceIds:dice.map(d=>d.id)});}
  else act({type:'end-turn'});
 }
 assert.equal(s.phase,'complete',`seed${seed} did not terminate`);
 if(s.outcome==='victory')wins++;else losses++;
}
assert.equal(wins+losses,150);
});
