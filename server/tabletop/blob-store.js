import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const VALID_ID = /^[A-Za-z0-9_-]{32}$/;
const MAX_ROOM_BYTES = 4_194_304;

/** Private, durable store with origin reads and conditional writes. */
export class BlobRoomStore {
  constructor({ client = { get, put }, storeId = process.env.BLOB_STORE_ID, token = process.env.BLOB_READ_WRITE_TOKEN, prefix = 'tabletop/rooms/' } = {}) {
    if (!/^[a-zA-Z0-9/_-]+\/$/.test(prefix)) throw new TypeError('Invalid room storage prefix.');
    this.client = client;
    this.prefix = prefix;
    this.credentials = { ...(storeId ? { storeId } : {}), ...(token ? { token } : {}) };
  }

  pathname(roomId) {
    if (!VALID_ID.test(roomId)) throw new TypeError('Invalid room identifier.');
    return `${this.prefix}${roomId}.json`;
  }

  async read(roomId) {
    const result = await this.client.get(this.pathname(roomId), { ...this.credentials, access: 'private', useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.blob?.etag || !result.stream) {
      throw new Error('Room storage returned an incomplete origin response.');
    }
    const reader = result.stream.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_ROOM_BYTES) {
          await reader.cancel();
          throw new Error('Stored room exceeds the supported size.');
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    const state = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (state.id !== roomId || !Number.isSafeInteger(state.revision) || state.revision < 0) {
      throw new Error('Room storage contains an invalid record.');
    }
    return { state, etag: result.blob.etag };
  }

  async get(roomId) { return (await this.read(roomId))?.state ?? null; }

  async compareAndSwap(roomId, expectedRevision, nextState) {
    const pathname = this.pathname(roomId);
    if (nextState.id !== roomId || nextState.revision !== (expectedRevision === null ? 0 : expectedRevision + 1)) {
      throw new TypeError('A room swap must preserve its ID and advance its revision exactly once.');
    }
    const body = JSON.stringify(nextState);
    if (Buffer.byteLength(body, 'utf8') > MAX_ROOM_BYTES) throw new Error('Room exceeds the supported storage size.');
    const current = await this.read(roomId);
    if (expectedRevision === null ? current !== null : current?.state.revision !== expectedRevision) return false;
    const options = {
      ...this.credentials, access: 'private', addRandomSuffix: false,
      contentType: 'application/json', allowOverwrite: expectedRevision !== null,
      ...(current ? { ifMatch: current.etag } : {}),
    };
    try {
      await this.client.put(pathname, body, options);
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return false;
      // Creating a known pathname is also conditional (allowOverwrite:false).
      // SDK versions need not expose a dedicated AlreadyExists error class.
      // Confirm existence before treating an unknown create error as a collision.
      if (expectedRevision === null && await this.read(roomId)) return false;
      throw error;
    }
  }
}
