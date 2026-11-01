import test from 'node:test';
import assert from 'node:assert/strict';
import { BlobPreconditionFailedError } from '@vercel/blob';
import { RoomService } from '../server/tabletop/room-service.js';
import { MemoryRoomStore } from '../server/tabletop/memory-store.js';
import { BlobRoomStore } from '../server/tabletop/blob-store.js';

// Deliberately a tiny turn-counter fixture, not invented tabletop mechanics.
const fixtureEngine = {
  createGame(options, context) {
    return { turn: context.players[0].id, total: 0, players: context.players.map(player => player.id), ...options };
  },
  authorizeAction(state, action, context) { return state.turn === context.memberId && action.type === 'advance'; },
  reduceGame(state, action, context) {
    if (action.amount !== 1) throw new Error('Invalid fixture action.');
    return { ...state, total: state.total + 1, turn: state.players[(context.seat + 1) % state.players.length] };
  },
};
const makeService = extra => new RoomService({ store: new MemoryRoomStore(), ...fixtureEngine, ...extra });
const start = (service, host, revision = host.snapshot.revision, options) => service.startRoom({
  roomId: host.roomId, token: host.token, requestId: 'start_0001', expectedRevision: revision, options,
});
const act = (service, player, revision, requestId = 'action_001', action = { type: 'advance', amount: 1 }) => service.dispatchAction({
  roomId: player.roomId, token: player.token, expectedRevision: revision, requestId, action,
});
const code = expected => error => error.code === expected;

test('room credentials are unguessable and only hashes enter durable records or snapshots', async () => {
  const service = makeService();
  const host = await service.createRoom({ name: '  Host  ' });
  assert.match(host.inviteCode, /^[A-Za-z0-9_-]{32}$/);
  assert.match(host.token, /^[A-Za-z0-9_-]{43}$/);
  const stored = await service.store.get(host.roomId);
  assert.match(stored.members[0].tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(stored.members[0].name, 'Host');
  assert.ok(!JSON.stringify(stored).includes(host.token));
  assert.ok(!JSON.stringify(host.snapshot).includes(stored.members[0].tokenHash));
  assert.equal(host.snapshot.receipts, undefined);
  await assert.rejects(service.getSnapshot({ roomId: host.roomId, token: 'A'.repeat(43) }), code('UNAUTHORIZED'));
  await assert.rejects(service.getSnapshot({ roomId: host.roomId }), code('UNAUTHORIZED'));
});

test('parallel joins never exceed four seats; known token reclaims the same seat', async () => {
  const service = makeService();
  const host = await service.createRoom({ name: 'Host' });
  const outcomes = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => service.joinRoom({ inviteCode: host.inviteCode, name: `Guest ${i}` })));
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 3);
  assert.ok(outcomes.filter(item => item.status === 'rejected').every(item => item.reason.code === 'ROOM_FULL'));
  const guest = outcomes.find(item => item.status === 'fulfilled').value;
  const resumed = await service.joinRoom({ inviteCode: host.inviteCode, token: guest.token });
  assert.equal(resumed.memberId, guest.memberId);
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.snapshot.members.length, 4);
  assert.deepEqual(resumed.snapshot.members.map(player => player.seat), [0, 1, 2, 3]);
  await assert.rejects(service.joinRoom({ inviteCode: host.inviteCode, token: 'B'.repeat(43), name: 'Other' }), code('UNAUTHORIZED'));
});

test('host-only start passes actual joined seats; only the engine-authorized actor can move', async () => {
  const service = makeService();
  const host = await service.createRoom({ name: 'Host' });
  const guest = await service.joinRoom({ inviteCode: host.inviteCode, name: 'Guest' });
  await assert.rejects(start(service, guest, 1), code('HOST_REQUIRED'));
  const started = await start(service, host, 1);
  assert.equal(started.snapshot.revision, 2);
  assert.deepEqual(started.snapshot.game.players, [host.memberId, guest.memberId]);
  await assert.rejects(act(service, guest, 2), code('ACTION_FORBIDDEN'));
  const moved = await act(service, host, 2);
  assert.equal(moved.snapshot.game.total, 1);
  assert.equal(moved.snapshot.game.turn, guest.memberId);
  await assert.rejects(act(service, host, 3, 'action_002'), code('ACTION_FORBIDDEN'));
  const guestMoved = await act(service, guest, 3);
  assert.equal(guestMoved.snapshot.game.total, 2);
  await assert.rejects(service.joinRoom({ inviteCode: host.inviteCode, name: 'Late' }), code('ROOM_STARTED'));
  const resumed = await service.joinRoom({ inviteCode: host.inviteCode, token: guest.token });
  assert.equal(resumed.snapshot.game.total, 2);
});

test('stale revision cannot overwrite a committed move and rejected rules do not change state', async () => {
  const service = makeService();
  const host = await service.createRoom({ name: 'Host' });
  await start(service, host);
  await act(service, host, 1);
  await assert.rejects(act(service, host, 1, 'action_002'), code('REVISION_CONFLICT'));
  await assert.rejects(act(service, host, 2, 'action_003', { type: 'advance', amount: 2 }), /Invalid fixture action/);
  const snapshot = await service.getSnapshot({ roomId: host.roomId, token: host.token });
  assert.equal(snapshot.revision, 2);
  assert.equal(snapshot.game.total, 1);
});

test('a lost response can be retried without duplicating an action, even after later moves', async () => {
  const service = makeService();
  const host = await service.createRoom({ name: 'Host' });
  await start(service, host);
  const first = await act(service, host, 1);
  await act(service, host, 2, 'action_002');
  const retry = await act(service, host, 1);
  assert.equal(first.alreadyApplied, false);
  assert.equal(retry.alreadyApplied, true);
  assert.equal(retry.appliedRevision, 2);
  assert.equal(retry.snapshot.game.total, 2);
  assert.equal(retry.snapshot.revision, 3);
  await assert.rejects(act(service, host, 3, 'action_001', { type: 'advance', amount: 999 }), code('REQUEST_ID_REUSED'));
  const retriedStart = await start(service, host);
  assert.equal(retriedStart.alreadyApplied, true);
  assert.equal(retriedStart.snapshot.game.total, 2);
});

test('concurrent distinct moves at one revision commit once; concurrent retries acknowledge the same move', async () => {
  const service = makeService();
  const host = await service.createRoom({ name: 'Host' });
  await start(service, host);
  const conflicts = await Promise.allSettled([act(service, host, 1, 'first_001'), act(service, host, 1, 'second_001')]);
  assert.equal(conflicts.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(conflicts.find(item => item.status === 'rejected').reason.code, 'REVISION_CONFLICT');
  const retries = await Promise.all([act(service, host, 2, 'retry_001'), act(service, host, 2, 'retry_001')]);
  assert.deepEqual(retries.map(item => item.alreadyApplied).sort(), [false, true]);
  assert.equal(retries[1].snapshot.game.total, 2);
});

test('no engine or absent authorization fails closed; hostile and oversized commands are rejected', async () => {
  const service = new RoomService({ store: new MemoryRoomStore() });
  const host = await service.createRoom({ name: 'Host' });
  await assert.rejects(start(service, host), code('ENGINE_UNAVAILABLE'));
  const noAuth = makeService({ authorizeAction: undefined });
  const player = await noAuth.createRoom({ name: 'Host' });
  await start(noAuth, player);
  await assert.rejects(act(noAuth, player, 1), code('ENGINE_UNAVAILABLE'));
  await assert.rejects(act(noAuth, player, 1, 'large_001', { type: 'advance', text: 'x'.repeat(17000) }), code('PAYLOAD_TOO_LARGE'));
  await assert.rejects(act(noAuth, player, 1, 'date_0001', { type: 'advance', date: new Date() }), code('INVALID_PAYLOAD'));
  await assert.rejects(act(noAuth, player, 1, 'nan_00001', { type: 'advance', amount: NaN }), code('INVALID_PAYLOAD'));
  await assert.rejects(act(noAuth, player, 1, 'x'), code('INVALID_REQUEST_ID'));
});

test('engine inputs and returned snapshots cannot mutate stored authoritative state', async () => {
  const service = makeService();
  const host = await service.createRoom({ name: 'Host' });
  const started = await start(service, host);
  started.snapshot.game.total = 100;
  started.snapshot.members[0].name = 'Altered';
  const saved = await service.getSnapshot({ roomId: host.roomId, token: host.token });
  assert.equal(saved.game.total, 0);
  assert.equal(saved.members[0].name, 'Host');
  service.reduceGame = state => { state.total = 100; return state; };
  await assert.rejects(act(service, host, 1), TypeError);
  assert.equal((await service.getSnapshot({ roomId: host.roomId, token: host.token })).game.total, 0);
});

test('optional engine view filters information from polling snapshots', async () => {
  const service = makeService({
    createGame: (_, context) => ({ ...fixtureEngine.createGame({}, context), hiddenDraw: ['secret'] }),
    viewGame: ({ hiddenDraw, ...state }) => state,
  });
  const host = await service.createRoom({ name: 'Host' });
  await start(service, host);
  assert.equal((await service.store.get(host.roomId)).game.hiddenDraw[0], 'secret');
  assert.equal((await service.getSnapshot({ roomId: host.roomId, token: host.token })).game.hiddenDraw, undefined);
});

function fakeBlobClient() {
  const records = new Map();
  let sequence = 0;
  const calls = [];
  return {
    calls, records,
    async get(pathname, options) {
      calls.push({ method: 'get', options });
      const record = records.get(pathname);
      if (!record) return null;
      return { statusCode: 200, stream: new Response(record.body).body, blob: { etag: record.etag } };
    },
    async put(pathname, body, options) {
      calls.push({ method: 'put', options });
      const previous = records.get(pathname);
      if ((!options.allowOverwrite && previous) || (options.ifMatch && previous?.etag !== options.ifMatch)) {
        throw new BlobPreconditionFailedError();
      }
      const etag = `etag-${++sequence}`;
      records.set(pathname, { body, etag });
      return { etag };
    },
  };
}

test('private Blob adapter reads origin and uses atomic create plus matching ETag updates', async () => {
  const client = fakeBlobClient();
  const store = new BlobRoomStore({ client });
  const service = makeService({ store });
  const host = await service.createRoom({ name: 'Host' });
  await start(service, host);
  assert.equal((await store.get(host.roomId)).revision, 1);
  const writes = client.calls.filter(call => call.method === 'put');
  assert.equal(writes[0].options.allowOverwrite, false);
  assert.equal(writes[0].options.addRandomSuffix, false);
  assert.equal(writes[0].options.ifMatch, undefined);
  assert.equal(writes[1].options.ifMatch, 'etag-1');
  assert.ok(client.calls.every(call => call.options.access === 'private'));
  assert.ok(client.calls.filter(call => call.method === 'get').every(call => call.options.useCache === false));
});

test('separate Blob adapter instances cannot both overwrite the same revision', async () => {
  const client = fakeBlobClient();
  const store1 = new BlobRoomStore({ client });
  const store2 = new BlobRoomStore({ client });
  const id = 'R'.repeat(32);
  await store1.compareAndSwap(id, null, { id, revision: 0, value: 0 });
  const outcomes = await Promise.all([
    store1.compareAndSwap(id, 0, { id, revision: 1, value: 1 }),
    store2.compareAndSwap(id, 0, { id, revision: 1, value: 2 }),
  ]);
  assert.deepEqual(outcomes.sort(), [false, true]);
  assert.equal((await store1.get(id)).revision, 1);
  assert.equal(await store1.compareAndSwap(id, null, { id, revision: 0 }), false);
  assert.equal(await store1.compareAndSwap(id, 0, { id, revision: 1 }), false);
});
