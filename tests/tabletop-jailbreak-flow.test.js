import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createJailbreak, reduceJailbreak, getLegalMoves, isJailbreakState, upgradeJailbreak,
  classOptions, canDrawClasses, classDrawCount, JAILBREAK_SCHEMA_VERSION,
} from '../src/tabletop/engine.js';
import { BASE_CLASSES, JAILBREAK_ACHIEVEMENTS, classPool, earnedClasses } from '../src/tabletop/jailbreak-rewards.js';

const act = (state, action, rolls = []) => {
  const next = reduceJailbreak(state, action, { random: () => {
    assert.ok(rolls.length, `Unexpected random roll during ${action.type}`);
    return rolls.shift();
  } });
  assert.equal(rolls.length, 0, `Unused rolls after ${action.type}`);
  assert.ok(isJailbreakState(next), `Invalid state after ${action.type}`);
  return next;
};
const dice = (hero, skill) => hero.dice.filter(die => !skill || die.skill === skill).map(die => die.id);
/** Random input that makes a D6 show `face` (1–6). */
const d6 = face => (face - 1) / 6 + 0.01;
const hero = (state, id) => state.heroes.find(item => item.id === id);
const meatLoaf = (slot = 'ready') => ({ code: 'CO-019', slot, gainedInBattle: true });

function tutorialRoundOne() {
  // Extended Tutorial pp.11–18 with its prescribed results and choices.
  let state = act(createJailbreak(), { type: 'begin-turn' });
  state = act(state, { type: 'move', to: '4,0' });
  state = act(state, { type: 'engage', form: 'light-weapon', targetId: 'high-elf-bandit', diceIds: dice(state.heroes[0]) }, [0, .2, .2]);
  state = act(state, { type: 'resolve' });
  state = act(state, { type: 'end-turn' });
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'move', to: '6,2' });
  state = act(state, { type: 'engage', form: 'magic', targetId: 'high-elf-bandit', diceIds: dice(state.heroes[1], 'force-shock') }, [.2, .7]);
  state = act(state, { type: 'resolve', backlashHeroId: 'argonian' });
  state = act(state, { type: 'engage', form: 'defensive', diceIds: dice(state.heroes[1], 'combat') }, [.2, .2]);
  state = act(state, { type: 'resolve' });
  state = act(state, { type: 'end-turn' }, [.9]);
  state = act(state, { type: 'defend', diceIds: [dice(state.heroes[0], 'shield-discipline')[0]] });
  return act(state, { type: 'defend', diceIds: dice(state.heroes[1], 'combat') });
}

/** Argonian standing two hexes from the cache, at the start of its turn. */
function besideCache() {
  const state = createJailbreak();
  state.heroes[0].position = '4,4';
  return act(state, { type: 'begin-turn' });
}

/** A battle that has just ended in victory, with chosen achievement holders. */
function finishedBattle(achievements = {}, options = {}) {
  let state = createJailbreak(options);
  state.enemies.forEach(enemy => { enemy.hp = 0; enemy.position = null; });
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'end-turn' });
  state = act(state, { type: 'begin-turn' });
  state.achievements = { ...state.achievements, ...achievements };
  return act(state, { type: 'end-turn' });
}

test('Tutorial pp.19–22: lockpick, item, final attack, cleanup and the published class options', () => {
  let state = act(tutorialRoundOne(), { type: 'begin-turn' });
  assert.ok(getLegalMoves(state).includes('2,4'));
  state = act(state, { type: 'move', to: '2,4' });
  assert.equal(state.phase, 'lockpick');
  assert.deepEqual(state.pending, { type: 'lockpick', heroId: 'argonian', remainingSteps: 0, check: null });

  state = act(state, { type: 'lockpick-roll' }, [d6(1), d6(2), d6(3)]);
  assert.deepEqual(state.pending.check.dice, [1, 2, 3]);
  state = act(state, { type: 'lockpick-adjust', dieIndex: 2, delta: -1 });
  state = act(state, { type: 'lockpick-resolve' });
  assert.equal(state.pending.check.phase, 'continue');
  state = act(state, { type: 'lockpick-roll', keep: [1, 2] }, [d6(3)]);
  state = act(state, { type: 'lockpick-adjust', dieIndex: 0, delta: 2 });
  state = act(state, { type: 'lockpick-resolve' });
  assert.equal(state.pending.check.phase, 'success');
  assert.equal(state.achievements.lockpick, 'argonian');
  state = act(state, { type: 'cache-item', placement: 'ready' });
  assert.equal(state.phase, 'heroes');
  assert.deepEqual(state.heroes[0].items, [meatLoaf()]);
  assert.deepEqual({ present: state.cache.present, result: state.cache.result }, { present: false, result: 'taken' });
  assert.equal(state.turn.continueMove, 0); // She moved three hexes: nothing left to continue.
  assert.deepEqual(state.heroes[0].cooldown.map(die => die.kind), Array(4).fill('light-fatigue'));

  // T20: Combat 2 + Shield Discipline 2 against defense 1 defeats the bandit.
  state = act(state, { type: 'engage', form: 'light-weapon', targetId: 'argonian-bandit', diceIds: dice(state.heroes[0]).filter(id => state.heroes[0].dice.find(die => die.id === id).state === 'available') }, [.9, .9]);
  state = act(state, { type: 'resolve' });
  assert.equal(state.enemies[1].hp, 0);
  state = act(state, { type: 'end-turn' });
  state = act(state, { type: 'begin-turn' });
  assert.deepEqual(state.heroes[1].cooldown.map(die => die.skill ?? die.kind), ['light-fatigue', 'combat', 'combat', 'light-fatigue']);
  state = act(state, { type: 'end-turn' });

  // T21 cleanup: both active Shield Discipline dice are exhausted; the queue stays.
  assert.equal(state.phase, 'rewards');
  assert.equal(state.outcome, 'victory');
  assert.deepEqual(state.heroes[0].cooldown.map(die => die.skill ?? die.kind),
    ['light-fatigue', 'light-fatigue', 'light-fatigue', 'light-fatigue', 'combat', 'shield-discipline', 'shield-discipline']);
  assert.ok(state.heroes.every(item => item.dice.every(die => die.state !== 'active')));

  // T22: the earned options without the Valenwood expansion.
  assert.deepEqual(new Set(classOptions(state, 'argonian')), new Set(['Acrobat', 'Scout', 'Dragonknight', 'Rogue', 'Archer']));
  assert.deepEqual(new Set(classOptions(state, 'dark-elf')), new Set(['Sorcerer', 'Healer']));
  state = act(state, { type: 'choose-class', heroId: 'dark-elf', className: 'Sorcerer' });
  state = act(state, { type: 'choose-class', heroId: 'argonian', className: 'Acrobat' });

  // R p94: party XP 2, inn-like rest, tenacity and the item are kept.
  assert.equal(state.phase, 'complete');
  assert.equal(state.partyXp, 2);
  assert.equal(state.day, null);
  assert.deepEqual(state.heroes.map(item => [item.className, item.hp, item.cooldown.length, item.tenacity, item.savedXp]),
    [['Acrobat', 5, 0, 1, 0], ['Sorcerer', 4, 0, 0, 0]]);
  assert.deepEqual(state.heroes[0].items, [meatLoaf()]);
  assert.deepEqual(state.supply, { light: 20, over: 12 });
  assert.ok(state.heroes.every(item => item.dice.every(die => die.state === 'available')));
  assert.throws(() => act(state, { type: 'begin-turn' }), { code: 'ENCOUNTER_COMPLETE' });
});

test('R pp59, 68: declining keeps the cache; unused hexes continue the same move action', () => {
  let state = besideCache();
  state = act(state, { type: 'move', to: '2,4' });
  assert.equal(state.pending.remainingSteps, 1);
  assert.throws(() => act(state, { type: 'end-turn' }), { code: 'WRONG_PHASE' });
  state = act(state, { type: 'lockpick-decline' });
  assert.equal(state.cache.present, true);
  assert.equal(state.achievements.lockpick, null);
  assert.equal(state.turn.continueMove, 1);
  assert.ok(getLegalMoves(state).includes('1,3'));
  state = act(state, { type: 'move', to: '1,3' });
  assert.equal(state.turn.moves, 1, 'continuing does not start a second move action');
  assert.equal(state.turn.continueMove, 0);
  // A later move back into the cache hex offers the check again.
  state = act(state, { type: 'move', to: '2,4' });
  assert.equal(state.turn.moves, 2);
  assert.equal(state.phase, 'lockpick');
  assert.equal(state.pending.remainingSteps, 2);
  assert.throws(() => act(state, { type: 'lockpick-resolve' }), { code: 'LOCKPICK_RULE' });
});

test('R p59: an engagement ends an interrupted move; a check cannot be declined once rolled', () => {
  let state = act(besideCache(), { type: 'move', to: '2,4' });
  state = act(state, { type: 'lockpick-roll' }, [d6(6), d6(6), d6(6)]);
  assert.throws(() => act(state, { type: 'lockpick-decline' }), { code: 'LOCKPICK_STARTED' });
  assert.throws(() => act(state, { type: 'lockpick-stop' }), { code: 'LOCKPICK_RULE' });
  state = act(state, { type: 'lockpick-resolve' });
  state = act(state, { type: 'lockpick-stop' });
  assert.equal(state.turn.continueMove, 1);
  state = act(state, { type: 'engage', form: 'defensive', diceIds: [] });
  state = act(state, { type: 'resolve' });
  assert.equal(state.turn.continueMove, 0);
  assert.deepEqual(getLegalMoves(state), []);
});

test('R p68: three failed attempts discard the cache, cycle the card and lose accumulated results', () => {
  let state = act(besideCache(), { type: 'move', to: '2,4' });
  for (let attempt = 1; attempt <= 3; attempt++) {
    state = act(state, { type: 'lockpick-roll' }, [d6(1), d6(1), d6(1)]);
    state = act(state, { type: 'lockpick-resolve' });
  }
  assert.equal(state.phase, 'heroes');
  assert.deepEqual({ present: state.cache.present, result: state.cache.result, heroId: state.cache.heroId },
    { present: false, result: 'cycled', heroId: 'argonian' });
  assert.equal(state.achievements.lockpick, null);
  assert.deepEqual(state.heroes[0].items, []);
  // The discarded cache never interrupts another move.
  state = act(state, { type: 'move', to: '1,3' });
  state = act(state, { type: 'move', to: '2,4' });
  assert.equal(state.phase, 'heroes');
});

test('R p69: each adjustment step gains fatigue through the real supply, and must be paid in full', () => {
  let state = act(besideCache(), { type: 'move', to: '2,4' });
  state = act(state, { type: 'lockpick-roll' }, [d6(1), d6(2), d6(2)]);
  // Conserve the 20 light fatigue dice: 19 already sit in cooldown tracks.
  const light = (prefix, count) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, kind: 'light-fatigue' }));
  state.heroes[1].cooldown = light('dark-elf-light', 13);
  state.heroes[0].cooldown = light('argonian-light', 6);
  state.supply = { light: 1, over: 12 };
  assert.ok(isJailbreakState(state));
  state = act(state, { type: 'lockpick-adjust', dieIndex: 0, delta: 3 });
  assert.deepEqual(state.heroes[0].cooldown.slice(6).map(die => die.kind), ['light-fatigue', 'overfatigue', 'overfatigue']);
  assert.deepEqual(state.supply, { light: 0, over: 10 });
  assert.equal(state.pending.check.fatigueSpent, 3);
  assert.throws(() => act(state, { type: 'lockpick-adjust', dieIndex: 1, delta: 5 }), { code: 'LOCKPICK_RULE' });
  state = act(state, { type: 'lockpick-resolve' });
  assert.equal(state.pending.check.phase, 'continue'); // 4-2-2 does not match 5-2-2.

  // Defensive: 32 dice cannot all fit 26 track slots, so a valid game never has
  // both supplies empty. The reducer still refuses an unpayable cost atomically.
  let unpayable = act(besideCache(), { type: 'move', to: '2,4' });
  unpayable = act(unpayable, { type: 'lockpick-roll' }, [d6(1), d6(2), d6(2)]);
  unpayable.supply = { light: 0, over: 0 };
  const before = structuredClone(unpayable);
  assert.throws(() => reduceJailbreak(unpayable, { type: 'lockpick-adjust', dieIndex: 0, delta: 1 }), { code: 'FATIGUE_SUPPLY_EMPTY' });
  assert.deepEqual(unpayable, before);
});

test('R p28: an unlocked item can go to the pack or be left; full inventories are refused', () => {
  const unlocked = () => {
    let state = act(besideCache(), { type: 'move', to: '2,4' });
    state = act(state, { type: 'lockpick-roll' }, [d6(5), d6(2), d6(2)]);
    return act(state, { type: 'lockpick-resolve' });
  };
  let state = act(unlocked(), { type: 'cache-item', placement: 'pack' });
  assert.deepEqual(state.heroes[0].items, [meatLoaf('pack')]);
  assert.throws(() => act(state, { type: 'use-item', itemCode: 'CO-019', mode: 'self' }), { code: 'ITEM_UNAVAILABLE' });
  state = act(unlocked(), { type: 'cache-item', placement: 'discard' });
  assert.deepEqual(state.heroes[0].items, []);
  assert.equal(state.cache.result, 'discarded');
  assert.equal(state.achievements.lockpick, 'argonian');

  const full = unlocked();
  full.heroes[0].items = Array.from({ length: 4 }, () => meatLoaf('ready'));
  assert.throws(() => act(full, { type: 'cache-item', placement: 'ready' }), { code: 'READY_SLOTS_FULL' });
  assert.equal(act(full, { type: 'cache-item', placement: 'pack' }).heroes[0].items.length, 5);
  full.heroes[0].items = Array.from({ length: 8 }, (_, index) => meatLoaf(index < 4 ? 'ready' : 'pack'));
  assert.throws(() => act(full, { type: 'cache-item', placement: 'pack' }), { code: 'INVENTORY_FULL' });
  assert.throws(() => act(full, { type: 'cache-item', placement: 'belt' }), { code: 'ITEM_PLACEMENT' });
});

test('Falkreath Meat Loaf: discard for 3 bonus HP or 1 bonus HP to each adventurer still on the map', () => {
  let state = act(createJailbreak(), { type: 'begin-turn' });
  state.heroes[0].items = [meatLoaf()];
  state = act(state, { type: 'use-item', itemCode: 'CO-019', mode: 'self' });
  assert.deepEqual(state.heroes.map(item => item.bonusHp), [3, 0]);
  assert.deepEqual(state.heroes[0].items, []);
  assert.throws(() => act(state, { type: 'use-item', itemCode: 'CO-019', mode: 'self' }), { code: 'ITEM_UNAVAILABLE' });

  state = createJailbreak();
  state.heroes[0].items = [meatLoaf()];
  state = act(state, { type: 'use-item', itemCode: 'CO-019', mode: 'party' }); // Start of turn is still the owner's turn.
  assert.deepEqual(state.heroes.map(item => item.bonusHp), [1, 1]);

  // With the same card in the pack and a ready slot, the ready copy is used.
  state = createJailbreak();
  state.heroes[0].items = [meatLoaf('pack'), meatLoaf('ready')];
  state = act(state, { type: 'use-item', itemCode: 'CO-019', mode: 'self' });
  assert.deepEqual(state.heroes[0].items, [meatLoaf('pack')]);

  state = createJailbreak();
  state.heroes[1].escaped = true; state.heroes[1].position = null;
  state.heroes[0].items = [meatLoaf()];
  assert.throws(() => act(state, { type: 'use-item', itemCode: 'CO-019', mode: 'both' }), { code: 'ITEM_CHOICE' });
  state = act(state, { type: 'use-item', itemCode: 'CO-019', mode: 'party' });
  assert.deepEqual(state.heroes.map(item => item.bonusHp), [1, 0]);
});

test('R pp20, 55, 63: bonus HP absorbs enemy damage first, never true damage or priority, and counts as damage taken', () => {
  let state = createJailbreak();
  state.heroes[0].bonusHp = 3;
  state.phase = 'enemy-defense'; state.enemies[1].position = '6,4';
  state.pending = { heroId: 'argonian', enemyId: 'argonian-bandit', damage: 2, targets: ['argonian'], targetIndex: 0 };
  state = act(state, { type: 'defend', diceIds: [] });
  assert.deepEqual([state.heroes[0].hp, state.heroes[0].bonusHp], [5, 1]);
  assert.equal(state.achievements.meleeDamage, 'argonian');
  assert.equal(state.achievements.rangedDamage, null);

  // Prevented damage is not damage taken.
  state = createJailbreak();
  state.phase = 'enemy-defense';
  state.pending = { heroId: 'argonian', enemyId: 'argonian-bandit', damage: 2, targets: ['argonian'], targetIndex: 0 };
  state = act(state, { type: 'defend', useRacial: true });
  assert.equal(state.achievements.rangedDamage, null);

  // Force Shock backlash is true damage: it skips bonus HP.
  state = createJailbreak(); state.activeHero = 1;
  state.heroes[0].bonusHp = 2;
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'engage', form: 'magic', diceIds: dice(state.heroes[1], 'force-shock').slice(0, 1) }, [.9]);
  state = act(state, { type: 'resolve', backlashHeroId: 'argonian' });
  assert.deepEqual([state.heroes[0].hp, state.heroes[0].bonusHp], [4, 2]);

  // Strongest priority compares HP without bonus HP: 3+3 is weaker than 4.
  state = createJailbreak(); state.activeHero = 1;
  state.heroes[0].hp = 3; state.heroes[0].bonusHp = 3;
  state.heroes[0].position = '4,4'; state.heroes[1].position = '4,6';
  state.enemies[0].hp = 0; state.enemies[0].position = null;
  state.enemies[1].position = '3,7';
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'end-turn' }, [.9]);
  assert.deepEqual(state.pending.targets, ['dark-elf', 'argonian']);
});

test('R p64 and the official Enemy Movement FAQ: tied destinations follow the priority icon, not the closest unit', () => {
  let state = createJailbreak(); state.activeHero = 1;
  const [highElf, argonianBandit] = state.enemies;
  state.enemies = [argonianBandit, highElf]; // The party orders equal-level enemies.
  argonianBandit.position = '0,2'; // Range 3, priority strongest.
  highElf.position = '1,3'; // Blocks one route.
  state.heroes[0].position = '4,6'; state.heroes[0].hp = 1; // Closer, but weaker.
  state.heroes[1].position = '4,8'; // Stronger: the bandit's priority.
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'end-turn' }, [.9]);
  // 2,2 and 1,5 are both two hexes away; only 1,5 brings the Dark Elf in range.
  assert.equal(state.enemies[0].position, '1,5');
  assert.deepEqual(state.pending.targets, ['dark-elf', 'argonian']);
});

test('R p93: fewer than two earned classes draw up to two after others choose, excluding their own sheet', () => {
  let state = finishedBattle({ firstTurn: 'argonian', defeated: { 'high-elf-bandit': 'argonian' } });
  assert.equal(state.rewards.mode, 'achievements');
  assert.deepEqual(state.rewards.heroes.argonian.earned, ['Sorcerer', 'Dragonknight']);
  assert.deepEqual(state.rewards.heroes['dark-elf'].earned, ['Healer']); // Dark Elf took the last turn.
  assert.equal(canDrawClasses(state, 'dark-elf'), false);
  assert.throws(() => act(state, { type: 'draw-classes', heroId: 'dark-elf' }), { code: 'WAIT_FOR_CHOICES' });
  assert.throws(() => act(state, { type: 'draw-classes', heroId: 'argonian' }), { code: 'DRAW_UNAVAILABLE' });
  assert.throws(() => act(state, { type: 'choose-class', heroId: 'dark-elf', className: 'Healer' }), { code: 'CLASS_UNAVAILABLE' });
  state = act(state, { type: 'choose-class', heroId: 'argonian', className: 'Sorcerer' });
  assert.equal(canDrawClasses(state, 'dark-elf'), true);
  // Pool: every base sheet except Sorcerer (chosen) and Healer (own, set aside).
  const pool = BASE_CLASSES.filter(name => !['Sorcerer', 'Healer'].includes(name)).sort();
  state = act(state, { type: 'draw-classes', heroId: 'dark-elf' }, [0]);
  assert.deepEqual(state.rewards.heroes['dark-elf'].offered, ['Healer', pool[0]]);
  assert.throws(() => act(state, { type: 'choose-class', heroId: 'dark-elf', className: 'Knight' }), { code: 'CLASS_UNAVAILABLE' });
  state = act(state, { type: 'choose-class', heroId: 'dark-elf', className: pool[0] });
  assert.equal(state.rewards.heroes['dark-elf'].method, 'draw');
  assert.equal(state.rewards.heroes.argonian.method, 'achievement');
  assert.equal(state.phase, 'complete');
});

test('R p93: adventurers who both lack two options draw one at a time from every other sheet', () => {
  let state = finishedBattle();
  assert.deepEqual(state.rewards.heroes.argonian.earned, ['Dragonknight']);
  state = act(state, { type: 'draw-classes', heroId: 'argonian' }, [0.99]);
  const drawn = state.rewards.heroes.argonian.offered[1];
  assert.notEqual(drawn, 'Dragonknight');
  assert.equal(canDrawClasses(state, 'dark-elf'), false, 'one adventurer draws and chooses at a time');
  state = act(state, { type: 'choose-class', heroId: 'argonian', className: drawn });
  // The Argonian's unchosen Dragonknight sheet is back among "all of the other
  // sheets": index 3 of the 13 remaining sheets is Dragonknight.
  const pool = BASE_CLASSES.filter(name => ![drawn, 'Healer'].includes(name)).sort();
  assert.equal(pool[3], 'Dragonknight');
  state = act(state, { type: 'draw-classes', heroId: 'dark-elf' }, [3 / pool.length + 0.001]);
  assert.deepEqual(state.rewards.heroes['dark-elf'].offered, ['Healer', 'Dragonknight']);
});

test('R p93: if an earlier draw took an adventurer\'s earned sheet, it still draws until holding two', () => {
  let state = finishedBattle();
  // The Argonian's shuffled sheets include the Dark Elf's earned Healer (index 3 of 14).
  const pool = BASE_CLASSES.filter(name => name !== 'Dragonknight').sort();
  assert.equal(pool[3], 'Healer');
  state = act(state, { type: 'draw-classes', heroId: 'argonian' }, [3 / pool.length + 0.001]);
  state = act(state, { type: 'choose-class', heroId: 'argonian', className: 'Healer' });
  assert.equal(classDrawCount(state, 'dark-elf'), 2);
  state = act(state, { type: 'draw-classes', heroId: 'dark-elf' }, [0, 0]);
  const offered = state.rewards.heroes['dark-elf'].offered;
  assert.equal(offered.length, 2);
  assert.ok(!offered.includes('Healer'));
  assert.deepEqual(classOptions(state, 'dark-elf'), offered);
});

test('R p94: declining earned classes costs battle tenacity and items, then chooses from what remains', () => {
  let state = finishedBattle({ firstTurn: 'argonian', defeated: { 'argonian-bandit': 'argonian' } });
  state.heroes[1].tenacity = 3;
  state.heroes[1].items = [meatLoaf(), { code: 'CO-019', slot: 'pack', gainedInBattle: false }];
  state = act(state, { type: 'decline-earned-classes', heroId: 'dark-elf' });
  assert.equal(state.heroes[1].tenacity, 0);
  assert.deepEqual(state.heroes[1].items, [{ code: 'CO-019', slot: 'pack', gainedInBattle: false }]);
  assert.deepEqual(classOptions(state, 'dark-elf'), [], 'waits for the remaining choices');
  assert.throws(() => act(state, { type: 'decline-earned-classes', heroId: 'dark-elf' }), { code: 'DECLINE_UNAVAILABLE' });
  state = act(state, { type: 'choose-class', heroId: 'argonian', className: 'Scout' });
  assert.deepEqual(classOptions(state, 'dark-elf'), BASE_CLASSES.filter(name => name !== 'Scout').sort());
  assert.throws(() => act(state, { type: 'choose-class', heroId: 'dark-elf', className: 'Scout' }), { code: 'CLASS_UNAVAILABLE' });
  state = act(state, { type: 'choose-class', heroId: 'dark-elf', className: 'Healer' });
  assert.equal(state.rewards.heroes['dark-elf'].method, 'non-achievement');
  assert.equal(state.heroes[1].className, 'Healer');
});

test('R p94: if every adventurer is defeated, sheets are shuffled once and each draws two', () => {
  let state = createJailbreak(); state.activeHero = 1;
  state.heroes[0].hp = 1; state.heroes[1].hp = 1;
  state = act(state, { type: 'begin-turn' });
  const selected = dice(state.heroes[1], 'force-shock');
  state = act(state, { type: 'engage', form: 'magic', diceIds: selected }, [.9, .9]);
  state = act(state, { type: 'resolve', backlashTargets: { [selected[0]]: 'argonian', [selected[1]]: 'dark-elf' } });
  assert.equal(state.outcome, 'defeat');
  assert.equal(state.rewards.mode, 'all-defeated');
  assert.ok(Object.values(state.rewards.heroes).every(entry => entry.earned.length === 0));
  assert.deepEqual(classOptions(state, 'argonian'), []);
  state = act(state, { type: 'draw-classes', heroId: 'argonian' }, [0, 0]);
  const pool = classPool();
  assert.deepEqual(state.rewards.heroes.argonian.offered, pool.slice(0, 2));
  state = act(state, { type: 'choose-class', heroId: 'argonian', className: pool[1] });
  state = act(state, { type: 'draw-classes', heroId: 'dark-elf' }, [0, 0]);
  assert.deepEqual(state.rewards.heroes['dark-elf'].offered, pool.slice(2, 4), 'earlier draws stay out of the shuffled sheets');
  state = act(state, { type: 'choose-class', heroId: 'dark-elf', className: pool[3] });
  assert.equal(state.phase, 'complete');
  assert.deepEqual(state.heroes.map(item => item.hp), [5, 4]);
});

test('Valenwood expansion classes are offered only when the expansion is in play', () => {
  const achievements = { lockpick: 'argonian', firstEscape: 'argonian', defeated: { 'high-elf-bandit': 'argonian' } };
  assert.deepEqual(earnedClasses(achievements, 'argonian'), ['Sorcerer', 'Rogue', 'Bard']);
  assert.deepEqual(earnedClasses(achievements, 'argonian', ['valenwood']), ['Arcanist', 'Sorcerer', 'Burglar', 'Rogue', 'Bard', 'Ranger']);
  const state = finishedBattle({ lockpick: 'argonian' }, { expansions: ['valenwood'] });
  assert.ok(classOptions(state, 'argonian').includes('Burglar'));
  assert.equal(classPool(['valenwood']).length, 18);
  assert.throws(() => createJailbreak({ expansions: ['morrowind'] }), { code: 'INVALID_EXPANSIONS' });
  assert.equal(JAILBREAK_ACHIEVEMENTS.length, 11);
});

test('Battle cleanup removes bonus HP and recovers drained dice before rewards', () => {
  let state = createJailbreak();
  state.enemies.forEach(enemy => { enemy.hp = 0; enemy.position = null; });
  state.heroes[0].bonusHp = 2;
  state.heroes[1].dice[0].state = 'drained';
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'end-turn' });
  state = act(state, { type: 'begin-turn' });
  state = act(state, { type: 'end-turn' });
  assert.equal(state.phase, 'rewards');
  assert.deepEqual(state.heroes.map(item => item.bonusHp), [0, 0]);
  assert.equal(state.heroes[1].dice[0].state, 'available');
});

test('Schema-1 saves upgrade without losing progress; finished battles continue to rewards', () => {
  const current = act(createJailbreak(), { type: 'begin-turn' });
  const legacy = structuredClone(current);
  legacy.schemaVersion = 1;
  for (const key of ['expansions', 'cache', 'rewards']) delete legacy[key];
  delete legacy.achievements.lockpick;
  for (const item of legacy.heroes) { delete item.items; delete item.savedXp; delete item.className; }
  const upgraded = upgradeJailbreak(legacy);
  assert.equal(upgraded.schemaVersion, JAILBREAK_SCHEMA_VERSION);
  assert.deepEqual(upgraded, current);
  assert.ok(isJailbreakState(upgraded));
  assert.equal(reduceJailbreak(legacy, { type: 'move', to: '6,2' }).heroes[0].position, '6,2');

  const finished = structuredClone(legacy);
  Object.assign(finished, { phase: 'complete', outcome: 'victory', cleanupPending: true, activeHero: 1 });
  finished.enemies.forEach(enemy => { enemy.hp = 0; enemy.position = null; });
  const resumed = upgradeJailbreak(finished);
  assert.equal(resumed.phase, 'rewards');
  assert.ok(isJailbreakState(resumed));
  assert.throws(() => upgradeJailbreak({ schemaVersion: 3, mode: 'jailbreak-combat' }), { code: 'INVALID_SAVE' });
});

test('Saved-state validation rejects shapes the reducer cannot continue', () => {
  const valid = act(besideCache(), { type: 'move', to: '2,4' });
  assert.ok(isJailbreakState(valid));
  const broken = [
    state => { state.pending.heroId = 'dark-elf'; },
    state => { state.cache.present = false; },
    state => { state.heroes[0].items = [{ code: 'CO-999', slot: 'ready', gainedInBattle: true }]; },
    state => { state.heroes[0].cooldown = [{ id: 'argonian-combat-1', kind: 'skill' }]; },
    state => { state.heroes[0].hp = 9; },
    state => { state.rewards = { mode: 'achievements', heroes: {} }; },
    state => { state.pending.check = { phase: 'adjust' }; },
    state => { state.heroes.reverse(); },
    // Shapes the reducer would crash on: a living enemy or hero off the map,
    // a faceless status die, unconserved fatigue and two units on one hex.
    state => { state.enemies[1].position = null; },
    state => { state.heroes[1].position = null; },
    state => { state.heroes[1].cooldown = [{ id: 'status-1', kind: 'status' }]; },
    state => { state.supply.light += 1; },
    state => { state.enemies[1].position = state.heroes[0].position; },
  ];
  for (const breakState of broken) {
    const copy = structuredClone(valid);
    breakState(copy);
    assert.equal(isJailbreakState(copy), false);
  }
  assert.equal(isJailbreakState(null), false);
  assert.equal(isJailbreakState({ schemaVersion: 1, mode: 'jailbreak-combat' }), false);
});
