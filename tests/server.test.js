import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createGameServer } from '../serve.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'betrayal-server-'));
  const root = join(directory, 'dist');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Adventure</title>');
  await writeFile(join(root, 'assets', 'app-Abc12345.js'), 'export const game = true;');
  await writeFile(join(root, 'assets', 'theme.css'), 'body { color: gold; }');
  await writeFile(join(root, 'assets', 'portrait.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await writeFile(join(directory, 'private.txt'), 'outside the public root');
  const server = await createGameServer({ root });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const port = server.address().port;
  const send = (path, { method = 'GET', headers = {} } = {}) => new Promise((resolve, reject) => {
    const outgoing = request({ hostname: '127.0.0.1', port, path, method, headers }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks) }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
  return { directory, root, send };
}

test('production runner serves bundled files with correct MIME, caching and HEAD behavior', async t => {
  const { send } = await fixture(t);
  const home = await send('/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-type'], /^text\/html/);
  assert.equal(home.headers['cache-control'], 'no-cache');
  assert.match(home.body.toString(), /Adventure/);
  const script = await send('/assets/app-Abc12345.js?version=3');
  assert.equal(script.status, 200);
  assert.match(script.headers['content-type'], /^text\/javascript/);
  assert.match(script.headers['cache-control'], /immutable/);
  assert.equal(script.headers['x-content-type-options'], 'nosniff');
  const head = await send('/assets/app-Abc12345.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers['content-length']), script.body.length);
  assert.match((await send('/assets/theme.css')).headers['content-type'], /^text\/css/);
  const image = await send('/assets/portrait.jpg');
  assert.equal(image.headers['content-type'], 'image/jpeg');
  assert.deepEqual(image.body, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
});

test('SPA fallback only serves HTML navigations, never missing assets or fetch requests', async t => {
  const { send } = await fixture(t);
  assert.equal((await send('/adventure/chapter', { headers: { accept: 'text/html,application/xhtml+xml', 'sec-fetch-dest': 'document' } })).status, 200);
  for (const path of ['/assets/missing.js', '/assets/missing', '/missing.png', '/favicon.ico']) {
    const response = await send(path, { headers: { accept: 'text/html' } });
    assert.equal(response.status, 404, path);
    assert.match(response.headers['content-type'], /^text\/plain/);
  }
  assert.equal((await send('/adventure/chapter')).status, 404);
  assert.equal((await send('/adventure/chapter', { headers: { accept: 'application/json' } })).status, 404);
  assert.equal((await send('/adventure/chapter', { headers: { accept: 'text/html', 'sec-fetch-dest': 'script' } })).status, 404);
  assert.equal((await send('/', { method: 'POST' })).status, 405);
});

test('malformed paths, traversal and links outside the game directory are rejected', async t => {
  const { directory, root, send } = await fixture(t);
  for (const path of ['/../private.txt', '/%2e%2e/private.txt', '/assets/%2e%2e/%2e%2e/private.txt', '/%2e%2e%2fprivate.txt']) {
    const response = await send(path);
    assert.equal(response.status, 403, path);
    assert.doesNotMatch(response.body.toString(), /outside the public root/);
  }
  for (const path of ['/%zz', '/%00', '/..%5cprivate.txt']) assert.equal((await send(path)).status, 400, path);
  try {
    await symlink(join(directory, 'private.txt'), join(root, 'assets', 'linked.txt'));
    assert.equal((await send('/assets/linked.txt')).status, 403);
  } catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    t.diagnostic('Windows denied creating a test symlink; path traversal checks still ran.');
  }
});

test('a missing production build produces a useful startup error', async () => {
  await assert.rejects(createGameServer({ root: join(tmpdir(), `missing-betrayal-${Date.now()}`) }), /npm run build first/);
});
