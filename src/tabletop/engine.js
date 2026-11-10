/**
 * Jailbreak Introduction encounter with the official Extended Tutorial's fixed
 * two-adventurer setup: Argonian and Dark Elf against the High Elf and
 * Argonian Bandits. Combat: Rulebook pp.54–64, Tutorial pp.8–18. Cache, item,
 * achievements, cleanup and class rewards: Rulebook pp.20, 28–29, 68–70, 86,
 * 89, 92–94 and Tutorial pp.19–22. docs/jailbreak-component-data.md records the
 * page references and rulebook versions checked.
 *
 * Not the complete game: the random five-enemy draw, class abilities, the
 * one-adventurer solo setup and the campaign are outside this reducer. Party
 * decisions are automated by an explicit convention, not an extra tabletop
 * rule: ties use party order, then the northernmost, then the westernmost hex.
 */
import {
  BATTLE_FORMS, createTurnState, recordMove, recordEngage, movementPath,
  rangeDistance, hasSight, isInFormRange, gatherDice, engagementFatigue,
  applyPhysicalDamage, applyTrueDamage,
} from './battle-rules.js';
import { COOLDOWN_CAPACITY, queueCooldownDie, recoverCooldown } from './cooldown.js';
import {
  JAILBREAK_CACHE_FIXTURE, assertLockpickCheck, createLockpickCheck, rollLockpick,
  adjustLockpick, resolveLockpick, stopLockpick, cacheOutcome,
} from './lockpicking.js';
import {
  SUPPORTED_EXPANSIONS, classPool, completedAchievements, earnedClasses, isClassAvailable,
} from './jailbreak-rewards.js';

export class JailbreakError extends Error {
  constructor(code, message) { super(message); this.name = 'JailbreakError'; this.code = code; }
}
const requireRule = (condition, code, message) => { if (!condition) throw new JailbreakError(code, message); };
const clone = value => structuredClone(value);
const natural = value => Number.isSafeInteger(value) && value >= 0;
const TENACITY_MAX = 5;

export const JAILBREAK_SCHEMA_VERSION = 2;
/** R p28: an inventory holds eight cards, four of them in ready slots. */
export const INVENTORY_LIMIT = 8;
export const READY_SLOTS = 4;
export const PHASES = Object.freeze(['start', 'heroes', 'roll', 'lockpick', 'enemy-defense', 'rewards', 'complete']);
const ACTING_PHASES = new Set(['start', 'heroes', 'roll', 'lockpick']);
const DIE_STATES = new Set(['available', 'active', 'cooldown', 'drained', 'rolled']);
const COOLDOWN_KINDS = new Set(['skill', 'light-fatigue', 'overfatigue', 'status']);
const CACHE_RESULTS = new Set(['taken', 'discarded', 'cycled']);
const ACHIEVEMENT_KEYS = ['firstTurn', 'lastTurn', 'firstEscape', 'rangedDamage', 'meleeDamage', 'lockpick'];

const columns = [[2,4,6], [1,3,5,7], [0,2,4,6,8], [1,3,5,7], [0,2,4,6,8], [1,3,5,7], [2,4,6], [3,5], [2,4,6]];
const CACHE_HEX = '2,4';
const cells = {};
columns.forEach((ys, x) => ys.forEach(y => {
  const id = `${x},${y}`;
  cells[id] = { id, x, y, tile: x < 7 ? 'clash' : 'entrance', neighbors: [], exit: x === 0, cache: id === CACHE_HEX };
}));
for (const cell of Object.values(cells)) {
  cell.neighbors = [[0,-2],[-1,-1],[1,-1],[-1,1],[1,1],[0,2]]
    .map(([dx,dy]) => `${cell.x + dx},${cell.y + dy}`).filter(id => cells[id]);
  Object.freeze(cell.neighbors); Object.freeze(cell);
}
export const JAILBREAK_MAP = Object.freeze({ cells: Object.freeze(cells) });

const tenacityFace = Object.freeze({ id: 'tenacity', label: '1 Tenacity', value: 0, tenacity: 1 });
const numberFace = value => Object.freeze({ id: `value-${value}`, label: `${value}`, value });
const physicalFaces = Object.freeze([tenacityFace, numberFace(1), numberFace(1), numberFace(1), numberFace(1), numberFace(2)]);
// Ordinary Force Shock tenacity and enemy Combat frequencies additionally use
// read-only community component scans, documented in the component-data report.
export const SKILLS = Object.freeze({
  combat: Object.freeze({ name: 'Combat', label: 'Combat', attribute: 'stamina', forms: [], faces: physicalFaces }),
  'shield-discipline': Object.freeze({ name: 'Shield Discipline', label: 'Shield Discipline', attribute: 'stamina', forms: ['light-weapon'], faces: physicalFaces }),
  'force-shock': Object.freeze({ name: 'Force Shock', label: 'Force Shock', attribute: 'magicka', forms: ['magic'], faces: Object.freeze([
    tenacityFace,
    Object.freeze({ id: 'shock-2', label: '2 Damage', value: 2 }),
    Object.freeze({ id: 'shock-2', label: '2 Damage', value: 2 }),
    Object.freeze({ id: 'shock-2', label: '2 Damage', value: 2 }),
    Object.freeze({ id: 'shock-4', label: '4 Damage · 1 true damage to an adventurer', value: 4, backlash: 1 }),
    Object.freeze({ id: 'shock-tenacity', label: '2 Tenacity · 1 true damage to an adventurer', value: 0, tenacity: 2, backlash: 1 }),
  ]) }),
});
const enemyFaces = Object.freeze([0, 1, 1, 1, 1, 2]);

/**
 * Item effects this encounter implements. CO-019 was visually verified on
 * Tutorial p5: a common Meat consumable. Its user discards it (the cost), then
 * either gains 3 bonus HP or every adventurer gains 1 bonus HP.
 */
export const ITEMS = Object.freeze({
  'CO-019': Object.freeze({ code: 'CO-019', name: 'Falkreath Meat Loaf', deck: 'common', subtype: 'consumable', trait: 'Meat' }),
});

function makeDice(heroId, skill, count) {
  return Array.from({ length: count }, (_, index) => ({ id: `${heroId}-${skill}-${index + 1}`, skill, state: 'available', face: null }));
}

/** Tutorial T19 / R p69: the top common card shows code 5-2-2 with three attempts. */
function createCache() {
  return {
    position: CACHE_HEX, present: true,
    digits: [...JAILBREAK_CACHE_FIXTURE.digits], attemptLimit: JAILBREAK_CACHE_FIXTURE.attemptLimit,
    keyDigit: JAILBREAK_CACHE_FIXTURE.keyDigit, itemCode: JAILBREAK_CACHE_FIXTURE.itemCode,
    result: null, heroId: null,
  };
}

function checkExpansions(expansions) {
  requireRule(Array.isArray(expansions) && expansions.every(name => SUPPORTED_EXPANSIONS.includes(name)) && new Set(expansions).size === expansions.length,
    'INVALID_EXPANSIONS', 'Only the Valenwood class expansion can be added to this encounter.');
  return [...expansions].sort();
}

export function createJailbreak({ players = [{ seat: 0 }], expansions = [] } = {}) {
  requireRule(Array.isArray(players) && players.length >= 1 && players.length <= 2,
    'FIXTURE_PLAYERS', 'This tutorial fixture supports one or two people controlling two adventurers.');
  const seats = players.map((player, index) => player?.seat ?? index);
  requireRule(seats.every(seat => Number.isSafeInteger(seat) && seat >= 0 && seat < 4) && new Set(seats).size === seats.length,
    'INVALID_PLAYERS', 'Player seats must be distinct.');
  const chosenExpansions = checkExpansions(expansions);
  const hero = (id, name, race, stats, form, position, ownerSeat, skill) => ({
    id, name, race, ownerSeat, ...stats, maxHp: stats.hp, bonusHp: 0, cooldownStat: 2,
    tenacity: 0, form, position, escaped: false, racialUsed: false,
    dice: [...makeDice(id, 'combat', id === 'argonian' ? 1 : 2), ...makeDice(id, skill, 2)], cooldown: [],
    items: [], savedXp: 0, className: null,
  });
  return {
    schemaVersion: JAILBREAK_SCHEMA_VERSION, mode: 'jailbreak-combat', difficulty: 'Adept', expansions: chosenExpansions,
    partyXp: 1, day: null, round: 1, phase: 'start', activeHero: 0, turn: createTurnState(), pending: null, outcome: null,
    heroes: [
      hero('argonian', 'Argonian', 'Argonian', { hp: 5, stamina: 3, magicka: 2 }, 'light-weapon', '7,3', seats[0], 'shield-discipline'),
      hero('dark-elf', 'Dark Elf', 'Dark Elf', { hp: 4, stamina: 2, magicka: 3 }, 'magic', '8,2', seats[1] ?? seats[0], 'force-shock'),
    ],
    enemies: [
      { id: 'high-elf-bandit', name: 'High Elf Bandit', level: 1, hp: 3, maxHp: 3, defense: 0, range: 4, combat: 1, targets: 2, priority: 'weakest', skill: 'Dodge', position: '3,1' },
      { id: 'argonian-bandit', name: 'Argonian Bandit', level: 1, hp: 3, maxHp: 3, defense: 1, range: 3, combat: 1, targets: 2, priority: 'strongest', skill: 'Enfeeble 1', position: '3,7' },
    ],
    cache: createCache(),
    supply: { light: 20, over: 12 }, nextDieId: 1, enemyQueue: [],
    achievements: { firstTurn: null, lastTurn: null, firstEscape: null, defeated: {}, rangedDamage: null, meleeDamage: null, lockpick: null },
    rewards: null,
    log: ['Jailbreak: two adventurers, Adept difficulty. Day 1 has not begun.'],
  };
}

const currentHero = state => state.heroes[state.activeHero];
const present = hero => Boolean(hero) && hero.hp > 0 && !hero.escaped && hero.position !== null;
const log = (state, text) => { state.log.push(text); if (state.log.length > 90) state.log.shift(); };
const occupied = (state, except) => [...state.heroes, ...state.enemies].filter(unit => unit.hp > 0 && unit.position && unit.id !== except).map(unit => unit.position);
const returnSupply = (state, dice) => { for (const die of dice) { if (die.kind === 'light-fatigue') state.supply.light++; if (die.kind === 'overfatigue') state.supply.over++; } };
const itemName = code => ITEMS[code]?.name ?? code;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function allocateFatigue(state, over = false) {
  const kind = over || state.supply.light === 0 ? 'overfatigue' : 'light-fatigue';
  const key = kind === 'overfatigue' ? 'over' : 'light';
  if (!state.supply[key]) return null; // v1.0 R21: no substitute after black dice run out.
  state.supply[key]--;
  return { id: `fatigue-${state.nextDieId++}`, kind };
}

function enqueue(state, hero, die) {
  if (hero.cooldown.length === COOLDOWN_CAPACITY) {
    // R23 discards the incoming die BEFORE replacing the rightmost non-black
    // die. Returning incoming fatigue first matters when the supply is empty.
    if (die.kind === 'skill') hero.dice.find(item => item.id === die.id).state = 'drained';
    else returnSupply(state, [die]);
    const index = hero.cooldown.findLastIndex(item => item.kind !== 'overfatigue');
    requireRule(index >= 0, 'INVALID_COOLDOWN', 'The finite supply cannot make a track of thirteen overfatigue dice.');
    const replacement = allocateFatigue(state, true);
    if (replacement) {
      const displaced = hero.cooldown[index];
      if (displaced.kind === 'skill') hero.dice.find(item => item.id === displaced.id).state = 'drained';
      else returnSupply(state, [displaced]);
      hero.cooldown[index] = replacement;
    }
    return;
  }
  const result = queueCooldownDie(hero.cooldown, die);
  hero.cooldown = result.track;
  for (const drained of result.drained) hero.dice.find(item => item.id === drained.id).state = 'drained';
  returnSupply(state, result.returned);
}

function exhaust(state, hero, die) {
  die.state = 'cooldown';
  enqueue(state, hero, { id: die.id, kind: 'skill', skill: die.skill, face: clone(die.face) });
}

function fatigue(state, hero, count, over = false) {
  if (!present(hero)) return;
  for (let i = 0; i < count; i++) {
    const die = allocateFatigue(state, over);
    if (die) enqueue(state, hero, die);
  }
}

function defeatHero(state, hero) {
  if (hero.hp !== 0) return;
  const wasOnMap = Boolean(hero.position);
  hero.position = null;
  for (const die of hero.dice.filter(die => die.state === 'active')) exhaust(state, hero, die);
  if (wasOnMap) log(state, `${hero.name} is defeated.`);
}

function recover(state, hero) {
  const result = recoverCooldown(hero.cooldown, hero.cooldownStat);
  hero.cooldown = result.track;
  for (const die of result.recovered) {
    const trained = hero.dice.find(item => item.id === die.id);
    trained.state = 'available'; trained.face = null;
  }
  returnSupply(state, result.returned);
  const count = result.recovered.length;
  log(state, `${hero.name} recovers ${count} skill ${count === 1 ? 'die' : 'dice'}.`);
}

function randomUnit(random) {
  const number = random();
  requireRule(Number.isFinite(number) && number >= 0 && number < 1, 'INVALID_RANDOM', 'Random source must return a number from 0 inclusive to 1 exclusive.');
  return number;
}

function rollFace(random, faces) {
  const face = faces?.[Math.floor(randomUnit(random) * 6)];
  requireRule(face !== null && face !== undefined, 'UNVERIFIED_DIE', 'This die face is not yet verified from the published components.');
  return clone(face);
}

/** An ordinary six-sided lockpick die (R p69). */
const rollD6 = random => Math.floor(randomUnit(random) * 6) + 1;

function ensurePhase(state, ...phases) {
  requireRule(phases.includes(state.phase), 'WRONG_PHASE', `This action requires the ${phases.join(' or ')} phase.`);
}
function ids(value, name = 'Dice') {
  requireRule(Array.isArray(value) && value.every(id => typeof id === 'string') && new Set(value).size === value.length,
    'INVALID_SELECTION', `${name} must be a list of distinct IDs.`);
  return value;
}

/**
 * R p59: after an interruption such as a lockpick check, the same move action
 * may continue with its unused hexes (`turn.continueMove`). Otherwise a new move
 * action is available while recordMove allows one.
 */
function moveAllowance(state, hero) {
  let fresh = 0;
  try { recordMove(state.turn); fresh = hero.stamina; } catch { /* No further move action this turn. */ }
  return Math.max(state.turn.continueMove ?? 0, fresh);
}

export function getLegalMoves(state) {
  if (state?.phase !== 'heroes') return [];
  const hero = currentHero(state);
  if (!present(hero)) return [];
  const allowance = moveAllowance(state, hero);
  if (!allowance) return [];
  const blockers = occupied(state, hero.id);
  return Object.keys(cells).filter(to => {
    if (to === hero.position) return false;
    const path = movementPath(JAILBREAK_MAP, hero.position, to, blockers);
    return path && path.length - 1 <= allowance;
  });
}

function priorityHeroes(state, enemy) {
  // R p55: strongest/weakest use current HP and exclude bonus HP.
  return state.heroes.filter(present).sort((a,b) =>
    (enemy.priority === 'strongest' ? b.hp - a.hp : a.hp - b.hp) || state.heroes.indexOf(a) - state.heroes.indexOf(b));
}
const enemyCanTarget = (enemy, hero, from = enemy.position) => hasSight(JAILBREAK_MAP, from, hero.position) && rangeDistance(JAILBREAK_MAP, from, hero.position) <= enemy.range;
const northernmost = (a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x;

/**
 * R p64 and the official "Enemy movement" FAQ: move toward the closest
 * unoccupied hex, reached through unoccupied hexes, from which a targetable
 * unit would be in range and sight. Among equally close destinations the
 * priority icon decides (the strongest or weakest such unit); remaining ties are
 * a party decision. The number of possible targets is ignored. Without any
 * destination, approach the closest opposing unit as far as possible.
 */
function moveEnemy(state, enemy) {
  const heroes = priorityHeroes(state, enemy);
  if (!heroes.length || heroes.some(hero => enemyCanTarget(enemy, hero))) return;
  const blockers = occupied(state, enemy.id);
  const destinations = Object.values(cells).filter(cell => !blockers.includes(cell.id) && heroes.some(hero => enemyCanTarget(enemy, hero, cell.id)))
    .map(cell => ({ cell, path: movementPath(JAILBREAK_MAP, enemy.position, cell.id, blockers) })).filter(candidate => candidate.path);
  if (destinations.length) {
    const shortest = Math.min(...destinations.map(candidate => candidate.path.length));
    let best = destinations.filter(candidate => candidate.path.length === shortest);
    for (const hero of heroes) {
      const reaching = best.filter(candidate => enemyCanTarget(enemy, hero, candidate.cell.id));
      if (reaching.length) { best = reaching; break; }
    }
    const { path } = best.sort(northernmost)[0];
    enemy.position = path[Math.min(2, path.length - 1)];
    return;
  }
  const closest = [...heroes].sort((a,b) => rangeDistance(JAILBREAK_MAP, enemy.position, a.position) - rangeDistance(JAILBREAK_MAP, enemy.position, b.position));
  const target = closest[0];
  const candidates = Object.values(cells).filter(cell => !blockers.includes(cell.id))
    .map(cell => ({ cell, path: movementPath(JAILBREAK_MAP, enemy.position, cell.id, blockers) }))
    .filter(item => item.path && item.path.length <= 3)
    .sort((a,b) => rangeDistance(JAILBREAK_MAP, a.cell.id, target.position) - rangeDistance(JAILBREAK_MAP, b.cell.id, target.position) || a.path.length - b.path.length || northernmost(a, b));
  if (candidates.length) enemy.position = candidates[0].cell.id;
}

/**
 * R p86 cleanup with the Jailbreak instructions on R p93: bonus HP is removed,
 * active dice are exhausted, drained dice recovered and the cooldown track is
 * left as it is. Tenacity and items gained in battle are kept for now.
 */
function enterRewards(state) {
  state.pending = null; state.enemyQueue = []; state.turn = createTurnState();
  for (const hero of state.heroes) {
    hero.bonusHp = 0;
    hero.hp = Math.min(hero.hp, hero.maxHp);
    for (const die of hero.dice.filter(die => die.state === 'active')) exhaust(state, hero, die);
    for (const die of hero.dice.filter(die => die.state === 'drained')) { die.state = 'available'; die.face = null; }
  }
  const allDefeated = state.heroes.every(hero => hero.hp === 0);
  state.rewards = {
    mode: allDefeated ? 'all-defeated' : 'achievements',
    heroes: Object.fromEntries(state.heroes.map(hero => [hero.id, {
      achievements: completedAchievements(state.achievements, hero.id),
      earned: allDefeated ? [] : earnedClasses(state.achievements, hero.id, state.expansions),
      offered: null, declined: false, choice: null, method: null,
    }])),
  };
  state.phase = 'rewards';
  log(state, 'Battle cleanup: active dice are exhausted and bonus HP is removed. Choose class rewards.');
}

function finishRound(state, random) {
  if (state.heroes.every(hero => hero.hp === 0)) { state.outcome = 'defeat'; }
  else if (state.enemies.every(enemy => enemy.hp === 0) || state.heroes.filter(hero => hero.hp > 0).every(hero => hero.escaped)) { state.outcome = 'victory'; }
  if (state.outcome) {
    log(state, state.outcome === 'victory' ? 'Jailbreak objective completed at the end of the round.' : 'The party is defeated.');
    enterRewards(state);
    return;
  }
  state.round++;
  if (state.round >= 6) {
    for (const hero of state.heroes.filter(present)) fatigue(state, hero, 1, true);
    for (const hero of state.heroes.filter(present)) {
      const damage = hero.cooldown.filter(die => die.kind === 'overfatigue').length;
      hero.hp = applyTrueDamage(hero, damage).unit.hp;
      log(state, `${hero.name} takes ${damage} true damage from overfatigue.`);
      defeatHero(state, hero);
    }
  }
  state.activeHero = state.heroes.findIndex(present);
  state.turn = createTurnState(); state.pending = null;
  if (state.activeHero >= 0) state.phase = 'start';
  else { state.enemyQueue = state.enemies.filter(enemy => enemy.hp > 0).map(enemy => enemy.id); advanceEnemies(state, random); }
}

function advanceEnemies(state, random) {
  while (state.enemyQueue.length) {
    const enemyId = state.enemyQueue.shift();
    const enemy = state.enemies.find(enemy => enemy.id === enemyId);
    if (!enemy || enemy.hp === 0) continue;
    moveEnemy(state, enemy);
    const targets = priorityHeroes(state, enemy).filter(hero => enemyCanTarget(enemy, hero)).slice(0, enemy.targets);
    if (!targets.length) continue;
    let damage = 0;
    for (let die = 0; die < enemy.combat; die++) damage += rollFace(random, enemyFaces);
    state.pending = { heroId: targets[0].id, enemyId: enemy.id, damage, targets: targets.map(hero => hero.id), targetIndex: 0 };
    state.phase = 'enemy-defense';
    log(state, `${enemy.name} rolls ${damage} damage against ${plural(targets.length, 'adventurer')}.`);
    return;
  }
  finishRound(state, random);
}

function endHeroTurn(state, random) {
  state.achievements.lastTurn = currentHero(state)?.id ?? state.achievements.lastTurn;
  for (let index = state.activeHero + 1; index < state.heroes.length; index++) {
    if (present(state.heroes[index])) { state.activeHero = index; state.turn = createTurnState(); state.phase = 'start'; state.pending = null; return; }
  }
  state.pending = null;
  state.enemyQueue = state.enemies.filter(enemy => enemy.hp > 0).map(enemy => enemy.id);
  advanceEnemies(state, random);
}

function resolveRoll(state, action, random) {
  ensurePhase(state, 'roll');
  const hero = currentHero(state), pending = state.pending;
  const resultIds = pending.results.map(result => result.dieId);
  const order = action.order === undefined ? resultIds : ids(action.order, 'Resolution order');
  const skip = action.skip === undefined ? [] : ids(action.skip, 'Skipped dice');
  requireRule(order.length === resultIds.length && order.every(id => resultIds.includes(id)) && skip.every(id => resultIds.includes(id)),
    'INVALID_RESOLUTION', 'Resolve each rolled die once and skip only dice in this roll.');
  const target = state.enemies.find(enemy => enemy.id === pending.targetId);
  const selected = order.map(id => pending.results.find(result => result.dieId === id));
  const resolves = selected.filter(result => !skip.includes(result.dieId));
  const damageResults = resolves.filter(result => result.face.value > 0 && target && !(result.skill === 'combat' && pending.form === 'defensive'));
  // Official Dodge FAQ: a die dealing damage to ANY unit counts, including
  // Force Shock backlash accompanying its two-tenacity face.
  const damagingDice = resolves.filter(result => damageResults.includes(result) || result.face.backlash);
  let dodge = target?.skill === 'Dodge' ? resultIds.length - damagingDice.length : 0;
  let defense = target?.defense ?? 0;
  const activeCount = hero.dice.filter(die => die.state === 'active').length;
  const toActive = resolves.filter(result => result.face.value > 0 && (result.skill === 'shield-discipline' || (result.skill === 'combat' && pending.form === 'defensive'))).length;
  requireRule(activeCount + toActive <= 4, 'ACTIVE_SLOTS_FULL', 'Only four active dice fit. Skip a result or free an active slot before rolling.');
  requireRule(action.backlashTargets === undefined || (action.backlashTargets && typeof action.backlashTargets === 'object' && !Array.isArray(action.backlashTargets)),
    'BACKLASH_TARGET', 'Backlash targets must map die IDs to adventurer IDs.');
  const backlashTargets = new Map(resolves.filter(result => result.face.backlash).map(result => {
    const id = action.backlashTargets?.[result.dieId] ?? action.backlashHeroId;
    const recipient = state.heroes.find(item => item.id === id);
    requireRule(recipient && present(recipient), 'BACKLASH_TARGET', 'Choose an undefeated adventurer for each Force Shock backlash result.');
    return [result.dieId, recipient];
  }));
  for (const result of selected) {
    const die = hero.dice.find(die => die.id === result.dieId);
    if (skip.includes(die.id)) { exhaust(state, hero, die); continue; }
    if (result.face.tenacity) hero.tenacity = Math.min(TENACITY_MAX, hero.tenacity + result.face.tenacity);
    const active = result.face.value > 0 && (die.skill === 'shield-discipline' || (die.skill === 'combat' && pending.form === 'defensive'));
    if (active) die.state = 'active';
    if (damageResults.includes(result) && target.hp > 0) {
      const value = result.face.value;
      const dodged = Math.min(value, dodge); dodge -= dodged;
      const outcome = applyPhysicalDamage(target, value - dodged, { defenseRemaining: defense });
      defense = outcome.defenseRemaining; target.hp = outcome.unit.hp;
      log(state, `${hero.name} deals ${outcome.hpLost} damage to ${target.name}.`);
      if (!target.hp) { target.position = null; state.achievements.defeated[target.id] = hero.id; log(state, `${target.name} is defeated.`); }
    }
    if (result.face.backlash) {
      const backlash = backlashTargets.get(result.dieId);
      requireRule(present(backlash), 'BACKLASH_TARGET_DEFEATED', 'Choose a surviving adventurer or skip excess backlash results.');
      backlash.hp = applyTrueDamage(backlash, result.face.backlash).unit.hp;
      log(state, `${backlash.name} takes ${result.face.backlash} true damage from Force Shock.`);
      defeatHero(state, backlash);
    }
    if (!active) exhaust(state, hero, die);
  }
  // Defeated adventurers cannot retain any active dice, including a later
  // result resolved in this same engagement after an earlier backlash defeat.
  for (const adventurer of state.heroes) if (!adventurer.hp) defeatHero(state, adventurer);
  state.pending = null; state.phase = 'heroes';
  if (!present(hero)) endHeroTurn(state, random);
}

function defend(state, action, random) {
  ensurePhase(state, 'enemy-defense');
  const pending = state.pending;
  const hero = state.heroes.find(hero => hero.id === pending.heroId);
  const enemy = state.enemies.find(enemy => enemy.id === pending.enemyId);
  const chosen = ids(action.diceIds ?? []).map(id => {
    const die = hero.dice.find(die => die.id === id);
    requireRule(die?.state === 'active' && ['combat','shield-discipline'].includes(die.skill), 'INVALID_DEFENSE', 'Choose active defense dice belonging to this adventurer.');
    return die;
  });
  if (action.useRacial) requireRule(hero.id === 'argonian' && !hero.racialUsed, 'RACIAL_UNAVAILABLE', 'Argonian Resistance is available once per battle.');
  let prevention = chosen.reduce((sum, die) => sum + die.face.value, 0);
  if (action.useRacial) { prevention = pending.damage; hero.racialUsed = true; }
  const outcome = applyPhysicalDamage(hero, pending.damage, { prevention });
  hero.hp = outcome.unit.hp; hero.bonusHp = outcome.unit.bonusHp;
  for (const die of chosen) exhaust(state, hero, die);
  log(state, `${hero.name} prevents ${outcome.prevented}${outcome.bonusLost ? `, loses ${outcome.bonusLost} bonus HP` : ''} and loses ${outcome.hpLost} HP.`);
  // R p20: bonus HP is removed first when an adventurer takes damage, so damage
  // absorbed by bonus HP is still damage taken for these achievements.
  if (outcome.taken > 0) {
    const key = rangeDistance(JAILBREAK_MAP, enemy.position, hero.position) === 1 ? 'meleeDamage' : 'rangedDamage';
    state.achievements[key] ??= hero.id;
  }
  defeatHero(state, hero);
  // Enfeeble triggers after the whole engage, after all its targets resolved.
  pending.targetIndex++;
  if (pending.targetIndex < pending.targets.length) { pending.heroId = pending.targets[pending.targetIndex]; return; }
  if (enemy.skill === 'Enfeeble 1') for (const id of pending.targets) fatigue(state, state.heroes.find(hero => hero.id === id), 1);
  state.pending = null; advanceEnemies(state, random);
}

function moveHero(state, hero, to) {
  ensurePhase(state, 'heroes');
  requireRule(typeof to === 'string' && getLegalMoves(state).includes(to), 'ILLEGAL_MOVE', 'That hex is not reachable by a legal move.');
  const steps = movementPath(JAILBREAK_MAP, hero.position, to, occupied(state, hero.id)).length - 1;
  const continuing = state.turn.continueMove ?? 0;
  const continuation = steps <= continuing;
  state.turn = { ...(continuation ? state.turn : recordMove(state.turn)), continueMove: 0 };
  const remainingSteps = (continuation ? continuing : hero.stamina) - steps;
  hero.position = to;
  log(state, `${hero.name} ${continuation ? 'continues moving' : 'moves'} to ${to}.`);
  // R pp59, 68: entering a cache hex during your turn may trigger a lockpick
  // check. It interrupts the move; unused hexes may be moved afterwards.
  if (state.cache.present && to === state.cache.position) {
    state.pending = { type: 'lockpick', heroId: hero.id, remainingSteps, check: null };
    state.phase = 'lockpick';
    log(state, `${hero.name} reaches the common cache: code ${state.cache.digits.join('-')}, ${plural(state.cache.attemptLimit, 'attempt')}.`);
  }
}

function lockpickPending(state) {
  ensurePhase(state, 'lockpick');
  return state.pending;
}

/** Translate the pure lockpick module's validation errors into rule errors. */
function lockpickStep(callback) {
  try { return callback(); } catch (error) {
    if (error instanceof JailbreakError) throw error;
    throw new JailbreakError('LOCKPICK_RULE', error.message);
  }
}

function endCacheInterruption(state, hero) {
  const remaining = state.pending.remainingSteps;
  state.pending = null; state.phase = 'heroes';
  state.turn = { ...state.turn, continueMove: remaining };
  if (remaining > 0) log(state, `${hero.name} may continue the interrupted move for up to ${remaining} ${remaining === 1 ? 'hex' : 'hexes'}.`);
}

function finishCache(state, hero, result) {
  Object.assign(state.cache, { present: false, result, heroId: hero.id });
  const name = itemName(state.cache.itemCode);
  log(state, result === 'taken' ? `${hero.name} takes ${name}.`
    : result === 'discarded' ? `${hero.name} leaves ${name}; the card and cache are discarded.`
      : 'The lockpick check fails. The cache is discarded and its item card cycles to the bottom of the deck.');
  endCacheInterruption(state, hero);
}

function lockpickAction(state, hero, action, random) {
  const pending = lockpickPending(state);
  switch (action.type) {
    case 'lockpick-decline':
      requireRule(!pending.check, 'LOCKPICK_STARTED', 'Finish or stop the lockpick check you started.');
      log(state, `${hero.name} leaves the cache locked.`);
      endCacheInterruption(state, hero);
      return;
    case 'lockpick-roll': {
      const keep = action.keep ?? [];
      requireRule(Array.isArray(keep) && keep.length <= 3, 'LOCKPICK_RULE', 'Keep must list die positions from 0 through 2.');
      const check = pending.check ?? createLockpickCheck({ digits: state.cache.digits, attemptLimit: state.cache.attemptLimit, keyDigit: state.cache.keyDigit });
      // Validate the keep choice before generating any server randomness.
      lockpickStep(() => rollLockpick(check, { results: Array(3 - keep.length).fill(1), keep }));
      const results = Array.from({ length: 3 - keep.length }, () => rollD6(random));
      pending.check = lockpickStep(() => rollLockpick(check, { results, keep }));
      log(state, `${hero.name} rolls the lockpick dice (attempt ${pending.check.attemptsUsed} of ${pending.check.attemptLimit}): ${pending.check.dice.join(', ')}.`);
      return;
    }
    case 'lockpick-adjust': {
      requireRule(pending.check?.phase === 'adjust', 'LOCKPICK_RULE', 'Roll the lockpick dice before adjusting a result.');
      const proposed = lockpickStep(() => adjustLockpick(pending.check, { dieIndex: action.dieIndex, delta: action.delta }));
      // R p61: a cost must be paid in full. Each step gains one light fatigue,
      // or overfatigue when no light fatigue remains (R p23).
      requireRule(state.supply.light + state.supply.over >= proposed.fatigueCost, 'FATIGUE_SUPPLY_EMPTY', 'No fatigue dice remain to pay for that adjustment.');
      fatigue(state, hero, proposed.fatigueCost);
      pending.check = proposed.check;
      log(state, `${hero.name} gains ${proposed.fatigueCost} fatigue to change a lockpick die to ${proposed.check.dice[action.dieIndex]}.`);
      return;
    }
    case 'lockpick-resolve':
      requireRule(pending.check?.phase === 'adjust', 'LOCKPICK_RULE', 'Roll the lockpick dice before checking the result.');
      pending.check = lockpickStep(() => resolveLockpick(pending.check));
      if (pending.check.phase === 'success') {
        state.achievements.lockpick ??= hero.id;
        log(state, `${hero.name} matches ${state.cache.digits.join('-')} and unlocks the cache.`);
      } else if (pending.check.phase === 'failure') finishCache(state, hero, 'cycled');
      else log(state, `${hero.name} has not matched the whole code. ${plural(pending.check.attemptLimit - pending.check.attemptsUsed, 'attempt')} left.`);
      return;
    case 'lockpick-stop':
      requireRule(pending.check?.phase === 'continue', 'LOCKPICK_RULE', 'You may stop only after an unsuccessful attempt.');
      pending.check = lockpickStep(() => stopLockpick(pending.check));
      finishCache(state, hero, 'cycled');
      return;
    case 'cache-item': {
      requireRule(pending.check?.phase === 'success', 'LOCKPICK_RULE', 'Only a successful lockpick check unlocks the item.');
      requireRule(['ready', 'pack', 'discard'].includes(action.placement), 'ITEM_PLACEMENT', 'Place the item in a ready slot or your pack, or leave it.');
      const outcome = cacheOutcome(pending.check, { takeItem: action.placement !== 'discard' });
      if (outcome.itemAction === 'take') {
        // R p28 allows rearranging full inventories; this encounter has one
        // cache, so a full inventory is rejected instead of rearranged.
        requireRule(hero.items.length < INVENTORY_LIMIT, 'INVENTORY_FULL', `An inventory holds ${INVENTORY_LIMIT} items.`);
        requireRule(action.placement === 'pack' || hero.items.filter(item => item.slot === 'ready').length < READY_SLOTS, 'READY_SLOTS_FULL', 'All four ready slots are full.');
        hero.items.push({ code: state.cache.itemCode, slot: action.placement, gainedInBattle: true });
      }
      finishCache(state, hero, outcome.itemAction === 'take' ? 'taken' : 'discarded');
      return;
    }
    default: throw new JailbreakError('UNKNOWN_ACTION', 'That action is not supported in this encounter.');
  }
}

/**
 * R p28: an item without stated timing is used during its owner's turn, and
 * only from a ready slot in battle. Bonus HP may exceed Health (R pp20, 89).
 */
function useItem(state, hero, action) {
  ensurePhase(state, 'start', 'heroes');
  const item = hero.items.find(entry => entry.code === action.itemCode);
  requireRule(item?.slot === 'ready', 'ITEM_UNAVAILABLE', 'Only an item in a ready slot can be used during battle.');
  requireRule(item.code === 'CO-019', 'ITEM_UNSUPPORTED', 'This item’s effect is not implemented.');
  requireRule(['self', 'party'].includes(action.mode), 'ITEM_CHOICE', 'Choose 3 bonus HP for yourself or 1 bonus HP for each adventurer.');
  hero.items = hero.items.filter(entry => entry !== item);
  if (action.mode === 'self') hero.bonusHp += 3;
  else for (const adventurer of state.heroes.filter(present)) adventurer.bonusHp += 1;
  log(state, action.mode === 'self' ? `${hero.name} eats ${itemName(item.code)} and gains 3 bonus HP.`
    : `${hero.name} shares ${itemName(item.code)}: each adventurer gains 1 bonus HP.`);
}

function rewardEntry(state, heroId) {
  ensurePhase(state, 'rewards');
  requireRule(typeof heroId === 'string' && Object.hasOwn(state.rewards.heroes, heroId), 'UNKNOWN_HERO', 'Choose one of the party’s adventurers.');
  return state.rewards.heroes[heroId];
}

const chosenByOthers = (state, heroId) => Object.entries(state.rewards.heroes).filter(([id, entry]) => id !== heroId && entry.choice).map(([, entry]) => entry.choice);

/**
 * Classes one adventurer may take right now (R pp93–94). Earned options need
 * at least two classes; otherwise the adventurer draws to two. An adventurer
 * declining earned classes chooses last among the remaining sheets: the
 * literal mutual waiting with drawing adventurers is resolved in that order.
 */
export function classOptions(state, heroId) {
  if (state?.phase !== 'rewards' || !state.rewards?.heroes?.[heroId]) return [];
  const entry = state.rewards.heroes[heroId];
  if (entry.choice) return [];
  const taken = new Set(chosenByOthers(state, heroId));
  if (entry.declined) {
    const othersReady = Object.entries(state.rewards.heroes).every(([id, other]) => id === heroId || other.declined || other.choice);
    return othersReady ? classPool(state.expansions).filter(name => !taken.has(name)) : [];
  }
  if (entry.offered) return entry.offered.filter(name => !taken.has(name));
  if (state.rewards.mode === 'achievements' && entry.earned.length >= 2) return entry.earned.filter(name => !taken.has(name));
  return [];
}

/** Whether `draw-classes` is currently legal for this adventurer. */
export function canDrawClasses(state, heroId) {
  if (state?.phase !== 'rewards' || !state.rewards?.heroes?.[heroId]) return false;
  const entry = state.rewards.heroes[heroId];
  if (entry.choice || entry.offered || entry.declined) return false;
  const others = Object.entries(state.rewards.heroes).filter(([id]) => id !== heroId).map(([, other]) => other);
  if (others.some(other => other.offered && !other.choice)) return false; // Draws happen one adventurer at a time.
  if (state.rewards.mode === 'all-defeated') return true;
  return entry.earned.length < 2 && others.every(other => other.choice || other.declined || other.earned.length < 2);
}

function drawClasses(state, action, random) {
  const entry = rewardEntry(state, action.heroId);
  const allDefeated = state.rewards.mode === 'all-defeated';
  requireRule(!entry.choice && !entry.offered && !entry.declined, 'DRAW_UNAVAILABLE', 'This adventurer has already drawn, declined or chosen.');
  requireRule(allDefeated || entry.earned.length < 2, 'DRAW_UNAVAILABLE', 'Choose one of your earned classes instead.');
  requireRule(canDrawClasses(state, action.heroId), 'WAIT_FOR_CHOICES', 'Wait until the other adventurers have chosen.');
  // Fewer than two earned options: set those aside, shuffle every other sheet
  // and draw until holding two. If everyone was defeated, the sheets are
  // shuffled once and each adventurer draws two, so earlier draws stay out.
  const excluded = new Set([...chosenByOthers(state, action.heroId), ...(allDefeated
    ? Object.values(state.rewards.heroes).flatMap(other => other.offered ?? [])
    : entry.earned)]);
  const pool = classPool(state.expansions).filter(name => !excluded.has(name));
  const drawn = [];
  for (let count = allDefeated ? 2 : 2 - entry.earned.length; count > 0 && pool.length; count--) {
    drawn.push(pool.splice(Math.floor(randomUnit(random) * pool.length), 1)[0]);
  }
  entry.offered = [...(allDefeated ? [] : entry.earned), ...drawn];
  const hero = state.heroes.find(item => item.id === action.heroId);
  log(state, `${hero.name} draws class sheets: ${drawn.join(' and ')}.`);
}

function declineEarnedClasses(state, action) {
  const entry = rewardEntry(state, action.heroId);
  requireRule(state.rewards.mode === 'achievements' && entry.earned.length > 0 && !entry.choice && !entry.offered && !entry.declined,
    'DECLINE_UNAVAILABLE', 'Only an adventurer with earned classes can decline them before drawing or choosing.');
  const hero = state.heroes.find(item => item.id === action.heroId);
  entry.declined = true;
  // R p94: choosing a non-achievement class costs the tenacity and items
  // gained during this battle (Jailbreak adventurers start with neither).
  const lost = hero.items.filter(item => item.gainedInBattle);
  hero.tenacity = 0;
  hero.items = hero.items.filter(item => !item.gainedInBattle);
  log(state, `${hero.name} declines achievement classes, losing tenacity${lost.length ? ` and discarding ${lost.map(item => itemName(item.code)).join(', ')}` : ''}.`);
}

/** R p94: party XP 2, saved XP 0, then an inn-like rest. Day 1 is not started. */
function completeJailbreak(state) {
  for (const hero of state.heroes) {
    hero.className = state.rewards.heroes[hero.id].choice;
    hero.hp = hero.maxHp; hero.bonusHp = 0; hero.savedXp = 0; hero.position = null;
    for (const die of hero.cooldown.filter(die => die.kind === 'skill')) {
      const trained = hero.dice.find(item => item.id === die.id);
      trained.state = 'available'; trained.face = null;
    }
    returnSupply(state, hero.cooldown);
    hero.cooldown = [];
  }
  state.partyXp = 2; state.day = null; state.pending = null; state.phase = 'complete';
  log(state, `Classes chosen: ${state.heroes.map(hero => `${hero.name} ${hero.className}`).join(', ')}. Party XP is 2; the adventurers rest to full HP with empty cooldown tracks.`);
}

function chooseClass(state, action) {
  const entry = rewardEntry(state, action.heroId);
  requireRule(!entry.choice, 'CLASS_CHOSEN', 'This adventurer has already chosen a class.');
  requireRule(typeof action.className === 'string' && classOptions(state, action.heroId).includes(action.className), 'CLASS_UNAVAILABLE',
    'That class is not one of this adventurer’s current options.');
  entry.choice = action.className;
  entry.method = entry.declined ? 'non-achievement' : entry.earned.includes(action.className) ? 'achievement' : 'draw';
  const hero = state.heroes.find(item => item.id === action.heroId);
  log(state, `${hero.name} chooses the ${action.className} class.`);
  if (Object.values(state.rewards.heroes).every(other => other.choice)) completeJailbreak(state);
}

/** Upgrade a schema-1 combat-alpha save (no cache, items or rewards). */
export function upgradeJailbreak(input) {
  requireRule(input && typeof input === 'object' && input.mode === 'jailbreak-combat' && [1, JAILBREAK_SCHEMA_VERSION].includes(input.schemaVersion),
    'INVALID_SAVE', 'This is not a supported tabletop encounter save.');
  if (input.schemaVersion === JAILBREAK_SCHEMA_VERSION) return input;
  const state = clone(input);
  requireRule(Array.isArray(state.heroes) && Array.isArray(state.log) && state.achievements && typeof state.achievements === 'object',
    'INVALID_SAVE', 'This is not a supported tabletop encounter save.');
  Object.assign(state, { schemaVersion: JAILBREAK_SCHEMA_VERSION, expansions: [], cache: createCache(), rewards: null });
  state.achievements.lockpick = null;
  for (const hero of state.heroes) Object.assign(hero, { bonusHp: hero.bonusHp ?? 0, items: [], savedXp: 0, className: null });
  const finished = state.phase === 'complete';
  delete state.cleanupPending;
  if (finished) enterRewards(state);
  return state;
}

/** Pure authoritative action reducer. Caller supplies RNG, never client dice. */
export function reduceJailbreak(input, action, { random = Math.random } = {}) {
  requireRule(action && typeof action === 'object' && !Array.isArray(action) && typeof action.type === 'string', 'INVALID_ACTION', 'Choose a valid action.');
  requireRule(typeof random === 'function', 'INVALID_RANDOM', 'A random source is required.');
  const state = clone(upgradeJailbreak(input));
  requireRule(state.phase !== 'complete', 'ENCOUNTER_COMPLETE', 'The encounter is complete.');
  const hero = currentHero(state);
  switch (action.type) {
    case 'begin-turn':
      ensurePhase(state, 'start'); recover(state, hero); state.phase = 'heroes';
      state.achievements.firstTurn ??= hero.id; break;
    case 'escape':
      ensurePhase(state, 'start'); requireRule(cells[hero.position]?.exit, 'NOT_AT_EXIT', 'Escape is possible only at the start of a turn on an exit hex.');
      state.achievements.firstTurn ??= hero.id;
      hero.escaped = true; hero.position = null; state.achievements.firstEscape ??= hero.id;
      log(state, `${hero.name} escapes.`); endHeroTurn(state, random); break;
    case 'move': moveHero(state, hero, action.to); break;
    case 'engage': {
      ensurePhase(state, 'heroes'); requireRule(BATTLE_FORMS.includes(action.form), 'INVALID_FORM', 'Choose a battle form.');
      const nextTurn = recordEngage(state.turn);
      const target = state.enemies.find(enemy => enemy.id === action.targetId && enemy.hp > 0);
      if (action.targetId) requireRule(target && isInFormRange(JAILBREAK_MAP, hero.position, target.position, { form: action.form, stamina: hero.stamina, magicka: hero.magicka }), 'INVALID_TARGET', 'Target is outside this battle form’s range.');
      const gathered = gatherDice({ dice: hero.dice.map(die => ({ ...die, ...SKILLS[die.skill], skillLine: die.skill })), selectedIds: ids(action.diceIds ?? []), form: action.form, stamina: hero.stamina, magicka: hero.magicka });
      fatigue(state, hero, engagementFatigue(state.turn.engages, state.difficulty));
      // R p59: movement cannot be split around an engagement.
      hero.form = action.form; state.turn = { ...nextTurn, continueMove: 0 };
      const results = gathered.dice.map(selected => {
        const die = hero.dice.find(die => die.id === selected.id);
        die.face = rollFace(random, SKILLS[die.skill].faces); die.state = 'rolled';
        return { dieId: die.id, skill: die.skill, face: clone(die.face) };
      });
      state.pending = { heroId: hero.id, targetId: target?.id ?? null, form: action.form, results };
      state.phase = 'roll'; break;
    }
    case 'resolve': resolveRoll(state, action, random); break;
    case 'end-turn': ensurePhase(state, 'heroes'); endHeroTurn(state, random); break;
    case 'defend': defend(state, action, random); break;
    case 'dismiss-active': {
      ensurePhase(state, 'heroes', 'roll');
      for (const id of ids(action.diceIds)) {
        const die = hero.dice.find(die => die.id === id);
        requireRule(die?.state === 'active', 'INVALID_ACTIVE_DIE', 'Only this adventurer’s active dice can be dismissed.');
        exhaust(state, hero, die);
      }
      break;
    }
    case 'racial': {
      ensurePhase(state, 'heroes'); requireRule(hero.id === 'dark-elf' && !hero.racialUsed, 'RACIAL_UNAVAILABLE', 'Dynamic is available to the Dark Elf once per battle.');
      const selected = ids(action.diceIds);
      // Official FAQ "Resolving Skills and Abilities: Do As Much As Possible"
      // (2026-05-01): recover all eligible skills when fewer than four remain;
      // with four or more eligible skills, resolving fewer is not optional.
      const required = Math.min(4, hero.cooldown.filter(die => die.kind === 'skill').length);
      requireRule(required > 0 && selected.length === required, 'RACIAL_SELECTION', `Dynamic requires ${required} exhausted skill dice.`);
      for (const id of selected) requireRule(hero.cooldown.some(die => die.id === id && die.kind === 'skill'), 'RACIAL_SELECTION', 'Choose skill dice in the cooldown track.');
      // Replace each chosen physical slot in place, preserving queue order.
      for (const id of selected) {
        const index = hero.cooldown.findIndex(die => die.id === id);
        const die = hero.dice.find(die => die.id === id); die.state = 'available'; die.face = null;
        const replacement = allocateFatigue(state);
        hero.cooldown.splice(index, 1, ...(replacement ? [replacement] : []));
      }
      hero.racialUsed = true; log(state, 'Dark Elf uses Dynamic to recover skill dice.'); break;
    }
    case 'lockpick-roll': case 'lockpick-adjust': case 'lockpick-resolve': case 'lockpick-stop': case 'lockpick-decline': case 'cache-item':
      lockpickAction(state, hero, action, random); break;
    case 'use-item': useItem(state, hero, action); break;
    case 'draw-classes': drawClasses(state, action, random); break;
    case 'decline-earned-classes': declineEarnedClasses(state, action); break;
    case 'choose-class': chooseClass(state, action); break;
    default: throw new JailbreakError('UNKNOWN_ACTION', 'That action is not supported in this encounter.');
  }
  return state;
}

const isFace = face => Boolean(face) && typeof face === 'object' && typeof face.id === 'string' && natural(face.value);

function validHero(state, hero) {
  return ['hp', 'maxHp', 'bonusHp', 'stamina', 'magicka', 'cooldownStat', 'tenacity', 'savedXp'].every(key => natural(hero[key])) &&
    hero.maxHp > 0 && hero.hp <= hero.maxHp && hero.tenacity <= TENACITY_MAX && Number.isSafeInteger(hero.ownerSeat) &&
    typeof hero.name === 'string' && typeof hero.race === 'string' && typeof hero.escaped === 'boolean' && typeof hero.racialUsed === 'boolean' &&
    (hero.position === null || Object.hasOwn(cells, hero.position)) && BATTLE_FORMS.includes(hero.form) &&
    (hero.className === null || isClassAvailable(hero.className, state.expansions)) &&
    Array.isArray(hero.dice) && hero.dice.every(die => die && typeof die.id === 'string' && Object.hasOwn(SKILLS, die.skill) &&
      DIE_STATES.has(die.state) && (die.face === null || isFace(die.face))) &&
    new Set(hero.dice.map(die => die.id)).size === hero.dice.length && hero.dice.filter(die => die.state === 'active').length <= 4 &&
    Array.isArray(hero.cooldown) && hero.cooldown.length <= COOLDOWN_CAPACITY &&
    hero.cooldown.every(die => die && typeof die.id === 'string' && COOLDOWN_KINDS.has(die.kind)) &&
    new Set(hero.cooldown.map(die => die.id)).size === hero.cooldown.length &&
    hero.dice.every(die => (die.state === 'cooldown') === hero.cooldown.some(queued => queued.kind === 'skill' && queued.id === die.id)) &&
    hero.cooldown.filter(die => die.kind === 'skill').every(queued => hero.dice.some(die => die.id === queued.id)) &&
    Array.isArray(hero.items) && hero.items.length <= INVENTORY_LIMIT && hero.items.filter(item => item?.slot === 'ready').length <= READY_SLOTS &&
    hero.items.every(item => item && Object.hasOwn(ITEMS, item.code) && ['ready', 'pack'].includes(item.slot) && typeof item.gainedInBattle === 'boolean');
}

function validPending(state, heroIds) {
  const pending = state.pending;
  const active = currentHero(state);
  switch (state.phase) {
    case 'roll':
      return Boolean(pending) && pending.heroId === active.id && BATTLE_FORMS.includes(pending.form) &&
        (pending.targetId === null || state.enemies.some(enemy => enemy.id === pending.targetId)) &&
        Array.isArray(pending.results) && pending.results.every(result => result && typeof result.dieId === 'string' &&
          Object.hasOwn(SKILLS, result.skill) && isFace(result.face) && active.dice.some(die => die.id === result.dieId && die.state === 'rolled'));
    case 'enemy-defense':
      return Boolean(pending) && heroIds.includes(pending.heroId) && state.enemies.some(enemy => enemy.id === pending.enemyId) &&
        natural(pending.damage) && Array.isArray(pending.targets) && pending.targets.every(id => heroIds.includes(id)) &&
        natural(pending.targetIndex) && pending.targets[pending.targetIndex] === pending.heroId;
    case 'lockpick':
      if (!pending || pending.type !== 'lockpick' || pending.heroId !== active.id || !natural(pending.remainingSteps) || !state.cache.present) return false;
      if (pending.check === null) return true;
      assertLockpickCheck(pending.check);
      return ['adjust', 'continue', 'success'].includes(pending.check.phase) && pending.check.digits.join() === state.cache.digits.join();
    default:
      return pending === null;
  }
}

function validRewards(state, heroIds) {
  const rewards = state.rewards;
  if (!['rewards', 'complete'].includes(state.phase)) return rewards === null && state.outcome === null;
  if (!['victory', 'defeat'].includes(state.outcome) || !rewards || !['achievements', 'all-defeated'].includes(rewards.mode) || !rewards.heroes) return false;
  const known = name => isClassAvailable(name, state.expansions);
  return Object.keys(rewards.heroes).length === heroIds.length && heroIds.every(id => {
    const entry = rewards.heroes[id];
    return entry && Array.isArray(entry.achievements) && entry.achievements.every(item => typeof item === 'string') &&
      Array.isArray(entry.earned) && entry.earned.every(known) && (entry.offered === null || (Array.isArray(entry.offered) && entry.offered.every(known))) &&
      typeof entry.declined === 'boolean' && (entry.choice === null || known(entry.choice)) &&
      [null, 'achievement', 'draw', 'non-achievement'].includes(entry.method) && (state.phase !== 'complete' || Boolean(entry.choice));
  });
}

/**
 * Structural check for a schema-2 state loaded from untrusted storage. It does
 * not replay history; it rejects shapes the reducer could not continue safely.
 */
export function isJailbreakState(state) {
  try {
    if (!state || typeof state !== 'object' || state.schemaVersion !== JAILBREAK_SCHEMA_VERSION || state.mode !== 'jailbreak-combat' || !PHASES.includes(state.phase)) return false;
    if (!['Apprentice', 'Adept', 'Expert'].includes(state.difficulty) || !Array.isArray(state.expansions) || !state.expansions.every(name => SUPPORTED_EXPANSIONS.includes(name))) return false;
    if (!natural(state.round) || state.round < 1 || !natural(state.partyXp) || !(state.day === null || natural(state.day))) return false;
    if (!Array.isArray(state.log) || !state.log.every(line => typeof line === 'string')) return false;
    const turn = state.turn;
    if (!turn || !natural(turn.moves) || !natural(turn.engages) || typeof turn.explored !== 'boolean' || !natural(turn.continueMove ?? 0)) return false;
    if (!state.supply || !natural(state.supply.light) || !natural(state.supply.over) || !natural(state.nextDieId)) return false;
    if (!Array.isArray(state.enemyQueue) || !state.enemyQueue.every(id => typeof id === 'string')) return false;
    if (!Array.isArray(state.heroes) || state.heroes.length !== 2 || state.heroes[0]?.id !== 'argonian' || state.heroes[1]?.id !== 'dark-elf') return false;
    const heroIds = state.heroes.map(hero => hero.id);
    if (!state.heroes.every(hero => validHero(state, hero))) return false;
    if (!Array.isArray(state.enemies) || !state.enemies.length || !state.enemies.every(enemy => enemy && typeof enemy.id === 'string' && typeof enemy.name === 'string' &&
      ['hp', 'maxHp', 'level', 'defense', 'range', 'combat', 'targets'].every(key => natural(enemy[key])) && enemy.hp <= enemy.maxHp &&
      ['strongest', 'weakest'].includes(enemy.priority) && typeof enemy.skill === 'string' &&
      (enemy.position === null || Object.hasOwn(cells, enemy.position)))) return false;
    const cache = state.cache;
    if (!cache || cache.position !== CACHE_HEX || typeof cache.present !== 'boolean' || !Object.hasOwn(ITEMS, cache.itemCode) ||
      cache.present !== (cache.result === null) || !(cache.result === null || CACHE_RESULTS.has(cache.result)) ||
      !(cache.heroId === null || heroIds.includes(cache.heroId))) return false;
    createLockpickCheck({ digits: cache.digits, attemptLimit: cache.attemptLimit, keyDigit: cache.keyDigit });
    const achievements = state.achievements;
    if (!achievements || typeof achievements !== 'object' || !achievements.defeated || typeof achievements.defeated !== 'object' ||
      !ACHIEVEMENT_KEYS.every(key => achievements[key] === null || heroIds.includes(achievements[key])) ||
      !Object.values(achievements.defeated).every(id => heroIds.includes(id))) return false;
    if (!Number.isSafeInteger(state.activeHero) || state.activeHero < -1 || state.activeHero >= state.heroes.length) return false;
    if (ACTING_PHASES.has(state.phase) && !present(currentHero(state))) return false;
    return validPending(state, heroIds) && validRewards(state, heroIds);
  } catch {
    return false;
  }
}
