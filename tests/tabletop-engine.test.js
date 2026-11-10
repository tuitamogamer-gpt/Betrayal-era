import test from 'node:test';
import assert from 'node:assert/strict';
import { createJailbreak, reduceJailbreak, getLegalMoves, JAILBREAK_MAP, SKILLS } from '../src/tabletop/engine.js';

const act = (state, action, rolls = []) => reduceJailbreak(state, action, { random: () => {
  assert.ok(rolls.length, `Unexpected random roll during ${action.type}`);
  return rolls.shift();
} });
const dice = (hero, skill) => hero.dice.filter(die => !skill || die.skill === skill).map(die => die.id);
function startHero(state) { return act(state, { type: 'begin-turn' }); }

function firstRound() {
  // Official extended tutorial pp11–18, exact positions, chosen results and
  // prevention decisions. These are injected test outcomes, not rigged RNG.
  let state = startHero(createJailbreak());
  state = act(state, { type: 'move', to: '4,0' });
  state = act(state, { type: 'engage', form: 'light-weapon', targetId: 'high-elf-bandit', diceIds: dice(state.heroes[0]) }, [0, .2, .2]);
  state = act(state, { type: 'resolve' });
  assert.equal(state.enemies[0].hp, 2);
  assert.equal(state.heroes[0].tenacity, 1);
  state = act(state, { type: 'end-turn' });
  state = startHero(state);
  state = act(state, { type: 'move', to: '6,2' });
  state = act(state, { type: 'engage', form: 'magic', targetId: 'high-elf-bandit', diceIds: dice(state.heroes[1], 'force-shock') }, [.2, .7]);
  state = act(state, { type: 'resolve', backlashHeroId: 'argonian' });
  assert.equal(state.enemies[0].hp, 0);
  assert.equal(state.heroes[0].hp, 4);
  state = act(state, { type: 'engage', form: 'defensive', diceIds: dice(state.heroes[1], 'combat') }, [.2, .2]);
  state = act(state, { type: 'resolve' });
  state = act(state, { type: 'end-turn' }, [.9]);
  assert.equal(state.enemies[1].position, '3,5');
  assert.equal(state.pending.damage, 2);
  assert.deepEqual(state.pending.targets, ['argonian', 'dark-elf']);
  state = act(state, { type: 'defend', diceIds: [dice(state.heroes[0], 'shield-discipline')[0]] });
  return act(state, { type: 'defend', diceIds: dice(state.heroes[1], 'combat') });
}

test('R92/T8–10: 33-hex map, actual two-adventurer stats and solo/co-op ownership', () => {
  const state = createJailbreak();
  assert.equal(Object.keys(JAILBREAK_MAP.cells).length, 33);
  assert.equal(Object.values(JAILBREAK_MAP.cells).filter(cell => cell.exit).length, 3);
  assert.deepEqual(state.heroes.map(hero => [hero.hp, hero.stamina, hero.magicka, hero.cooldownStat, hero.ownerSeat]), [[5,3,2,2,0], [4,2,3,2,0]]);
  assert.deepEqual(state.heroes.map(hero => dice(hero,'combat').length), [1,2]);
  assert.equal(state.partyXp, 1); assert.equal(state.day, null); assert.equal(state.difficulty, 'Adept');
  assert.deepEqual(createJailbreak({ players: [{ seat: 0 }, { seat: 1 }] }).heroes.map(hero => hero.ownerSeat), [0,1]);
  assert.throws(() => createJailbreak({ players: [{seat:0},{seat:1},{seat:2}] }), { code: 'FIXTURE_PLAYERS' });
  for (const cell of Object.values(JAILBREAK_MAP.cells)) for (const neighbor of cell.neighbors) assert.ok(JAILBREAK_MAP.cells[neighbor].neighbors.includes(cell.id));
});

test('T11–18: full prescribed first round reproduces HP, queue order, active slots and recovery', () => {
  let state = firstRound();
  assert.equal(state.round, 2); assert.equal(state.phase, 'start'); assert.equal(state.activeHero, 0);
  assert.deepEqual(state.heroes.map(hero => hero.hp), [3,4]);
  assert.deepEqual(state.heroes[0].cooldown.map(die => die.skill ?? die.kind), ['combat','shield-discipline','light-fatigue']);
  assert.deepEqual(state.heroes[1].cooldown.map(die => die.skill ?? die.kind), ['force-shock','force-shock','light-fatigue','combat','combat','light-fatigue']);
  assert.equal(state.heroes[0].dice.filter(die => die.state === 'active').length, 1);
  assert.equal(state.heroes[1].dice.filter(die => die.state === 'active').length, 0);
  assert.deepEqual(state.supply, { light: 17, over: 12, status: 12 });
  state = startHero(state);
  assert.deepEqual(state.heroes[0].cooldown.map(die => die.kind), ['light-fatigue']);
  assert.equal(state.heroes[0].dice.filter(die => die.state === 'available').length, 2);
});

test('Published face frequencies: Combat and Shield match; all Force Shock outcomes resolve', () => {
  assert.deepEqual(SKILLS.combat.faces.map(face => face.value), [0,1,1,1,1,2]);
  assert.deepEqual(SKILLS['shield-discipline'].faces.map(face => face.value), [0,1,1,1,1,2]);
  assert.deepEqual(SKILLS['force-shock'].faces.map(face => face.value), [0,2,2,2,4,0]);
  assert.deepEqual(SKILLS['force-shock'].faces.map(face => face.tenacity ?? 0), [1,0,0,0,0,2]);
});

test('R59–61: movement, blocked hexes, second move and magic Combat limits are enforced atomically', () => {
  const initial = createJailbreak(); const before = structuredClone(initial);
  assert.throws(() => act(initial, { type:'move', to:'6,2' }), { code:'WRONG_PHASE' });
  assert.deepEqual(initial, before);
  let state = startHero(initial);
  assert.ok(getLegalMoves(state).includes('4,0'));
  assert.ok(!getLegalMoves(state).includes('3,1'));
  assert.ok(!getLegalMoves(state).includes('8,2'));
  state = act(state, {type:'move',to:'6,2'});
  state = act(state, {type:'move',to:'5,1'});
  assert.throws(() => act(state, {type:'engage',form:'defensive',diceIds:[]}), { code:'ENGAGE_AFTER_SECOND_MOVE' });
  state = startHero(createJailbreak());
  assert.throws(() => act(state, {type:'engage',form:'magic',diceIds:dice(state.heroes[0],'combat')}), {code:'COMBAT_IN_MAGIC'});
  assert.throws(() => act(state, {type:'engage',form:'light-weapon',targetId:'high-elf-bandit',diceIds:[]}), {code:'INVALID_TARGET'});
});

test('R59: second engagement adds light fatigue without reducing maximum HP', () => {
  let state = startHero(createJailbreak());
  state = act(state, {type:'engage',form:'defensive',diceIds:[]});
  state = act(state, {type:'resolve'});
  state = act(state, {type:'engage',form:'defensive',diceIds:[]});
  assert.deepEqual(state.heroes[0].cooldown.map(die=>die.kind), ['light-fatigue']);
  assert.equal(state.heroes[0].hp,5); assert.equal(state.heroes[0].maxHp,5); assert.equal(state.supply.light,19);
});

test('Official Dodge FAQ: Force Shock backlash counts as damage from its tenacity face', () => {
  let state = createJailbreak(); state.activeHero = 1;
  state.heroes[1].position = '6,2'; state = startHero(state);
  state = act(state, {type:'engage',form:'magic',targetId:'high-elf-bandit',diceIds:dice(state.heroes[1],'force-shock')}, [.2,.9]);
  state = act(state, {type:'resolve',backlashHeroId:'argonian'});
  assert.equal(state.enemies[0].hp,1); // Dodge prevents zero: both dice deal damage.
  assert.equal(state.heroes[1].tenacity,2);
  assert.equal(state.heroes[0].hp,4);
});

test('R60: unresolved results exhaust without tenacity; per-die backlash choices are independent', () => {
  let state = createJailbreak(); state.activeHero = 1; state = startHero(state);
  const selected = dice(state.heroes[1],'force-shock');
  state = act(state, {type:'engage',form:'magic',diceIds:selected}, [0,.9]);
  state = act(state, {type:'resolve',skip:[selected[0]],backlashHeroId:'argonian'});
  assert.equal(state.heroes[1].tenacity,2);
  assert.equal(state.heroes[1].cooldown.length,2);
  state = createJailbreak(); state.activeHero = 1; state.heroes[0].hp=1; state.heroes[1].hp=1; state = startHero(state);
  state = act(state, {type:'engage',form:'magic',diceIds:selected}, [.9,.9]);
  state = act(state, {type:'resolve',backlashTargets:{[selected[0]]:'argonian',[selected[1]]:'dark-elf'}});
  assert.equal(state.outcome,'defeat');
  assert.ok(state.heroes.every(hero=>hero.hp===0 && hero.dice.every(die=>die.state!=='active')));
});

test('R63: a two-value active shield is exhausted completely; Enfeeble still applies on zero HP loss', () => {
  let state = createJailbreak();
  const shield = state.heroes[0].dice.find(die=>die.skill==='shield-discipline');
  shield.state='active'; shield.face={id:'value-2',label:'2',value:2};
  state.phase='enemy-defense'; state.enemies[1].position='6,4';
  state.pending={heroId:'argonian',enemyId:'argonian-bandit',damage:1,targets:['argonian'],targetIndex:0};
  state = act(state, {type:'defend',diceIds:[shield.id]});
  assert.equal(state.heroes[0].hp,5);
  assert.deepEqual(state.heroes[0].cooldown.map(die=>die.skill??die.kind), ['shield-discipline','light-fatigue']);
  assert.equal(state.heroes[0].dice.find(die=>die.id===shield.id).state,'cooldown');
});

test('Race sheets: Argonian Resistance once per battle; Dynamic recovers in-place and replaces with fatigue', () => {
  let state=createJailbreak(); state.phase='enemy-defense';
  state.pending={heroId:'argonian',enemyId:'argonian-bandit',damage:2,targets:['argonian'],targetIndex:0};
  state=act(state,{type:'defend',useRacial:true});
  assert.equal(state.heroes[0].hp,5); assert.equal(state.heroes[0].racialUsed,true);
  state=createJailbreak(); state.activeHero=1; state=startHero(state);
  state=act(state,{type:'engage',form:'magic',diceIds:dice(state.heroes[1],'force-shock')},[0,0]);
  state=act(state,{type:'resolve'});
  state=act(state,{type:'engage',form:'defensive',diceIds:dice(state.heroes[1],'combat')},[0,0]);
  state=act(state,{type:'resolve'});
  const recovered=dice(state.heroes[1]);
  assert.throws(()=>act(state,{type:'racial',diceIds:recovered.slice(0,2)}),{code:'RACIAL_SELECTION'});
  state=act(state,{type:'racial',diceIds:recovered});
  assert.ok(state.heroes[1].dice.filter(die=>recovered.includes(die.id)).every(die=>die.state==='available'));
  assert.deepEqual(state.heroes[1].cooldown.map(die=>die.kind),Array(5).fill('light-fatigue'));
  assert.throws(()=>act(state,{type:'racial',diceIds:recovered}),{code:'RACIAL_UNAVAILABLE'});
});

test('Official partial-resolution FAQ: Dynamic recovers one or two skills when only that many are eligible', () => {
  for (const count of [1,2]) {
    let state=createJailbreak();state.activeHero=1;state=startHero(state);
    const selected=dice(state.heroes[1],'force-shock').slice(0,count);
    state=act(state,{type:'engage',form:'magic',diceIds:selected},Array(count).fill(0));
    state=act(state,{type:'resolve'});
    state=act(state,{type:'racial',diceIds:selected});
    assert.ok(state.heroes[1].dice.filter(die=>selected.includes(die.id)).every(die=>die.state==='available'));
    assert.deepEqual(state.heroes[1].cooldown.map(die=>die.kind),Array(count).fill('light-fatigue'));
    assert.equal(state.heroes[1].racialUsed,true);
  }
});

test('R93: escape only at start; victory waits for end of round and undefeated heroes', () => {
  let state=createJailbreak(); state.heroes[0].position='0,2'; state.heroes[1].position='0,4';
  state=act(state,{type:'escape'});
  assert.equal(state.heroes[0].escaped,true); assert.equal(state.phase,'start'); assert.equal(state.outcome,null);
  state=act(state,{type:'escape'});
  assert.equal(state.outcome,'victory'); assert.equal(state.phase,'rewards');
  assert.equal(state.achievements.firstEscape,'argonian');
  assert.deepEqual(state.rewards.heroes.argonian.achievements,['escape-first','first-turn']);
  state=startHero(createJailbreak()); state.heroes[0].position='0,2';
  assert.throws(()=>act(state,{type:'escape'}),{code:'WRONG_PHASE'});
  state=startHero(createJailbreak()); state.enemies.forEach(enemy=>{enemy.hp=0;enemy.position=null;});
  state=act(state,{type:'end-turn'});
  assert.equal(state.outcome,null);
  state=startHero(state); state=act(state,{type:'end-turn'});
  assert.equal(state.outcome,'victory');
});

test('R57: round six adds overfatigue and true damage rather than a hard turn-limit defeat', () => {
  let state=createJailbreak(); state.round=5; state.activeHero=1;
  state.enemies.forEach(enemy=>{enemy.position='0,6';enemy.range=0;});
  state=startHero(state); state=act(state,{type:'end-turn'});
  assert.equal(state.round,6); assert.equal(state.outcome,null);
  assert.deepEqual(state.heroes.map(hero=>hero.hp),[4,3]);
  assert.deepEqual(state.heroes.map(hero=>hero.cooldown[0].kind),['overfatigue','overfatigue']);
  assert.equal(state.supply.over,10);
  state=startHero(state); // a one-die overfatigue queue is still recoverable safely.
  assert.equal(state.heroes[0].cooldown[0].kind,'overfatigue');
});

test('R21: empty fatigue supplies never fabricate dice', () => {
  let state=startHero(createJailbreak()); state.supply={light:0,over:1,status:12};
  state=act(state,{type:'engage',form:'defensive',diceIds:[]});state=act(state,{type:'resolve'});
  state=act(state,{type:'engage',form:'defensive',diceIds:[]});state=act(state,{type:'resolve'});
  assert.equal(state.heroes[0].cooldown[0].kind,'overfatigue');
  state=act(state,{type:'engage',form:'defensive',diceIds:[]});
  assert.equal(state.heroes[0].cooldown.length,1); assert.deepEqual(state.supply,{light:0,over:0,status:12});
});

test('Rejected duplicate dice, invalid resolution order and malformed randomness do not mutate a save', () => {
  let state=startHero(createJailbreak());const before=structuredClone(state);const id=dice(state.heroes[0],'combat')[0];
  assert.throws(()=>act(state,{type:'engage',form:'defensive',diceIds:[id,id]}),{code:'INVALID_SELECTION'});
  assert.deepEqual(state,before);
  assert.throws(()=>reduceJailbreak(state,{type:'engage',form:'defensive',diceIds:[id]},{random:()=>1}),{code:'INVALID_RANDOM'});
  assert.deepEqual(state,before);
  state=act(state,{type:'engage',form:'defensive',diceIds:[id]},[.2]);
  const rolled=structuredClone(state);
  assert.throws(()=>act(state,{type:'resolve',order:[]}),{code:'INVALID_RESOLUTION'});
  assert.deepEqual(state,rolled);
});
