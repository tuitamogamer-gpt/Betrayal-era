/**
 * Official-tabletop cooldown foundation, independent of the legacy fan game.
 * Source: publisher Rulebook v1.0, pp. 23 and 59. See
 * docs/tabletop-rules-research.md for the publisher PDF and source precedence.
 *
 * A die is a serializable record with a unique string `id` and a `kind`:
 * `skill`, `light-fatigue`, `overfatigue`, or `status`. A status die additionally
 * has a nonempty string `face` identifying its effect. Additional metadata is
 * preserved. A skill in `track` is exhausted; its location is its state.
 *
 * Operations return { track, recovered, drained, returned }. These arrays
 * contain detached copies of dice. `recovered` contains skills restored to
 * their trained rows; `drained` contains skills moved to the drained area;
 * `returned` contains dice returned to supply. The caller owns those locations
 * and finite supplies. No dice or IDs are invented here.
 *
 * This module does not implement HP, status abilities, end-of-day/inn recovery,
 * silver-die supply fallback, fatigue rounds, or the remainder of the game.
 */

export const COOLDOWN_CAPACITY = 13;
const KINDS = new Set(['skill', 'light-fatigue', 'overfatigue', 'status']);

export class UnsupportedCooldownRuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'UnsupportedCooldownRuleError';
    this.code = code;
  }
}

function validateDie(die) {
  if (!die || typeof die !== 'object' || Array.isArray(die)
      || typeof die.id !== 'string' || !die.id.trim() || !KINDS.has(die.kind)) {
    throw new TypeError('A cooldown die requires a nonempty id and a supported kind.');
  }
  if (die.kind === 'status' && (typeof die.face !== 'string' || !die.face.trim())) {
    throw new TypeError('A status die requires a nonempty face identifying its effect.');
  }
}

function validateTrack(track) {
  if (!Array.isArray(track) || track.length > COOLDOWN_CAPACITY) {
    throw new TypeError('The cooldown track must be an array containing at most 13 dice.');
  }
  const ids = new Set();
  const statusFaces = new Set();
  for (const die of track) {
    validateDie(die);
    if (ids.has(die.id)) throw new TypeError('Each physical die must have a unique id.');
    ids.add(die.id);
    if (die.kind === 'status') {
      if (statusFaces.has(die.face)) {
        throw new TypeError('A cooldown track cannot contain duplicate status faces.');
      }
      statusFaces.add(die.face);
    }
  }
}

const transition = track => ({ track: structuredClone(track), recovered: [], drained: [], returned: [] });
const discardFromTrack = (result, die) => result[die.kind === 'skill' ? 'drained' : 'returned'].push(die);

/**
 * Place one die at the queue's tail (the leftmost empty physical slot).
 * Simultaneous gains are applied separately in the player's chosen order.
 *
 * R p.23: a matching status face refreshes the EXISTING die to the tail. In
 * this API the caller supplies a physical incoming die from supply; that unused
 * die is returned. Refreshing does not overflow even when all 13 slots are full.
 *
 * For overflow, `overfatigueDie` must be a distinct die actually available in
 * the caller's supply. R p.23 drains/returns the incoming die, then replaces
 * the rightmost non-overfatigue die in place, draining/returning it as well.
 */
export function queueCooldownDie(track, die, { overfatigueDie } = {}) {
  validateTrack(track);
  validateDie(die);
  if (track.some(existing => existing.id === die.id)) {
    throw new TypeError('An incoming die must not already occupy the cooldown track.');
  }

  const result = transition(track);
  const incoming = structuredClone(die);
  if (incoming.kind === 'status') {
    const existingIndex = result.track.findIndex(existing => existing.kind === 'status' && existing.face === incoming.face);
    if (existingIndex !== -1) {
      const [existing] = result.track.splice(existingIndex, 1);
      result.track.push(existing);
      result.returned.push(incoming);
      return result;
    }
  }

  if (result.track.length < COOLDOWN_CAPACITY) {
    result.track.push(incoming);
    return result;
  }

  const replacementIndex = result.track.findLastIndex(existing => existing.kind !== 'overfatigue');
  if (replacementIndex === -1) {
    // R p.23 names a non-overfatigue replacement but gives no fallback when
    // none exists. Stop atomically until an authoritative ruling is supplied.
    throw new UnsupportedCooldownRuleError('ALL_OVERFATIGUE_OVERFLOW',
      'Overflow onto 13 overfatigue dice has no verified replacement rule.');
  }
  if (!overfatigueDie) {
    throw new TypeError('Overflow requires an overfatigue die from the caller\'s supply.');
  }
  validateDie(overfatigueDie);
  if (overfatigueDie.kind !== 'overfatigue' || overfatigueDie.id === incoming.id
      || track.some(existing => existing.id === overfatigueDie.id)) {
    throw new TypeError('The replacement must be a distinct overfatigue die from supply.');
  }

  discardFromTrack(result, incoming);
  discardFromTrack(result, result.track[replacementIndex]);
  result.track[replacementIndex] = structuredClone(overfatigueDie);
  return result;
}

/**
 * Resolve the start-of-turn Recovery step (R pp.23,59), left to right.
 * A recovered skill becomes available, light fatigue/status return to supply,
 * and overfatigue moves to the tail, consuming one recovery position.
 *
 * Canonical representation: visit each die present at the beginning at most
 * once. If the stat exceeds that count, only identical overfatigue dice can
 * remain. Further visits would just rotate their physical IDs, without
 * recovering anything or changing their mechanical order. Keeping their
 * existing order is therefore equivalent for this module, which has no
 * per-die recovery triggers. This is a derived normalization, not an explicit
 * additional tabletop rule. Revisit it if such triggers are later introduced.
 */
export function recoverCooldown(track, cooldownStat) {
  validateTrack(track);
  if (!Number.isSafeInteger(cooldownStat) || cooldownStat < 0) {
    throw new TypeError('Cooldown stat must be a nonnegative safe integer.');
  }
  const result = transition(track);
  const count = Math.min(cooldownStat, result.track.length);
  for (let index = 0; index < count; index++) {
    const die = result.track.shift();
    if (die.kind === 'skill') result.recovered.push(die);
    else if (die.kind === 'overfatigue') result.track.push(die);
    else result.returned.push(die);
  }
  return result;
}
