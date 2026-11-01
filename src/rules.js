/** A compact, original solo campaign inspired by the tabletop game's core loops.
 * Axial hex coordinates; pure rules except for optional browser save storage.
 * This is an adaptation, not a reproduction of the complete official ruleset.
 */
export const SAVE_KEY = 'betrayal-board-save-v1';
export const HEXES = [];
for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
  if (Math.abs(q + r) <= 3) HEXES.push({ q, r, key: `${q},${r}`, terrain: 'stone' });
}
export const SKILLS = {
  blade: { name: 'Iron Blade', type: 'physical', range: 1, faces: [['hit', 2], ['hit', 2], ['hit', 2], ['critical', 3], ['hit', 1], ['blank', 0]] },
  destruction: { name: 'Flames', type: 'magic', range: 3, faces: [['hit', 2], ['hit', 2], ['critical', 3], ['hit', 1], ['hit', 1], ['blank', 0]] },
  guard: { name: 'Iron Ward', type: 'defense', range: 0, faces: [['block', 2], ['block', 2], ['block', 3], ['block', 1], ['block', 1], ['blank', 0]] },
  restoration: { name: 'Restoration', type: 'support', range: 0, faces: [['heal', 2], ['heal', 2], ['heal', 3], ['heal', 1], ['heal', 1], ['blank', 0]] },
  lightning: { name: 'Lightning Bolt', type: 'magic', range: 4, faces: [['hit', 3], ['hit', 2], ['critical', 4], ['hit', 2], ['hit', 2], ['blank', 0]] }
};
export const CLASSES = {
  Sorcerer: { name: 'Sorcerer', ability: 'Crystal Fragments', description: 'Spend 2 Tenacity: deal 4 damage to an enemy within 3 hexes.', damage: 4, heal: 0, guard: 0, icon: 'Flame' },
  Dragonknight: { name: 'Dragonknight', ability: 'Obsidian Shield', description: 'Spend 2 Tenacity: deal 3 damage within 3 hexes and gain 2 Guard.', damage: 3, heal: 0, guard: 2, icon: 'Shield' },
  Nightblade: { name: 'Nightblade', ability: 'Siphoning Strike', description: 'Spend 2 Tenacity: deal 3 damage within 3 hexes and recover 2 health.', damage: 3, heal: 2, guard: 0, icon: 'Moon' }
};
export const SHOP_ITEMS = [
  { id: 'potion', name: 'Health potion', description: 'Add one potion. Drink it during combat to recover up to 6 health.', cost: 15, icon: 'Heart', kind: 'consumable' },
  { id: 'ward-charm', name: 'Ward charm', description: 'Begin every turn with 1 Guard. Automatically equipped.', cost: 40, icon: 'Shield', kind: 'equipment' },
  { id: 'sharpening-stone', name: 'Sharpening stone', description: 'Deal +1 damage when any physical die hits in an engagement.', cost: 45, icon: 'Sword', kind: 'equipment' },
  { id: 'focus-crystal', name: 'Focus crystal', description: 'Deal +1 damage when any magic die hits in an engagement.', cost: 45, icon: 'Flame', kind: 'equipment' }
];
export const TRAINING_OPTIONS = [
  { id: 'vitality', name: 'Enduring spirit', description: 'Permanently gain 3 maximum health and recover 3 health.', cost: 2, icon: 'Heart' },
  { id: 'discipline', name: 'Battle discipline', description: 'Recover one additional die at the start of each turn.', cost: 3, icon: 'RotateCcw' },
  { id: 'lightning', name: 'Lightning Bolt', description: 'Learn a powerful magic die with a range of 4 hexes.', cost: 2, icon: 'Zap' }
];
export const DIFFICULTIES = {
  story: { id: 'story', name: 'Story', description: 'Two extra rounds per battle. Enemies deal 1 less damage, to a minimum of 1.', roundBonus: 2, healthBonus: 0, attackBonus: -1 },
  standard: { id: 'standard', name: 'Standard', description: 'The intended tactical challenge. Plan your movement, skills, and supplies.', roundBonus: 0, healthBonus: 0, attackBonus: 0 },
  veteran: { id: 'veteran', name: 'Veteran', description: 'Enemies gain 2 health and deal 1 more damage. Cover and preparation matter.', roundBonus: 0, healthBonus: 2, attackBonus: 1 }
};
export const ROUTE_EVENTS = {
  camp: { id: 'camp', title: 'A fire in the dark', text: 'A caravan has taken shelter beside the old road. Its weary captain offers food and a place by the fire. Before dawn, you must choose how to prepare for the dangers ahead.', art: '/assets/hero.jpg', choices: [
    { id: 'camp-rest', label: 'Share their fire', description: 'Trade stories, tend your wounds, and accept a flask for the road.', effectsLabel: 'Fully heal · +1 health potion' },
    { id: 'camp-prepare', label: 'Stand the night watch', description: 'Protect the caravan and learn the captain’s defensive drills.', effectsLabel: 'Heal 6 · Start every turn of the next encounter with +1 Guard' }
  ] },
  shrine: { id: 'shrine', title: 'The voice beneath the stones', text: 'A quiet whisper rises from a cracked wayshrine. A memory of ancient magic waits within its blue light. You can reach for its power, or ask the shrine to restore your strength.', art: '/assets/shrine.jpg', choices: [
    { id: 'shrine-learn', label: 'Listen to the ancient spell', description: 'Learn Lightning Bolt. If you already know it, gain 2 Tenacity instead.', effectsLabel: 'Lightning Bolt or +2 Tenacity · Heal 4' },
    { id: 'shrine-restore', label: 'Ask for renewal', description: 'Set aside your ambition and accept a blessing for the journey.', effectsLabel: 'Fully heal · +2 Tenacity' }
  ] },
  ruins: { id: 'ruins', title: 'What the ruins remember', text: 'A collapsed waystation hides a strongbox and a half-buried journal. The fading light leaves time to recover only one. The strongbox holds coins and a healing draught; the journal records a fighting discipline that steels your resolve.', art: '/assets/keep.jpg', choices: [
    { id: 'ruins-gold', label: 'Open the strongbox', description: 'Recover the old garrison’s pay and a health potion, then gather medicinal herbs for the road.', effectsLabel: '+35 gold · +1 health potion · Heal 3' },
    { id: 'ruins-study', label: 'Read the forgotten journal', description: 'Study its techniques and prepare a class ability with renewed Tenacity. Gather herbs before departing.', effectsLabel: '+2 XP · +2 Tenacity (up to 6) · Heal 3' }
  ] }
};
const cover = (q, r) => ({ q, r, type: 'cover', name: 'Stone cover', description: 'End your move here to reduce every incoming enemy attack by 1, before Guard.' });
const hazard = (q, r) => ({ q, r, type: 'hazard', name: 'Unstable ground', description: 'Ending a move here costs 1 health. Enemies are unaffected.' });
export const ENCOUNTER_TERRAIN = [
  [cover(-2, 1), cover(1, 0), cover(0, -2), hazard(-2, 2), hazard(2, 0)],
  [cover(-2, 1), cover(1, 0), cover(0, -2), hazard(-2, 0), hazard(2, -2)],
  [cover(-2, 1), cover(1, 0), cover(0, -2), hazard(-2, 0), hazard(2, -2)]
];
export const ENCOUNTER_TOKENS = [
  [{ id: 'road-chest', q: -2, r: 1, type: 'chest', name: 'Abandoned strongbox', collected: false }],
  [{ id: 'shard-west', q: -1, r: 1, type: 'skyshard', name: 'Western skyshard', collected: false }, { id: 'shard-east', q: 1, r: -1, type: 'skyshard', name: 'Eastern skyshard', collected: false }],
  [{ id: 'ward-west', q: -1, r: 0, type: 'ward', name: 'Western ritual ward', collected: false }, { id: 'ward-east', q: 1, r: -1, type: 'ward', name: 'Eastern ritual ward', collected: false }]
];
export const ENCOUNTERS = [
  { id: 'ambush', name: 'An uneasy welcome', location: 'Glenumbra', description: 'The road to Daggerfall lies silent. Between the broken stones, a glint of steel catches your eye. You are not alone.', objective: 'Defeat the ambushers before the end of round 5.', reward: { xp: 2, gold: 30 }, enemies: [
    { id: 'raider', name: 'Iron Raider', type: 'melee', q: 0, r: 0, health: 5, attack: 2 },
    { id: 'archer', name: 'Ashen Archer', type: 'ranged', q: 2, r: -1, health: 4, attack: 1 }
  ] },
  { id: 'shrine', name: 'Whispers in the ruins', location: 'Stormhaven', description: 'An old seal has been broken. Beneath the ruined sanctuary, Deslandra’s servants guard two skyshards. Recover them before their power is lost.', objective: 'Recover both skyshards and defeat the guardians.', reward: { xp: 3, gold: 45 }, enemies: [
    { id: 'sentinel', name: 'Oathbound Sentinel', type: 'melee', q: 0, r: 0, health: 5, attack: 2 },
    { id: 'cultist', name: 'Ash Cultist', type: 'ranged', q: -1, r: -1, health: 4, attack: 2 },
    { id: 'hound', name: 'Shadow Hound', type: 'beast', q: 2, r: -1, health: 3, attack: 1 }
  ] },
  { id: 'oathbreaker', name: 'The price of betrayal', location: 'Rivenspire', description: 'The trail ends here. Two ritual wards protect Deslandra behind a veil of stolen magic. Break them to strip her protection, or face her at full strength.', objective: 'Defeat Deslandra and her guardian. Break the wards to remove her armor.', reward: { xp: 5, gold: 100 }, enemies: [
    { id: 'deslandra', name: 'Deslandra', type: 'boss', q: 0, r: -1, health: 10, attack: 3 },
    { id: 'knight', name: 'Hollow Knight', type: 'melee', q: 1, r: 0, health: 5, attack: 2 }
  ] }
];
export const TRAVEL_OPTIONS = [
  { id: 'camp', name: 'A sheltered camp', description: 'Choose restorative rest or defensive preparation.', icon: 'camp' },
  { id: 'shrine', name: 'A wayside shrine', description: 'Choose an ancient spell or a renewing blessing.', icon: 'shrine' },
  { id: 'ruins', name: 'Forgotten ruins', description: 'Choose recovered gold or knowledge from the past.', icon: 'ruins' }
];
export const hexDistance = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((a.q + a.r) - (b.q + b.r)));
const clone = value => JSON.parse(JSON.stringify(value));
const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const isHex = (q, r) => Number.isInteger(q) && Number.isInteger(r) && Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 3;

export function createCampaign(onChange = () => {}, onEvent = () => {}) {
  let state;
  let preview = true;
  let saveStatus = 'preview';
  function log(message) { state.log.unshift(message); state.log = state.log.slice(0, 40); }
  function event(type, title, text, extra = {}) { onEvent({ type, title, text, ...extra }); }
  function warn(text) { event('toast', 'A moment, adventurer', text); return false; }
  function living() { return state.enemies.filter(e => e.health > 0); }
  function blocked(q, r) { return living().some(e => e.q === q && e.r === r); }
  function reachableFrom(origin, distance, includePlayer = false) {
    const seen = new Set([`${origin.q},${origin.r}`]);
    let frontier = [{ q: origin.q, r: origin.r }];
    const result = [];
    for (let step = 0; step < distance; step++) {
      const next = [];
      for (const cell of frontier) for (const [dq, dr] of DIRECTIONS) {
        const q = cell.q + dq, r = cell.r + dr, key = `${q},${r}`;
        if (seen.has(key) || !isHex(q, r) || blocked(q, r)) continue;
        if (!includePlayer && q === state.player.q && r === state.player.r) continue;
        seen.add(key); const h = { q, r, key }; result.push(h); next.push(h);
      }
      frontier = next;
    }
    return result;
  }
  const equipped = id => state.player.equipment.includes(id);
  const startingGuard = () => (equipped('ward-charm') ? 1 : 0) + (state.preparationGuard || 0);
  const terrainAt = position => ENCOUNTER_TERRAIN[state.encounter].find(tile => tile.q === position.q && tile.r === position.r);
  const coverProtection = () => terrainAt(state.player)?.type === 'cover' ? 1 : 0;
  const armorFor = enemy => enemy?.type === 'boss' && state.tokens.some(token => token.type === 'ward' && !token.collected) ? 2 : 0;
  const roundLimit = (index, difficulty) => (index === 1 ? 6 : 5) + DIFFICULTIES[difficulty].roundBonus;
  function mission() {
    const enemiesRemaining = living().length;
    if (state.encounter === 0) return { kind: 'skirmish', title: 'Break the ambush', description: 'Defeat the ambushers. The abandoned strongbox holds 15 optional gold.', progress: state.enemies.length - enemiesRemaining, total: state.enemies.length, complete: enemiesRemaining === 0, optional: false, enemiesRemaining };
    const type = state.encounter === 1 ? 'skyshard' : 'ward';
    const tokens = state.tokens.filter(token => token.type === type), progress = tokens.filter(token => token.collected).length;
    return { kind: state.encounter === 1 ? 'shards' : 'wards', title: state.encounter === 1 ? 'Recover the skyshards' : 'Break the ritual wards',
      description: state.encounter === 1 ? 'End a move on each skyshard and defeat every guardian.' : 'End a move on both wards to remove Deslandra’s 2 armor. You may fight through her protection instead.',
      progress, total: tokens.length, complete: progress === tokens.length, optional: state.encounter === 2, enemiesRemaining };
  }
  function damageOutcomes(attackDice) {
    // Convolve outcomes, tracking whether physical/magic dice hit for once-per-type gear bonuses.
    let outcomes = new Map([['0,0', 1]]);
    for (const die of attackDice) {
      const next = new Map(), faces = SKILLS[die.skill].faces;
      for (const [key, probability] of outcomes) {
        const [damage, hits] = key.split(',').map(Number);
        for (const [face, value] of faces) {
          const hit = face === 'hit' || face === 'critical';
          const flag = hit ? (die.type === 'physical' ? 1 : 2) : 0;
          const nextKey = `${damage + (hit ? value : 0)},${hits | flag}`;
          next.set(nextKey, (next.get(nextKey) || 0) + probability / faces.length);
        }
      }
      outcomes = next;
    }
    return outcomes;
  }
  function combatPreview(selected) {
    const attackDice = selected.filter(d => ['physical', 'magic'].includes(d.type));
    const target = living().find(e => e.id === state.targetId);
    const range = attackDice.length ? Math.min(...attackDice.map(d => SKILLS[d.skill].range)) : 0;
    const distance = target ? hexDistance(state.player, target) : null;
    let expectedDamage = 0, maxDamage = 0;
    const armorReduction = armorFor(target);
    for (const [key, probability] of damageOutcomes(attackDice)) {
      const [base, hits] = key.split(',').map(Number);
      const bonus = ((hits & 1) && equipped('sharpening-stone') ? 1 : 0) + ((hits & 2) && equipped('focus-crystal') ? 1 : 0);
      const damage = Math.max(0, base + bonus - armorReduction);
      expectedDamage += damage * probability;
      maxDamage = Math.max(maxDamage, damage);
    }
    let reason = '';
    if (state.phase !== 'combat') reason = 'This encounter is complete.';
    else if (!selected.length) reason = 'Select ready dice to prepare an engagement.';
    else if (attackDice.length && !target) reason = 'Choose an enemy to target.';
    else if (attackDice.length && distance > range) reason = `Target is ${distance} hexes away; selected dice reach ${range}. Move closer or choose ranged magic.`;
    else if (state.engaged && (state.player.health <= 1 || state.player.maxHealth <= 1)) reason = 'No health left for another engagement. End your turn.';
    return { canRoll: !reason, reason, range, distance, targetName: target?.name || null, armorReduction,
      armorNote: armorReduction ? 'Ritual wards absorb 2 damage from each engagement. Break both wards to remove this protection.' : '',
      expectedDamage: Math.round(expectedDamage * 10) / 10, maxDamage, fatigueCost: state.engaged ? 1 : 0 };
  }
  function updateDerived() {
    const canMove = state.phase === 'combat' && state.moveCount < 2 && !(state.moved && state.engaged);
    state.reachable = canMove ? reachableFrom(state.player, state.player.stamina).map(hex => ({ ...hex, healthCost: terrainAt(hex)?.type === 'hazard' ? 1 : 0, terrain: terrainAt(hex)?.type || 'stone' })) : [];
    state.terrain = clone(ENCOUNTER_TERRAIN[state.encounter]);
    state.mission = mission();
    state.player.cover = !!coverProtection();
    state.canUndoMove = state.phase === 'combat' && !!state.moveUndo;
    state.undoMoveReason = state.canUndoMove ? '' : 'Undo an ordinary move before rolling, using supplies, or resolving an effect.';
    state.travelEvent = state.phase === 'event' ? clone(ROUTE_EVENTS[state.routeId]) : null;
    state.difficultyInfo = DIFFICULTIES[state.difficulty];
    state.enemies.forEach(enemy => { enemy.armor = armorFor(enemy); });
    const selected = state.dice.filter(d => d.selected && d.status === 'ready');
    const ranges = selected.filter(d => ['physical', 'magic'].includes(d.type)).map(d => SKILLS[d.skill].range);
    const attackRange = ranges.length ? Math.min(...ranges) : 3;
    state.attackable = living().filter(e => hexDistance(state.player, e) <= attackRange).map(e => ({ q: e.q, r: e.r, id: e.id }));
    state.selectedCount = selected.length;
    if (!living().some(e => e.id === state.targetId)) state.targetId = living()[0]?.id || null;
    state.combatPreview = combatPreview(selected);
    state.canRoll = state.combatPreview.canRoll;
    state.classInfo = CLASSES[state.player.className] || CLASSES.Sorcerer;
    state.enemyIntents = predictEnemies();
    state.incomingDamage = state.enemyIntents.reduce((sum, intent) => sum + intent.healthDamage, 0);
    state.shopItems = SHOP_ITEMS.map(item => {
      const owned = item.kind === 'equipment' && equipped(item.id);
      const reason = state.phase !== 'travel' ? 'Visit the merchant between encounters.' : owned ? 'Already equipped.' : state.player.gold < item.cost ? `Requires ${item.cost} gold.` : '';
      return { ...item, owned, canBuy: !reason, reason };
    });
    state.trainingOptions = TRAINING_OPTIONS.map(option => {
      const learned = state.player.trained.includes(option.id) || option.id === 'lightning' && state.dice.some(d => d.skill === 'lightning');
      const reason = state.phase !== 'travel' ? 'Train between encounters.' : learned ? 'Already learned.' : state.player.xp < option.cost ? `Requires ${option.cost} XP.` : '';
      return { ...option, learned, canTrain: !reason, reason };
    });
    state.objective = state.encounter === 0 ? `Defeat the ambushers before round ${state.maxRounds} ends.` : ENCOUNTERS[state.encounter].objective;
    state.encounterName = ENCOUNTERS[state.encounter].name;
    state.location = ENCOUNTERS[state.encounter].location;
    state.description = ENCOUNTERS[state.encounter].description;
    state.travelOptions = TRAVEL_OPTIONS;
    state.cooldownQueue.forEach((id, index) => { const die = state.dice.find(d => d.id === id); if (die) die.cooldown = index + 1; });
    state.dice.filter(d => d.status === 'ready').forEach(d => d.cooldown = 0);
    if (!living().some(e => e.id === state.targetId)) state.targetId = living()[0]?.id || null;
    state.player.guard = Math.max(0, state.player.guard || 0);
  }
  function getState() { updateDerived(); return clone(state); }
  function serialize() {
    return JSON.stringify({ version: 1, savedAt: Date.now(), state: normalizeSave(state) });
  }
  function persist() {
    if (preview) return;
    try {
      if (typeof localStorage === 'undefined') { saveStatus = 'unavailable'; return; }
      localStorage.setItem(SAVE_KEY, serialize());
      saveStatus = 'saved';
    } catch { saveStatus = 'unavailable'; }
  }
  function changed() { updateDerived(); persist(); onChange(clone(state)); }
  function makeDice() {
    return ['blade', 'blade', 'destruction', 'destruction', 'guard', 'restoration'].map((skill, i) => ({
      id: `die-${i}`, skill, name: SKILLS[skill].name, type: SKILLS[skill].type, range: SKILLS[skill].range, status: 'ready', selected: false, face: null, value: 0, cooldown: 0
    }));
  }
  function beginEncounter(index) {
    state.encounter = index; state.session = index + 1; state.day = 1; state.round = 1; state.phase = 'combat';
    state.routeId = null;
    state.maxRounds = roundLimit(index, state.difficulty);
    const difficulty = DIFFICULTIES[state.difficulty];
    state.enemies = ENCOUNTERS[index].enemies.map(e => ({ ...e, health: e.health + difficulty.healthBonus, maxHealth: e.health + difficulty.healthBonus, attack: Math.max(1, e.attack + difficulty.attackBonus) }));
    state.tokens = clone(ENCOUNTER_TOKENS[index]);
    state.player.q = 0; state.player.r = 2; state.player.guard = startingGuard();
    state.player.fatigue = 0; state.player.maxHealth = state.player.baseMaxHealth;
    state.player.health = Math.min(state.player.health, state.player.maxHealth);
    state.cooldownQueue = []; state.dice.forEach(d => { d.status = 'ready'; d.selected = false; d.face = null; d.value = 0; d.cooldown = 0; });
    state.lastRoll = []; state.moved = false; state.engaged = false; state.moveCount = 0; state.moveUndo = null;
    state.selected = null; state.targetId = state.enemies[0].id; state.mode = 'move';
    state.reward = null; state.pendingUpgrade = false; state.defeatReason = null;
    log(`${ENCOUNTERS[index].name} · Session ${index + 1}. Your turn.`);
    state.checkpoint = { encounter: index, player: clone(state.player), dice: clone(state.dice), stats: clone(state.stats), log: [...state.log], tokens: clone(state.tokens), preparationGuard: state.preparationGuard || 0 };
  }
  function reset(options = {}) {
    const race = options.race || 'Dunmer';
    const hp = race.toLowerCase() === 'nord' ? 14 : 12;
    state = {
      version: 1, contentVersion: 3, difficulty: typeof options.difficulty === 'string' && Object.hasOwn(DIFFICULTIES, options.difficulty) ? options.difficulty : 'standard', preparationGuard: 0, routeId: null, journey: [], tokens: [], phase: 'combat', player: { name: String(options.name || 'Lyris Ashwind').slice(0, 40), race,
        className: options.className || 'Sorcerer', q: 0, r: 2, health: hp, maxHealth: hp, baseMaxHealth: hp,
        stamina: race.toLowerCase() === 'nord' ? 4 : 3, magicka: race.toLowerCase() === 'breton' ? 4 : 3,
        combat: 3, cooldown: 2, tenacity: 0, fatigue: 0, guard: 0, xp: 0, gold: 0, potions: 3, equipment: [], trained: [] },
      enemies: [], round: 1, maxRounds: 5, encounter: 0, session: 1, day: 1,
      selected: null, reachable: [], attackable: [], dice: makeDice(), cooldownQueue: [], log: [],
      moved: false, engaged: false, moveCount: 0, targetId: null, mode: 'move', lastRoll: [],
      reward: null, pendingUpgrade: false, travelOptions: TRAVEL_OPTIONS,
      stats: { defeated: 0, damage: 0, battles: 0, rolls: 0 }, ending: null
    };
    beginEncounter(0); changed(); return getState();
  }
  // Imported saves are data, never a source of unbounded loops or UI allocations.
  const boundedInt = (value, min = 0, max = 1000000) => Number.isSafeInteger(value) && value >= min && value <= max;
  const boundedText = (value, max = 160) => typeof value === 'string' && value.length <= max;
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
  const boundedArray = (value, max, item, min = 0) => Array.isArray(value) && value.length >= min && value.length <= max && value.every(item);
  const unique = values => new Set(values).size === values.length;
  const pick = (value, keys) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
  const playerKeys = ['name', 'race', 'className', 'q', 'r', 'health', 'maxHealth', 'baseMaxHealth', 'stamina', 'magicka', 'combat', 'cooldown', 'tenacity', 'fatigue', 'guard', 'xp', 'gold', 'potions', 'equipment', 'trained'];
  const diceKeys = ['id', 'skill', 'name', 'type', 'range', 'status', 'selected', 'face', 'value', 'cooldown'];
  const enemyKeys = ['id', 'name', 'type', 'q', 'r', 'health', 'maxHealth', 'attack'];
  const statsKeys = ['defeated', 'damage', 'battles', 'rolls'];
  function validPlayer(player) {
    return !!player && boundedText(player.name, 80) && ['Dunmer', 'Nord', 'Breton'].includes(player.race)
      && typeof player.className === 'string' && Object.hasOwn(CLASSES, player.className) && isHex(player.q, player.r)
      && boundedInt(player.health, 0, 1000) && boundedInt(player.maxHealth, 1, 1000) && player.health <= player.maxHealth
      && (player.baseMaxHealth === undefined || boundedInt(player.baseMaxHealth, player.maxHealth, 1000))
      && ['stamina', 'magicka', 'combat', 'cooldown'].every(key => boundedInt(player[key], 1, 32))
      && ['xp', 'gold'].every(key => boundedInt(player[key])) && boundedInt(player.potions, 0, 1000)
      && boundedInt(player.tenacity, 0, 6) && boundedInt(player.fatigue, 0, 1000)
      && (player.guard === undefined || boundedInt(player.guard, 0, 1000))
      && (player.equipment === undefined || boundedArray(player.equipment, 3, id => SHOP_ITEMS.some(item => item.id === id && item.kind === 'equipment')) && unique(player.equipment))
      && (player.trained === undefined || boundedArray(player.trained, 3, id => TRAINING_OPTIONS.some(item => item.id === id)) && unique(player.trained));
  }
  function validDice(dice) {
    return boundedArray(dice, 32, d => !!d && validId(d.id) && typeof d.skill === 'string' && Object.hasOwn(SKILLS, d.skill)
      && boundedText(d.name, 80) && d.type === SKILLS[d.skill].type && d.range === SKILLS[d.skill].range
      && ['ready', 'cooldown'].includes(d.status) && typeof d.selected === 'boolean'
      && (d.face === null || ['hit', 'critical', 'blank', 'heal', 'block'].includes(d.face))
      && boundedInt(d.value, 0, 100) && boundedInt(d.cooldown, 0, 32), 1) && unique(dice.map(d => d.id));
  }
  function validStats(stats) {
    return !!stats && boundedInt(stats.defeated, 0, 1000) && boundedInt(stats.damage)
      && boundedInt(stats.battles, 0, 3) && boundedInt(stats.rolls, 0, 100000);
  }
  const validLog = log => boundedArray(log, 40, line => boundedText(line, 1000));
  function validTokens(tokens, encounter) {
    const templates = ENCOUNTER_TOKENS[encounter];
    return boundedArray(tokens, 2, token => !!token && typeof token.collected === 'boolean' && templates.some(template => template.id === token.id && template.q === token.q && template.r === token.r && template.type === token.type), templates.length)
      && tokens.length === templates.length && unique(tokens.map(token => token.id));
  }
  function validJourney(journey) {
    return boundedArray(journey, 2, entry => !!entry && boundedInt(entry.fromEncounter, 0, 1)
      && Object.values(ROUTE_EVENTS).some(route => route.choices.some(choice => choice.id === entry.id)))
      && unique(journey.map(entry => entry.fromEncounter));
  }
  function validCheckpoint(checkpoint, encounter) {
    return checkpoint == null || checkpoint.encounter === encounter && checkpoint.checkpoint === undefined
      && validPlayer(checkpoint.player) && checkpoint.player.health > 0 && checkpoint.player.fatigue === 0
      && validDice(checkpoint.dice) && validStats(checkpoint.stats) && validLog(checkpoint.log)
      && (checkpoint.tokens === undefined || validTokens(checkpoint.tokens, encounter))
      && (checkpoint.preparationGuard === undefined || boundedInt(checkpoint.preparationGuard, 0, 1));
  }
  function validMoveUndo(undo, s) {
    if (undo == null) return true;
    const from = undo.from, to = undo.to;
    return s.phase === 'combat' && undo.encounter === s.encounter && undo.round === s.round
      && !!from && !!to && isHex(from.q, from.r) && isHex(to.q, to.r)
      && to.q === s.player.q && to.r === s.player.r
      && boundedInt(from.moveCount, 0, 1) && from.moveCount === s.moveCount - 1
      && typeof from.moved === 'boolean' && typeof from.engaged === 'boolean'
      && from.moved === (from.moveCount > 0) && !(from.moved && from.engaged)
      && s.moved === true && s.engaged === (from.moved || from.engaged)
      && hexDistance(from, to) > 0 && hexDistance(from, to) <= s.player.stamina
      && !ENCOUNTER_TERRAIN[s.encounter].some(tile => tile.q === to.q && tile.r === to.r && tile.type === 'hazard')
      && !s.enemies.some(enemy => enemy.health > 0 && enemy.q === from.q && enemy.r === from.r);
  }
  function validSave(s) {
    if (!s || !['combat', 'reward', 'travel', 'event', 'victory', 'defeat'].includes(s.phase)
      || !boundedInt(s.encounter, 0, ENCOUNTERS.length - 1) || s.session !== s.encounter + 1 || !boundedInt(s.day, 1, 3)
      || s.contentVersion !== undefined && s.contentVersion !== 3
      || s.difficulty !== undefined && (typeof s.difficulty !== 'string' || !Object.hasOwn(DIFFICULTIES, s.difficulty))
      || !boundedInt(s.round, 1, s.maxRounds) || !boundedInt(s.maxRounds, 5, 8) || !boundedInt(s.moveCount, 0, 2)
      || s.contentVersion === undefined && s.maxRounds !== 5
      || s.contentVersion === 3 && s.maxRounds !== roundLimit(s.encounter, s.difficulty || 'standard')
      || s.tokens !== undefined && !validTokens(s.tokens, s.encounter)
      || s.contentVersion === 3 && !validTokens(s.tokens, s.encounter)
      || s.preparationGuard !== undefined && !boundedInt(s.preparationGuard, 0, 1)
      || s.journey !== undefined && !validJourney(s.journey)
      || s.phase === 'event' && (typeof s.routeId !== 'string' || !Object.hasOwn(ROUTE_EVENTS, s.routeId))
      || s.phase !== 'event' && s.routeId != null
      || !['move', 'attack'].includes(s.mode) || !['moved', 'engaged', 'pendingUpgrade'].every(key => typeof s[key] === 'boolean')
      || !validPlayer(s.player) || !validDice(s.dice) || !validStats(s.stats) || !validLog(s.log)
      || !validCheckpoint(s.checkpoint, s.encounter)
      || !boundedArray(s.enemies, 37, e => !!e && validId(e.id) && boundedText(e.name, 80)
        && ['melee', 'ranged', 'beast', 'boss'].includes(e.type) && isHex(e.q, e.r)
        && boundedInt(e.maxHealth, 1, 1000) && boundedInt(e.health, 0, e.maxHealth) && boundedInt(e.attack, 0, 1000), 1)
      || !unique(s.enemies.map(e => e.id))
      || !boundedArray(s.cooldownQueue, 32, id => s.dice.some(d => d.id === id && d.status === 'cooldown')) || !unique(s.cooldownQueue)
      || s.dice.some(d => d.status === 'cooldown' && !s.cooldownQueue.includes(d.id))
      || s.selected != null && !isHex(s.selected.q, s.selected.r)
      || s.targetId != null && !validId(s.targetId)
      || !boundedArray(s.lastRoll, 32, d => !!d && validId(d.id) && typeof d.skill === 'string' && Object.hasOwn(SKILLS, d.skill)
        && boundedText(d.name, 80) && d.type === SKILLS[d.skill].type && ['hit', 'critical', 'blank', 'heal', 'block'].includes(d.face)
        && boundedInt(d.value, 0, 100) && boundedInt(d.damage, 0, 100))
      || s.ending != null && !boundedText(s.ending, 1000) || s.defeatReason != null && !boundedText(s.defeatReason, 1000)) return false;
    if (!validMoveUndo(s.moveUndo, s)) return false;
    if (['reward', 'travel', 'event'].includes(s.phase) && s.encounter >= ENCOUNTERS.length - 1 || s.phase === 'victory' && s.encounter !== ENCOUNTERS.length - 1) return false;
    if (s.reward != null && (!boundedInt(s.reward.xp, 0, 1000) || !boundedInt(s.reward.gold, 0, 10000)
      || !boundedText(s.reward.title, 160) || s.reward.upgrade != null && !['health', 'combat', 'cooldown'].includes(s.reward.upgrade))) return false;
    return s.phase !== 'reward' || s.reward != null;
  }
  function normalizeSave(s) {
    // Discard imported derived values and unknown nested properties; recompute UI state.
    const clean = pick(s, ['version', 'phase', 'round', 'maxRounds', 'encounter', 'session', 'day', 'moved', 'engaged', 'moveCount', 'targetId', 'mode', 'pendingUpgrade', 'ending', 'defeatReason']);
    clean.contentVersion = 3;
    clean.difficulty = s.difficulty || 'standard';
    clean.maxRounds = roundLimit(s.encounter, clean.difficulty);
    clean.preparationGuard = s.preparationGuard || 0;
    clean.routeId = s.phase === 'event' ? s.routeId : null;
    clean.tokens = ENCOUNTER_TOKENS[s.encounter].map(template => ({ ...template, collected: s.tokens ? !!s.tokens.find(token => token.id === template.id)?.collected : ['reward', 'travel', 'event', 'victory'].includes(s.phase) }));
    clean.journey = (s.journey || []).map(entry => {
      const route = Object.values(ROUTE_EVENTS).find(route => route.choices.some(choice => choice.id === entry.id));
      const choice = route.choices.find(choice => choice.id === entry.id);
      return { id: choice.id, title: route.title, choiceLabel: choice.label, effectsLabel: choice.effectsLabel, fromEncounter: entry.fromEncounter };
    });
    clean.player = pick(s.player, playerKeys);
    clean.dice = s.dice.map(d => pick(d, diceKeys));
    clean.enemies = s.enemies.map(e => pick(e, enemyKeys));
    clean.stats = pick(s.stats, statsKeys);
    clean.log = [...s.log]; clean.cooldownQueue = [...s.cooldownQueue];
    clean.lastRoll = s.lastRoll.map(d => pick(d, ['id', 'skill', 'name', 'type', 'face', 'value', 'damage']));
    clean.selected = s.selected ? pick(s.selected, ['q', 'r']) : null;
    clean.moveUndo = s.moveUndo ? { encounter: s.moveUndo.encounter, round: s.moveUndo.round,
      from: pick(s.moveUndo.from, ['q', 'r', 'moved', 'engaged', 'moveCount']), to: pick(s.moveUndo.to, ['q', 'r']) } : null;
    clean.reward = s.reward ? pick(s.reward, ['xp', 'gold', 'title', 'upgrade']) : null;
    clean.checkpoint = s.checkpoint ? { encounter: s.checkpoint.encounter, player: pick(s.checkpoint.player, playerKeys),
      dice: s.checkpoint.dice.map(d => pick(d, diceKeys)), stats: pick(s.checkpoint.stats, statsKeys), log: [...s.checkpoint.log],
      tokens: ENCOUNTER_TOKENS[s.encounter].map(template => ({ ...template, collected: !!s.checkpoint.tokens?.find(token => token.id === template.id)?.collected })), preparationGuard: s.checkpoint.preparationGuard || 0 } : null;
    migratePlayer(clean.player);
    if (clean.checkpoint) migratePlayer(clean.checkpoint.player);
    return clean;
  }
  function restore(raw) {
    const previousState = state;
    try {
      if (typeof raw !== 'string' || !raw || raw.length > 1024 * 1024) return false;
      const data = JSON.parse(raw);
      if (data?.version !== 1 || !validSave(data.state)) return false;
      state = normalizeSave(data.state);
      changed(); event('toast', 'Journey restored', 'Your saved campaign is ready.'); return true;
    } catch { state = previousState; return false; }
  }
  function load() {
    try { return typeof localStorage !== 'undefined' && restore(localStorage.getItem(SAVE_KEY)); }
    catch { return false; }
  }
  function migratePlayer(player) {
    player.equipment = Array.isArray(player.equipment) ? [...new Set(player.equipment.filter(id => SHOP_ITEMS.some(item => item.id === id && item.kind === 'equipment')))] : [];
    player.trained = Array.isArray(player.trained) ? [...new Set(player.trained.filter(id => TRAINING_OPTIONS.some(option => option.id === id)))] : [];
    player.baseMaxHealth = Number.isFinite(player.baseMaxHealth) ? player.baseMaxHealth : Math.max(1, player.maxHealth || 12);
    player.guard = Number.isFinite(player.guard) ? Math.max(0, player.guard) : 0;
  }
  function battleWon() {
    if (living().length || state.phase !== 'combat') return;
    if (state.encounter === 1 && state.tokens.some(token => token.type === 'skyshard' && !token.collected)) return;
    state.moveUndo = null;
    const reward = ENCOUNTERS[state.encounter].reward;
    state.player.xp += reward.xp; state.player.gold += reward.gold; state.stats.battles++;
    state.reward = { ...reward, title: state.encounter === 2 ? 'The betrayal ends' : 'Encounter complete' };
    state.dice.forEach(d => d.selected = false);
    if (state.encounter === ENCOUNTERS.length - 1) {
      state.phase = 'victory'; state.ending = 'Deslandra’s ritual is broken. Across Tamriel, the first light of a quieter dawn finds the roads you walked.';
      log('Victory! You completed all three sessions and ended Deslandra’s betrayal.');
      event('victory', 'An oath restored', state.ending, { reward: state.reward });
    } else {
      state.phase = 'reward'; state.pendingUpgrade = true;
      log(`Encounter won! +${reward.xp} XP · +${reward.gold} gold. Choose an upgrade.`);
      event('reward', 'Encounter complete', `+${reward.xp} experience · +${reward.gold} gold`, { reward: state.reward });
    }
  }
  function hurtEnemy(enemy, amount) {
    if (!enemy || enemy.health <= 0 || amount <= 0) return;
    const actual = Math.min(enemy.health, amount); enemy.health -= actual; state.stats.damage += actual;
    if (enemy.health <= 0) { state.stats.defeated++; log(`${enemy.name} is defeated.`); event('enemy-defeated', enemy.name, 'Defeated', { id: enemy.id }); }
  }
  function defeated(reason) {
    state.phase = 'defeat'; state.moveUndo = null; state.defeatReason = reason; log(reason);
    event('defeat', 'An oath unfinished', reason);
  }
  function moveTo(q, r) {
    if (!state.reachable.some(h => h.q === q && h.r === r)) return warn(state.moved && state.engaged ? 'You have already moved and engaged. End your turn to act again.' : `Choose an unoccupied highlighted hex within ${state.player.stamina} spaces.`);
    // Keep only position and action-budget flags: Undo can never restore dice or resources.
    state.moveUndo = { encounter: state.encounter, round: state.round,
      from: { q: state.player.q, r: state.player.r, moved: state.moved, engaged: state.engaged, moveCount: state.moveCount }, to: { q, r } };
    const twice = state.moved;
    state.player.q = q; state.player.r = r; state.selected = { q, r }; state.moveCount++;
    state.moved = true;
    if (twice) { state.engaged = true; log('Double move: your engagement is spent this turn.'); }
    else log(`Moved to ${q}, ${r}.`);
    event('move', 'Position changed', '', { q, r });
    if (terrainAt(state.player)?.type === 'hazard') {
      state.moveUndo = null;
      state.player.health = Math.max(0, state.player.health - 1);
      log('Unstable ground: lost 1 health.');
      event('hazard', 'Unstable ground', 'Ending a move on unstable ground costs 1 health.', { q, r, damage: 1 });
      if (!state.player.health) { defeated('The unstable ground drained your last strength. Retry the encounter and choose a safer route.'); return true; }
    }
    const token = state.tokens.find(token => !token.collected && token.q === q && token.r === r);
    if (token) {
      state.moveUndo = null;
      token.collected = true;
      const amount = token.type === 'chest' ? 15 : 1;
      if (token.type === 'chest') state.player.gold += amount;
      const text = token.type === 'chest' ? '+15 gold from the abandoned strongbox.' : token.type === 'skyshard' ? 'A skyshard is recovered. Defeat the guardians and recover both shards to escape.' : 'A ritual ward is broken. Break both to remove Deslandra’s armor.';
      log(`${token.name}: ${text}`);
      event('pickup', token.name, text, { id: token.id, tokenType: token.type, q, r, amount });
    }
    battleWon();
    return true;
  }
  function undoMove() {
    if (!state.moveUndo) return warn(state.undoMoveReason);
    const from = state.moveUndo.from;
    state.player.q = from.q; state.player.r = from.r;
    state.moved = from.moved; state.engaged = from.engaged; state.moveCount = from.moveCount;
    state.mode = 'move'; state.selected = { q: from.q, r: from.r }; state.moveUndo = null;
    log(`Move undone. Returned to ${from.q}, ${from.r}.`);
    event('move', 'Move undone', 'Your position and movement allowance are restored.', { q: from.q, r: from.r, undone: true });
    return true;
  }
  function toggleDie(id) {
    const die = state.dice.find(d => d.id === id);
    if (!die || die.status !== 'ready') return warn('That skill die is on cooldown. End your turn to recover dice.');
    if (die.selected) { die.selected = false; return true; }
    const selected = state.dice.filter(d => d.selected);
    if (selected.length >= state.player.combat) return warn(`Your combat stat allows up to ${state.player.combat} dice per engagement.`);
    const stat = ['magic', 'support'].includes(die.type) ? 'magicka' : 'stamina';
    const count = selected.filter(d => stat === 'magicka' ? ['magic', 'support'].includes(d.type) : ['physical', 'defense'].includes(d.type)).length;
    if (count >= state.player[stat]) return warn(`Your ${stat} limits how many of those dice you can roll.`);
    die.selected = true; return true;
  }
  function roll() {
    const selected = state.dice.filter(d => d.selected && d.status === 'ready');
    const prepared = combatPreview(selected);
    if (!prepared.canRoll) return warn(prepared.reason);
    const target = living().find(e => e.id === state.targetId);
    if (state.engaged) {
      if (state.player.maxHealth <= 1 || state.player.health <= 1) return warn('You cannot take more fatigue safely. End your turn.');
      state.player.fatigue++; state.player.maxHealth--; state.player.health = Math.min(state.player.health, state.player.maxHealth);
      log('Additional engagement: +1 fatigue, −1 maximum health for this encounter.');
    }
    state.moveUndo = null;
    state.engaged = true; state.stats.rolls++;
    let damage = 0, healing = 0, guard = 0, blanks = 0;
    state.lastRoll = selected.map(die => {
      const faces = SKILLS[die.skill].faces;
      const [face, value] = faces[Math.floor(Math.random() * faces.length)];
      die.face = face; die.value = value; die.status = 'cooldown'; die.selected = false; state.cooldownQueue.push(die.id);
      if (face === 'hit' || face === 'critical') damage += value;
      if (face === 'heal') healing += value;
      if (face === 'block') guard += value;
      if (face === 'blank') blanks++;
      return { id: die.id, skill: die.skill, name: die.name, type: die.type, face, value, damage: ['hit', 'critical'].includes(face) ? value : 0 };
    });
    const physicalHit = state.lastRoll.some(d => d.type === 'physical' && d.damage > 0);
    const magicHit = state.lastRoll.some(d => d.type === 'magic' && d.damage > 0);
    const equipmentDamage = (physicalHit && equipped('sharpening-stone') ? 1 : 0) + (magicHit && equipped('focus-crystal') ? 1 : 0);
    damage += equipmentDamage;
    const armorBlocked = Math.min(damage, armorFor(target));
    damage -= armorBlocked;
    state.player.tenacity = Math.min(6, state.player.tenacity + blanks);
    state.player.health = Math.min(state.player.maxHealth, state.player.health + healing);
    state.player.guard += guard;
    if (damage) hurtEnemy(target, damage);
    const details = [damage ? `${damage} damage to ${target.name}` : '', armorBlocked ? `${armorBlocked} absorbed by ritual wards` : '', healing ? `${healing} healing` : '', guard ? `${guard} guard` : '', blanks ? `+${blanks} tenacity` : ''].filter(Boolean).join(' · ');
    log(`Rolled ${selected.length} dice: ${details || 'no effect'}.`);
    event('roll', 'The dice have spoken', details, { dice: clone(state.lastRoll), damage, healing, guard, tenacity: blanks, equipmentDamage, armorBlocked, targetId: target?.id });
    battleWon(); return true;
  }
  function moveEnemy(enemy, enemies = state.enemies) {
    const range = enemy.type === 'ranged' ? 2 : 1;
    const speed = enemy.type === 'beast' ? 2 : 1;
    for (let step = 0; step < speed && hexDistance(enemy, state.player) > range; step++) {
      const options = DIRECTIONS.map(([q, r]) => ({ q: enemy.q + q, r: enemy.r + r })).filter(h =>
        isHex(h.q, h.r) && !enemies.some(e => e.health > 0 && e.q === h.q && e.r === h.r) && !(h.q === state.player.q && h.r === state.player.r));
      options.sort((a, b) => hexDistance(a, state.player) - hexDistance(b, state.player));
      if (!options.length || hexDistance(options[0], state.player) >= hexDistance(enemy, state.player)) break;
      enemy.q = options[0].q; enemy.r = options[0].r;
    }
    return hexDistance(enemy, state.player) <= range;
  }
  function predictEnemies() {
    if (state.phase !== 'combat') return [];
    const enemies = clone(state.enemies);
    let guard = state.player.guard || 0, health = state.player.health;
    return enemies.filter(e => e.health > 0).map(enemy => {
      const active = health > 0;
      const willAttack = active && moveEnemy(enemy, enemies);
      const damage = willAttack ? enemy.attack : 0;
      const coverBlocked = Math.min(coverProtection(), damage);
      const blocked = Math.min(guard, damage - coverBlocked); guard -= blocked;
      const healthDamage = Math.min(health, damage - coverBlocked - blocked); health -= healthDamage;
      return { id: enemy.id, damage, blocked, coverBlocked, healthDamage, range: enemy.type === 'ranged' ? 2 : 1,
        willAttack, destination: { q: enemy.q, r: enemy.r } };
    });
  }
  function endTurn() {
    state.moveUndo = null;
    battleWon();
    if (state.phase !== 'combat') return true;
    state.dice.forEach(d => d.selected = false);
    let totalDamage = 0;
    for (const enemy of living()) {
      if (!moveEnemy(enemy)) { log(`${enemy.name} closes in.`); continue; }
      const coverBlocked = Math.min(coverProtection(), enemy.attack);
      const blockedDamage = Math.min(state.player.guard, enemy.attack - coverBlocked); state.player.guard -= blockedDamage;
      const damage = enemy.attack - coverBlocked - blockedDamage; state.player.health = Math.max(0, state.player.health - damage); totalDamage += damage;
      log(`${enemy.name} attacks: ${damage} damage${coverBlocked ? `, ${coverBlocked} stopped by cover` : ''}${blockedDamage ? `, ${blockedDamage} blocked by Guard` : ''}.`);
      if (!state.player.health) { defeated('You fell in battle. Start a new campaign and try a different strategy.'); return true; }
    }
    event('enemy-turn', 'The enemy advances', totalDamage ? `You took ${totalDamage} damage.` : 'Your defenses held.', { damage: totalDamage });
    if (state.round >= state.maxRounds) {
      defeated(state.encounter === 1 && !living().length ? `Round ${state.maxRounds} ended before both skyshards were recovered. The sanctum collapsed.` : `Round ${state.maxRounds} ended with enemies still standing. Reinforcements overwhelmed your position.`); return true;
    }
    state.round++; state.moved = false; state.engaged = false; state.moveCount = 0; state.player.guard = startingGuard();
    state.mode = 'move'; state.selected = null;
    const recovered = state.cooldownQueue.splice(0, state.player.cooldown);
    recovered.forEach(id => { const die = state.dice.find(d => d.id === id); if (die) { die.status = 'ready'; die.face = null; die.value = 0; die.cooldown = 0; } });
    log(`Round ${state.round}: recovered ${recovered.length} skill dice. Your turn.`);
    return true;
  }
  function ability() {
    if (state.player.tenacity < 2) return warn('Class abilities require 2 tenacity. Blank dice faces grant tenacity.');
    const enemy = living().find(e => e.id === state.targetId);
    if (!enemy || hexDistance(state.player, enemy) > 3) return warn('Select an enemy within 3 hexes to use your class ability.');
    state.moveUndo = null;
    state.player.tenacity -= 2;
    const info = CLASSES[state.player.className] || CLASSES.Sorcerer;
    const armorBlocked = Math.min(info.damage, armorFor(enemy));
    const damage = info.damage - armorBlocked;
    const healing = Math.min(info.heal, state.player.maxHealth - state.player.health);
    state.player.health += healing;
    state.player.guard += info.guard;
    hurtEnemy(enemy, damage); log(`${info.ability}: ${damage} damage to ${enemy.name}${healing ? `, ${healing} health restored` : ''}${info.guard ? `, ${info.guard} Guard gained` : ''}.`);
    event('ability', info.ability, `${damage} damage${armorBlocked ? ` · ${armorBlocked} absorbed by ritual wards` : ''}${healing ? ` · ${healing} healing` : ''}${info.guard ? ` · ${info.guard} Guard` : ''} · −2 Tenacity`, { targetId: enemy.id, damage, healing, guard: info.guard, armorBlocked }); battleWon(); return true;
  }
  function upgrade(type) {
    if (state.phase !== 'reward' || !state.pendingUpgrade) return warn('Choose an upgrade after winning an encounter.');
    if (!['health', 'combat', 'cooldown'].includes(type)) return false;
    if (type === 'health') { state.player.baseMaxHealth += 3; state.player.maxHealth += 3; state.player.health = Math.min(state.player.maxHealth, state.player.health + 3); }
    else state.player[type]++;
    state.pendingUpgrade = false; state.reward.upgrade = type;
    log(`Training complete: ${type === 'health' ? '+3 maximum health' : `+1 ${type}`}.`);
    event('toast', 'Your legend grows', type === 'health' ? 'Maximum health increased by 3.' : `${type[0].toUpperCase() + type.slice(1)} increased by 1.`); return true;
  }
  function buy(id) {
    if (state.phase !== 'travel') return warn('The merchant is available between encounters.');
    const item = SHOP_ITEMS.find(item => item.id === id);
    if (!item) return false;
    if (item.kind === 'equipment' && equipped(id)) return warn('You already own this item.');
    if (state.player.gold < item.cost) return warn(`You need ${item.cost} gold to buy ${item.name}.`);
    state.player.gold -= item.cost;
    if (id === 'potion') state.player.potions++;
    else state.player.equipment.push(id);
    log(`Bought ${item.name} for ${item.cost} gold.`);
    event('purchase', 'Added to your pack', `${item.name} · −${item.cost} gold`, { itemId: id });
    return true;
  }
  function learnLightning() {
    if (state.dice.some(d => d.skill === 'lightning')) return false;
    let id = state.dice.length;
    while (state.dice.some(d => d.id === `die-${id}`)) id++;
    state.dice.push({ id: `die-${id}`, skill: 'lightning', name: SKILLS.lightning.name, type: 'magic', range: 4, status: 'ready', selected: false, face: null, value: 0, cooldown: 0 });
    return true;
  }
  function train(id) {
    if (state.phase !== 'travel') return warn('Training is available between encounters.');
    const option = TRAINING_OPTIONS.find(option => option.id === id);
    if (!option) return false;
    if (state.player.trained.includes(id) || id === 'lightning' && state.dice.some(d => d.skill === 'lightning')) return warn('You have already learned this skill.');
    if (state.player.xp < option.cost) return warn(`You need ${option.cost} XP for ${option.name}.`);
    state.player.xp -= option.cost; state.player.trained.push(id);
    if (id === 'vitality') { state.player.baseMaxHealth += 3; state.player.maxHealth += 3; state.player.health = Math.min(state.player.maxHealth, state.player.health + 3); }
    if (id === 'discipline') state.player.cooldown++;
    if (id === 'lightning') learnLightning();
    log(`Learned ${option.name} for ${option.cost} XP.`);
    event('training', 'Practice becomes instinct', `${option.name} · −${option.cost} XP`, { trainingId: id });
    return true;
  }
  function retry() {
    if (state.phase !== 'defeat') return false;
    const checkpoint = state.checkpoint;
    if (checkpoint) {
      state.player = clone(checkpoint.player); state.dice = clone(checkpoint.dice);
      state.stats = clone(checkpoint.stats); state.log = [...checkpoint.log];
      state.preparationGuard = checkpoint.preparationGuard || 0;
    } else {
      // Older saves have no checkpoint. Keep earned progression and resume with full health.
      state.player.maxHealth = state.player.baseMaxHealth;
      state.player.health = state.player.maxHealth;
      state.stats.defeated = Math.max(0, state.stats.defeated - state.enemies.filter(e => e.health <= 0).length);
    }
    beginEncounter(state.encounter);
    if (checkpoint?.tokens) { state.tokens = clone(checkpoint.tokens); state.checkpoint.tokens = clone(checkpoint.tokens); }
    log('The encounter begins again. Your campaign progress is preserved.');
    event('encounter', 'A second chance', 'Encounter restarted from your last preparation.');
    return true;
  }
  function travel(id) {
    if (state.phase !== 'travel') return false;
    if (!TRAVEL_OPTIONS.some(option => option.id === id)) return false;
    state.phase = 'event'; state.routeId = id;
    log(`On the road: ${ROUTE_EVENTS[id].title}.`);
    return true;
  }
  function chooseEvent(id) {
    if (state.phase !== 'event') return false;
    const route = ROUTE_EVENTS[state.routeId];
    const choice = route.choices.find(choice => choice.id === id);
    if (!choice) return false;
    // Fatigue belongs to an encounter; restore the full cap before applying rest.
    state.player.maxHealth = state.player.baseMaxHealth; state.player.fatigue = 0;
    state.preparationGuard = 0;
    if (id === 'camp-rest') { state.player.health = state.player.maxHealth; state.player.potions++; }
    if (id === 'camp-prepare') { state.player.health = Math.min(state.player.maxHealth, state.player.health + 6); state.preparationGuard = 1; }
    if (id === 'shrine-learn') {
      state.player.health = Math.min(state.player.maxHealth, state.player.health + 4);
      const learned = learnLightning();
      if (!learned) state.player.tenacity = Math.min(6, state.player.tenacity + 2);
    }
    if (id === 'shrine-restore') { state.player.health = state.player.maxHealth; state.player.tenacity = Math.min(6, state.player.tenacity + 2); }
    if (id === 'ruins-gold' || id === 'ruins-study') {
      state.player.health = Math.min(state.player.maxHealth, state.player.health + 3);
      if (id === 'ruins-gold') { state.player.gold += 35; state.player.potions++; }
      else { state.player.xp += 2; state.player.tenacity = Math.min(6, state.player.tenacity + 2); }
    }
    state.journey.push({ id, title: route.title, choiceLabel: choice.label, effectsLabel: choice.effectsLabel, fromEncounter: state.encounter });
    state.journey = state.journey.slice(-2);
    log(`${choice.label}: ${choice.effectsLabel}.`);
    beginEncounter(state.encounter + 1);
    event('encounter', ENCOUNTERS[state.encounter].name, ENCOUNTERS[state.encounter].description); return true;
  }
  function action(name, payload) {
    if (name === 'save') { persist(); event('toast', 'Journey saved', 'Your campaign is stored on this device.'); return true; }
    if (name === 'load') return load();
    if (name === 'reset') { reset(payload || {}); return true; }
    let result = false;
    if (name === 'upgrade') result = upgrade(typeof payload === 'object' ? payload?.type : payload);
    else if (name === 'buy') result = buy(typeof payload === 'object' ? payload?.id : payload);
    else if (name === 'train') result = train(typeof payload === 'object' ? payload?.id : payload);
    else if (name === 'retry') result = retry();
    else if (name === 'next' && state.phase === 'reward') {
      if (state.pendingUpgrade) return warn('Choose one permanent upgrade before continuing.');
      state.phase = 'travel'; state.day = 2; log('Choose your route to the next encounter.'); result = true;
    } else if (name === 'travel') result = travel(typeof payload === 'object' ? payload?.id : payload);
    else if (name === 'choose-event') result = chooseEvent(typeof payload === 'object' ? payload?.id : payload);
    else if (state.phase !== 'combat') return false;
    else if (name === 'undo-move') result = undoMove();
    else if (name === 'mode' && ['move', 'attack'].includes(payload)) { state.mode = payload; result = true; }
    else if (name === 'hex' && isHex(payload?.q, payload?.r)) {
      const enemy = living().find(e => e.q === payload.q && e.r === payload.r);
      if (enemy) { state.targetId = enemy.id; state.selected = { q: enemy.q, r: enemy.r }; state.mode = 'attack'; log(`Target selected: ${enemy.name}.`); result = true; }
      else if (state.mode === 'move') result = moveTo(payload.q, payload.r);
      else { state.selected = { q: payload.q, r: payload.r }; result = true; }
    } else if (name === 'target') {
      const id = typeof payload === 'object' ? payload?.id : payload;
      if (living().some(e => e.id === id)) { state.targetId = id; state.mode = 'attack'; result = true; }
    } else if (name === 'die') result = toggleDie(typeof payload === 'object' ? payload?.id : payload);
    else if (name === 'roll') result = roll();
    else if (name === 'end-turn') result = endTurn();
    else if (name === 'ability') result = ability();
    else if (name === 'potion') {
      if (state.player.potions <= 0) return warn('You have no healing potions left.');
      if (state.player.health >= state.player.maxHealth) return warn('Your health is already full.');
      state.moveUndo = null;
      state.player.potions--; state.player.health = Math.min(state.player.maxHealth, state.player.health + 6);
      log('Drank a healing potion: recovered 6 health.'); event('heal', 'Healing potion', 'Recovered up to 6 health.'); result = true;
    }
    if (result) changed(); return result;
  }
  // Prepare a preview without overwriting an existing campaign before Load is used.
  const savedOnChange = onChange;
  onChange = () => {};
  reset();
  preview = false;
  onChange = savedOnChange;
  return { getState, action, load, reset, save: persist, serialize, restore, getSaveStatus: () => saveStatus };
}
