import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBattleMap, movementPath, rangeDistance, hasSight, formCanReach, isInFormRange,
  createTurnState, recordMove, recordEngage, recordExplore, validateMovementPath,
  engagementFatigue, gatherDice, applyPhysicalDamage, applyTrueDamage,
  battleRoundValue, fatigueRoundDamage,
} from '../src/tabletop/battle-rules.js';

// A small abstract fixture, not a transcription of a published encounter layout.
const map = createBattleMap([
  { id: 'a', tile: 'entrance', neighbors: ['b', 'd'] },
  { id: 'b', tile: 'clash', neighbors: ['a', 'c', 'e'] },
  { id: 'c', tile: 'clash', neighbors: ['b', 'f'] },
  { id: 'd', tile: 'entrance', neighbors: ['a', 'e'] },
  { id: 'e', tile: 'clash', neighbors: ['b', 'd', 'f'], impassable: true },
  { id: 'f', tile: 'third', neighbors: ['c', 'e'] },
]);
const errorCode = code => error => error.code === code;

test('R58: units block movement, but never range; obstacles block both', () => {
  assert.deepEqual(movementPath(map, 'a', 'c'), ['a', 'b', 'c']);
  assert.equal(movementPath(map, 'a', 'c', ['b']), null);
  assert.equal(rangeDistance(map, 'a', 'c'), 2);
  assert.equal(rangeDistance(map, 'd', 'f'), 4); // Cannot cut through impassable e.
  assert.equal(rangeDistance(map, 'a', 'e'), Infinity);
  assert.equal(movementPath(map, 'a', 'c', ['c']), null);
  assert.equal(rangeDistance(map, 'c', 'c'), 0);
});

test('R58: sight uses same/adjacent tiles even when source hex is not at tile edge', () => {
  assert.equal(hasSight(map, 'd', 'c'), true);
  assert.equal(hasSight(map, 'a', 'f'), false);
  assert.equal(hasSight(map, 'b', 'f'), true);
  assert.equal(hasSight(map, 'a', 'e'), false);
});

test('maps reject broken or asymmetric adjacency and are immutable', () => {
  assert.throws(() => createBattleMap([
    { id: 'a', tile: 't', neighbors: ['b'] }, { id: 'b', tile: 't', neighbors: [] },
  ]), errorCode('INVALID_MAP'));
  assert.throws(() => map.cells.a.neighbors.push('f'), TypeError);
});

test('R61: battle forms distinguish melee, nonadjacent ranged, defensive and magic', () => {
  const stats = { stamina: 3, magicka: 2 };
  assert.equal(formCanReach({ ...stats, form: 'light-weapon', distance: 1 }), true);
  assert.equal(formCanReach({ ...stats, form: 'heavy-weapon', distance: 2 }), false);
  assert.equal(formCanReach({ ...stats, form: 'ranged-weapon', distance: 1 }), false);
  assert.equal(formCanReach({ ...stats, form: 'ranged-weapon', distance: 3 }), true);
  assert.equal(formCanReach({ ...stats, form: 'defensive', distance: 1 }), false);
  assert.equal(formCanReach({ ...stats, form: 'magic', distance: 2 }), true);
  assert.equal(formCanReach({ ...stats, form: 'magic', distance: 3 }), false);
  assert.equal(isInFormRange(map, 'a', 'f', { form: 'magic', stamina: 3, magicka: 5 }), false);
});

test('R59: moving twice prevents any engagement; engaging prevents a second move', () => {
  const start = createTurnState();
  const moved = recordMove(start);
  const twice = recordMove(moved);
  assert.throws(() => recordEngage(twice), errorCode('ENGAGE_AFTER_SECOND_MOVE'));
  assert.throws(() => recordMove(recordEngage(moved)), errorCode('SECOND_MOVE_AFTER_ENGAGE'));
  assert.deepEqual(start, { moves: 0, engages: 0, explored: false });
});

test('R59: one movement may precede or follow engagements, but cannot be split', () => {
  const firstEngage = recordEngage(createTurnState());
  assert.equal(recordMove(firstEngage).moves, 1);
  const firstMove = recordMove(createTurnState());
  const engaged = recordEngage(firstMove);
  assert.equal(recordEngage(engaged).engages, 2);
  assert.throws(() => recordMove(engaged), errorCode('SECOND_MOVE_AFTER_ENGAGE'));
});

test('R59,61: explore is once per delve turn and excludes move actions', () => {
  const explored = recordExplore(createTurnState(), 'delve');
  assert.throws(() => recordMove(explored), errorCode('MOVE_AFTER_EXPLORE'));
  assert.throws(() => recordExplore(explored, 'delve'), errorCode('EXPLORE_LIMIT'));
  assert.throws(() => recordExplore(recordMove(createTurnState()), 'delve'), errorCode('EXPLORE_AFTER_MOVE'));
  assert.throws(() => recordExplore(createTurnState(), 'clash'), errorCode('EXPLORE_MODE'));
  assert.equal(recordEngage(explored).engages, 1);
});

test('R58–59: each move is a contiguous unoccupied path no longer than Stamina', () => {
  assert.deepEqual(validateMovementPath(map, ['a', 'b', 'c'], 2, ['a']), ['a', 'b', 'c']);
  assert.throws(() => validateMovementPath(map, ['a', 'b', 'c'], 1), errorCode('MOVEMENT_RANGE'));
  assert.throws(() => validateMovementPath(map, ['a', 'c'], 2), errorCode('NONADJACENT'));
  assert.throws(() => validateMovementPath(map, ['a', 'b', 'c'], 2, ['b']), errorCode('OCCUPIED'));
  assert.throws(() => validateMovementPath(map, ['a', 'd', 'e'], 2), errorCode('IMPASSABLE'));
});

test('R59: additional engagements cost light fatigue by actual difficulty', () => {
  for (const level of ['Apprentice', 'Adept', 'Expert']) assert.equal(engagementFatigue(0, level), 0);
  assert.equal(engagementFatigue(1, 'Adept'), 1);
  assert.equal(engagementFatigue(4, 'Apprentice'), 1);
  assert.equal(engagementFatigue(2, 'Expert'), 2);
  assert.throws(() => engagementFatigue(1, 'Veteran'), errorCode('INVALID_DIFFICULTY'));
});

const dice = [
  { id: 'combat', state: 'available', attribute: 'stamina', skillLine: 'combat', forms: [] },
  { id: 'shield', state: 'available', attribute: 'stamina', skillLine: 'one-hand-and-shield', forms: ['light-weapon'] },
  { id: 'shock', state: 'available', attribute: 'magicka', skillLine: 'destruction-staff', forms: ['magic'] },
  { id: 'neutral', state: 'available', attribute: 'stamina', skillLine: 'acrobatics', forms: [] },
  { id: 'exhausted', state: 'cooldown', attribute: 'magicka', skillLine: 'destruction-staff', forms: ['magic'] },
];

test('R60: mixed attributes have separate gathering caps; zero gathered dice is legal', () => {
  const result = gatherDice({ dice, selectedIds: ['shock', 'neutral'], form: 'magic', stamina: 1, magicka: 1 });
  assert.deepEqual(result.counts, { stamina: 1, magicka: 1 });
  assert.equal(result.dice.length, 2);
  assert.throws(() => gatherDice({ dice, selectedIds: ['combat', 'neutral'], form: 'defensive', stamina: 1, magicka: 5 }), errorCode('DICE_CAPACITY'));
  assert.deepEqual(gatherDice({ dice, selectedIds: [], form: 'magic', stamina: 0, magicka: 0 }).dice, []);
});

test('R60–61: gathering enforces availability, form, uniqueness and Combat prohibition in Magic', () => {
  const gather = (selectedIds, form = 'magic') => gatherDice({ dice, selectedIds, form, stamina: 3, magicka: 3 });
  assert.throws(() => gather(['combat']), errorCode('COMBAT_IN_MAGIC'));
  assert.throws(() => gather(['shield']), errorCode('DIE_FORM'));
  assert.throws(() => gather(['exhausted']), errorCode('DIE_UNAVAILABLE'));
  assert.throws(() => gather(['shock', 'shock']), errorCode('DUPLICATE_DIE'));
  assert.throws(() => gather(['missing']), errorCode('DIE_UNAVAILABLE'));
  assert.equal(gather(['combat'], 'defensive').dice.length, 1);
});

test('R60 + tutorial33: defense prevents once across an engage, not once per die', () => {
  const unit = { hp: 5, defense: 1 };
  const first = applyPhysicalDamage(unit, 2);
  const second = applyPhysicalDamage(first.unit, 4, { defenseRemaining: first.defenseRemaining });
  assert.equal(first.unit.hp, 4);
  assert.equal(second.unit.hp, 0);
  assert.equal(first.prevented + second.prevented, 1);
  assert.equal(unit.hp, 5);
  // A NEW action starts with the innate defense available again.
  assert.equal(applyPhysicalDamage(first.unit, 1).taken, 0);
});

test('R20,63: damage dealt differs from damage taken, and physical damage consumes bonus HP first', () => {
  const result = applyPhysicalDamage({ hp: 4, bonusHp: 2, defense: 1 }, 6, { prevention: 1 });
  assert.equal(result.dealt, 6);
  assert.equal(result.prevented, 2);
  assert.equal(result.taken, 4);
  assert.deepEqual(result.unit, { hp: 2, bonusHp: 0, defense: 1 });
});

test('R20,63: true damage bypasses innate defense and bonus HP', () => {
  const target = { hp: 4, bonusHp: 2, defense: 5 };
  const result = applyTrueDamage(target, 3);
  assert.deepEqual(result.unit, { hp: 1, bonusHp: 2, defense: 5 });
  assert.equal(result.taken, 3);
  assert.equal(target.hp, 4);
});

test('R57: later rounds are fatigue rounds, not an automatic defeat at round five', () => {
  assert.equal(battleRoundValue(5), 5);
  assert.equal(battleRoundValue(6), 6);
  assert.equal(battleRoundValue(20), 6);
  assert.equal(fatigueRoundDamage(5, 3), 0);
  assert.equal(fatigueRoundDamage(6, 3), 3);
  assert.equal(fatigueRoundDamage(20, 5), 5);
});
