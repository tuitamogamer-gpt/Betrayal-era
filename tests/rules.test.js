import test from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign, HEXES, SKILLS, hexDistance, SAVE_KEY, ENCOUNTERS, ENCOUNTER_TOKENS, DIFFICULTIES, ROUTE_EVENTS } from '../src/rules.js';

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
}
function select(game, ids) { for (const id of ids) assert.equal(game.action('die', id), true); }
function moveNearFirst(game) { assert.equal(game.action('hex', {q: 0, r: 1}), true); }
function travel(game, route = 'camp', choice = ROUTE_EVENTS[route].choices[0].id) {
  assert.equal(game.action('travel', route), true);
  assert.equal(game.getState().phase, 'event');
  assert.equal(game.action('choose-event', choice), true);
}

function playCampaign(game) {
  for (let safety = 0; safety < 100 && !['victory', 'defeat'].includes(game.getState().phase); safety++) {
    let state = game.getState();
    if (state.phase === 'reward') {
      game.action('upgrade', 'combat'); game.action('next');
      if (!state.player.equipment.includes('focus-crystal') && state.player.gold >= 45) game.action('buy', 'focus-crystal');
      if (!state.player.trained.includes('vitality') && state.player.xp >= 2) game.action('train', 'vitality');
      else if (!state.player.trained.includes('discipline') && state.player.xp >= 3) game.action('train', 'discipline');
      travel(game);
      continue;
    }
    if (state.player.health <= Math.max(7, state.incomingDamage + 2) && state.player.potions) game.action('potion');
    state = game.getState();
    const token = state.tokens.filter(t => !t.collected && t.type !== 'chest').sort((a, b) => hexDistance(state.player, a) - hexDistance(state.player, b))[0];
    let target = state.enemies.filter(e => e.health > 0).sort((a,b) => hexDistance(state.player,a)-hexDistance(state.player,b))[0];
    if (!state.moved && (token || target && hexDistance(state.player, target) > 1)) {
      const destination = token || target;
      const best = state.reachable.sort((a,b) => hexDistance(a,destination)-hexDistance(b,destination) || a.healthCost-b.healthCost)[0];
      game.action('mode','move'); game.action('hex',best);
    }
    state = game.getState();
    if (state.phase !== 'combat') continue;
    target = state.enemies.find(e => e.health > 0 && token && e.q === token.q && e.r === token.r) || state.enemies.filter(e => e.health > 0).sort((a,b) => hexDistance(state.player,a)-hexDistance(state.player,b) || a.health-b.health)[0];
    if (!target) { game.action('end-turn'); continue; }
    game.action('target', target.id);
    state = game.getState();
    const distance = hexDistance(state.player, target);
    const ready = state.dice.filter(d => d.status === 'ready' && ['physical','magic'].includes(d.type) && SKILLS[d.skill].range >= distance);
    const chosen = ready.slice(0, Math.min(state.player.combat, Math.ceil((target.health + target.armor) / 2)));
    if (chosen.length) { select(game, chosen.map(d=>d.id)); assert.equal(game.action('roll'),true); }
    else game.action('end-turn');
  }
  return game.getState();
}

test('board contains 37 unique, connected axial cells', () => {
  assert.equal(HEXES.length, 37);
  assert.equal(new Set(HEXES.map(h => h.key)).size, 37);
  assert.ok(HEXES.every(h => hexDistance(h, {q: 0, r: 0}) <= 3));
});

test('movement rejects outside-board and occupied tiles; targeting never moves player', () => {
  const game = createCampaign();
  assert.equal(game.action('hex', {q: 8, r: 0}), false);
  const before = game.getState().player;
  assert.equal(game.action('hex', {q: 0, r: 0}), true);
  assert.equal(game.getState().mode, 'attack');
  assert.deepEqual([game.getState().player.q, game.getState().player.r], [before.q, before.r]);
  game.action('mode', 'move'); moveNearFirst(game);
  assert.equal(game.getState().moved, true);
});

test('combat and range limits leave rejected dice and engagements untouched', () => {
  const game = createCampaign();
  select(game, ['die-0', 'die-1', 'die-2']);
  assert.equal(game.action('die', 'die-3'), false);
  assert.equal(game.action('roll'), false); // Sword is two hexes from target.
  assert.equal(game.getState().dice.filter(d => d.status === 'cooldown').length, 0);
  assert.equal(game.getState().engaged, false);
});

test('spent dice recover in FIFO order up to cooldown stat', () => withRandom(.1, () => {
  const game = createCampaign();
  select(game, ['die-2', 'die-4', 'die-5']);
  game.action('roll');
  assert.deepEqual(game.getState().cooldownQueue, ['die-2', 'die-4', 'die-5']);
  game.action('end-turn');
  assert.equal(game.getState().round, 2);
  assert.deepEqual(game.getState().cooldownQueue, ['die-5']);
  assert.equal(game.getState().dice.find(d => d.id === 'die-2').status, 'ready');
}));

test('additional engagement adds fatigue and reduces health cap', () => withRandom(.1, () => {
  const game = createCampaign();
  select(game, ['die-2']); game.action('roll');
  const maximum = game.getState().player.maxHealth;
  select(game, ['die-3']); game.action('roll');
  assert.equal(game.getState().player.fatigue, 1);
  assert.equal(game.getState().player.maxHealth, maximum - 1);
  assert.ok(game.getState().player.health <= game.getState().player.maxHealth);
}));

test('blank faces grant tenacity which powers a class ability', () => withRandom(.999, () => {
  const game = createCampaign();
  select(game, ['die-2', 'die-3']); game.action('roll');
  assert.equal(game.getState().player.tenacity, 2);
  assert.equal(game.action('ability'), true);
  assert.equal(game.getState().player.tenacity, 0);
  assert.equal(game.getState().enemies[0].health, 1);
}));

test('full three-encounter campaign can be won through public actions', () => withRandom(.1, () => {
  const game = createCampaign();
  const state = playCampaign(game);
  assert.equal(state.phase, 'victory', JSON.stringify(state));
  assert.equal(state.stats.battles, 3);
  assert.equal(state.stats.defeated, 7);
  assert.ok(state.player.gold >= 130);
  assert.equal(state.journey.length, 2);
}));

test('failure occurs by fifth completed round and no more combat actions apply', () => {
  const game = createCampaign();
  for (let i = 0; i < 5 && game.getState().phase === 'combat'; i++) game.action('end-turn');
  assert.equal(game.getState().phase, 'defeat');
  assert.equal(game.action('roll'), false);
  assert.equal(game.action('hex',{q:0,r:1}), false);
});

test('constructor preserves an existing save and load restores the campaign', () => {
  const map = new Map();
  globalThis.localStorage = { getItem: key => map.get(key) || null, setItem: (key,value) => map.set(key,value) };
  try {
    const first = createCampaign(); first.reset({name:'Ari',race:'Breton',className:'Sorcerer'}); moveNearFirst(first);
    const saved = map.get(SAVE_KEY);
    const second = createCampaign();
    assert.equal(map.get(SAVE_KEY), saved);
    assert.equal(second.load(), true);
    assert.equal(second.getState().player.name, 'Ari');
    assert.deepEqual([second.getState().player.q, second.getState().player.r], [0,1]);
    map.set(SAVE_KEY, '{corrupt'); assert.equal(second.load(),false);
  } finally { delete globalThis.localStorage; }
});


test('Nord movement follows stamina and mixed attack dice expose their shared range', () => {
  const game = createCampaign();
  game.reset({race:'Nord'});
  assert.equal(game.getState().player.stamina,4);
  assert.ok(game.getState().reachable.some(h => hexDistance(h,game.getState().player)===4));
  select(game,['die-0','die-2']);
  assert.equal(game.getState().attackable.length,0);
});

test('new-game reset replaces an existing saved campaign', () => {
  const map = new Map();
  globalThis.localStorage = { getItem: key => map.get(key)||null, setItem: (key,value) => map.set(key,value) };
  try {
    const game = createCampaign();
    assert.equal(map.has(SAVE_KEY),false);
    game.reset({name:'First'});
    game.action('hex',{q:0,r:1});
    game.reset({name:'Second',race:'Breton'});
    const saved=JSON.parse(map.get(SAVE_KEY)).state;
    assert.equal(saved.player.name,'Second');
    assert.equal(saved.player.r,2);
    assert.equal(saved.player.race,'Breton');
    assert.equal(saved.encounter,0);
    const restored=createCampaign();
    assert.equal(restored.load(),true);
    assert.equal(restored.getState().player.name,'Second');
  } finally {delete globalThis.localStorage;}
});

// Fixtures enter through the same versioned save loader as a resumed browser game.
function withSavedGame(modify, fn) {
  const state = createCampaign().getState();
  modify(state);
  const map = new Map([[SAVE_KEY, JSON.stringify({ version: 1, state })]]);
  globalThis.localStorage = { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) };
  try {
    const game = createCampaign();
    assert.equal(game.load(), true);
    return fn(game, map);
  } finally { delete globalThis.localStorage; }
}

function readyAtTown(state) {
  state.phase = 'travel'; state.player.gold = 200; state.player.xp = 10;
}

function encounterFixture(state, index) {
  state.encounter = index; state.session = index + 1; state.checkpoint = null;
  state.maxRounds = (index === 1 ? 6 : 5) + DIFFICULTIES[state.difficulty].roundBonus;
  state.tokens = structuredClone(ENCOUNTER_TOKENS[index]);
  state.enemies = ENCOUNTERS[index].enemies.map(enemy => ({ ...enemy, maxHealth: enemy.health }));
  state.targetId = state.enemies[0].id;
}

test('merchant charges correctly, prevents duplicates and only trades between encounters', () => {
  const combat = createCampaign();
  const beforeCombat = combat.getState();
  assert.equal(combat.action('buy', 'potion'), false);
  assert.deepEqual(combat.getState(), beforeCombat);
  withSavedGame(readyAtTown, game => {
    const before = game.getState().player;
    assert.equal(game.action('buy', 'potion'), true);
    assert.equal(game.action('buy', 'potion'), true);
    assert.equal(game.getState().player.potions, before.potions + 2);
    assert.equal(game.getState().player.gold, before.gold - 30);
    assert.equal(game.action('buy', 'ward-charm'), true);
    const bought = game.getState();
    assert.equal(bought.shopItems.find(i => i.id === 'ward-charm').owned, true);
    assert.equal(game.action('buy', 'ward-charm'), false);
    assert.equal(game.action('buy', 'unknown'), false);
    assert.deepEqual(game.getState(), bought);
  });
  withSavedGame(s => { readyAtTown(s); s.player.gold = 14; }, game => {
    const before = game.getState();
    assert.equal(game.action('buy', 'potion'), false);
    assert.deepEqual(game.getState(), before);
  });
});

test('XP training spends once, improves real stats and never duplicates a known spell', () => {
  withSavedGame(readyAtTown, game => {
    const before = game.getState().player;
    assert.equal(game.action('train', 'vitality'), true);
    assert.equal(game.getState().player.baseMaxHealth, before.baseMaxHealth + 3);
    assert.equal(game.action('train', 'discipline'), true);
    assert.equal(game.getState().player.cooldown, before.cooldown + 1);
    assert.equal(game.action('train', 'lightning'), true);
    assert.equal(game.getState().player.xp, before.xp - 7);
    const trained = game.getState();
    for (const id of ['vitality', 'discipline', 'lightning', 'unknown']) assert.equal(game.action('train', id), false);
    assert.deepEqual(game.getState(), trained);
    travel(game, 'shrine');
    assert.equal(game.getState().dice.filter(d => d.skill === 'lightning').length, 1);
    assert.equal(game.getState().player.tenacity, 2);
    assert.equal(game.action('train', 'vitality'), false);
  });
  withSavedGame(s => { readyAtTown(s); s.player.xp = 1; }, game => {
    const before = game.getState();
    assert.equal(game.action('train', 'vitality'), false);
    assert.deepEqual(game.getState(), before);
  });
});

test('equipment adds damage once per successful type and ward returns each turn', () => withRandom(.1, () => {
  withSavedGame(readyAtTown, game => {
    game.action('buy', 'ward-charm'); game.action('buy', 'sharpening-stone'); game.action('buy', 'focus-crystal');
    travel(game);
    assert.equal(game.getState().player.guard, 1);
    game.action('hex', { q: 0, r: 1 });
    select(game, ['die-0', 'die-1']);
    assert.equal(game.getState().combatPreview.maxDamage, 7); // Two blade crits plus one item bonus.
    game.action('roll');
    assert.equal(game.getState().enemies.find(e => e.id === 'sentinel').health, 0); // 2 + 2 + 1.
    game.action('target', 'cultist');
    select(game, ['die-2']); game.action('roll');
    assert.equal(game.getState().enemies.find(e => e.id === 'cultist').health, 1); // 2 + 1.
    const expectedDamage = game.getState().incomingDamage;
    const health = game.getState().player.health;
    game.action('end-turn');
    assert.equal(game.getState().player.health, health - expectedDamage);
    assert.equal(game.getState().player.guard, 1);
  });
  withSavedGame(readyAtTown, game => {
    game.action('buy', 'focus-crystal'); travel(game);
    select(game, ['die-2', 'die-3']);
    withRandom(.999, () => game.action('roll'));
    assert.equal(game.getState().enemies[0].health, game.getState().enemies[0].maxHealth);
  });
}));

test('combat preview agrees with mixed-range, support-only and exhausted-fatigue rolls', () => {
  const game = createCampaign();
  select(game, ['die-0', 'die-2']);
  assert.equal(game.getState().combatPreview.canRoll, false);
  assert.equal(game.getState().canRoll, false);
  assert.equal(game.getState().combatPreview.range, 1);
  assert.equal(game.getState().combatPreview.distance, 2);
  assert.equal(game.action('roll'), false);
  game.action('die', 'die-0');
  assert.equal(game.getState().canRoll, true);
  assert.ok(game.getState().combatPreview.expectedDamage > 1);
  assert.equal(game.getState().combatPreview.maxDamage, 3);
  game.action('die', 'die-2'); select(game, ['die-4', 'die-5']);
  assert.equal(game.getState().combatPreview.canRoll, true);
  assert.equal(game.getState().combatPreview.maxDamage, 0);
  withSavedGame(s => { s.engaged = true; s.player.health = 1; }, tired => {
    select(tired, ['die-5']);
    assert.equal(tired.getState().combatPreview.fatigueCost, 1);
    assert.equal(tired.getState().combatPreview.canRoll, false);
    assert.equal(tired.action('roll'), false);
  });
});

test('enemy intent prediction is pure and matches sequential movement with shared guard', () => {
  for (const health of [12, 1]) withSavedGame(s => {
    s.player.health = health; s.player.guard = 2;
    s.enemies = [
      { id: 'a', name: 'First', type: 'melee', q: 0, r: 0, health: 5, maxHealth: 5, attack: 2 },
      { id: 'b', name: 'Second', type: 'beast', q: -1, r: 0, health: 5, maxHealth: 5, attack: 2 },
      { id: 'c', name: 'Third', type: 'ranged', q: 2, r: -1, health: 5, maxHealth: 5, attack: 2 }
    ];
  }, game => {
    const before = game.getState();
    for (let i = 0; i < 3; i++) assert.deepEqual(game.getState(), before);
    game.action('end-turn');
    const after = game.getState();
    assert.equal(after.player.health, before.player.health - before.incomingDamage);
    for (const intent of before.enemyIntents) {
      const enemy = after.enemies.find(e => e.id === intent.id);
      assert.deepEqual({ q: enemy.q, r: enemy.r }, intent.destination);
    }
    assert.equal(before.enemyIntents[0].healthDamage, 0); // The first enemy consumes the shared shield.
    assert.equal(before.enemyIntents[1].blocked, 0);
  });
});

test('class abilities have distinct effects with bounded healing', () => {
  for (const [className, damage, healing, guard] of [['Sorcerer', 4, 0, 0], ['Dragonknight', 3, 0, 2], ['Nightblade', 3, 2, 0]]) {
    withSavedGame(s => { s.player.className = className; s.player.tenacity = 2; s.player.health = 8; }, game => {
      assert.equal(game.action('ability'), true);
      const s = game.getState();
      assert.equal(s.enemies[0].health, 5 - damage);
      assert.equal(s.player.health, 8 + healing);
      assert.equal(s.player.guard, guard);
      assert.equal(s.player.tenacity, 0);
    });
  }
  withSavedGame(s => { s.player.className = 'Nightblade'; s.player.tenacity = 2; s.player.health = s.player.maxHealth - 1; }, game => {
    game.action('ability'); assert.equal(game.getState().player.health, game.getState().player.maxHealth);
  });
});

test('retry rolls back failed encounter costs and kills while preserving prepared upgrades, including after reload', () => withRandom(.1, () => {
  withSavedGame(readyAtTown, (game, map) => {
    game.action('buy', 'ward-charm'); game.action('buy', 'focus-crystal'); game.action('train', 'vitality');
    travel(game);
    const start = game.getState();
    game.action('hex', { q: 0, r: 1 });
    select(game, ['die-0', 'die-1', 'die-2']); game.action('roll'); // Defeat one enemy.
    game.action('end-turn');
    if (game.getState().player.health < game.getState().player.maxHealth) game.action('potion');
    for (let i = 0; i < 6 && game.getState().phase === 'combat'; i++) game.action('end-turn');
    assert.equal(game.getState().phase, 'defeat');
    const restored = createCampaign(); assert.equal(restored.load(), true);
    assert.equal(restored.action('retry'), true);
    const retried = restored.getState();
    for (const key of ['player', 'dice', 'stats', 'enemies']) assert.deepEqual(retried[key], start[key]);
    assert.equal(retried.phase, 'combat'); assert.equal(retried.encounter, 1); assert.equal(retried.round, 1);
    assert.equal(retried.checkpoint.checkpoint, undefined);
    assert.ok(map.get(SAVE_KEY).length < 25000);
    assert.equal(restored.action('retry'), false);
    const again = createCampaign(); assert.equal(again.load(), true);
    assert.deepEqual(again.getState().player, start.player);
  });
}));

test('legacy saves gain safe progression defaults and can restart without a checkpoint', () => {
  withSavedGame(s => {
    delete s.player.equipment; delete s.player.trained; delete s.checkpoint;
    s.phase = 'defeat'; s.player.health = 0;
  }, (game, map) => {
    assert.deepEqual(game.getState().player.equipment, []);
    assert.deepEqual(game.getState().player.trained, []);
    assert.equal(game.action('retry'), true);
    assert.equal(game.getState().player.health, game.getState().player.maxHealth);
    const before = game.getState();
    map.set(SAVE_KEY, '{broken'); assert.equal(game.load(), false);
    assert.deepEqual(game.getState(), before);
    const malformed = structuredClone(before); malformed.stats = null;
    map.set(SAVE_KEY, JSON.stringify({ version: 1, state: malformed }));
    assert.equal(game.load(), false); assert.deepEqual(game.getState(), before);
  });
});

test('import rejects unbounded values, invalid enums and poisoned checkpoints without committing state or storage', () => {
  const map = new Map();
  let candidate, writes = 0;
  globalThis.localStorage = {
    getItem: key => candidate ?? map.get(key) ?? null,
    setItem: (key, value) => { writes++; map.set(key, value); }
  };
  try {
    const game = createCampaign(); game.reset({ name: 'Preserved adventure' });
    const before = game.getState(), stored = map.get(SAVE_KEY);
    const invalid = [
      s => { s.player.stamina = 1e12; },
      s => { s.player.health = s.player.maxHealth = s.player.baseMaxHealth = 1e12; },
      s => { s.enemies[0].maxHealth = 1e12; },
      s => { s.enemies = Array.from({ length: 38 }, (_, i) => ({ ...s.enemies[0], id: `enemy-${i}` })); },
      s => { s.dice = Array.from({ length: 33 }, (_, i) => ({ ...s.dice[0], id: `die-${i}` })); },
      s => { s.log = Array(41).fill('Entry'); },
      s => { s.dice[0].skill = '__proto__'; },
      s => { s.dice[0].skill = ['blade']; },
      s => { s.dice[0].type = 'alien'; },
      s => { s.dice[0].id = 'die-0"] button'; },
      s => { s.player.className = ['Sorcerer']; },
      s => { s.player.race = 'unknown'; },
      s => { s.difficulty = '__proto__'; },
      s => { s.difficulty = ['story']; },
      s => { s.maxRounds = 8; },
      s => { s.contentVersion = 99; },
      s => { s.tokens[0].q = 9; },
      s => { s.tokens[0].collected = 'false'; },
      s => { s.tokens.push({ ...s.tokens[0] }); },
      s => { s.tokens = []; },
      s => { s.phase = 'event'; s.routeId = '__proto__'; },
      s => { s.routeId = 'camp'; },
      s => { s.preparationGuard = 2; },
      s => { s.journey = [{ id: 'invented-choice', fromEncounter: 0 }]; },
      s => { s.journey = [{ id: 'camp-rest', fromEncounter: 0 }, { id: 'ruins-gold', fromEncounter: 0 }]; },
      s => { s.phase = 'travel'; s.encounter = 2; s.session = 3; s.checkpoint = null; },
      s => { s.checkpoint.player.q = 500; },
      s => { s.checkpoint.player.stamina = 1e12; },
      s => { s.checkpoint.player.health = 0; },
      s => { s.checkpoint.dice[0].status = 'unknown'; },
      s => { s.checkpoint.stats = {}; },
      s => { s.checkpoint.log = Array(41).fill('Entry'); },
      s => { s.checkpoint.tokens[0].collected = 1; },
      s => { s.checkpoint.preparationGuard = 100; },
      s => { s.checkpoint.checkpoint = {}; }
    ];
    for (const modify of invalid) {
      const malformed = structuredClone(before); modify(malformed);
      candidate = JSON.stringify({ version: 1, state: malformed });
      const writesBefore = writes;
      assert.equal(game.load(), false);
      assert.deepEqual(game.getState(), before);
      assert.equal(map.get(SAVE_KEY), stored);
      assert.equal(writes, writesBefore);
    }
    candidate = ' '.repeat(1024 * 1024 + 1);
    assert.equal(game.load(), false);
    assert.deepEqual(game.getState(), before);
    assert.equal(map.get(SAVE_KEY), stored);
  } finally { delete globalThis.localStorage; }
});

test('valid imports discard untrusted derived data and unknown nested fields', () => {
  withSavedGame(s => {
    s.canRoll = true; s.reachable = Array(100).fill({ q: 999, r: 999 });
    s.player.unknown = { nested: { ignored: true } };
    s.checkpoint.unknown = { nested: { ignored: true } };
    s.dice[0].unknown = { ignored: true };
    s.terrain = [{ q: 0, r: 2, type: 'cover' }];
    s.tokens[0].name = 'Imported name';
    s.player.cover = true; s.enemies[0].armor = 99;
    s.mission = { complete: true };
  }, game => {
    const loaded = game.getState();
    assert.equal(loaded.canRoll, false);
    assert.ok(loaded.reachable.every(h => Math.abs(h.q) <= 3));
    assert.equal(loaded.player.unknown, undefined);
    assert.equal(loaded.checkpoint.unknown, undefined);
    assert.equal(loaded.dice[0].unknown, undefined);
    assert.equal(loaded.player.cover, false);
    assert.equal(loaded.enemies[0].armor, 0);
    assert.equal(loaded.tokens[0].name, 'Abandoned strongbox');
    assert.equal(loaded.terrain.length, 5);
    assert.equal(loaded.mission.complete, false);
  });
});

test('all difficulties have distinct enemy stats, round budgets, and a winnable public-action campaign', () => withRandom(.1, () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const game = createCampaign(); game.reset({ difficulty });
    const before = game.getState();
    assert.equal(before.difficulty, difficulty);
    assert.equal(before.maxRounds, difficulty === 'story' ? 7 : 5);
    assert.equal(before.enemies[0].health, difficulty === 'veteran' ? 7 : 5);
    assert.equal(before.enemies[0].attack, difficulty === 'veteran' ? 3 : difficulty === 'story' ? 1 : 2);
    const final = playCampaign(game);
    assert.equal(final.phase, 'victory', `${difficulty}: ${JSON.stringify(final)}`);
    assert.equal(final.stats.battles, 3);
  }
}));

test('cover reduces each attack before shared Guard, matching predicted health damage', () => {
  withSavedGame(s => {
    s.player.q = 1; s.player.r = 0; s.player.guard = 1;
    s.enemies[0].attack = 3; s.enemies[1].attack = 2;
  }, game => {
    const before = game.getState();
    assert.equal(before.player.cover, true);
    assert.deepEqual(before.enemyIntents.map(intent => intent.coverBlocked), [1, 1]);
    assert.deepEqual(before.enemyIntents.map(intent => intent.blocked), [1, 0]);
    assert.equal(before.incomingDamage, 2);
    game.action('end-turn');
    assert.equal(game.getState().player.health, before.player.health - 2);
  });
});

test('hazard previews cost one health on landing and lethal moves can be retried', () => {
  withSavedGame(s => { s.player.health = 1; }, game => {
    const hazard = game.getState().reachable.find(h => h.q === -2 && h.r === 2);
    assert.equal(hazard.healthCost, 1);
    assert.equal(hazard.terrain, 'hazard');
    assert.equal(game.action('hex', hazard), true);
    assert.equal(game.getState().player.health, 0);
    assert.equal(game.getState().phase, 'defeat');
    assert.equal(game.action('retry'), true);
    assert.equal(game.getState().player.health, game.getState().player.maxHealth);
  });
  withSavedGame(s => { s.player.q = -2; s.player.r = 2; }, game => {
    const before = game.getState();
    game.action('end-turn');
    assert.equal(game.getState().player.health, before.player.health - before.incomingDamage, 'Standing on a hazard does not reapply landing damage.');
  });
});

test('optional chest pays once, emits a typed pickup, and retry rolls back its gold', () => {
  const events = [], game = createCampaign(() => {}, event => events.push(event));
  const gold = game.getState().player.gold;
  game.action('hex', { q: -2, r: 1 });
  assert.equal(game.getState().player.gold, gold + 15);
  assert.equal(game.getState().tokens[0].collected, true);
  assert.equal(events.find(event => event.type === 'pickup').tokenType, 'chest');
  game.action('hex', { q: -1, r: 1 }); game.action('end-turn');
  game.action('hex', { q: -2, r: 1 });
  assert.equal(game.getState().player.gold, gold + 15);
  for (let i = 0; i < 5 && game.getState().phase === 'combat'; i++) game.action('end-turn');
  assert.equal(game.action('retry'), true);
  assert.equal(game.getState().player.gold, gold);
  assert.equal(game.getState().tokens[0].collected, false);
  game.action('hex', { q: -2, r: 1 });
  assert.equal(game.getState().player.gold, gold + 15);
});

test('shrine requires both skyshards after all guardians fall and last-round collection succeeds', () => {
  withSavedGame(s => {
    encounterFixture(s, 1); s.enemies.forEach(enemy => enemy.health = 0); s.round = 6;
  }, game => {
    const initialGold = game.getState().player.gold;
    game.action('hex', { q: -1, r: 1 });
    assert.equal(game.getState().phase, 'combat');
    assert.equal(game.getState().mission.progress, 1);
    assert.equal(game.getState().player.gold, initialGold);
    game.action('hex', { q: 1, r: -1 });
    assert.equal(game.getState().phase, 'reward');
    assert.equal(game.getState().mission.complete, true);
    assert.equal(game.getState().player.gold, initialGold + 45);
  });
  withSavedGame(s => {
    encounterFixture(s, 1); s.enemies.forEach(enemy => enemy.health = 0); s.round = 6;
  }, game => {
    game.action('end-turn');
    assert.equal(game.getState().phase, 'defeat');
    assert.match(game.getState().defeatReason, /skyshards/);
  });
});

test('boss wards reduce whole engagements, exact expectations, and abilities until both are broken', () => {
  withSavedGame(s => { encounterFixture(s, 2); }, game => {
    select(game, ['die-2']);
    let state = game.getState();
    assert.equal(state.combatPreview.armorReduction, 2);
    assert.equal(state.combatPreview.expectedDamage, .2); // Only the 3-damage critical gets through: 1/6.
    assert.equal(state.combatPreview.maxDamage, 1);
    assert.equal(state.canRoll, true);
    withRandom(.1, () => game.action('roll'));
    assert.equal(game.getState().enemies[0].health, 10);
    game.action('mode', 'move'); game.action('hex', { q: -1, r: 0 });
    assert.equal(game.getState().enemies[0].armor, 2);
    game.action('end-turn');
    // The knight may approach the eastern ward; a direct fixture below verifies the final break.
  });
  withSavedGame(s => {
    encounterFixture(s, 2); s.player.q = -1; s.player.r = 0; s.tokens[0].collected = true;
    s.player.tenacity = 4;
  }, game => {
    assert.equal(game.action('ability'), true);
    assert.equal(game.getState().enemies[0].health, 8);
    game.action('mode', 'move'); assert.equal(game.action('hex', { q: 1, r: -1 }), true);
    assert.equal(game.getState().enemies[0].armor, 0);
    assert.equal(game.getState().mission.complete, true);
    assert.equal(game.action('ability'), true);
    assert.equal(game.getState().enemies[0].health, 4);
  });
  withSavedGame(s => {
    encounterFixture(s, 2); s.player.equipment = ['focus-crystal'];
  }, game => {
    select(game, ['die-2', 'die-3']);
    const outcomes = SKILLS.destruction.faces.flatMap(([face, value]) => SKILLS.destruction.faces.map(([otherFace, otherValue]) => Math.max(0, value + otherValue + (face !== 'blank' || otherFace !== 'blank' ? 1 : 0) - 2)));
    assert.equal(game.getState().combatPreview.expectedDamage, Math.round(outcomes.reduce((a, b) => a + b) / 36 * 10) / 10);
    assert.equal(game.getState().combatPreview.maxDamage, 5);
    withRandom(.1, () => game.action('roll'));
    assert.equal(game.getState().enemies[0].health, 7); // 2 + 2 + focus 1 − armor 2, once for the whole roll.
  });
});

test('every travel branch applies its advertised effects once and records the choice', () => {
  for (const route of Object.values(ROUTE_EVENTS)) for (const choice of route.choices) {
    withSavedGame(s => {
      readyAtTown(s); s.player.health = 2; s.player.maxHealth = 10; s.player.fatigue = 2;
    }, game => {
      const before = game.getState();
      assert.equal(game.action('travel', route.id), true);
      assert.equal(game.getState().phase, 'event');
      assert.deepEqual(game.getState().player, before.player);
      assert.equal(game.action('choose-event', 'invalid-choice'), false);
      assert.equal(game.action('choose-event', choice.id), true);
      const after = game.getState();
      assert.equal(after.encounter, 1);
      assert.equal(after.maxRounds, 6);
      assert.equal(after.phase, 'combat');
      assert.equal(after.player.maxHealth, before.player.baseMaxHealth);
      assert.equal(after.player.fatigue, 0);
      assert.equal(after.journey[0].id, choice.id);
      assert.equal(after.journey[0].choiceLabel, choice.label);
      assert.equal(after.journey[0].fromEncounter, 0);
      const expectedHealth = { 'camp-rest': 12, 'camp-prepare': 8, 'shrine-learn': 6, 'shrine-restore': 12, 'ruins-gold': 5, 'ruins-study': 5 }[choice.id];
      assert.equal(after.player.health, expectedHealth);
      assert.equal(after.player.potions, before.player.potions + (['camp-rest', 'ruins-gold'].includes(choice.id) ? 1 : 0));
      assert.equal(after.player.gold, before.player.gold + (choice.id === 'ruins-gold' ? 35 : 0));
      assert.equal(after.player.xp, before.player.xp + (choice.id === 'ruins-study' ? 2 : 0));
      assert.equal(after.player.tenacity, ['shrine-restore', 'ruins-study'].includes(choice.id) ? 2 : 0);
      assert.equal(after.player.guard, choice.id === 'camp-prepare' ? 1 : 0);
      assert.equal(after.dice.some(die => die.skill === 'lightning'), choice.id === 'shrine-learn');
      assert.equal(game.action('choose-event', choice.id), false);
      assert.deepEqual(game.getState(), after);
    });
  }
});

test('travel choice saves resume without replay, and preparation persists across turns and retries', () => {
  withSavedGame(readyAtTown, game => {
    game.action('buy', 'ward-charm'); game.action('travel', 'camp');
    const restored = createCampaign(); assert.equal(restored.load(), true);
    assert.equal(restored.getState().phase, 'event');
    assert.equal(restored.getState().travelEvent.id, 'camp');
    assert.equal(restored.action('choose-event', 'camp-prepare'), true);
    assert.equal(restored.getState().player.guard, 2);
    restored.action('end-turn');
    assert.equal(restored.getState().player.guard, 2);
    for (let i = 0; i < 6 && restored.getState().phase === 'combat'; i++) restored.action('end-turn');
    const saved = createCampaign(); assert.equal(saved.load(), true);
    assert.equal(saved.action('retry'), true);
    assert.equal(saved.getState().preparationGuard, 1);
    assert.equal(saved.getState().player.guard, 2);
    assert.equal(saved.getState().journey.length, 1);
    assert.equal(saved.action('choose-event', 'camp-prepare'), false);
  });
});

test('both ruins branches offer immediate final-battle resources preserved exactly by checkpoint retry', () => {
  for (const choice of ['ruins-gold', 'ruins-study']) withSavedGame(s => {
    encounterFixture(s, 1); readyAtTown(s); s.player.health = 4; s.player.tenacity = 5;
  }, game => {
    const before = game.getState();
    travel(game, 'ruins', choice);
    const prepared = game.getState();
    assert.equal(prepared.encounter, 2);
    assert.equal(prepared.player.health, 7);
    assert.equal(prepared.player.potions, before.player.potions + (choice === 'ruins-gold' ? 1 : 0));
    assert.equal(prepared.player.tenacity, choice === 'ruins-study' ? 6 : 5);
    assert.equal(prepared.player.gold, before.player.gold + (choice === 'ruins-gold' ? 35 : 0));
    assert.equal(prepared.player.xp, before.player.xp + (choice === 'ruins-study' ? 2 : 0));
    assert.equal(prepared.checkpoint.player.potions, prepared.player.potions);
    assert.equal(prepared.checkpoint.player.tenacity, prepared.player.tenacity);
    assert.equal(game.action('potion'), true);
    assert.equal(game.action('ability'), true);
    assert.equal(game.getState().player.potions, prepared.player.potions - 1);
    assert.equal(game.getState().player.tenacity, prepared.player.tenacity - 2);
    for (let round = 0; round < 5 && game.getState().phase === 'combat'; round++) game.action('end-turn');
    assert.equal(game.getState().phase, 'defeat');
    const restored = createCampaign(); assert.equal(restored.load(), true);
    assert.equal(restored.action('retry'), true);
    assert.deepEqual(restored.getState().player, prepared.player);
    assert.deepEqual(restored.getState().journey, prepared.journey);
    assert.equal(restored.action('choose-event', choice), false);
    assert.deepEqual(restored.getState().player, prepared.player);
  });
});

test('legacy saves migrate missions and difficulty without invalidating completed encounters', () => {
  for (const phase of ['combat', 'travel']) withSavedGame(s => {
    encounterFixture(s, 1); s.phase = phase; s.maxRounds = 5;
    delete s.contentVersion; delete s.difficulty; delete s.tokens; delete s.journey; delete s.preparationGuard;
  }, game => {
    const state = game.getState();
    assert.equal(state.contentVersion, 3);
    assert.equal(state.difficulty, 'standard');
    assert.equal(state.maxRounds, 6);
    assert.equal(state.tokens.length, 2);
    assert.ok(state.tokens.every(token => token.collected === (phase === 'travel')));
    assert.deepEqual(state.journey, []);
    assert.equal(state.phase, phase);
  });
});

test('difficulty and collected tokens survive save and reload without reapplying modifiers', () => {
  const map = new Map();
  globalThis.localStorage = { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) };
  try {
    for (const difficulty of Object.keys(DIFFICULTIES)) {
      const game = createCampaign(); game.reset({ difficulty });
      game.action('hex', { q: -2, r: 1 });
      const before = game.getState();
      const restored = createCampaign(); assert.equal(restored.load(), true);
      const after = restored.getState();
      assert.equal(after.difficulty, difficulty);
      assert.equal(after.maxRounds, before.maxRounds);
      assert.deepEqual(after.tokens, before.tokens);
      assert.deepEqual(after.enemies, before.enemies);
      assert.equal(after.player.gold, 15);
      assert.equal(JSON.parse(map.get(SAVE_KEY)).state.contentVersion, 3);
    }
  } finally { delete globalThis.localStorage; }
});

test('undo restores an ordinary move while keeping dice selection and recomputing cover', () => {
  const events = [], game = createCampaign(() => {}, event => events.push(event));
  const initial = game.getState();
  assert.equal(initial.canUndoMove, false);
  assert.ok(initial.undoMoveReason.length > 0);
  assert.equal(game.action('undo-move'), false);
  assert.equal(game.action('hex', { q: 1, r: 0 }), true);
  assert.equal(game.getState().player.cover, true);
  assert.equal(game.getState().canUndoMove, true);
  assert.equal(game.getState().undoMoveReason, '');
  game.action('target', 'archer'); select(game, ['die-2']);
  assert.equal(game.action('undo-move'), true);
  const undone = game.getState();
  assert.deepEqual(undone.player, initial.player);
  assert.deepEqual(undone.stats, initial.stats);
  assert.deepEqual(undone.checkpoint, initial.checkpoint);
  assert.deepEqual(undone.reachable, initial.reachable);
  assert.equal(undone.moved, false); assert.equal(undone.engaged, false); assert.equal(undone.moveCount, 0);
  assert.equal(undone.targetId, 'archer'); assert.equal(undone.dice.find(d => d.id === 'die-2').selected, true);
  assert.equal(undone.canUndoMove, false); assert.equal(game.action('undo-move'), false);
  assert.deepEqual(events.find(event => event.undone).q, initial.player.q);
});

test('undoing a second move restores its spent engagement without undoing the first move', () => {
  const game = createCampaign();
  moveNearFirst(game);
  assert.equal(game.action('hex', { q: -1, r: 1 }), true);
  assert.equal(game.getState().engaged, true); assert.equal(game.getState().moveCount, 2);
  assert.equal(game.action('undo-move'), true);
  const undone = game.getState();
  assert.deepEqual([undone.player.q, undone.player.r], [0, 1]);
  assert.equal(undone.moveCount, 1); assert.equal(undone.moved, true); assert.equal(undone.engaged, false);
  select(game, ['die-0']);
  assert.equal(game.getState().combatPreview.fatigueCost, 0);
  assert.equal(game.action('undo-move'), false);
});

test('hazards, pickups, combat, supplies, and enemy turns commit movement; rejected actions do not', () => withRandom(.1, () => {
  for (const [label, prepare, resolve] of [
    ['hazard', () => {}, game => game.action('hex', { q: -2, r: 2 })],
    ['chest', () => {}, game => game.action('hex', { q: -2, r: 1 })],
    ['roll', game => select(game, ['die-0']), game => game.action('roll')],
    ['end-turn', () => {}, game => game.action('end-turn')],
  ]) {
    const game = createCampaign(); moveNearFirst(game); prepare(game);
    assert.equal(resolve(game), true, label);
    const beforeUndo = game.getState();
    assert.equal(beforeUndo.canUndoMove, false, label);
    assert.equal(game.action('undo-move'), false, label);
    assert.deepEqual(game.getState(), beforeUndo, label);
  }
  for (const action of ['ability', 'potion']) withSavedGame(s => { s.player.tenacity = 2; s.player.health = 8; }, game => {
    moveNearFirst(game);
    assert.equal(game.action(action), true);
    const committed = game.getState();
    assert.equal(committed.canUndoMove, false);
    assert.equal(game.action('undo-move'), false);
    assert.deepEqual(game.getState(), committed);
  });
  const game = createCampaign(); moveNearFirst(game);
  assert.equal(game.action('roll'), false); assert.equal(game.action('potion'), false); assert.equal(game.action('ability'), false);
  assert.equal(game.action('undo-move'), true, 'Failed actions leave an ordinary move reversible.');
}));

test('undo after moving never refunds an earlier engagement, roll, or fatigue', () => withRandom(.1, () => {
  const game = createCampaign();
  select(game, ['die-2']); game.action('roll');
  select(game, ['die-3']); game.action('roll');
  const committed = game.getState();
  assert.equal(game.action('hex', { q: 0, r: 1 }), true);
  assert.equal(game.action('undo-move'), true);
  const undone = game.getState();
  assert.deepEqual(undone.player, committed.player);
  assert.deepEqual(undone.dice, committed.dice);
  assert.deepEqual(undone.stats, committed.stats);
  assert.equal(undone.engaged, true); assert.equal(undone.moved, false);
  assert.equal(undone.combatPreview.fatigueCost, 1);
}));

test('undo survives reload, strips imported extras, and rejects stale or invalid move records', () => {
  const map = new Map();
  globalThis.localStorage = { getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value) };
  try {
    const game = createCampaign(); moveNearFirst(game);
    const save = JSON.parse(map.get(SAVE_KEY));
    save.state.moveUndo.from.health = 999; save.state.moveUndo.from.dice = ['forged'];
    save.state.canUndoMove = false;
    map.set(SAVE_KEY, JSON.stringify(save));
    const restored = createCampaign(); assert.equal(restored.load(), true);
    assert.equal(restored.getState().canUndoMove, true);
    assert.equal(restored.getState().moveUndo.from.health, undefined);
    assert.equal(restored.getState().moveUndo.from.dice, undefined);
    for (const change of [
      undo => { undo.round++; }, undo => { undo.encounter++; }, undo => { undo.from.q = 999; },
      undo => { undo.from.moveCount = 1; }, undo => { undo.from.engaged = true; },
      undo => { undo.to.r = 2; }, undo => { undo.from = null; },
    ]) {
      const bad = structuredClone(save); change(bad.state.moveUndo); map.set(SAVE_KEY, JSON.stringify(bad));
      const before = restored.getState();
      assert.equal(restored.load(), false); assert.deepEqual(restored.getState(), before);
    }
    assert.equal(restored.action('undo-move'), true);
    const undone = createCampaign(); assert.equal(undone.load(), true);
    assert.equal(undone.getState().canUndoMove, false); assert.equal(undone.getState().player.r, 2);
    const legacy = JSON.parse(map.get(SAVE_KEY)); delete legacy.state.moveUndo;
    legacy.state.canUndoMove = true; legacy.state.undoMoveReason = '<imported>';
    map.set(SAVE_KEY, JSON.stringify(legacy)); assert.equal(undone.load(), true);
    assert.equal(undone.getState().canUndoMove, false); assert.equal(undone.getState().moveUndo, null);
    assert.notEqual(undone.getState().undoMoveReason, '<imported>');
  } finally { delete globalThis.localStorage; }
});

test('in-memory backups round-trip including undo when browser storage is blocked or absent', () => {
  globalThis.localStorage = {
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); },
  };
  try {
    const original = createCampaign();
    assert.equal(original.getSaveStatus(), 'preview');
    original.reset({ name: 'Portable hero', difficulty: 'story', race: 'Nord' });
    assert.equal(original.getSaveStatus(), 'unavailable');
    assert.equal(original.action('hex', { q: 1, r: 0 }), true);
    select(original, ['die-2']);
    const before = original.getState(), serialized = original.serialize();
    const envelope = JSON.parse(serialized);
    assert.equal(envelope.version, 1); assert.equal(typeof envelope.savedAt, 'number');
    assert.equal(envelope.state.reachable, undefined); assert.equal(envelope.state.player.cover, undefined);
    assert.equal(envelope.state.canUndoMove, undefined);
    assert.equal(envelope.state.saveStatus, undefined);
    const restored = createCampaign(); assert.equal(restored.load(), false);
    assert.equal(restored.restore(serialized), true);
    assert.deepEqual(restored.getState(), before);
    assert.equal(restored.action('undo-move'), true);
    assert.equal(restored.getState().player.r, 2); assert.equal(restored.getState().player.q, 0);
    delete globalThis.localStorage;
    const withoutStorage = createCampaign();
    assert.equal(withoutStorage.restore(serialized), true);
    assert.equal(withoutStorage.getSaveStatus(), 'unavailable');
    assert.deepEqual(withoutStorage.getState(), before);
    assert.equal(withoutStorage.load(), false);
    assert.equal(JSON.parse(withoutStorage.serialize()).state.player.name, 'Portable hero');
  } finally { delete globalThis.localStorage; }
});

test('restore rejects invalid backup content before changing state, storage, or UI', () => {
  const map = new Map(); let writes = 0, changes = 0;
  globalThis.localStorage = { getItem: key => map.get(key) || null, setItem: (key, value) => { writes++; map.set(key, value); } };
  try {
    const game = createCampaign(() => { changes++; });
    assert.equal(game.getSaveStatus(), 'preview');
    game.reset({ name: 'Keep this hero' }); moveNearFirst(game);
    assert.equal(game.getSaveStatus(), 'saved');
    const before = game.getState(), stored = map.get(SAVE_KEY), writesBefore = writes, changesBefore = changes;
    const invalidState = JSON.parse(game.serialize()); invalidState.state.player.health = -1;
    const invalidUndo = JSON.parse(game.serialize()); invalidUndo.state.moveUndo.round++;
    for (const raw of [null, 42, {}, '', '{invalid', 'null', '{}', '[]', JSON.stringify({ version: 2, state: before }), JSON.stringify(invalidState), JSON.stringify(invalidUndo), ' '.repeat(1024 * 1024 + 1)]) {
      assert.equal(game.restore(raw), false);
      assert.deepEqual(game.getState(), before);
      assert.equal(map.get(SAVE_KEY), stored);
      assert.equal(writes, writesBefore); assert.equal(changes, changesBefore);
    }
    globalThis.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
    game.action('mode', 'attack');
    assert.equal(game.getSaveStatus(), 'unavailable', 'An older readable save must not mask a failed write.');
    assert.equal(map.get(SAVE_KEY), stored);
  } finally { delete globalThis.localStorage; }
});
