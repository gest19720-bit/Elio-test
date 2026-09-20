import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const apiHandlers = {
  '/oauth/authorize': require('./api/oauth/authorize.js'),
  '/oauth/token': require('./api/oauth/token.js'),
  '/oauth/register': require('./api/oauth/register.js'),
  '/api/oauth/authorize': require('./api/oauth/authorize.js'),
  '/api/oauth/token': require('./api/oauth/token.js'),
  '/api/oauth/register': require('./api/oauth/register.js'),
  '/api/oauth/request-details': require('./api/oauth/request-details.js'),
  '/api/oauth/authorization-server': require('./api/oauth/authorization-server.js'),
  '/api/oauth/protected-resource': require('./api/oauth/protected-resource.js'),
  '/.well-known/oauth-authorization-server': require('./api/oauth/authorization-server.js'),
  '/.well-known/oauth-protected-resource': require('./api/oauth/protected-resource.js'),
  '/mcp': require('./api/mcp.js'),
  '/api/mcp': require('./api/mcp.js')
};

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8000);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png' };

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  if ((request.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
  try { return JSON.parse(text); } catch { return text; }
}

async function handleApi(request, response, pathname, url) {
  const handler = apiHandlers[pathname];
  if (!handler) return false;
  const body = request.method === 'GET' || request.method === 'HEAD' ? {} : await readBody(request);
  const result = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { response.setHeader(name, value); return this; },
    json(payload) { response.statusCode = this.statusCode; if (!response.headersSent) response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(payload)); },
    send(payload) { response.statusCode = this.statusCode; response.end(payload); },
    redirect(code, location) { response.statusCode = code; response.setHeader('Location', location); response.end(); },
    end(payload) { response.statusCode = this.statusCode; response.end(payload); }
  };
  try { await handler({ method: request.method, headers: request.headers, query: Object.fromEntries(url.searchParams), body }, result); }
  catch (error) { console.error('[elio-dev-server] API failure', pathname, error instanceof Error ? error.message : 'unknown'); if (!response.headersSent) { response.statusCode = 500; response.end(JSON.stringify({ error: 'server_error' })); } }
  return true;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    if (await handleApi(request, response, pathname, url)) return;
    const requested = pathname === '/' ? '/index.html' : pathname;
    const file = path.resolve(root, `.${requested}`);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end('Forbidden'); return; }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(file));
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found'); }
});

server.listen(port, '127.0.0.1', () => console.log(`Elio is available at http://localhost:${port}`));
