/**
 * Jailbreak combat alpha. Factual fixture: official Extended Tutorial pp8–18;
 * map/objectives: Rulebook pp92–93. This is a fixed two-adventurer encounter,
 * not the complete game: cache, class rewards, campaign and other components
 * are deliberately outside this reducer. See docs/jailbreak-component-data.md.
 * Equal-priority enemy choices use party order, then northernmost hex: an
 * explicit automated party convention, not an additional tabletop rule.
 */
import {
  BATTLE_FORMS, createTurnState, recordMove, recordEngage, movementPath,
  rangeDistance, hasSight, isInFormRange, gatherDice, engagementFatigue,
  applyPhysicalDamage, applyTrueDamage,
} from './battle-rules.js';
import { queueCooldownDie, recoverCooldown } from './cooldown.js';

export class JailbreakError extends Error {
  constructor(code, message) { super(message); this.name = 'JailbreakError'; this.code = code; }
}
const requireRule = (condition, code, message) => { if (!condition) throw new JailbreakError(code, message); };
const clone = value => structuredClone(value);
const TENACITY_MAX = 5;

const columns = [[2,4,6], [1,3,5,7], [0,2,4,6,8], [1,3,5,7], [0,2,4,6,8], [1,3,5,7], [2,4,6], [3,5], [2,4,6]];
const cells = {};
columns.forEach((ys, x) => ys.forEach(y => {
  const id = `${x},${y}`;
  cells[id] = { id, x, y, tile: x < 7 ? 'clash' : 'entrance', neighbors: [], exit: x === 0, cache: x === 2 && y === 4 };
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

function makeDice(heroId, skill, count) {
  return Array.from({ length: count }, (_, index) => ({ id: `${heroId}-${skill}-${index + 1}`, skill, state: 'available', face: null }));
}

export function createJailbreak({ players = [{ seat: 0 }] } = {}) {
  requireRule(Array.isArray(players) && players.length >= 1 && players.length <= 2,
    'FIXTURE_PLAYERS', 'This tutorial fixture supports one or two people controlling two adventurers.');
  const seats = players.map((player, index) => player.seat ?? index);
  requireRule(seats.every(seat => Number.isSafeInteger(seat) && seat >= 0 && seat < 4) && new Set(seats).size === seats.length,
    'INVALID_PLAYERS', 'Player seats must be distinct.');
  const hero = (id, name, race, stats, form, position, ownerSeat, skill) => ({
    id, name, race, ownerSeat, ...stats, maxHp: stats.hp, bonusHp: 0, cooldownStat: 2,
    tenacity: 0, form, position, escaped: false, racialUsed: false,
    dice: [...makeDice(id, 'combat', id === 'argonian' ? 1 : 2), ...makeDice(id, skill, 2)], cooldown: [],
  });
  return {
    schemaVersion: 1, mode: 'jailbreak-combat', difficulty: 'Adept', partyXp: 1, day: null,
    round: 1, phase: 'start', activeHero: 0, turn: createTurnState(), pending: null, outcome: null,
    heroes: [
      hero('argonian', 'Argonian', 'Argonian', { hp: 5, stamina: 3, magicka: 2 }, 'light-weapon', '7,3', seats[0], 'shield-discipline'),
      hero('dark-elf', 'Dark Elf', 'Dark Elf', { hp: 4, stamina: 2, magicka: 3 }, 'magic', '8,2', seats[1] ?? seats[0], 'force-shock'),
    ],
    enemies: [
      { id: 'high-elf-bandit', name: 'High Elf Bandit', level: 1, hp: 3, maxHp: 3, defense: 0, range: 4, combat: 1, targets: 2, priority: 'weakest', skill: 'Dodge', position: '3,1' },
      { id: 'argonian-bandit', name: 'Argonian Bandit', level: 1, hp: 3, maxHp: 3, defense: 1, range: 3, combat: 1, targets: 2, priority: 'strongest', skill: 'Enfeeble 1', position: '3,7' },
    ],
    supply: { light: 20, over: 12 }, nextDieId: 1, enemyQueue: [],
    achievements: { firstTurn: null, lastTurn: null, firstEscape: null, defeated: {}, rangedDamage: null, meleeDamage: null },
    log: ['Jailbreak: two adventurers, Adept difficulty. Day 1 has not begun.'],
  };
}

const currentHero = state => state.heroes[state.activeHero];
const present = hero => hero.hp > 0 && !hero.escaped && hero.position !== null;
const log = (state, text) => { state.log.push(text); if (state.log.length > 90) state.log.shift(); };
const occupied = (state, except) => [...state.heroes, ...state.enemies].filter(unit => unit.hp > 0 && unit.position && unit.id !== except).map(unit => unit.position);
const returnSupply = (state, dice) => { for (const die of dice) { if (die.kind === 'light-fatigue') state.supply.light++; if (die.kind === 'overfatigue') state.supply.over++; } };

function allocateFatigue(state, over = false) {
  const kind = over || state.supply.light === 0 ? 'overfatigue' : 'light-fatigue';
  const key = kind === 'overfatigue' ? 'over' : 'light';
  if (!state.supply[key]) return null; // R21: no substitute after black dice run out.
  state.supply[key]--;
  return { id: `fatigue-${state.nextDieId++}`, kind };
}

function enqueue(state, hero, die) {
  if (hero.cooldown.length === 13) {
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
  log(state, `${hero.name} recovers ${result.recovered.length} skill dice.`);
}

function rollFace(random, faces) {
  const number = random();
  requireRule(Number.isFinite(number) && number >= 0 && number < 1, 'INVALID_RANDOM', 'Random source must return a number from 0 inclusive to 1 exclusive.');
  requireRule(faces && faces[Math.floor(number * 6)] !== null, 'UNVERIFIED_DIE', 'This die face is not yet verified from the published components.');
  return clone(faces[Math.floor(number * 6)]);
}

function ensurePhase(state, phase) { requireRule(state.phase === phase, 'WRONG_PHASE', `This action requires the ${phase} phase.`); }
function ids(value, name = 'Dice') {
  requireRule(Array.isArray(value) && value.every(id => typeof id === 'string') && new Set(value).size === value.length,
    'INVALID_SELECTION', `${name} must be a list of distinct IDs.`);
  return value;
}

export function getLegalMoves(state) {
  if (state?.phase !== 'heroes') return [];
  const hero = currentHero(state);
  if (!present(hero)) return [];
  try { recordMove(state.turn); } catch { return []; }
  const blockers = occupied(state, hero.id);
  return Object.keys(cells).filter(to => {
    if (to === hero.position) return false;
    const path = movementPath(JAILBREAK_MAP, hero.position, to, blockers);
    return path && path.length - 1 <= hero.stamina;
  });
}

function priorityHeroes(state, enemy) {
  return state.heroes.filter(present).sort((a,b) =>
    (enemy.priority === 'strongest' ? b.hp - a.hp : a.hp - b.hp) || state.heroes.indexOf(a) - state.heroes.indexOf(b));
}
const enemyCanTarget = (enemy, hero, from = enemy.position) => hasSight(JAILBREAK_MAP, from, hero.position) && rangeDistance(JAILBREAK_MAP, from, hero.position) <= enemy.range;

function moveEnemy(state, enemy) {
  const heroes = priorityHeroes(state, enemy);
  if (!heroes.length || heroes.some(hero => enemyCanTarget(enemy, hero))) return;
  const blockers = occupied(state, enemy.id);
  const destinations = Object.values(cells).filter(cell => !blockers.includes(cell.id) && heroes.some(hero => enemyCanTarget(enemy, hero, cell.id)))
    .map(cell => ({ cell, path: movementPath(JAILBREAK_MAP, enemy.position, cell.id, blockers) })).filter(candidate => candidate.path);
  destinations.sort((a,b) => a.path.length - b.path.length);
  const bestLength = destinations[0]?.path.length;
  const best = destinations.filter(candidate => candidate.path.length === bestLength);
  // R64: tied destinations resolve toward closest unit, then its priority.
  const closest = [...heroes].sort((a,b) => rangeDistance(JAILBREAK_MAP, enemy.position, a.position) - rangeDistance(JAILBREAK_MAP, enemy.position, b.position));
  const target = closest[0];
  if (best.length > 1) best.sort((a,b) => rangeDistance(JAILBREAK_MAP, a.cell.id, target.position) - rangeDistance(JAILBREAK_MAP, b.cell.id, target.position) || a.cell.y - b.cell.y || a.cell.x - b.cell.x);
  const path = best[0]?.path;
  if (path) enemy.position = path[Math.min(2, path.length - 1)];
  else {
    const candidates = Object.values(cells).filter(cell => !blockers.includes(cell.id))
      .map(cell => ({ cell, path: movementPath(JAILBREAK_MAP, enemy.position, cell.id, blockers) }))
      .filter(item => item.path && item.path.length <= 3)
      .sort((a,b) => rangeDistance(JAILBREAK_MAP, a.cell.id, target.position) - rangeDistance(JAILBREAK_MAP, b.cell.id, target.position) || a.path.length - b.path.length || a.cell.y - b.cell.y || a.cell.x - b.cell.x);
    if (candidates.length) enemy.position = candidates[0].cell.id;
  }
}

function finishRound(state, random) {
  if (state.heroes.every(hero => hero.hp === 0)) { state.outcome = 'defeat'; }
  else if (state.enemies.every(enemy => enemy.hp === 0) || state.heroes.filter(hero => hero.hp > 0).every(hero => hero.escaped)) { state.outcome = 'victory'; }
  if (state.outcome) {
    state.phase = 'complete'; state.pending = null; state.cleanupPending = true;
    log(state, state.outcome === 'victory' ? 'Jailbreak combat objective completed at the end of the round.' : 'The party is defeated.');
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
    log(state, `${enemy.name} rolls ${damage} damage against ${targets.length} adventurer${targets.length === 1 ? '' : 's'}.`);
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
  log(state, `${hero.name} prevents ${outcome.prevented} and loses ${outcome.hpLost} HP.`);
  if (outcome.hpLost > 0) {
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

/** Pure authoritative action reducer. Caller supplies RNG, never client dice. */
export function reduceJailbreak(input, action, { random = Math.random } = {}) {
  requireRule(input?.schemaVersion === 1 && input.mode === 'jailbreak-combat', 'INVALID_SAVE', 'This is not a supported tabletop encounter save.');
  requireRule(action && typeof action === 'object' && typeof action.type === 'string', 'INVALID_ACTION', 'Choose a valid action.');
  requireRule(typeof random === 'function', 'INVALID_RANDOM', 'A random source is required.');
  requireRule(input.phase !== 'complete', 'ENCOUNTER_COMPLETE', 'The encounter is complete.');
  const state = clone(input), hero = currentHero(state);
  switch (action.type) {
    case 'begin-turn':
      ensurePhase(state, 'start'); recover(state, hero); state.phase = 'heroes';
      state.achievements.firstTurn ??= hero.id; break;
    case 'escape':
      ensurePhase(state, 'start'); requireRule(cells[hero.position]?.exit, 'NOT_AT_EXIT', 'Escape is possible only at the start of a turn on an exit hex.');
      hero.escaped = true; hero.position = null; state.achievements.firstEscape ??= hero.id;
      log(state, `${hero.name} escapes.`); endHeroTurn(state, random); break;
    case 'move': {
      ensurePhase(state, 'heroes'); requireRule(getLegalMoves(state).includes(action.to), 'ILLEGAL_MOVE', 'That hex is not reachable by a legal move.');
      state.turn = recordMove(state.turn); hero.position = action.to; log(state, `${hero.name} moves to ${action.to}.`); break;
    }
    case 'engage': {
      ensurePhase(state, 'heroes'); requireRule(BATTLE_FORMS.includes(action.form), 'INVALID_FORM', 'Choose a battle form.');
      const nextTurn = recordEngage(state.turn);
      const target = state.enemies.find(enemy => enemy.id === action.targetId && enemy.hp > 0);
      if (action.targetId) requireRule(target && isInFormRange(JAILBREAK_MAP, hero.position, target.position, { form: action.form, stamina: hero.stamina, magicka: hero.magicka }), 'INVALID_TARGET', 'Target is outside this battle form’s range.');
      const gathered = gatherDice({ dice: hero.dice.map(die => ({ ...die, ...SKILLS[die.skill], skillLine: die.skill })), selectedIds: ids(action.diceIds ?? []), form: action.form, stamina: hero.stamina, magicka: hero.magicka });
      fatigue(state, hero, engagementFatigue(state.turn.engages, state.difficulty));
      hero.form = action.form; state.turn = nextTurn;
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
      requireRule(['heroes', 'roll'].includes(state.phase), 'WRONG_PHASE', 'Active dice can be dismissed during your turn.');
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
    default: throw new JailbreakError('UNKNOWN_ACTION', 'That action is not supported in this encounter.');
  }
  return state;
}
