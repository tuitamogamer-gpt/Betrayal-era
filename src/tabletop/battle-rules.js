/**
 * Verified building blocks for the published tabletop rules, not a complete battle
 * reducer. Sources: CTG Rulebook v1.0, pp20, 55, 57–61, 63.
 *
 * Maps are explicit graphs of component hexes. Callers supply actual component
 * layouts; this module does not assume the earlier fan game's radius-three map.
 * Resolve triggered events/abilities separately before continuing an action.
 */

export class BattleRuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BattleRuleError';
    this.code = code;
  }
}

function requireRule(condition, code, message) {
  if (!condition) throw new BattleRuleError(code, message);
}

function natural(value, name) {
  requireRule(Number.isSafeInteger(value) && value >= 0, 'INVALID_VALUE', `${name} must be a nonnegative integer.`);
  return value;
}

export const BATTLE_FORMS = Object.freeze([
  'light-weapon', 'heavy-weapon', 'defensive', 'ranged-weapon', 'magic',
]);

function checkForm(form) {
  requireRule(BATTLE_FORMS.includes(form), 'INVALID_FORM', 'Unknown battle form.');
}

/**
 * Hex shape: { id: string, tile: string, neighbors: string[], impassable?: boolean }.
 * Neighbor edges must be symmetric and describe physical shared edges, including
 * impassable hexes; tile adjacency for sight still uses those physical edges.
 */
export function createBattleMap(hexes) {
  requireRule(Array.isArray(hexes) && hexes.length > 0, 'INVALID_MAP', 'A map needs hexes.');
  const cells = {};
  for (const hex of hexes) {
    requireRule(hex && typeof hex.id === 'string' && hex.id.length > 0 &&
      typeof hex.tile === 'string' && hex.tile.length > 0 && Array.isArray(hex.neighbors),
    'INVALID_MAP', 'Each hex needs an id, tile and neighbor list.');
    requireRule(!Object.hasOwn(cells, hex.id) && !['__proto__', 'constructor', 'prototype'].includes(hex.id),
      'INVALID_MAP', 'Hex ids must be unique safe keys.');
    requireRule(hex.neighbors.every(id => typeof id === 'string') &&
      new Set(hex.neighbors).size === hex.neighbors.length && !hex.neighbors.includes(hex.id),
    'INVALID_MAP', 'Neighbor lists must contain distinct other hex ids.');
    cells[hex.id] = Object.freeze({
      id: hex.id, tile: hex.tile, neighbors: Object.freeze([...hex.neighbors]), impassable: Boolean(hex.impassable),
    });
  }
  for (const hex of Object.values(cells)) {
    for (const id of hex.neighbors) {
      requireRule(Object.hasOwn(cells, id) && cells[id].neighbors.includes(hex.id),
        'INVALID_MAP', 'Map adjacency must reference existing hexes symmetrically.');
    }
  }
  return Object.freeze({ cells: Object.freeze(cells) });
}

function cell(map, id) {
  requireRule(map?.cells && Object.hasOwn(map.cells, id), 'UNKNOWN_HEX', 'Hex is not on this map.');
  return map.cells[id];
}

function shortestPath(map, from, to, occupied) {
  const start = cell(map, from);
  const end = cell(map, to);
  if (start.impassable || end.impassable || (to !== from && occupied.has(to))) return null;
  const parents = new Map([[from, null]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current === to) {
      const path = [];
      for (let id = to; id !== null; id = parents.get(id)) path.unshift(id);
      return path;
    }
    for (const id of map.cells[current].neighbors) {
      if (!parents.has(id) && !map.cells[id].impassable && !occupied.has(id)) {
        parents.set(id, current);
        queue.push(id);
      }
    }
  }
  return null;
}

/** R p58: returns ids including the start and destination, or null if unreachable. */
export function movementPath(map, from, to, occupied = []) {
  return shortestPath(map, from, to, new Set(occupied));
}

/** R p58: units never block range; impassable hexes always do. */
export function rangeDistance(map, from, to) {
  const path = shortestPath(map, from, to, new Set());
  return path ? path.length - 1 : Infinity;
}

/** R p58: sight is based on tiles, not a geometric line drawn between centers. */
export function hasSight(map, from, to) {
  const source = cell(map, from);
  const target = cell(map, to);
  if (source.impassable || target.impassable) return false;
  if (source.tile === target.tile) return true;
  return Object.values(map.cells).some(hex => hex.tile === source.tile &&
    hex.neighbors.some(id => map.cells[id].tile === target.tile));
}

/** R p61: range predicate only; caller must also verify an opposing, targetable unit. */
export function formCanReach({ form, distance, stamina, magicka }) {
  checkForm(form);
  natural(stamina, 'Stamina');
  natural(magicka, 'Magicka');
  requireRule(distance === Infinity || (Number.isSafeInteger(distance) && distance >= 0),
    'INVALID_VALUE', 'Distance must be a nonnegative integer or Infinity.');
  if (form === 'defensive' || distance === Infinity) return false;
  if (form === 'light-weapon' || form === 'heavy-weapon') return distance === 1;
  if (form === 'ranged-weapon') return distance >= 2 && distance <= stamina;
  return distance <= magicka;
}

export function isInFormRange(map, from, to, attributes) {
  return hasSight(map, from, to) && formCanReach({ ...attributes, distance: rangeDistance(map, from, to) });
}

/** R p59. This action counter starts after start-of-turn effects and recovery. */
export function createTurnState() {
  return { moves: 0, engages: 0, explored: false };
}

function validateTurn(turn) {
  requireRule(turn && typeof turn.explored === 'boolean', 'INVALID_TURN', 'Invalid turn counters.');
  natural(turn.moves, 'Move count');
  natural(turn.engages, 'Engage count');
  requireRule(turn.moves <= 2 && !(turn.moves === 2 && turn.engages > 0) &&
    !(turn.explored && turn.moves > 0), 'INVALID_TURN', 'Contradictory turn counters.');
}

/** A completed movement is one indivisible action, even if fewer than Stamina steps were used. */
export function recordMove(turn) {
  validateTurn(turn);
  requireRule(!turn.explored, 'MOVE_AFTER_EXPLORE', 'Movement and exploration cannot share a turn.');
  requireRule(turn.moves < 2, 'MOVE_LIMIT', 'At most two move actions are allowed.');
  requireRule(turn.moves === 0 || turn.engages === 0,
    'SECOND_MOVE_AFTER_ENGAGE', 'A second move is allowed only without an engagement.');
  return { ...turn, moves: turn.moves + 1 };
}

export function recordEngage(turn) {
  validateTurn(turn);
  requireRule(turn.moves < 2, 'ENGAGE_AFTER_SECOND_MOVE', 'A second move prevents engagements this turn.');
  return { ...turn, engages: turn.engages + 1 };
}

export function recordExplore(turn, battleMode) {
  validateTurn(turn);
  requireRule(battleMode === 'delve', 'EXPLORE_MODE', 'The explore action is available only in a delve.');
  requireRule(!turn.explored, 'EXPLORE_LIMIT', 'The explore action is available once per turn.');
  requireRule(turn.moves === 0, 'EXPLORE_AFTER_MOVE', 'Movement and exploration cannot share a turn.');
  return { ...turn, explored: true };
}

/**
 * Validate a chosen ordinary move, including deliberate non-shortest routes.
 * path includes its starting hex. This does not skip/cache-resolve intermediate
 * effects: the encounter reducer must pause at each triggered event (R p59).
 */
export function validateMovementPath(map, path, stamina, occupied = []) {
  natural(stamina, 'Stamina');
  requireRule(Array.isArray(path) && path.length > 0, 'INVALID_PATH', 'Path must include the starting hex.');
  requireRule(path.length - 1 <= stamina, 'MOVEMENT_RANGE', 'Movement exceeds Stamina.');
  const blocked = new Set(occupied);
  path.forEach((id, index) => {
    const hex = cell(map, id);
    requireRule(!hex.impassable, 'IMPASSABLE', 'Movement cannot use impassable hexes.');
    if (index > 0) {
      requireRule(cell(map, path[index - 1]).neighbors.includes(id), 'NONADJACENT', 'Each step must use a shared edge.');
      // The moving unit vacates its starting hex and can return to it.
      requireRule(id === path[0] || !blocked.has(id), 'OCCUPIED', 'Another unit blocks this movement.');
    }
  });
  return [...path];
}

/** R p59: call with number of engages already performed before starting the next. */
export function engagementFatigue(engagesAlreadyTaken, difficulty) {
  natural(engagesAlreadyTaken, 'Engagement count');
  requireRule(['Apprentice', 'Adept', 'Expert'].includes(difficulty), 'INVALID_DIFFICULTY', 'Unknown tabletop difficulty.');
  return engagesAlreadyTaken === 0 ? 0 : difficulty === 'Expert' ? 2 : 1;
}

/**
 * R pp60–61. Selected die records have unique ids, state:'available',
 * attribute:'stamina'|'magicka', skillLine:'combat'|another id, and
 * forms:[] for unrestricted skills or an explicit list of allowed forms.
 * Free enemy Combat dice from abilities are added by the ability resolver and
 * are deliberately outside this trained-dice selection API.
 */
export function gatherDice({ dice, selectedIds, form, stamina, magicka }) {
  checkForm(form);
  natural(stamina, 'Stamina');
  natural(magicka, 'Magicka');
  requireRule(Array.isArray(dice) && Array.isArray(selectedIds), 'INVALID_DICE', 'Dice and selected ids must be arrays.');
  requireRule(new Set(selectedIds).size === selectedIds.length, 'DUPLICATE_DIE', 'A die cannot be rolled twice.');
  requireRule(dice.every(die => die && typeof die.id === 'string') && new Set(dice.map(die => die.id)).size === dice.length,
    'INVALID_DICE', 'Available dice must have unique ids.');
  const counts = { stamina: 0, magicka: 0 };
  const selected = selectedIds.map(id => {
    const die = dice.find(candidate => candidate.id === id);
    requireRule(die && die.state === 'available', 'DIE_UNAVAILABLE', 'Only available trained dice may be gathered.');
    requireRule(['stamina', 'magicka'].includes(die.attribute) && Array.isArray(die.forms) && die.forms.every(value => BATTLE_FORMS.includes(value)),
      'INVALID_DICE', 'Die requires a verified attribute and form restriction.');
    requireRule(die.skillLine !== 'combat' || form !== 'magic', 'COMBAT_IN_MAGIC', 'Combat dice cannot be gathered in Magic form.');
    requireRule(die.forms.length === 0 || die.forms.includes(form), 'DIE_FORM', 'Skill die is incompatible with this battle form.');
    counts[die.attribute]++;
    return { ...die, forms: [...die.forms] };
  });
  requireRule(counts.stamina <= stamina && counts.magicka <= magicka, 'DICE_CAPACITY', 'Gathered dice exceed their attribute capacity.');
  return { dice: selected, counts };
}

function validateHealth(unit) {
  requireRule(unit && typeof unit === 'object', 'INVALID_UNIT', 'A unit is required.');
  natural(unit.hp, 'HP');
  natural(unit.bonusHp ?? 0, 'Bonus HP');
}

/**
 * R pp20,55,60,63. Resolve physical damage using the defense still available for
 * this action. Carry the returned defenseRemaining into subsequent physical
 * packets of the SAME engage; reset it only when the next action starts.
 * Ability prevention (Dodge, shields, etc.) is resolved by the caller, in the
 * controller's chosen order. `prevention` represents its already verified amount.
 * This helper applies innate defense before that supplied ability prevention.
 */
export function applyPhysicalDamage(unit, amount, { defenseRemaining = unit.defense ?? 0, prevention = 0 } = {}) {
  validateHealth(unit);
  natural(amount, 'Damage');
  natural(defenseRemaining, 'Defense remaining');
  natural(prevention, 'Prevention');
  const defenseUsed = Math.min(amount, defenseRemaining);
  const otherPrevented = Math.min(amount - defenseUsed, prevention);
  const taken = amount - defenseUsed - otherPrevented;
  const bonusLost = Math.min(unit.bonusHp ?? 0, taken);
  const hpLost = Math.min(unit.hp, taken - bonusLost);
  return {
    unit: { ...unit, hp: unit.hp - hpLost, bonusHp: (unit.bonusHp ?? 0) - bonusLost },
    dealt: amount, prevented: defenseUsed + otherPrevented, taken,
    hpLost, bonusLost, defenseRemaining: defenseRemaining - defenseUsed,
  };
}

/** R pp20,63: ordinary prevention and bonus HP do not absorb true damage. */
export function applyTrueDamage(unit, amount) {
  validateHealth(unit);
  natural(amount, 'True damage');
  const hpLost = Math.min(unit.hp, amount);
  return { unit: { ...unit, hp: unit.hp - hpLost }, dealt: amount, taken: amount, hpLost, bonusLost: 0 };
}

/** R p57: rounds after five are all numeric round six for rules effects. */
export function battleRoundValue(roundsStarted) {
  natural(roundsStarted, 'Rounds started');
  requireRule(roundsStarted >= 1, 'INVALID_ROUND', 'Battle rounds start at one.');
  return Math.min(roundsStarted, 6);
}

/** Call AFTER adding this fatigue round's overfatigue to the cooldown track. */
export function fatigueRoundDamage(roundsStarted, overfatigueInTrack) {
  natural(overfatigueInTrack, 'Overfatigue count');
  return battleRoundValue(roundsStarted) === 6 ? overfatigueInTrack : 0;
}
