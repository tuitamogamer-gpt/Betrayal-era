import { RoomError } from './room-service.js';

const MAX_BODY_BYTES = 32_768;

function httpError(code, message, status) { return new RoomError(code, message, status); }

async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
    throw httpError('JSON_REQUIRED', 'Send an application/json request body.', 415);
  }
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    throw httpError('PAYLOAD_TOO_LARGE', 'Request body exceeds 32 KiB.', 413);
  }
  let raw;
  if (req.body !== undefined) {
    raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  } else {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.byteLength;
      if (bytes > MAX_BODY_BYTES) throw httpError('PAYLOAD_TOO_LARGE', 'Request body exceeds 32 KiB.', 413);
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    throw httpError('PAYLOAD_TOO_LARGE', 'Request body exceeds 32 KiB.', 413);
  }
  let body;
  try { body = JSON.parse(raw); } catch { throw httpError('INVALID_JSON', 'Request body must be valid JSON.', 400); }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw httpError('INVALID_PAYLOAD', 'Expected a JSON object.', 400);
  return body;
}

function bearerToken(req) {
  const authorization = req.headers.authorization;
  if (authorization === undefined) return undefined;
  if (typeof authorization !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) {
    throw httpError('UNAUTHORIZED', 'Use a valid Bearer room session token.', 401);
  }
  return authorization.slice(7);
}

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const expectedHost = req.headers.host;
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== expectedHost || parsed.origin !== origin) throw new Error();
  } catch { throw httpError('ORIGIN_FORBIDDEN', 'Cross-origin room requests are not accepted.', 403); }
}

function respond(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(value));
}

/** Node/Vercel transport adapter; injectable for real HTTP integration tests. */
export function createTabletopHandler({ getService, getStatus = () => ({ onlineAvailable: true }) }) {
  if (typeof getService !== 'function') throw new TypeError('getService is required.');
  return async function tabletopHandler(req, res) {
    try {
      if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        throw httpError('METHOD_NOT_ALLOWED', 'Use GET or POST.', 405);
      }
      checkOrigin(req);
      const token = bearerToken(req);
      if (req.method === 'GET') {
        const url = new URL(req.url, 'http://localhost');
        if (url.searchParams.get('operation') === 'status') return respond(res, 200, await getStatus());
        const service = await getService();
        return respond(res, 200, await service.getSnapshot({ roomId: url.searchParams.get('roomId'), token }));
      }
      const body = await readBody(req);
      if (!['create', 'join', 'start', 'action'].includes(body.operation)) {
        throw httpError('INVALID_OPERATION', 'Choose create, join, start, or action.', 400);
      }
      const service = await getService();
      let result;
      if (body.operation === 'create') result = await service.createRoom({ name: body.name });
      if (body.operation === 'join') result = await service.joinRoom({ inviteCode: body.roomId, name: body.name, token });
      if (body.operation === 'start') {
        result = await service.startRoom({
          roomId: body.roomId, token, requestId: body.requestId,
          expectedRevision: body.expectedRevision, options: body.options ?? {},
        });
      }
      if (body.operation === 'action') {
        result = await service.dispatchAction({
          roomId: body.roomId, token, requestId: body.requestId,
          expectedRevision: body.expectedRevision, action: body.action,
        });
      }
      return respond(res, body.operation === 'create' ? 201 : 200, result);
    } catch (error) {
      if (error instanceof RoomError) {
        return respond(res, error.status, { error: { code: error.code, message: error.message, details: error.details } });
      }
      // Never serialize a stack or arbitrary engine/storage message: it may
      // contain a credential or a submitted value. Diagnostics stay generic.
      console.error('Tabletop request failed:', error?.name ?? 'Error');
      return respond(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'The room request could not be completed. Retry with the same request ID.' } });
    }
  };
}
