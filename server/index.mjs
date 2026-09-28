import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEscapeApi } from './api.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const distRoot = path.join(projectRoot, 'dist');
const isDev = process.argv.includes('--dev');
const port = Number(process.env.PORT) || 4173;
const handleApi = createEscapeApi();
let vite;

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

function baseHeaders(dev = false) {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self'" + (dev ? " 'unsafe-inline'" : ''),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https: data:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  };
}

async function serveStatic(request, response) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  let relative;
  try {
    relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    response.writeHead(400, baseHeaders(isDev));
    return response.end('잘못된 주소예요.');
  }

  const candidate = path.resolve(distRoot, relative || 'index.html');
  const rootPrefix = distRoot.endsWith(path.sep) ? distRoot : distRoot + path.sep;
  let filePath = candidate.startsWith(rootPrefix) || candidate === distRoot
    ? candidate
    : path.join(distRoot, 'index.html');

  try {
    const info = await stat(filePath);
    if (!info.isFile()) filePath = path.join(distRoot, 'index.html');
  } catch {
    filePath = path.join(distRoot, 'index.html');
  }

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      ...baseHeaders(isDev),
      'content-type': mimeTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
      'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    response.end(contents);
  } catch {
    response.writeHead(503, baseHeaders(isDev));
    response.end('먼저 npm run build를 실행해 주세요.');
  }
}

const server = createServer((request, response) => {
  const headers = baseHeaders(isDev);
  if (request.url?.startsWith('/api/')) {
    response.setHeader('x-content-type-options', headers['x-content-type-options']);
    return handleApi(request, response);
  }
  if (isDev && vite) {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    return vite.middlewares(request, response, (error) => {
      if (error) {
        response.writeHead(500, headers);
        response.end('개발 서버에서 오류가 발생했어요.');
      }
    });
  }
  return serveStatic(request, response);
});

if (isDev) {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({
    configFile: path.join(projectRoot, 'vite.config.js'),
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa',
  });
}

server.listen(port, '0.0.0.0', () => {
  const mode = isDev ? '개발' : '운영';
  const keyStatus = process.env.ROOM_SEARCH_API_KEY ? '설정됨' : '미설정';
  console.log('룸서치 ' + mode + ' 서버가 포트 ' + port + '에서 실행 중입니다. API 키: ' + keyStatus);
});

async function shutdown() {
  await vite?.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
