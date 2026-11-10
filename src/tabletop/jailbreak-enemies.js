/**
 * The five level-1 enemies in the Jailbreak enemy bag (Rulebook v1.0/v1.1
 * pp.92–93). Profiles: docs/jailbreak-component-data.md — the bandits from
 * Tutorial pp.10–20, Spriggan and Skeleton corroborated by Tutorial pp.32–39,
 * remaining fields from the community component scans recorded there. Skill
 * effects: the official Enemy Skills Reference.
 */

const profile = record => Object.freeze({ level: 1, ...record });

export const JAILBREAK_ENEMIES = Object.freeze({
  'high-elf-bandit': profile({ name: 'High Elf Bandit', abbr: 'HE', hp: 3, defense: 0, range: 4, combat: 1, targets: 2, priority: 'weakest', skill: 'Dodge' }),
  'argonian-bandit': profile({ name: 'Argonian Bandit', abbr: 'AR', hp: 3, defense: 1, range: 3, combat: 1, targets: 2, priority: 'strongest', skill: 'Enfeeble 1' }),
  'skeever-pup': profile({ name: 'Skeever Pup', abbr: 'SP', hp: 3, defense: 0, range: 1, combat: 1, targets: 'all', priority: 'weakest', skill: 'Rot' }),
  skeleton: profile({ name: 'Skeleton', abbr: 'SK', hp: 2, defense: 2, range: 1, combat: 1, targets: 2, priority: 'weakest', skill: null }),
  spriggan: profile({ name: 'Spriggan', abbr: 'SG', hp: 4, defense: 1, range: 2, combat: 0, targets: 2, priority: 'strongest', skill: 'Bane' }),
});

/** Bag contents for a standard Jailbreak draw, in the rulebook's listed order. */
export const JAILBREAK_ENEMY_BAG = Object.freeze(Object.keys(JAILBREAK_ENEMIES));

/** R p92 diagram: numbered enemy deployment hexes 1–4 (implementation coordinates). */
export const ENEMY_DEPLOYMENT_HEXES = Object.freeze(['3,1', '3,7', '1,1', '1,7']);

/** Short descriptions in this project's own words; the reference sheet is authoritative. */
export const ENEMY_SKILL_TEXT = Object.freeze({
  Dodge: 'Prevents damage equal to the rolled skill dice that deal no damage.',
  'Enfeeble 1': 'After its engage, each target gains one light fatigue.',
  Rot: 'The adventurer who defeats it gains one overfatigue.',
  Bane: 'After its engage, each target gains a Bane status: 1 true damage at the start of each of its turns until the die leaves its cooldown track.',
});

export function createEnemy(id, position) {
  const enemy = JAILBREAK_ENEMIES[id];
  if (!enemy) throw new TypeError(`Unknown Jailbreak enemy: ${id}`);
  return {
    id, name: enemy.name, level: enemy.level, hp: enemy.hp, maxHp: enemy.hp, defense: enemy.defense, range: enemy.range,
    combat: enemy.combat, targets: enemy.targets, priority: enemy.priority, skill: enemy.skill, position,
  };
}
