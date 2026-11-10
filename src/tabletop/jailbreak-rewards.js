/**
 * Jailbreak Introduction achievements and class rewards.
 *
 * Source: publisher Rulebook v1.1 pp.93–94 (support-page download checked on
 * 2026-11-10). The Extended Tutorial v1.1 p.22 applies the same entries to its
 * worked example (Sorcerer/Arcanist, Healer, Acrobat/Scout, Dragonknight,
 * Rogue/Burglar and Archer). Arcanist, Burglar and Ranger require the
 * Valenwood expansion. Class abilities are outside this module: a chosen class
 * is recorded by name for later campaign play.
 */

export const BASE_CLASSES = Object.freeze([
  'Acrobat', 'Archer', 'Bard', 'Dragonknight', 'Healer', 'Knight', 'Necromancer', 'Nightblade',
  'Pilgrim', 'Rogue', 'Scout', 'Sorcerer', 'Spellsword', 'Templar', 'Warden',
]);
export const VALENWOOD_CLASSES = Object.freeze(['Arcanist', 'Burglar', 'Ranger']);
export const SUPPORTED_EXPANSIONS = Object.freeze(['valenwood']);

const entry = record => Object.freeze({ ...record, classes: Object.freeze([...record.classes]) });

/**
 * `enemyId` entries are held through `achievements.defeated[enemyId]`; the
 * others through `achievements[key]`. Each achievement belongs to at most one
 * adventurer, so the classes earned by different adventurers never overlap.
 */
export const JAILBREAK_ACHIEVEMENTS = Object.freeze([
  entry({ id: 'defeat-high-elf-bandit', label: 'Defeat High Elf Bandit', enemyId: 'high-elf-bandit', classes: ['Arcanist', 'Sorcerer'] }),
  entry({ id: 'defeat-argonian-bandit', label: 'Defeat Argonian Bandit', enemyId: 'argonian-bandit', classes: ['Acrobat', 'Scout'] }),
  entry({ id: 'defeat-skeever-pup', label: 'Defeat Skeever Pup', enemyId: 'skeever-pup', classes: ['Nightblade', 'Warden'] }),
  entry({ id: 'defeat-skeleton', label: 'Defeat Skeleton', enemyId: 'skeleton', classes: ['Necromancer', 'Spellsword'] }),
  entry({ id: 'defeat-spriggan', label: 'Defeat Spriggan', enemyId: 'spriggan', classes: ['Pilgrim', 'Templar'] }),
  entry({ id: 'cache-lockpick', label: 'Succeed at Cache Lockpick', key: 'lockpick', classes: ['Burglar', 'Rogue'] }),
  entry({ id: 'escape-first', label: 'Escape First', key: 'firstEscape', classes: ['Bard', 'Ranger'] }),
  entry({ id: 'first-turn', label: 'Take the First Turn', key: 'firstTurn', classes: ['Dragonknight'] }),
  entry({ id: 'last-turn', label: 'Take the Last Turn', key: 'lastTurn', classes: ['Healer'] }),
  entry({ id: 'ranged-damage', label: 'First to Take Damage from an Enemy at Range 2+', key: 'rangedDamage', classes: ['Archer'] }),
  entry({ id: 'melee-damage', label: 'First to Take Damage from an Enemy at Range 1', key: 'meleeDamage', classes: ['Knight'] }),
]);

export function isClassAvailable(name, expansions = []) {
  return BASE_CLASSES.includes(name) || (VALENWOOD_CLASSES.includes(name) && expansions.includes('valenwood'));
}

/** Every class sheet in play, alphabetically. */
export function classPool(expansions = []) {
  return [...BASE_CLASSES, ...VALENWOOD_CLASSES].filter(name => isClassAvailable(name, expansions)).sort();
}

export function achievementHolder(achievements, achievement) {
  if (!achievements || typeof achievements !== 'object') return null;
  const holder = achievement.enemyId ? achievements.defeated?.[achievement.enemyId] : achievements[achievement.key];
  return typeof holder === 'string' ? holder : null;
}

/** Achievement ids completed by one adventurer, in checklist order. */
export function completedAchievements(achievements, heroId) {
  return JAILBREAK_ACHIEVEMENTS.filter(item => achievementHolder(achievements, item) === heroId).map(item => item.id);
}

/** Classes earned from one adventurer's achievements, in checklist order. */
export function earnedClasses(achievements, heroId, expansions = []) {
  return JAILBREAK_ACHIEVEMENTS
    .filter(item => achievementHolder(achievements, item) === heroId)
    .flatMap(item => item.classes)
    .filter(name => isClassAvailable(name, expansions));
}
