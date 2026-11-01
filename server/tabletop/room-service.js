import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const MAX_ROOM_PLAYERS = 4;
export const MAX_COMMAND_BYTES = 16_384;
const MAX_COMMANDS = 10_000;
const ROOM_ID = /^[A-Za-z0-9_-]{32}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,96}$/;

export class RoomError extends Error {
  constructor(code, message, status = 400, details = {}) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function fail(code, message, status, details) {
  throw new RoomError(code, message, status, details);
}

const hash = value => createHash('sha256').update(value).digest('hex');
const opaqueId = bytes => randomBytes(bytes).toString('base64url');

function plainJson(value, depth = 0) {
  if (depth > 20) fail('INVALID_PAYLOAD', 'JSON nesting exceeds the supported depth.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(entry => plainJson(entry, depth + 1));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.keys(value).sort().map(key => [key, plainJson(value[key], depth + 1)]);
    return Object.fromEntries(entries);
  }
  fail('INVALID_PAYLOAD', 'Only plain JSON data is accepted.');
}

function jsonObject(value, limit = MAX_COMMAND_BYTES) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    fail('INVALID_PAYLOAD', 'Expected a JSON object.');
  }
  const checked = plainJson(value);
  if (Buffer.byteLength(JSON.stringify(checked), 'utf8') > limit) {
    fail('PAYLOAD_TOO_LARGE', `Payload exceeds ${limit} bytes.`, 413);
  }
  return checked;
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function playerName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 48 || /[\u0000-\u001f\u007f]/u.test(name)) {
    fail('INVALID_NAME', 'Player names must contain between 1 and 48 visible characters.');
  }
  return name.trim();
}

function publicMember(member) {
  return { id: member.id, seat: member.seat, name: member.name, isHost: member.isHost };
}

/**
 * Transport-independent authoritative rooms. No tabletop rules are invented here.
 * A real engine supplies createGame, authorizeAction, reduceGame and optionally
 * viewGame. It must validate every rule and generate random outcomes server-side.
 */
export class RoomService {
  constructor({ store, createGame, authorizeAction, reduceGame, viewGame = state => state, now = Date.now, maxPlayers = MAX_ROOM_PLAYERS } = {}) {
    if (!store || typeof store.get !== 'function' || typeof store.compareAndSwap !== 'function') {
      throw new TypeError('A room store with get and atomic compareAndSwap is required.');
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > MAX_ROOM_PLAYERS) {
      throw new TypeError('Room capacity must be an integer from one to four.');
    }
    this.store = store;
    this.createGame = createGame;
    this.authorizeAction = authorizeAction;
    this.reduceGame = reduceGame;
    this.viewGame = viewGame;
    this.now = now;
    this.maxPlayers = maxPlayers;
  }

  timestamp() { return new Date(this.now()).toISOString(); }

  async createRoom({ name } = {}) {
    const cleanName = playerName(name);
    for (let attempt = 0; attempt < 4; attempt++) {
      const id = opaqueId(24);
      const token = opaqueId(32);
      const member = { id: opaqueId(12), seat: 0, name: cleanName, isHost: true, tokenHash: hash(token) };
      const createdAt = this.timestamp();
      const room = {
        schemaVersion: 1, id, revision: 0, phase: 'lobby', capacity: this.maxPlayers, createdAt, updatedAt: createdAt,
        members: [member], game: null, receipts: [],
      };
      if (await this.store.compareAndSwap(id, null, room)) {
        return { roomId: id, inviteCode: id, token, memberId: member.id, snapshot: this.snapshot(room, member) };
      }
    }
    fail('ROOM_CREATION_FAILED', 'Could not allocate a room identifier.', 503);
  }

  async readRoom(roomId) {
    if (typeof roomId !== 'string' || !ROOM_ID.test(roomId)) fail('ROOM_NOT_FOUND', 'Room not found.', 404);
    const room = await this.store.get(roomId);
    if (!room) fail('ROOM_NOT_FOUND', 'Room not found.', 404);
    return room;
  }

  authenticate(room, token) {
    if (typeof token !== 'string' || !TOKEN.test(token)) fail('UNAUTHORIZED', 'A valid room session is required.', 401);
    const candidate = Buffer.from(hash(token), 'hex');
    const member = room.members.find(player => timingSafeEqual(candidate, Buffer.from(player.tokenHash, 'hex')));
    if (!member) fail('UNAUTHORIZED', 'A valid room session is required.', 401);
    return member;
  }

  context(room, member) {
    return freeze({
      roomId: room.id, memberId: member.id, seat: member.seat, isHost: member.isHost,
      players: room.members.map(publicMember), revision: room.revision,
    });
  }

  snapshot(room, member) {
    const state = room.game === null ? null : this.viewGame(freeze(structuredClone(room.game)), this.context(room, member));
    return structuredClone({
      id: room.id, revision: room.revision, phase: room.phase, capacity: room.capacity,
      createdAt: room.createdAt, updatedAt: room.updatedAt,
      members: room.members.map(publicMember), self: publicMember(member), game: state,
    });
  }

  async getSnapshot({ roomId, token } = {}) {
    const room = await this.readRoom(roomId);
    return this.snapshot(room, this.authenticate(room, token));
  }

  async joinRoom({ inviteCode, name, token } = {}) {
    // Supplying an existing token reclaims that exact seat, including after start.
    // An invalid token never silently allocates a new seat.
    let room = await this.readRoom(inviteCode);
    if (token !== undefined) {
      const member = this.authenticate(room, token);
      return { roomId: room.id, token, memberId: member.id, resumed: true, snapshot: this.snapshot(room, member) };
    }
    const cleanName = playerName(name);
    const newToken = opaqueId(32);
    const newMemberId = opaqueId(12);
    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt) room = await this.readRoom(inviteCode);
      if (room.phase !== 'lobby') fail('ROOM_STARTED', 'New players cannot join after the game starts.', 409);
      if (room.members.length >= room.capacity) fail('ROOM_FULL', `This room already has ${room.capacity} players.`, 409);
      const member = {
        id: newMemberId, seat: room.members.length, name: cleanName, isHost: false, tokenHash: hash(newToken),
      };
      const next = { ...room, members: [...room.members, member], revision: room.revision + 1, updatedAt: this.timestamp() };
      if (await this.store.compareAndSwap(room.id, room.revision, next)) {
        return { roomId: room.id, token: newToken, memberId: member.id, resumed: false, snapshot: this.snapshot(next, member) };
      }
    }
    fail('ROOM_BUSY', 'The room changed while joining. Retry joining.', 409);
  }

  async startRoom(command = {}) { return this.command('start', command); }
  async dispatchAction(command = {}) { return this.command('action', command); }

  async command(kind, { roomId, token, requestId, expectedRevision, options = {}, action } = {}) {
    if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) fail('INVALID_REQUEST_ID', 'Use a unique 8–96 character request ID.');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('INVALID_REVISION', 'A non-negative expected revision is required.');
    const payload = jsonObject(kind === 'start' ? options : action);
    const fingerprint = hash(JSON.stringify({ kind, payload }));
    let room = await this.readRoom(roomId);
    const member = this.authenticate(room, token);
    const replay = this.findReceipt(room, member, requestId, fingerprint);
    if (replay) return this.commandResult(room, member, replay.revision, true);
    if (room.revision !== expectedRevision) {
      fail('REVISION_CONFLICT', 'The room changed. Refresh before submitting this action.', 409, { revision: room.revision });
    }
    if (room.receipts.length >= MAX_COMMANDS) fail('ROOM_COMMAND_LIMIT', 'This room reached its supported command limit.', 409);
    const context = this.context(room, member);
    let game;
    if (kind === 'start') {
      if (!member.isHost) fail('HOST_REQUIRED', 'Only the host can start the game.', 403);
      if (room.phase !== 'lobby') fail('ROOM_STARTED', 'The game has already started.', 409);
      if (typeof this.createGame !== 'function') fail('ENGINE_UNAVAILABLE', 'No verified game engine is connected.', 503);
      game = await this.createGame(freeze(payload), context);
    } else {
      if (room.phase !== 'playing') fail('GAME_NOT_STARTED', 'Start the game before taking an action.', 409);
      if (typeof this.authorizeAction !== 'function' || typeof this.reduceGame !== 'function') {
        fail('ENGINE_UNAVAILABLE', 'The game action engine and authorization must both be connected.', 503);
      }
      const previousGame = freeze(structuredClone(room.game));
      freeze(payload);
      if (await this.authorizeAction(previousGame, payload, context) !== true) {
        fail('ACTION_FORBIDDEN', 'This player cannot take that action now.', 403);
      }
      game = await this.reduceGame(previousGame, payload, context);
    }
    // Only durable JSON can be a game state. A large state indicates a broken
    // engine/content contract; uploaded files and executable code are excluded.
    game = jsonObject(game, 1_048_576);
    const nextRevision = room.revision + 1;
    const next = {
      ...room, phase: 'playing', game, revision: nextRevision, updatedAt: this.timestamp(),
      receipts: [...room.receipts, { memberId: member.id, requestId, fingerprint, revision: nextRevision }],
    };
    if (await this.store.compareAndSwap(roomId, room.revision, next)) {
      return this.commandResult(next, member, nextRevision, false);
    }
    // Another request may have committed this same command while ours ran.
    room = await this.readRoom(roomId);
    const committed = this.findReceipt(room, member, requestId, fingerprint);
    if (committed) return this.commandResult(room, member, committed.revision, true);
    fail('REVISION_CONFLICT', 'Another action was committed first. Refresh before retrying.', 409, { revision: room.revision });
  }

  findReceipt(room, member, requestId, fingerprint) {
    const receipt = room.receipts.find(item => item.memberId === member.id && item.requestId === requestId);
    if (receipt && receipt.fingerprint !== fingerprint) {
      fail('REQUEST_ID_REUSED', 'This request ID was already used for a different command.', 409);
    }
    return receipt;
  }

  commandResult(room, member, appliedRevision, alreadyApplied) {
    return { appliedRevision, alreadyApplied, snapshot: this.snapshot(room, member) };
  }
}
