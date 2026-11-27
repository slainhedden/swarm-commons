import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const requested = path.resolve(root, '.' + pathname);
    if (!requested.startsWith(root + path.sep) && requested !== root) { res.writeHead(403); res.end(); return; }
    let filename = pathname === '/' ? path.join(root,'index.html') : requested;
    let body;
    try { body = await readFile(filename); }
    catch { if (path.extname(pathname)) { res.writeHead(404);res.end('Not found');return; } filename = path.join(root,'index.html');body = await readFile(filename); }
    res.writeHead(200, {'Content-Type':types[path.extname(filename)] || 'application/octet-stream','Cache-Control':filename.endsWith('index.html')?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff'});res.end(body);
  } catch { res.writeHead(400);res.end('Bad request'); }
}).listen(Number(process.env.PORT || 3000),'0.0.0.0');
