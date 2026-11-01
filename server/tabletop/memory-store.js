/**
 * Development/test store. Never use this for serverless production persistence.
 * The read and swap contain no awaits: one JS process cannot interleave them.
 */
export class MemoryRoomStore {
  #rooms = new Map();

  async get(roomId) {
    const value = this.#rooms.get(roomId);
    return value ? structuredClone(value) : null;
  }

  async compareAndSwap(roomId, expectedRevision, nextState) {
    const current = this.#rooms.get(roomId);
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) {
      return false;
    }
    if (nextState.id !== roomId || nextState.revision !== (expectedRevision === null ? 0 : expectedRevision + 1)) {
      throw new TypeError('A room swap must preserve its ID and advance its revision exactly once.');
    }
    this.#rooms.set(roomId, structuredClone(nextState));
    return true;
  }
}
