import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COOLDOWN_CAPACITY,
  UnsupportedCooldownRuleError,
  queueCooldownDie,
  recoverCooldown,
} from '../src/tabletop/cooldown.js';

// These cases exercise the official rules on Rulebook v1.0 pp.23,59.
// They are constructed mechanics fixtures, not purported verbatim examples.
const skill = id => ({ id, kind: 'skill', metadata: { skillLine: 'Combat' } });
const light = id => ({ id, kind: 'light-fatigue' });
const over = id => ({ id, kind: 'overfatigue' });
const status = (id, face) => ({ id, kind: 'status', face });
const ids = dice => dice.map(die => die.id);
const fullSkills = () => Array.from({ length: COOLDOWN_CAPACITY }, (_, index) => skill(`skill-${index}`));

test('R23: different die types enter in the chosen order, up to 13 slots', () => {
  const dice = [skill('skill'), light('light'), status('status', 'burn'), over('over')];
  const result = dice.reduce((current, die) => queueCooldownDie(current.track, die), { track: [] });
  assert.deepEqual(ids(result.track), ['skill', 'light', 'status', 'over']);
  assert.deepEqual(result.recovered, []);
  assert.deepEqual(result.drained, []);
  assert.deepEqual(result.returned, []);
  assert.equal(COOLDOWN_CAPACITY, 13);
});

test('R23/59: recovery uses the stat and resolves skills, light fatigue and status separately', () => {
  const result = recoverCooldown([skill('s1'), light('light'), status('status', 'burn'), skill('s2')], 3);
  assert.deepEqual(ids(result.track), ['s2']);
  assert.deepEqual(ids(result.recovered), ['s1']);
  assert.deepEqual(ids(result.returned), ['light', 'status']);
  assert.deepEqual(result.drained, []);
});

test('R23/59: overfatigue cycles to the tail and uses one recovery position', () => {
  const result = recoverCooldown([over('over'), skill('s1'), skill('s2')], 2);
  assert.deepEqual(ids(result.track), ['s2', 'over']);
  assert.deepEqual(ids(result.recovered), ['s1']);
  assert.deepEqual(result.returned, []);
});

test('R23/59: multiple overfatigue dice remain and preserve recovery order', () => {
  const result = recoverCooldown([over('over1'), skill('skill'), over('over2'), light('light')], 4);
  assert.deepEqual(ids(result.track), ['over1', 'over2']);
  assert.deepEqual(ids(result.recovered), ['skill']);
  assert.deepEqual(ids(result.returned), ['light']);
});

test('R23: an identical status face refreshes the existing die and returns the unused die', () => {
  const original = [skill('s1'), status('old-status', 'burn'), light('light')];
  const result = queueCooldownDie(original, status('new-status', 'burn'));
  assert.deepEqual(ids(result.track), ['s1', 'light', 'old-status']);
  assert.deepEqual(ids(result.returned), ['new-status']);
  assert.deepEqual(result.drained, []);
});

test('R23: different status faces coexist; equal faces do not overflow a full track', () => {
  const distinct = queueCooldownDie([status('burn', 'burn')], status('poison', 'poison'));
  assert.deepEqual(ids(distinct.track), ['burn', 'poison']);
  const full = fullSkills();
  full[2] = status('existing', 'burn');
  const result = queueCooldownDie(full, status('incoming', 'burn'));
  assert.equal(result.track.length, 13);
  assert.equal(result.track.at(-1).id, 'existing');
  assert.deepEqual(ids(result.returned), ['incoming']);
  assert.deepEqual(result.drained, []);
});

test('R23: overflow drains incoming skill and rightmost non-overfatigue skill in place', () => {
  const full = fullSkills();
  full[12] = over('old-over');
  const result = queueCooldownDie(full, skill('incoming'), { overfatigueDie: over('new-over') });
  assert.equal(result.track.length, 13);
  assert.deepEqual(ids(result.track.slice(-3)), ['skill-10', 'new-over', 'old-over']);
  assert.deepEqual(ids(result.drained), ['incoming', 'skill-11']);
  assert.deepEqual(result.returned, []);
});

test('R23: overflow returns incoming fatigue and replaced status to supply', () => {
  const full = fullSkills();
  full[12] = status('old-status', 'burn');
  const result = queueCooldownDie(full, light('incoming'), { overfatigueDie: over('new-over') });
  assert.equal(result.track.at(-1).id, 'new-over');
  assert.deepEqual(ids(result.returned), ['incoming', 'old-status']);
  assert.deepEqual(result.drained, []);
});

test('R23: overflowing a distinct incoming status returns it while draining replaced skill', () => {
  const result = queueCooldownDie(fullSkills(), status('incoming', 'poison'), { overfatigueDie: over('new-over') });
  assert.deepEqual(ids(result.returned), ['incoming']);
  assert.deepEqual(ids(result.drained), ['skill-12']);
  assert.equal(result.track.at(-1).id, 'new-over');
});

test('operations do not mutate inputs or retain mutable metadata references', () => {
  const original = [skill('s1'), light('light')];
  const incoming = skill('s2');
  const before = structuredClone(original);
  const queued = queueCooldownDie(original, incoming);
  queued.track[0].metadata.skillLine = 'changed';
  queued.track[2].metadata.skillLine = 'changed';
  const recovered = recoverCooldown(original, 1);
  recovered.recovered[0].metadata.skillLine = 'changed';
  assert.deepEqual(original, before);
  assert.equal(incoming.metadata.skillLine, 'Combat');
  const full = fullSkills();
  const fullBefore = structuredClone(full);
  const replacement = over('replacement');
  queueCooldownDie(full, skill('incoming'), { overfatigueDie: replacement });
  assert.deepEqual(full, fullBefore);
  assert.deepEqual(replacement, over('replacement'));
});

test('ordinary recovery handles empty queues, zero stat and fewer dice than stat', () => {
  assert.deepEqual(recoverCooldown([], 2), { track: [], recovered: [], drained: [], returned: [] });
  assert.deepEqual(ids(recoverCooldown([skill('s')], 0).track), ['s']);
  const result = recoverCooldown([skill('s'), light('light')], 5);
  assert.deepEqual(result.track, []);
  assert.deepEqual(ids(result.recovered), ['s']);
  assert.deepEqual(ids(result.returned), ['light']);
});

test('unsupported all-overfatigue overflow fails atomically instead of inventing a rule', () => {
  const full = Array.from({ length: 13 }, (_, index) => over(`over-${index}`));
  const before = structuredClone(full);
  assert.throws(() => queueCooldownDie(full, skill('incoming'), { overfatigueDie: over('extra') }),
    error => error instanceof UnsupportedCooldownRuleError && error.code === 'ALL_OVERFATIGUE_OVERFLOW');
  assert.deepEqual(full, before);
});

test('excess recovery leaves a lone overfatigue die without blocking or duplicating it', () => {
  const original = [over('over')];
  const result = recoverCooldown(original, 2);
  assert.deepEqual(result, { track: [over('over')], recovered: [], drained: [], returned: [] });
  assert.deepEqual(original, [over('over')]);
});

test('excess recovery clears other dice and canonicalizes only remaining identical overfatigue', () => {
  const original = [over('over-a'), light('light-b')];
  const result = recoverCooldown(original, 3);
  assert.deepEqual(result.track, [over('over-a')]);
  assert.deepEqual(result.returned, [light('light-b')]);
  assert.deepEqual(result.recovered, []);
  assert.deepEqual(original, [over('over-a'), light('light-b')]);
  const onlyOverfatigue = recoverCooldown([over('over-a'), over('over-b')], 5);
  assert.deepEqual(onlyOverfatigue.track, [over('over-a'), over('over-b')]);
  assert.deepEqual(onlyOverfatigue.returned, []);
});

test('input validation preserves physical identity, status uniqueness and supply ownership', () => {
  assert.throws(() => queueCooldownDie([skill('s')], skill('s')), /already occupy/);
  assert.throws(() => recoverCooldown([skill('s'), skill('s')], 1), /unique id/);
  assert.throws(() => recoverCooldown([status('s1', 'burn'), status('s2', 'burn')], 1), /duplicate status/);
  assert.throws(() => queueCooldownDie([], { id: 'bad', kind: 'status' }), /face/);
  assert.throws(() => queueCooldownDie([], { id: 'bad', kind: 'invented' }), /supported kind/);
  assert.throws(() => recoverCooldown(fullSkills().concat(skill('extra')), 1), /at most 13/);
  assert.throws(() => recoverCooldown([], -1), /nonnegative/);
  assert.throws(() => recoverCooldown([], 1.5), /nonnegative/);
  assert.throws(() => queueCooldownDie(fullSkills(), light('incoming')), /requires an overfatigue/);
  assert.throws(() => queueCooldownDie(fullSkills(), light('incoming'), { overfatigueDie: over('skill-0') }), /distinct/);
});
