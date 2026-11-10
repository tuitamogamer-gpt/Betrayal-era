import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createJailbreak, reduceJailbreak, isJailbreakState, getDeploymentHexes, getLegalMoves, classOptions,
} from '../src/tabletop/engine.js';
import { JAILBREAK_ENEMY_BAG, ENEMY_DEPLOYMENT_HEXES } from '../src/tabletop/jailbreak-enemies.js';

const act = (state, action, rolls = []) => {
  const next = reduceJailbreak(state, action, { random: () => {
    assert.ok(rolls.length, `Unexpected random roll during ${action.type}`);
    return rolls.shift();
  } });
  assert.equal(rolls.length, 0, `Unused rolls after ${action.type}`);
  assert.ok(isJailbreakState(next), `Invalid state after ${action.type}`);
  return next;
};
/** Random input selecting bag index `index` of `size` remaining enemies. */
const pick = (index, size) => (index + 0.5) / size;
const standard = (options, draws) => createJailbreak({ setup: 'standard', ...options, random: () => draws.shift() });
const dice = (hero, skill) => hero.dice.filter(die => !skill || die.skill === skill).map(die => die.id);
const bane = hero => hero.cooldown.filter(die => die.kind === 'status' && die.face === 'bane');

/** Deploy every adventurer at the given hexes, then return the state at round 1. */
function deployAll(state, hexes, forms = []) {
  hexes.forEach((hex, index) => { state = act(state, { type: 'deploy', hex, form: forms[index] ?? state.heroes[index].form }); });
  return state;
}

test('R pp92–93: the standard setup draws one bag enemy per adventurer into the numbered hexes', () => {
  assert.deepEqual(JAILBREAK_ENEMY_BAG, ['high-elf-bandit', 'argonian-bandit', 'skeever-pup', 'skeleton', 'spriggan']);
  const state = standard({}, [pick(4, 5), pick(2, 4)]);
  assert.ok(isJailbreakState(state));
  assert.deepEqual(state.enemies.map(enemy => [enemy.id, enemy.position, enemy.hp]), [['spriggan', '3,1', 4], ['skeever-pup', '3,7', 3]]);
  assert.equal(state.phase, 'deploy');
  assert.deepEqual(state.heroes.map(hero => hero.position), [null, null]);
  assert.deepEqual(getDeploymentHexes(state).sort(), ['7,3', '7,5', '8,2', '8,4', '8,6']);
  // Draws are without replacement: two enemies are always different.
  for (let first = 0; first < 5; first++) for (let second = 0; second < 4; second++) {
    const drawn = standard({}, [pick(first, 5), pick(second, 4)]).enemies.map(enemy => enemy.id);
    assert.notEqual(drawn[0], drawn[1]);
  }
  assert.deepEqual(ENEMY_DEPLOYMENT_HEXES.slice(0, 2), ['3,1', '3,7']);
});

test('R p93: adventurers deploy on unoccupied entrance hexes in turn order and choose a battle form', () => {
  let state = standard({ party: ['dark-elf', 'argonian'] }, [pick(0, 5), pick(0, 4)]);
  assert.deepEqual(state.heroes.map(hero => hero.id), ['dark-elf', 'argonian']);
  assert.throws(() => act(state, { type: 'deploy', hex: '6,4', form: 'magic' }), { code: 'ILLEGAL_DEPLOYMENT' });
  assert.throws(() => act(state, { type: 'deploy', hex: '8,4', form: 'flying' }), { code: 'INVALID_FORM' });
  assert.throws(() => act(state, { type: 'begin-turn' }), { code: 'WRONG_PHASE' });
  state = act(state, { type: 'deploy', hex: '8,4', form: 'defensive' });
  assert.equal(state.activeHero, 1);
  assert.throws(() => act(state, { type: 'deploy', hex: '8,4', form: 'light-weapon' }), { code: 'ILLEGAL_DEPLOYMENT' });
  state = act(state, { type: 'deploy', hex: '7,5', form: 'ranged-weapon' });
  assert.equal(state.phase, 'start');
  assert.equal(state.round, 1);
  assert.equal(state.activeHero, 0);
  assert.deepEqual(state.heroes.map(hero => [hero.position, hero.form]), [['8,4', 'defensive'], ['7,5', 'ranged-weapon']]);
  state = act(state, { type: 'begin-turn' });
  assert.equal(state.achievements.firstTurn, 'dark-elf');
  assert.ok(getLegalMoves(state).length > 0);
});

test('Party options: solo adventurers draw one enemy; seats follow turn order; tutorial stays fixed', () => {
  const solo = standard({ party: ['dark-elf'] }, [pick(3, 5)]);
  assert.equal(solo.heroes.length, 1);
  assert.deepEqual(solo.enemies.map(enemy => enemy.id), ['skeleton']);
  assert.throws(() => createJailbreak({ setup: 'standard', party: ['dark-elf'], players: [{ seat: 0 }, { seat: 1 }] }), { code: 'FIXTURE_PLAYERS' });
  const pair = createJailbreak({ setup: 'standard', party: ['dark-elf', 'argonian'], players: [{ seat: 0 }, { seat: 1 }], random: () => 0 });
  assert.deepEqual(pair.heroes.map(hero => [hero.id, hero.ownerSeat]), [['dark-elf', 0], ['argonian', 1]]);
  assert.throws(() => createJailbreak({ party: ['dark-elf', 'argonian'] }), { code: 'INVALID_PARTY' });
  assert.throws(() => createJailbreak({ setup: 'standard', party: ['argonian', 'argonian'] }), { code: 'INVALID_PARTY' });
  assert.throws(() => createJailbreak({ setup: 'standard', party: ['khajiit'] }), { code: 'INVALID_PARTY' });
  assert.throws(() => createJailbreak({ setup: 'random' }), { code: 'INVALID_SETUP' });
  assert.throws(() => createJailbreak({ difficulty: 'Legendary' }), { code: 'INVALID_DIFFICULTY' });
  const tutorial = createJailbreak({ random: () => { throw new Error('The tutorial setup never draws.'); } });
  assert.deepEqual(tutorial.enemies.map(enemy => enemy.id), ['high-elf-bandit', 'argonian-bandit']);
});

test('R pp13, 59: Expert difficulty makes each additional engage cost two light fatigue', () => {
  let state = act(createJailbreak({ difficulty: 'Expert' }), { type: 'begin-turn' });
  state = act(state, { type: 'engage', form: 'defensive', diceIds: [] });
  state = act(state, { type: 'resolve' });
  state = act(state, { type: 'engage', form: 'defensive', diceIds: [] });
  assert.deepEqual(state.heroes[0].cooldown.map(die => die.kind), ['light-fatigue', 'light-fatigue']);
});

test('Skeever Pup engages every adventurer in range; Rot gives its defeater one overfatigue', () => {
  let state = standard({}, [pick(2, 5), pick(0, 4)]);
  assert.deepEqual(state.enemies.map(enemy => enemy.id), ['skeever-pup', 'high-elf-bandit']);
  state = deployAll(state, ['7,3', '8,2']);
  state.heroes[0].position = '4,2'; state.heroes[1].position = '2,2'; // Both adjacent to the pup at 3,1.
  state.enemies[1].position = '6,6';
  state.enemies[1].range = 0; // Keep the second enemy out of this engage.
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'end-turn' });
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'end-turn' }, [.9]);
  assert.equal(state.phase, 'enemy-defense');
  assert.deepEqual(state.pending.targets, ['dark-elf', 'argonian']); // Weakest first.

  state = standard({ party: ['argonian'] }, [pick(2, 5)]);
  state = deployAll(state, ['7,3']);
  state.heroes[0].position = '4,2';
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'engage', form: 'light-weapon', targetId: 'skeever-pup', diceIds: dice(state.heroes[0]) }, [.9, .9, .9]);
  state = act(state, { type: 'resolve' });
  assert.equal(state.enemies[0].hp, 0);
  assert.equal(state.achievements.defeated['skeever-pup'], 'argonian');
  assert.equal(state.heroes[0].cooldown.filter(die => die.kind === 'overfatigue').length, 1);
  assert.equal(state.supply.over, 11);
});

test('Spriggan engages without Combat dice and applies Bane: 1 true damage at each turn start until recovered', () => {
  let state = standard({ party: ['argonian'] }, [pick(4, 5)]);
  state = deployAll(state, ['7,3']);
  state.heroes[0].position = '4,2'; // In range 2 of the Spriggan at 3,1.
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'end-turn' }); // No Combat dice: no roll and no defense prompt.
  assert.equal(state.round, 2);
  assert.equal(state.phase, 'start');
  assert.equal(state.heroes[0].hp, 4, 'Bane dealt 1 true damage as the turn started');
  assert.equal(bane(state.heroes[0]).length, 1);
  assert.equal(state.supply.status, 11);
  state = act(state, { type: 'begin-turn' }); // Cooldown 2 recovers the status die.
  assert.equal(bane(state.heroes[0]).length, 0);
  assert.equal(state.supply.status, 12);

  // Bonus HP never absorbs Bane's true damage.
  state.heroes[0].bonusHp = 3;
  state = act(state, { type: 'end-turn' });
  assert.equal(state.round, 3);
  assert.deepEqual([state.heroes[0].hp, state.heroes[0].bonusHp], [3, 3]);
});

test('R p67: a repeated Bane moves the existing die to the end of the track; Bane can defeat before the turn', () => {
  let state = standard({ party: ['argonian'] }, [pick(4, 5)]);
  state = deployAll(state, ['7,3']);
  state.heroes[0].position = '4,2';
  state = act(state, { type: 'begin-turn' });
  state.heroes[0].cooldown = [{ id: 'status-a', kind: 'status', face: 'bane' }, { id: 'light-a', kind: 'light-fatigue' }];
  state.supply.status = 11; state.supply.light = 19;
  state = act(state, { type: 'end-turn' });
  assert.deepEqual(state.heroes[0].cooldown.map(die => die.id), ['light-a', 'status-a']);
  assert.equal(state.supply.status, 11);

  // A Bane at 1 HP defeats the adventurer before it can act; the solo party loses.
  state = standard({ party: ['argonian'] }, [pick(4, 5)]);
  state = deployAll(state, ['7,3']);
  state.heroes[0].position = '4,2';
  state.heroes[0].hp = 1;
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'end-turn' });
  assert.equal(state.outcome, 'defeat');
  assert.equal(state.phase, 'rewards');
  assert.equal(state.rewards.mode, 'all-defeated');
  assert.equal(state.achievements.lastTurn, 'argonian');
});

test('R p21: with the status supply empty, Bane applies no die', () => {
  let state = standard({ party: ['argonian'] }, [pick(4, 5)]);
  state = deployAll(state, ['7,3']);
  state.heroes[0].position = '4,2';
  state = act(state, { type: 'begin-turn' });
  state.supply.status = 0; // Not reachable with two adventurers; checked directly.
  const next = reduceJailbreak(state, { type: 'end-turn' });
  assert.equal(bane(next.heroes[0]).length, 0);
  assert.equal(next.heroes[0].hp, 5);
});

test('A solo adventurer always earns at least two classes: the first and the last turn', () => {
  let state = standard({ party: ['dark-elf'] }, [pick(1, 5)]);
  state = deployAll(state, ['8,4']);
  state.enemies[0].hp = 0; state.enemies[0].position = null;
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'end-turn' });
  assert.equal(state.phase, 'rewards');
  assert.deepEqual(classOptions(state, 'dark-elf'), ['Dragonknight', 'Healer']);
  state = act(state, { type: 'choose-class', heroId: 'dark-elf', className: 'Healer' });
  assert.equal(state.phase, 'complete');
  assert.equal(state.heroes[0].className, 'Healer');
});

test('Saved-state validation accepts both setups and rejects deployment inconsistencies', () => {
  const deploying = standard({}, [pick(0, 5), pick(0, 4)]);
  assert.ok(isJailbreakState(deploying));
  const broken = [
    state => { state.heroes[0].position = '7,3'; }, // Not yet deployed.
    state => { state.setup = 'tutorial'; },
    state => { state.enemies[0].targets = 'many'; },
    state => { state.enemies[0].id = 'troll'; },
    state => { state.heroes[0].cooldown = [{ id: 'status-x', kind: 'status', face: 'curse' }]; state.supply.status = 11; },
    state => { state.supply.status = 11; },
  ];
  for (const breakState of broken) {
    const copy = structuredClone(deploying);
    breakState(copy);
    assert.equal(isJailbreakState(copy), false);
  }
});
