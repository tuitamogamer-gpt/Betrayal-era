import { BlobRoomStore } from '../server/tabletop/blob-store.js';
import { createTabletopHandler } from '../server/tabletop/http-api.js';
import { createJailbreakService } from '../server/tabletop/jailbreak-service.js';
import { RoomError } from '../server/tabletop/room-service.js';

let servicePromise;
export default createTabletopHandler({
  getStatus() {
    const onlineAvailable = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
    return { onlineAvailable, ...(onlineAvailable ? {} : { reason: 'Online co-op is not connected yet. A private room store is required.' }) };
  },
  getService() {
    if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
      throw new RoomError('STORAGE_UNAVAILABLE', 'Online co-op is not connected yet. The server needs a private room store.', 503);
    }
    servicePromise ??= createJailbreakService({ store: new BlobRoomStore() }).catch(error => {
      servicePromise = undefined;
      throw error;
    });
    return servicePromise;
  },
});
