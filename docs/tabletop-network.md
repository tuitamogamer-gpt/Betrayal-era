# Authoritative co-op foundation

This is a multiplayer foundation with a separate Jailbreak engine binding for the requested rules-enforced solo and online co-op game. It does **not** make the existing fan adaptation a faithful tabletop implementation, and no production room service is currently connected. Synchronization tests use an artificial turn counter; a separate HTTP smoke test exercises the actual Jailbreak engine. Neither substitutes for verification of the complete tabletop game.

## Implemented

- A configurable capacity of one to four authenticated human seats, an unguessable 192-bit invite/room ID, and separate 256-bit session tokens. Only SHA-256 token hashes are stored. The fixed two-hero Jailbreak fixture sets capacity2; a solo player controls both heroes.
- A reconnect with the same token resumes the same seat, including after the room starts. The host starts the game; new seats cannot join afterward.
- Server-owned state with an explicit rules-engine authorization callback, immutable inputs, optimistic revisions, and atomic store updates.
- Per-player request IDs make retried start/action commands idempotent. Reusing a request ID with different content fails. A successful retry returns the latest snapshot and the revision where the command originally committed.
- Snapshots omit credential hashes and request receipts. An optional engine projection can hide future card draws or other private state.
- A private Vercel Blob adapter reads directly from origin and uses conditional ETag writes. The memory adapter is only for local development and tests.
- A Node/Vercel HTTP adapter and explicit local development server, with engine integration through `jailbreak-service.js` and cryptographic server-generated dice.

## Rules engine contract

```js
import { RoomService } from '../server/tabletop/room-service.js';
import { BlobRoomStore } from '../server/tabletop/blob-store.js';

const service = new RoomService({
  store: new BlobRoomStore(),
  maxPlayers: 4,
  createGame(options, context) { /* return verified initial game state */ },
  authorizeAction(state, action, context) { /* return true only if allowed */ },
  reduceGame(state, action, context) { /* return verified next state */ },
  viewGame(state, context) { /* return the player's visible state */ },
});
```

`context` is trusted server data: `{roomId, memberId, seat, isHost, players, revision}`. Each player has `{id, seat, name, isHost}`. The engine binds heroes to these member IDs, validates turn ownership and every choice, and generates random results on the server. Never accept client-supplied dice outcomes, entire replacement game states, or ownership claims as authoritative. Solo has one human member; the engine decides how that member controls the published solo setup.

`createGame`, `authorizeAction`, and `reduceGame` may return promises. `authorizeAction` must return exactly `true`; a missing callback fails closed. Engine callbacks must be free of external side effects because two competing requests can execute before only one is committed. A rejected action or losing compare-and-swap never changes the stored room. Engine states and options must be plain JSON. Inputs are frozen to detect mutations.

`viewGame` is synchronous. Its default returns the whole shared game state, so an engine containing hidden future content must provide an appropriate projection. The room service always filters its own credential and receipt fields regardless of this projection.

## Service methods

| Method | Arguments | Result |
| --- | --- | --- |
| `createRoom` | `{name}` | `{roomId, inviteCode, token, memberId, snapshot}` |
| `joinRoom` | `{inviteCode, name}` | New session and snapshot, `resumed:false` |
| `joinRoom` | `{inviteCode, token}` | Existing session and snapshot, `resumed:true` |
| `getSnapshot` | `{roomId, token}` | Authenticated latest snapshot |
| `startRoom` | `{roomId, token, requestId, expectedRevision, options}` | `{snapshot, appliedRevision, alreadyApplied}` |
| `dispatchAction` | `{roomId, token, requestId, expectedRevision, action}` | Same command result shape |

The room ID is also the invitation code; it is suitable for a shared invitation URL. Session tokens are private bearer credentials and must not be included in invitation URLs or logs. This client stores its token in that browser's local storage so it can reconnect after a reload or browser restart. Invitation links contain only the room ID.

Each mutating command uses a fresh request ID of 8–96 letters, digits, underscores or hyphens. Retry a lost response with the **same** request ID and payload. A `REVISION_CONFLICT` means another action won: fetch a new snapshot and ask the player to reconsider the action rather than silently replaying it against different game conditions. A completed duplicate returns `alreadyApplied:true` even when its original expected revision is now old.

`RoomError` supplies `code`, `status`, and safe `details`. The HTTP adapter returns known rules violations as HTTP400 and unexpected engine/storage errors as a generic HTTP500, with diagnostics that exclude credentials. It caps raw body size at32KiB before JSON parsing, rejects a mismatched browser Origin, sets `Cache-Control:no-store`, and keeps storage tokens outside client bundles.

Payload limits: 16 KiB for command options/actions, 1 MiB for game state, depth20 JSON, and 10,000 committed commands per room. Receipts are retained for the room's lifetime; reaching the limit fails explicitly instead of forgetting old IDs and allowing duplicate moves. Room persistence is bounded at 4 MiB. Creation/join are not idempotent allocation commands; retain their returned token promptly. A lost join response before receiving its token requires future transport-level allocation recovery work.

## Durable store contract

`get(roomId)` returns a detached room JSON object or `null`.

`compareAndSwap(roomId, expectedRevision, nextState)` atomically returns `true` and saves only if the persisted revision matches. `expectedRevision:null` means create only if absent. The next revision must be `0` for create, otherwise exactly `expectedRevision + 1`. On a concurrency conflict it returns `false`; operational failures throw. A process-local read followed by an unconditional write does not satisfy this contract.

`MemoryRoomStore` implements the contract in one process, with detached reads/writes. It must never be used as a fallback for Vercel Functions, where instances do not share memory.

`BlobRoomStore` uses private objects at `tabletop/rooms/<id>.json`:

1. Read data and ETag together with `get(path, {access:'private', useCache:false})`.
2. Confirm the stored revision matches the expected revision.
3. For updates, call `put` with `allowOverwrite:true`, `addRandomSuffix:false`, and `ifMatch` set to that ETag. A `BlobPreconditionFailedError` is a conflict.
4. For creation, call `put` with `allowOverwrite:false`, `addRandomSuffix:false`. Confirm existence before classifying an otherwise unknown creation error as a collision.

This prevents two Function instances from overwriting each other's moves. The ETag must belong to the actual data read; separately fetching metadata and cached content is unsafe.

Verified against installed `@vercel/blob`2.8.2 and the official documentation on 2026-11-01:

- [Conditional writes](https://vercel.com/docs/vercel-blob#conditional-writes)
- [Blob SDK get/put options](https://vercel.com/docs/vercel-blob/using-blob-sdk)

## Connect the existing Vercel project

Target project: `betrayal-of-the-second-era`, in team `tuitamogamer-7851s-projects`.

1. In that project's Storage area, create/connect a **private** Blob store for the appropriate Preview and Production environments.
2. Prefer the project-connected OIDC setup with `BLOB_STORE_ID`; `BlobRoomStore` also supports the server-only `BLOB_READ_WRITE_TOKEN` environment variable where that is the provisioned setup. No values belong in source control or browser code.
3. Deploy a server API using `BlobRoomStore` and the verified rules engine. Fail with an explicit unavailable response when storage/engine configuration is absent; do not silently run rooms in memory.
4. Verify real two-browser create/join/start/action/reconnect behavior and concurrent submissions against that deployment before declaring online co-op available.

The attempted connected-tool store creation returned HTTP403. The source adapter, HTTP routes, Jailbreak engine binding, contract tests, and real-engine HTTP smoke test are complete. The actual private store, full-game engine/content, rate controls/room lifecycle, and deployed end-to-end verification remain outstanding. No claim of live online co-op is made.

## HTTP and local development

All endpoints use `/api/tabletop`. JSON responses are never cached.

| Request | Body / credentials | Result |
| --- | --- | --- |
| `GET ?operation=status` | None | `{onlineAvailable, reason?}`; no room state or storage credentials |
| `POST` | `{operation:'create', name}` | HTTP201, created session |
| `POST` | `{operation:'join', roomId, name}` | Joined session; optional Bearer token resumes a seat |
| `GET ?roomId=...` | `Authorization: Bearer <token>` | Latest authenticated snapshot |
| `POST` | `{operation:'start', roomId, requestId, expectedRevision, options?}` plus Bearer | Command result |
| `POST` | `{operation:'action', roomId, requestId, expectedRevision, action}` plus Bearer | Command result |

Errors have shape `{error:{code,message,details?}}`. The availability endpoint reports whether production storage configuration is present; it does not perform a paid storage request or assert the store is healthy. When storage is absent, room operations return `503 STORAGE_UNAVAILABLE`.

Run `npm run dev:tabletop-api` for the explicit local API on `127.0.0.1:3001`, then `npm run dev` in a second terminal. The command passes an explicit `--memory` option and works on Windows as well as Unix. `TABLETOP_MEMORY_STORE=1` is also supported. Local rooms are lost on restart. The Vite `/api/tabletop` proxy preserves the browser's Host header (`changeOrigin:false`) so the Origin check remains valid. The development server refuses to run when the Vercel environment flag is present.

## Verification

Run `node --test tests/tabletop-rooms.test.js tests/tabletop-api.test.js`. Tests cover credential handling, parallel seat allocation, host-only start, engine turn ownership, stale writes, rule rejection, replay-safe retries, simultaneous commands, unavailable engines, payload validation, input/snapshot immutability, view projection, conditional Blob operations across separate adapter instances, and actual HTTP requests. A real Jailbreak-engine test exercises two players through turn ownership, movement, a Combat roll, resolution, turn handoff and reconnect, and confirms that injected client dice outcomes cannot replace server randomness. Blob tests use a contract fake; they are not evidence of a successful production storage connection.
