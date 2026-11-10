import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { MemoryRoomStore } from '../server/tabletop/memory-store.js';
import { createTabletopHandler } from '../server/tabletop/http-api.js';
import { createJailbreakService } from '../server/tabletop/jailbreak-service.js';
import { RoomError } from '../server/tabletop/room-service.js';
import { createJailbreak, reduceJailbreak } from '../src/tabletop/engine.js';

// Minimal stand-in tests the exact real-engine seat contract without asserting
// this counter models a tabletop encounter. Real encounter tests are separate.
const engine = {
  createJailbreak({ players }) {
    return {
      heroes: [{ id: 'argonian', ownerSeat: players[0].seat }, { id: 'dark-elf', ownerSeat: (players[1] ?? players[0]).seat }],
      activeHero: 0, pending: null, total: 0,
    };
  },
  reduceJailbreak(state, action, { random }) {
    if (action.type === 'end-turn') return { ...state, activeHero: 1 - state.activeHero, total: state.total + 1, rolled: random() };
    throw new Error('Unexpected test action.');
  },
};

async function app(t, options = {}, useRealEngine = false) {
  const service = await createJailbreakService({ store: new MemoryRoomStore(), ...(useRealEngine ? {} : { engine }) });
  const server = createServer(createTabletopHandler({ getService: () => service, ...options }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/tabletop`;
  async function request(body, token) {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  return { url, request, service };
}

/** Replace a started room's game state, as a trusted test fixture. */
async function replaceGame(service, roomId, game) {
  const room = await service.store.get(roomId);
  assert.ok(await service.store.compareAndSwap(roomId, room.revision, { ...room, game, revision: room.revision + 1 }));
  return room.revision + 1;
}

test('two actual HTTP clients create, join, start, authorize turns, retry and reconnect', async t => {
  const { url, request } = await app(t);
  const host = await request({ operation: 'create', name: 'Host' });
  assert.equal(host.status, 201);
  assert.equal(host.headers.get('cache-control'), 'no-store');
  const guest = await request({ operation: 'join', roomId: host.body.inviteCode, name: 'Guest' });
  assert.equal(guest.status, 200);
  const roomId = host.body.roomId;
  const startCommand = { operation: 'start', roomId, expectedRevision: 1, requestId: 'start_0001' };
  assert.equal((await request(startCommand, guest.body.token)).status, 403);
  const started = await request(startCommand, host.body.token);
  assert.equal(started.status, 200);
  assert.deepEqual(started.body.snapshot.game.heroes.map(hero => hero.ownerSeat), [0, 1]);
  const move = { operation: 'action', roomId, expectedRevision: 2, requestId: 'action_001', action: { type: 'end-turn' } };
  assert.equal((await request(move, guest.body.token)).status, 403);
  const moved = await request(move, host.body.token);
  assert.equal(moved.body.snapshot.game.total, 1);
  assert.ok(moved.body.snapshot.game.rolled >= 0 && moved.body.snapshot.game.rolled < 1);
  const retried = await request(move, host.body.token);
  assert.equal(retried.body.alreadyApplied, true);
  const next = await request({ ...move, expectedRevision: 3 }, guest.body.token);
  assert.equal(next.body.snapshot.game.total, 2);
  const resumed = await fetch(`${url}?roomId=${roomId}`, { headers: { Authorization: `Bearer ${guest.body.token}` } });
  assert.equal(resumed.status, 200);
  const snapshot = await resumed.json();
  assert.equal(snapshot.game.total, 2);
  assert.equal(snapshot.self.seat, 1);
  assert.equal((await fetch(`${url}?roomId=${roomId}`)).status, 401);
  assert.ok(!JSON.stringify(snapshot).includes('tokenHash'));
});

test('solo controls both tutorial heroes; tutorial capacity prevents a third human joining', async t => {
  const { request } = await app(t);
  const host = (await request({ operation: 'create', name: 'Solo' })).body;
  const started = await request({ operation: 'start', roomId: host.roomId, expectedRevision: 0, requestId: 'start_0001' }, host.token);
  assert.deepEqual(started.body.snapshot.game.heroes.map(hero => hero.ownerSeat), [0, 0]);
  await request({ operation: 'action', roomId: host.roomId, expectedRevision: 1, requestId: 'action_001', action: { type: 'end-turn' } }, host.token);
  const secondTurn = await request({ operation: 'action', roomId: host.roomId, expectedRevision: 2, requestId: 'action_002', action: { type: 'end-turn' } }, host.token);
  assert.equal(secondTurn.status, 200);
  const group = (await request({ operation: 'create', name: 'Group' })).body;
  assert.equal(group.snapshot.capacity, 2);
  await request({ operation: 'join', roomId: group.roomId, name: 'Two' });
  const third = await request({ operation: 'join', roomId: group.roomId, name: 'Three' });
  assert.equal(third.status, 409);
  assert.equal(third.body.error.code, 'ROOM_FULL');
  const groupStarted = await request({ operation: 'start', roomId: group.roomId, expectedRevision: 1, requestId: 'start_0001' }, group.token);
  assert.equal(groupStarted.status, 200);
});

test('HTTP rejects cross-origin writes, incorrect methods, malformed and oversized JSON', async t => {
  const { url } = await app(t);
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(33000) }) })).status, 413);
});

test('availability is public but unconfigured room operations fail honestly without memory fallback', async t => {
  const { url, request } = await app(t, {
    getStatus: () => ({ onlineAvailable: false, reason: 'Private room storage is not connected.' }),
    getService: () => { throw new RoomError('STORAGE_UNAVAILABLE', 'Private room storage is not connected.', 503); },
  });
  const status = await fetch(`${url}?operation=status`);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).onlineAvailable, false);
  const creation = await request({ operation: 'create', name: 'Host' });
  assert.equal(creation.status, 503);
  assert.equal(creation.body.error.code, 'STORAGE_UNAVAILABLE');
});

test('real Jailbreak engine enforces two HTTP players through movement, roll resolution and reconnect', async t => {
  const { url, request } = await app(t, {}, true);
  const host = (await request({ operation: 'create', name: 'Argonian player' })).body;
  const guest = (await request({ operation: 'join', roomId: host.roomId, name: 'Dark Elf player' })).body;
  let snapshot = (await request({ operation: 'start', roomId: host.roomId, expectedRevision: 1, requestId: 'real_start_01' }, host.token)).body.snapshot;
  assert.deepEqual(snapshot.game.heroes.map(hero => [hero.id, hero.ownerSeat]), [['argonian', 0], ['dark-elf', 1]]);
  let count = 0;
  async function command(player, action) {
    const result = await request({ operation: 'action', roomId: host.roomId, expectedRevision: snapshot.revision, requestId: `real_action_${++count}`, action }, player.token);
    if (result.status === 200) snapshot = result.body.snapshot;
    return result;
  }
  assert.equal((await command(guest, { type: 'begin-turn' })).status, 403);
  assert.equal((await command(host, { type: 'begin-turn' })).status, 200);
  const illegal = await command(host, { type: 'move', to: '0,2' });
  assert.equal(illegal.status, 400);
  assert.equal(illegal.body.error.code, 'ILLEGAL_MOVE');
  assert.equal((await command(host, { type: 'move', to: '4,2' })).status, 200);
  assert.equal(snapshot.game.heroes[0].position, '4,2');
  assert.equal((await command(host, {
    type: 'engage', form: 'light-weapon', targetId: 'high-elf-bandit', diceIds: ['argonian-combat-1'],
    // These untrusted extras must not become the authoritative random outcome.
    random: 999, results: [{ face: { value: 999 } }],
  })).status, 200);
  assert.equal(snapshot.game.phase, 'roll');
  assert.ok([0, 1, 2].includes(snapshot.game.pending.results[0].face.value));
  assert.equal((await command(guest, { type: 'resolve' })).status, 403);
  assert.equal((await command(host, { type: 'resolve' })).status, 200);
  assert.equal(snapshot.game.heroes[0].dice.find(die => die.id === 'argonian-combat-1').state, 'cooldown');
  assert.equal((await command(host, { type: 'end-turn' })).status, 200);
  assert.equal(snapshot.game.activeHero, 1);
  assert.equal((await command(host, { type: 'begin-turn' })).status, 403);
  assert.equal((await command(guest, { type: 'begin-turn' })).status, 200);
  const reconnected = await fetch(`${url}?roomId=${host.roomId}`, { headers: { Authorization: `Bearer ${guest.token}` } });
  const resumed = await reconnected.json();
  assert.equal(resumed.revision, snapshot.revision);
  assert.equal(resumed.game.heroes[0].position, '4,2');
  assert.equal(resumed.game.activeHero, 1);
  assert.equal(resumed.self.seat, 1);
});

test('real engine: lockpick dice come from the server and only each owner chooses its class reward', async t => {
  const { request, service } = await app(t, {}, true);
  const host = (await request({ operation: 'create', name: 'Argonian player' })).body;
  const guest = (await request({ operation: 'join', roomId: host.roomId, name: 'Dark Elf player' })).body;
  const unsupported = await request({ operation: 'start', roomId: host.roomId, expectedRevision: 1, requestId: 'start_bad_01', options: { enemies: 5 } }, host.token);
  assert.equal(unsupported.status, 400);
  assert.equal(unsupported.body.error.code, 'UNSUPPORTED_OPTIONS');
  let snapshot = (await request({ operation: 'start', roomId: host.roomId, expectedRevision: 1, requestId: 'start_vw_001', options: { expansions: ['valenwood'] } }, host.token)).body.snapshot;
  assert.deepEqual(snapshot.game.expansions, ['valenwood']);
  let count = 0;
  async function command(player, action) {
    const result = await request({ operation: 'action', roomId: host.roomId, expectedRevision: snapshot.revision, requestId: `flow_action_${++count}`, action }, player.token);
    if (result.status === 200) snapshot = result.body.snapshot;
    return result;
  }

  // The Argonian starts two hexes from the cache.
  const placed = structuredClone(snapshot.game);
  placed.heroes[0].position = '4,4';
  snapshot.revision = await replaceGame(service, host.roomId, placed);
  assert.equal((await command(host, { type: 'begin-turn' })).status, 200);
  assert.equal((await command(host, { type: 'move', to: '2,4' })).status, 200);
  assert.equal(snapshot.game.phase, 'lockpick');
  assert.equal((await command(guest, { type: 'lockpick-roll' })).status, 403);
  assert.equal((await command(host, { type: 'lockpick-roll', results: [5, 2, 2], dice: [5, 2, 2] })).status, 200);
  const check = snapshot.game.pending.check;
  assert.equal(check.attemptsUsed, 1);
  assert.ok(check.dice.every(value => Number.isInteger(value) && value >= 1 && value <= 6));
  const invalid = await command(host, { type: 'lockpick-adjust', dieIndex: 7, delta: 1 });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'LOCKPICK_RULE');

  // Finish a battle with chosen achievements, then resolve rewards over HTTP.
  let game = createJailbreak({ players: [{ seat: 0 }, { seat: 1 }] });
  game.enemies.forEach(enemy => { enemy.hp = 0; enemy.position = null; });
  for (const type of ['begin-turn', 'end-turn', 'begin-turn', 'end-turn']) game = reduceJailbreak(game, { type });
  assert.equal(game.phase, 'rewards');
  snapshot.revision = await replaceGame(service, host.roomId, game);
  assert.deepEqual(game.rewards.heroes.argonian.earned, ['Dragonknight']);
  assert.equal((await command(guest, { type: 'draw-classes', heroId: 'argonian' })).status, 403);
  assert.equal((await command(host, { type: 'draw-classes', heroId: 'argonian' })).status, 200);
  const offered = snapshot.game.rewards.heroes.argonian.offered;
  assert.equal(offered.length, 2);
  const waiting = await command(guest, { type: 'draw-classes', heroId: 'dark-elf' });
  assert.equal(waiting.status, 400);
  assert.equal(waiting.body.error.code, 'WAIT_FOR_CHOICES');
  assert.equal((await command(host, { type: 'choose-class', heroId: 'argonian', className: offered[1] })).status, 200);
  assert.equal((await command(host, { type: 'draw-classes', heroId: 'dark-elf' })).status, 403);
  assert.equal((await command(guest, { type: 'draw-classes', heroId: 'dark-elf' })).status, 200);
  const darkElfOffer = snapshot.game.rewards.heroes['dark-elf'].offered;
  assert.ok(!darkElfOffer.includes(offered[1]));
  assert.equal((await command(guest, { type: 'choose-class', heroId: 'dark-elf', className: darkElfOffer[0] })).status, 200);
  assert.equal(snapshot.game.phase, 'complete');
  assert.deepEqual(snapshot.game.heroes.map(hero => hero.className), [offered[1], darkElfOffer[0]]);
  assert.equal(snapshot.game.partyXp, 2);
});

test('real engine: the host chooses a standard setup; the server draws enemies and each owner deploys', async t => {
  const { request } = await app(t, {}, true);
  const host = (await request({ operation: 'create', name: 'Dark Elf player' })).body;
  const guest = (await request({ operation: 'join', roomId: host.roomId, name: 'Argonian player' })).body;
  const soloForTwo = await request({ operation: 'start', roomId: host.roomId, expectedRevision: 1, requestId: 'start_solo_01', options: { setup: 'standard', party: ['argonian'] } }, host.token);
  assert.equal(soloForTwo.status, 400);
  assert.equal(soloForTwo.body.error.code, 'FIXTURE_PLAYERS');
  const forged = await request({ operation: 'start', roomId: host.roomId, expectedRevision: 1, requestId: 'start_bad_02', options: { setup: 'standard', enemies: ['skeleton'] } }, host.token);
  assert.equal(forged.body.error.code, 'UNSUPPORTED_OPTIONS');
  const started = await request({ operation: 'start', roomId: host.roomId, expectedRevision: 1, requestId: 'start_std_01',
    options: { setup: 'standard', party: ['dark-elf', 'argonian'], difficulty: 'Expert' } }, host.token);
  assert.equal(started.status, 200);
  let snapshot = started.body.snapshot;
  assert.equal(snapshot.game.phase, 'deploy');
  assert.equal(snapshot.game.difficulty, 'Expert');
  assert.deepEqual(snapshot.game.heroes.map(hero => [hero.id, hero.ownerSeat]), [['dark-elf', 0], ['argonian', 1]]);
  assert.equal(snapshot.game.enemies.length, 2);
  assert.notEqual(snapshot.game.enemies[0].id, snapshot.game.enemies[1].id);
  let count = 0;
  async function command(player, action) {
    const result = await request({ operation: 'action', roomId: host.roomId, expectedRevision: snapshot.revision, requestId: `std_action_${++count}`, action }, player.token);
    if (result.status === 200) snapshot = result.body.snapshot;
    return result;
  }
  assert.equal((await command(guest, { type: 'deploy', hex: '8,4', form: 'magic' })).status, 403);
  assert.equal((await command(host, { type: 'deploy', hex: '8,4', form: 'magic' })).status, 200);
  const taken = await command(guest, { type: 'deploy', hex: '8,4', form: 'light-weapon' });
  assert.equal(taken.status, 400);
  assert.equal(taken.body.error.code, 'ILLEGAL_DEPLOYMENT');
  assert.equal((await command(guest, { type: 'deploy', hex: '7,3', form: 'light-weapon' })).status, 200);
  assert.equal(snapshot.game.phase, 'start');
  assert.equal(snapshot.game.activeHero, 0);
  assert.equal((await command(guest, { type: 'begin-turn' })).status, 403);
  assert.equal((await command(host, { type: 'begin-turn' })).status, 200);
});
