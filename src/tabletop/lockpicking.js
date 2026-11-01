/**
 * Official-tabletop lockpicking, Rulebook v1.0 pp.68–70. Source links and
 * integration limits: docs/lockpicking.md. Pure operations; the caller supplies
 * rolls and applies returned fatigue costs through the actual cooldown rules.
 *
 * Supports three ordinary digits, optionally preceded by one key digit, as in
 * the published common/legendary examples. Other code structures are rejected.
 */

const PHASES = new Set(['ready', 'adjust', 'continue', 'success', 'failure']);
const isFace = value => Number.isInteger(value) && value >= 1 && value <= 6;
const copy = value => structuredClone(value);

export const JAILBREAK_CACHE_FIXTURE = Object.freeze({
  digits: Object.freeze([5, 2, 2]),
  attemptLimit: 3,
  keyDigit: null,
  itemName: 'Falkreath Meat Loaf',
  source: Object.freeze({ document: 'Rulebook v1.0', page: 69, tutorialPage: 19 }),
});

function validateCode({ digits, attemptLimit, keyDigit }) {
  if (!Array.isArray(digits) || digits.length !== 3 || !digits.every(isFace)) {
    throw new TypeError('Supported lockpick codes require exactly three ordinary digits, each 1–6.');
  }
  if (!Number.isSafeInteger(attemptLimit) || attemptLimit < 1) {
    throw new TypeError('Lockpick attempt limit must be a positive safe integer.');
  }
  if (keyDigit !== null && !isFace(keyDigit)) {
    throw new TypeError('A key digit must be null or a single integer from 1 through 6.');
  }
}

function validateCheck(check) {
  if (!check || typeof check !== 'object') throw new TypeError('A lockpick check is required.');
  validateCode(check);
  if (!PHASES.has(check.phase) || !Number.isSafeInteger(check.attemptsUsed)
      || check.attemptsUsed < 0 || check.attemptsUsed > check.attemptLimit
      || !Array.isArray(check.dice) || check.dice.length !== 3
      || !check.dice.every(value => value === null || isFace(value))
      || typeof check.keyMatched !== 'boolean'
      || !Number.isSafeInteger(check.fatigueSpent) || check.fatigueSpent < 0) {
    throw new TypeError('Malformed lockpick check state.');
  }
  if (['adjust', 'continue'].includes(check.phase) && !check.dice.every(isFace)) {
    throw new TypeError('An active lockpick attempt requires three die results.');
  }
}

export function createLockpickCheck({ digits, attemptLimit, keyDigit = null }) {
  validateCode({ digits, attemptLimit, keyDigit });
  return {
    digits: copy(digits), attemptLimit, keyDigit,
    attemptsUsed: 0, phase: 'ready', dice: [null, null, null],
    keyMatched: false, fatigueSpent: 0,
  };
}

/**
 * Roll results map to unkept die indexes in ascending order. First attempt
 * always rolls all three dice. Later attempts retain only the chosen physical
 * dice; ordinary matched values do not persist if their dice are rerolled.
 */
export function rollLockpick(check, { results, keep = [] }) {
  validateCheck(check);
  if (!['ready', 'continue'].includes(check.phase) || check.attemptsUsed >= check.attemptLimit) {
    throw new Error('Resolve the current attempt before rolling, and stop after the check ends.');
  }
  if (!Array.isArray(keep) || keep.some(index => !Number.isInteger(index) || index < 0 || index > 2)
      || new Set(keep).size !== keep.length) {
    throw new TypeError('Keep must contain unique die indexes from 0 through 2.');
  }
  if (check.attemptsUsed === 0 && keep.length) throw new Error('The first attempt must roll all three dice.');
  if (check.keyDigit !== null && !check.keyMatched && keep.length) {
    throw new Error('No dice may be kept for another attempt before matching the key digit.');
  }
  if (!Array.isArray(results) || results.length !== 3 - keep.length || !results.every(isFace)) {
    throw new TypeError('Supply one result from 1 through 6 for every unkept die.');
  }
  const next = copy(check);
  let resultIndex = 0;
  for (let index = 0; index < 3; index++) {
    if (!keep.includes(index)) next.dice[index] = results[resultIndex++];
  }
  next.attemptsUsed++;
  next.phase = 'adjust';
  return next;
}

/**
 * R p.69: each step of ±1 costs one light fatigue; 1/6 do not wrap.
 * Return the proposed state and cost. The caller MUST successfully apply all
 * fatigue before committing this state; this function does not grant free
 * adjustments or resolve overflow/silver-die supply on the caller's behalf.
 */
export function adjustLockpick(check, { dieIndex, delta }) {
  validateCheck(check);
  if (check.phase !== 'adjust') throw new Error('Results can only be adjusted during an unresolved attempt.');
  if (!Number.isInteger(dieIndex) || dieIndex < 0 || dieIndex > 2
      || !Number.isSafeInteger(delta) || delta === 0) {
    throw new TypeError('Choose a die index from 0 through 2 and a nonzero integer adjustment.');
  }
  const value = check.dice[dieIndex] + delta;
  if (!isFace(value)) throw new RangeError('Adjusted dice must stay between 1 and 6; faces do not wrap.');
  const next = copy(check);
  next.dice[dieIndex] = value;
  const fatigueCost = Math.abs(delta);
  next.fatigueSpent += fatigueCost;
  return { check: next, fatigueCost };
}

function matchesAll(values, required) {
  const available = [...values];
  return required.every(value => {
    const index = available.indexOf(value);
    if (index === -1) return false;
    available.splice(index, 1);
    return true;
  });
}

function fail(check) {
  const next = copy(check);
  next.phase = 'failure';
  next.dice = [null, null, null];
  next.keyMatched = false;
  return next;
}

/**
 * R pp.69–70: match any key first. That die cannot also match an ordinary digit
 * in the same attempt. Once the attempt is resolved, its key achievement
 * persists and that physical die may be rerolled on subsequent attempts.
 */
export function resolveLockpick(check) {
  validateCheck(check);
  if (check.phase !== 'adjust') throw new Error('Only an unresolved attempt can be resolved.');
  const next = copy(check);
  const ordinaryValues = [...next.dice];
  if (next.keyDigit !== null && !next.keyMatched) {
    const index = ordinaryValues.indexOf(next.keyDigit);
    if (index !== -1) {
      next.keyMatched = true;
      ordinaryValues.splice(index, 1);
    }
  }
  const keySatisfied = next.keyDigit === null || next.keyMatched;
  if (keySatisfied && matchesAll(ordinaryValues, next.digits)) {
    next.phase = 'success';
    return next;
  }
  if (next.attemptsUsed === next.attemptLimit) return fail(next);
  next.phase = 'continue';
  return next;
}

export function stopLockpick(check) {
  validateCheck(check);
  if (check.phase !== 'continue') throw new Error('A player may stop after an unsuccessful attempt.');
  return fail(check);
}

/** Normal cache only, R p.68. Scenario overrides and trap effects are external. */
export function cacheOutcome(check, { takeItem = true } = {}) {
  validateCheck(check);
  if (!['success', 'failure'].includes(check.phase)) throw new Error('The lockpick check has not ended.');
  if (typeof takeItem !== 'boolean') throw new TypeError('takeItem must be a boolean.');
  return {
    removeCache: true,
    itemAction: check.phase === 'failure' ? 'cycle-to-bottom' : takeItem ? 'take' : 'discard',
  };
}
