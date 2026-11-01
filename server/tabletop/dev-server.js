import { createServer } from 'node:http';
import { MemoryRoomStore } from './memory-store.js';
import { createTabletopHandler } from './http-api.js';
import { createJailbreakService } from './jailbreak-service.js';

if (process.env.TABLETOP_MEMORY_STORE !== '1' && !process.argv.includes('--memory')) {
  throw new Error('Local rooms require explicit TABLETOP_MEMORY_STORE=1. Memory storage is not a production fallback.');
}
if (process.env.VERCEL) throw new Error('The memory development server must not run on Vercel.');

const service = await createJailbreakService({ store: new MemoryRoomStore() });
const handler = createTabletopHandler({ getService: () => service });
const port = Number(process.env.TABLETOP_API_PORT ?? 3001);
const server = createServer((req, res) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/api/tabletop') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }));
    return;
  }
  handler(req, res);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Local tabletop API: http://127.0.0.1:${port}/api/tabletop (memory; resets on restart)`);
});
