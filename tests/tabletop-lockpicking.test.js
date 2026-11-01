import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JAILBREAK_CACHE_FIXTURE, createLockpickCheck, rollLockpick, adjustLockpick,
  resolveLockpick, stopLockpick, cacheOutcome,
} from '../src/tabletop/lockpicking.js';

const common = () => createLockpickCheck(JAILBREAK_CACHE_FIXTURE);

test('R69 / Tutorial19: exact Jailbreak 5-2-2 example succeeds on attempt2 for three fatigue', () => {
  let check = rollLockpick(common(), { results: [1, 2, 3] });
  let adjustment = adjustLockpick(check, { dieIndex: 2, delta: -1 });
  assert.equal(adjustment.fatigueCost, 1);
  check = resolveLockpick(adjustment.check);
  assert.equal(check.phase, 'continue');
  check = rollLockpick(check, { keep: [1, 2], results: [3] });
  adjustment = adjustLockpick(check, { dieIndex: 0, delta: 2 });
  assert.equal(adjustment.fatigueCost, 2);
  check = resolveLockpick(adjustment.check);
  assert.equal(check.phase, 'success');
  assert.equal(check.attemptsUsed, 2);
  assert.equal(check.fatigueSpent, 3);
  assert.deepEqual(cacheOutcome(check), { removeCache: true, itemAction: 'take' });
});

test('R70: legendary example matches key6, reuses its die next attempt, then matches5-2-3', () => {
  let check = createLockpickCheck({ digits: [5, 2, 3], keyDigit: 6, attemptLimit: 4 });
  check = rollLockpick(check, { results: [4, 2, 2] });
  check = adjustLockpick(check, { dieIndex: 0, delta: 2 }).check;
  check = resolveLockpick(check);
  assert.equal(check.keyMatched, true);
  assert.equal(check.phase, 'continue');
  check = rollLockpick(check, { keep: [1], results: [5, 4] });
  check = adjustLockpick(check, { dieIndex: 2, delta: -1 }).check;
  check = resolveLockpick(check);
  assert.equal(check.phase, 'success');
  assert.equal(check.attemptsUsed, 2);
  assert.equal(check.fatigueSpent, 3);
});

test('R69: duplicate code digits require separate die results, regardless of result order', () => {
  const failedAttempt = resolveLockpick(rollLockpick(common(), { results: [5, 2, 1] }));
  assert.equal(failedAttempt.phase, 'continue');
  const success = resolveLockpick(rollLockpick(common(), { results: [2, 5, 2] }));
  assert.equal(success.phase, 'success');
});

test('R69: ordinary digits only persist while the corresponding dice are kept', () => {
  let check = resolveLockpick(rollLockpick(common(), { results: [5, 2, 1] }));
  check = resolveLockpick(rollLockpick(check, { results: [1, 1, 2] }));
  assert.equal(check.phase, 'continue');
  assert.deepEqual(check.dice, [1, 1, 2]);
});

test('R69: no retained dice before key digit; matching the key does not count it twice', () => {
  const start = createLockpickCheck({ digits: [5, 1, 2], keyDigit: 5, attemptLimit: 3 });
  let check = resolveLockpick(rollLockpick(start, { results: [4, 1, 2] }));
  assert.throws(() => rollLockpick(check, { keep: [1], results: [5, 3] }), /key digit/);
  check = resolveLockpick(rollLockpick(check, { results: [5, 1, 2] }));
  assert.equal(check.keyMatched, true);
  assert.equal(check.phase, 'continue');
});

test('R68/69: attempt exhaustion removes cache and cycles item, losing accumulated results', () => {
  let check = common();
  for (let attempt = 0; attempt < 3; attempt++) {
    check = resolveLockpick(rollLockpick(check, { results: [1, 1, 1] }));
  }
  assert.equal(check.phase, 'failure');
  assert.deepEqual(check.dice, [null, null, null]);
  assert.deepEqual(cacheOutcome(check), { removeCache: true, itemAction: 'cycle-to-bottom' });
  assert.throws(() => rollLockpick(check, { results: [5, 2, 2] }), /check ends/);
});

test('R68: declining a successfully unlocked item discards item and cache', () => {
  const check = resolveLockpick(rollLockpick(common(), { results: [5, 2, 2] }));
  assert.deepEqual(cacheOutcome(check, { takeItem: false }), { removeCache: true, itemAction: 'discard' });
});

test('R69: voluntarily stopping after a failed attempt fails the complete check', () => {
  const check = stopLockpick(resolveLockpick(rollLockpick(common(), { results: [1, 1, 1] })));
  assert.equal(check.phase, 'failure');
  assert.equal(check.attemptsUsed, 1);
  assert.deepEqual(check.dice, [null, null, null]);
});

test('R69: result adjustment charges each step and never wraps between 6 and 1', () => {
  const check = rollLockpick(common(), { results: [1, 6, 3] });
  assert.throws(() => adjustLockpick(check, { dieIndex: 0, delta: -1 }), /do not wrap/);
  assert.throws(() => adjustLockpick(check, { dieIndex: 1, delta: 1 }), /do not wrap/);
  const adjustment = adjustLockpick(check, { dieIndex: 0, delta: 5 });
  assert.equal(adjustment.fatigueCost, 5);
  assert.equal(adjustment.check.dice[0], 6);
});

test('pure operations leave input checks, result arrays and code data unchanged', () => {
  const digits = [5, 2, 2];
  const check = createLockpickCheck({ digits, attemptLimit: 3 });
  const before = structuredClone(check);
  const results = [1, 2, 3];
  const rolled = rollLockpick(check, { results });
  const adjusted = adjustLockpick(rolled, { dieIndex: 2, delta: -1 });
  resolveLockpick(adjusted.check);
  assert.deepEqual(check, before);
  assert.deepEqual(rolled.dice, [1, 2, 3]);
  adjusted.check.digits[0] = 6;
  assert.deepEqual(digits, [5, 2, 2]);
  assert.deepEqual(results, [1, 2, 3]);
});

test('only valid rolls, unique kept dice and the correct phase may advance a check', () => {
  assert.throws(() => rollLockpick(common(), { keep: [0], results: [1, 2] }), /first attempt/);
  assert.throws(() => rollLockpick(common(), { results: [1, 2, 7] }), /1 through 6/);
  const continued = resolveLockpick(rollLockpick(common(), { results: [1, 2, 3] }));
  assert.throws(() => rollLockpick(continued, { keep: [1, 1], results: [1] }), /unique/);
  assert.throws(() => adjustLockpick(continued, { dieIndex: 0, delta: 1 }), /unresolved attempt/);
  assert.throws(() => cacheOutcome(continued), /has not ended/);
  assert.throws(() => resolveLockpick(common()), /unresolved attempt/);
  assert.throws(() => createLockpickCheck({ digits: [1, 2, 3, 4], attemptLimit: 3 }), /exactly three/);
});
