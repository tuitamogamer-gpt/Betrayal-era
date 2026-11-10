import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createJailbreak, reduceJailbreak, getLegalMoves, getDeploymentHexes, isJailbreakState, classOptions, canDrawClasses,
  JAILBREAK_MAP, SKILLS,
} from '../src/tabletop/engine.js';
import { JAILBREAK_ENEMY_BAG } from '../src/tabletop/jailbreak-enemies.js';
import { rangeDistance, isInFormRange } from '../src/tabletop/battle-rules.js';

const LIGHT_FATIGUE = 20;
const OVERFATIGUE = 12;

function checkInvariants(state) {
  assert.ok(isJailbreakState(state), 'state passes structural validation');
  // Rooms persist only plain JSON: an undefined field would be rejected by the server.
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  const tracks = state.heroes.flatMap(hero => hero.cooldown);
  assert.equal(state.supply.light + tracks.filter(die => die.kind === 'light-fatigue').length, LIGHT_FATIGUE);
  assert.equal(state.supply.over + tracks.filter(die => die.kind === 'overfatigue').length, OVERFATIGUE);
  assert.equal(state.supply.status + tracks.filter(die => die.kind === 'status').length, 12);
  for (const hero of state.heroes) {
    assert.ok(hero.hp >= 0 && hero.hp <= hero.maxHp && hero.bonusHp >= 0);
    if (!hero.hp) assert.equal(hero.dice.filter(die => die.state === 'active').length, 0);
    for (const die of hero.dice) assert.equal(hero.cooldown.filter(queued => queued.id === die.id).length, die.state === 'cooldown' ? 1 : 0);
  }
  const loaves = state.heroes.flatMap(hero => hero.items).filter(item => item.code === 'CO-019').length;
  assert.ok(loaves <= (state.cache.result === 'taken' ? 1 : 0), 'the single cache item is never duplicated');
}

/** A simple seeded party policy that exercises every phase, including the cache. */
function chooseAction(state, seed) {
  const hero = state.heroes[state.activeHero];
  if (state.phase === 'deploy') {
    const hexes = getDeploymentHexes(state);
    return { type: 'deploy', hex: hexes[seed % hexes.length], form: hero.form };
  }
  if (state.phase === 'start') return { type: 'begin-turn' };
  if (state.phase === 'lockpick') {
    const check = state.pending.check;
    if (!check) return seed % 5 === 0 ? { type: 'lockpick-decline' } : { type: 'lockpick-roll' };
    if (check.phase === 'success') return { type: 'cache-item', placement: seed % 4 === 0 ? 'pack' : 'ready' };
    if (check.phase === 'continue') {
      if (seed % 7 === 0) return { type: 'lockpick-stop' };
      const needed = [...check.digits];
      const keep = [];
      check.dice.forEach((value, index) => { const match = needed.indexOf(value); if (match !== -1) { needed.splice(match, 1); keep.push(index); } });
      return { type: 'lockpick-roll', keep };
    }
    // Spend at most one fatigue per attempt so far, moving an unmatched die toward a missing digit.
    const needed = [...check.digits];
    const unmatched = [];
    check.dice.forEach((value, index) => { const match = needed.indexOf(value); if (match === -1) unmatched.push(index); else needed.splice(match, 1); });
    if (unmatched.length && needed.length && seed % 3 !== 1 && state.supply.light + state.supply.over > 0 && check.fatigueSpent < check.attemptsUsed) {
      const index = unmatched[0];
      return { type: 'lockpick-adjust', dieIndex: index, delta: Math.sign(needed[0] - check.dice[index]) };
    }
    return { type: 'lockpick-resolve' };
  }
  if (state.phase === 'roll') {
    const active = hero.dice.filter(die => die.state === 'active');
    if (active.length) return { type: 'dismiss-active', diceIds: active.map(die => die.id) };
    const living = state.heroes.filter(item => item.hp > 0 && !item.escaped).sort((a, b) => b.hp - a.hp);
    const skip = []; const backlashTargets = {}; const remaining = living.map(item => item.hp);
    for (const result of state.pending.results) {
      if (!result.face.backlash) continue;
      const index = remaining.indexOf(Math.max(...remaining));
      if (remaining[index] <= 1) skip.push(result.dieId);
      else { backlashTargets[result.dieId] = living[index].id; remaining[index]--; }
    }
    return { type: 'resolve', skip, backlashTargets };
  }
  if (state.phase === 'enemy-defense') {
    const defender = state.heroes.find(item => item.id === state.pending.heroId);
    return { type: 'defend', diceIds: defender.dice.filter(die => die.state === 'active').map(die => die.id) };
  }
  if (state.phase === 'rewards') {
    const decliner = seed % 11 === 0 && state.rewards.mode === 'achievements' && state.heroes.find(candidate => {
      const entry = state.rewards.heroes[candidate.id];
      return !entry.choice && !entry.offered && !entry.declined && entry.earned.length;
    });
    if (decliner) return { type: 'decline-earned-classes', heroId: decliner.id };
    for (const candidate of state.heroes) {
      const options = classOptions(state, candidate.id);
      if (options.length) return { type: 'choose-class', heroId: candidate.id, className: options[seed % options.length] };
      if (canDrawClasses(state, candidate.id)) return { type: 'draw-classes', heroId: candidate.id };
    }
    throw new Error('No legal class reward action is available.');
  }
  // Heroes phase.
  const ready = hero.items.find(item => item.slot === 'ready');
  if (ready && hero.hp <= 2) return { type: 'use-item', itemCode: ready.code, mode: seed % 2 ? 'self' : 'party' };
  if (state.turn.engages) return { type: 'end-turn' };
  const moves = getLegalMoves(state);
  if (state.cache.present && seed % 3 === 0 && moves.includes(state.cache.position)) return { type: 'move', to: state.cache.position };
  const form = hero.id === 'argonian' ? 'light-weapon' : 'magic';
  let targets = state.enemies.filter(enemy => enemy.hp > 0);
  if (!targets.length) return { type: 'end-turn' };
  const inRange = targets.filter(enemy => isInFormRange(JAILBREAK_MAP, hero.position, enemy.position, { ...hero, form }));
  if (!inRange.length && moves.length && (!state.turn.moves || state.turn.continueMove)) {
    const distance = hex => Math.min(...targets.map(enemy => rangeDistance(JAILBREAK_MAP, hex, enemy.position)));
    return { type: 'move', to: [...moves].sort((a, b) => distance(a) - distance(b))[0] };
  }
  targets = inRange;
  const dice = hero.dice.filter(die => die.state === 'available' && (die.skill === 'combat' ? form !== 'magic' : SKILLS[die.skill].forms.includes(form)));
  if (targets.length && dice.length && state.turn.moves < 2) return { type: 'engage', form, targetId: targets[0].id, diceIds: dice.map(die => die.id) };
  return { type: 'end-turn' };
}

const PARTIES = [['argonian', 'dark-elf'], ['dark-elf', 'argonian'], ['argonian'], ['dark-elf']];
const DIFFICULTIES = ['Adept', 'Expert', 'Apprentice'];

test('600 seeded encounters in both setups reach class rewards and completion while preserving physical invariants', () => {
  const outcomes = { victory: 0, defeat: 0 };
  let cachesOpened = 0, checksFailed = 0, itemsUsed = 0, draws = 0, declines = 0, banes = 0, rots = 0;
  const enemiesSeen = new Set();
  for (let seed = 1; seed <= 600; seed++) {
    let n = seed;
    const random = () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
    const tutorial = seed % 3 === 0;
    let state = createJailbreak(tutorial ? { difficulty: DIFFICULTIES[seed % 2] } : {
      setup: 'standard', party: PARTIES[seed % PARTIES.length], difficulty: DIFFICULTIES[seed % 3], random,
    });
    state.enemies.forEach(enemy => enemiesSeen.add(enemy.id));
    checkInvariants(state);
    for (let steps = 0; state.phase !== 'complete'; steps++) {
      assert.ok(steps < 500, `seed ${seed} did not finish`);
      const action = chooseAction(state, seed + steps);
      if (action.type === 'use-item') itemsUsed++;
      if (action.type === 'draw-classes') draws++;
      if (action.type === 'decline-earned-classes') declines++;
      state = reduceJailbreak(state, action, { random });
      checkInvariants(state);
      banes += state.log.at(-1)?.includes('gains a Bane status') ? 1 : 0;
    }
    outcomes[state.outcome]++;
    rots += state.log.filter(line => line.startsWith('Rot:')).length;
    if (state.cache.result === 'taken' || state.cache.result === 'discarded') cachesOpened++;
    if (state.cache.result === 'cycled') checksFailed++;
    assert.equal(state.partyXp, 2);
    assert.deepEqual(state.supply, { light: LIGHT_FATIGUE, over: OVERFATIGUE, status: 12 });
    for (const hero of state.heroes) {
      assert.equal(hero.hp, hero.maxHp);
      assert.equal(hero.cooldown.length, 0);
      assert.ok(typeof hero.className === 'string');
      assert.ok(hero.dice.every(die => die.state === 'available'));
    }
    if (state.heroes.length === 2) assert.notEqual(state.heroes[0].className, state.heroes[1].className);
  }
  assert.equal(outcomes.victory + outcomes.defeat, 600);
  assert.deepEqual([...enemiesSeen].sort(), [...JAILBREAK_ENEMY_BAG].sort());
  // The policy must actually exercise the new flows, not just terminate.
  assert.ok(cachesOpened > 0 && checksFailed > 0 && itemsUsed > 0 && draws > 0 && declines > 0 && banes > 0 && rots > 0,
    JSON.stringify({ cachesOpened, checksFailed, itemsUsed, draws, declines, banes, rots, outcomes }));
});
