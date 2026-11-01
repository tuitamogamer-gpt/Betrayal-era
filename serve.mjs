#!/usr/bin/env node
/** Local production runner. Uses only Node's standard library. */
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(packageDirectory, 'dist');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.wasm': 'application/wasm',
};

function isInside(root, path) {
  const location = relative(root, path);
  return location === '' || (!isAbsolute(location) && location !== '..' && !location.startsWith(`..${sep}`));
}

function sendText(request, response, status, message) {
  const body = Buffer.from(`${message}\n`);
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(status === 405 ? { Allow: 'GET, HEAD' } : {}),
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

async function existingFile(root, candidate) {
  try {
    const canonical = await realpath(candidate);
    if (!isInside(root, canonical)) return { forbidden: true };
    return (await stat(canonical)).isFile() ? { path: canonical } : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

/** Exported for tests and embedding; the caller chooses when and where to listen. */
export async function createGameServer({ root = defaultRoot } = {}) {
  let canonicalRoot;
  try {
    canonicalRoot = await realpath(root);
    const index = await existingFile(canonicalRoot, resolve(canonicalRoot, 'index.html'));
    if (!index?.path) throw new Error('Missing index');
  } catch {
    throw new Error('Game files are missing. Keep the dist folder beside serve.mjs. From the source project, run npm run build first.');
  }

  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(request, response, 405, 'Only GET and HEAD are supported.');
      return;
    }
    let pathname;
    try {
      // Inspect the original target before URL normalization can remove ../.
      pathname = decodeURIComponent((request.url || '/').split(/[?#]/, 1)[0]);
    } catch {
      sendText(request, response, 400, 'Invalid request path.');
      return;
    }
    if (!pathname.startsWith('/') || pathname.includes('\0') || pathname.includes('\\')) {
      sendText(request, response, 400, 'Invalid request path.');
      return;
    }
    if (pathname.split('/').includes('..')) {
      sendText(request, response, 403, 'This path is unavailable.');
      return;
    }
    try {
      const candidate = resolve(canonicalRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!isInside(canonicalRoot, candidate)) {
        sendText(request, response, 403, 'This path is unavailable.');
        return;
      }
      let file = await existingFile(canonicalRoot, candidate);
      if (file?.forbidden) {
        sendText(request, response, 403, 'This path is unavailable.');
        return;
      }
      const wantsPage = /(?:^|,)\s*text\/html\b/i.test(request.headers.accept || '');
      const destination = request.headers['sec-fetch-dest'];
      const navigation = wantsPage && (!destination || destination === 'document' || destination === 'iframe');
      const assetPath = pathname === '/assets' || pathname.startsWith('/assets/');
      // A missing script, image, stylesheet or API fetch must never receive HTML.
      if (!file && navigation && !assetPath && !extname(pathname)) {
        file = await existingFile(canonicalRoot, resolve(canonicalRoot, 'index.html'));
      }
      if (!file?.path) {
        sendText(request, response, 404, 'File not found.');
        return;
      }
      const body = await readFile(file.path);
      const hashedBundle = /[/\\][^/\\]+-[a-zA-Z0-9_-]{8,}\.(?:js|css)$/.test(file.path);
      response.writeHead(200, {
        'Content-Type': mimeTypes[extname(file.path).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': hashedBundle ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      if (!response.headersSent) sendText(request, response, 500, 'The game file could not be read.');
      else response.destroy();
    }
  });
}

function readPort(args, environmentPort) {
  let value = environmentPort || '4173';
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--port') value = args[++index];
    else if (argument.startsWith('--port=')) value = argument.slice('--port='.length);
    else throw new Error(`Unknown option: ${argument}. Use --port 4173 or --help.`);
  }
  if (!/^\d+$/.test(value || '') || Number(value) < 1 || Number(value) > 65535) {
    throw new Error('Choose a port from 1 to 65535, for example: node serve.mjs --port 4174');
  }
  return Number(value);
}

async function run() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Betrayal of the Second Era — local game runner\n\nUsage: node serve.mjs [--port 4173]\nPORT can also be set in the environment. The game is served on this computer only.');
    return;
  }
  const port = readPort(args, process.env.PORT);
  const server = await createGameServer();
  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListening);
  }).catch(error => {
    if (error.code === 'EADDRINUSE') throw new Error(`Port ${port} is already in use. Try: node serve.mjs --port ${port === 65535 ? 4173 : port + 1}`);
    throw new Error(`The game server could not start: ${error.message}`);
  });
  console.log(`\nThe Elder Scrolls: Betrayal of the Second Era\n\nPlay: http://127.0.0.1:${port}\n\nKeep this window open while you play. Press Ctrl+C to stop.\n`);
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(error => {
    console.error(`\n${error.message}\n`);
    process.exitCode = 1;
  });
}
