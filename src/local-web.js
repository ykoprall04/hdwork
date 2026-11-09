const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { pipeline } = require('node:stream');

function createLocalWeb({ cert, key, dist, apiPort = 3090,allowedHosts,applicationSessionOnly=false }) {
  const root = path.resolve(dist);
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  const server = https.createServer({ cert, key, minVersion: 'TLSv1.2' }, (req, res) => {
    if(allowedHosts&&!allowedHosts.includes(req.headers.host)){res.writeHead(421);res.end();return;}
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    if(applicationSessionOnly){
      res.setHeader('X-Frame-Options','DENY');
      res.setHeader('Content-Security-Policy',"frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'");
    }
    const pathname = new URL(req.url, 'https://localhost').pathname;
    if(applicationSessionOnly&&/^\/(health|ready|internal|legacy|preview|uploads|socket[.]io|json|devtools|metrics)(\/|$)/.test(pathname)){res.writeHead(404);res.end();return;}
    if (pathname.startsWith('/api/') || ['/health', '/ready'].includes(pathname)) {
      const headers = { ...req.headers }; delete headers['proxy-authorization']; delete headers['proxy-connection'];
      const proxy = http.request({ hostname: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers }, upstream => {
        res.writeHead(upstream.statusCode, { ...upstream.headers, 'cache-control': 'no-store' });
        upstream.pipe(res);
        upstream.on('error', () => res.destroy());
      });
      proxy.on('error', () => { if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"success":false,"message":"API lokal belum tersedia"}'); } else res.destroy(); });
      req.on('aborted', () => proxy.destroy());
      res.on('close', () => proxy.destroy());
      req.pipe(proxy);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { res.writeHead(400); res.end(); return; }
    const target = path.resolve(root, '.' + decoded);
    if (!target.startsWith(root + path.sep) && target !== root || decoded.includes('\\') || decoded.split('/').some(p => p.startsWith('.'))) { res.writeHead(404); res.end(); return; }
    let file = target;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (path.extname(decoded)) { res.writeHead(404); res.end(); return; }
      file = path.join(root, 'index.html');
    }
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'HEAD') { res.end(); return; }
    pipeline(fs.createReadStream(file), res, () => {});
  });
  return server;
}
module.exports = { createLocalWeb };
