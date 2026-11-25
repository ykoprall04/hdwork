const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const { createLocalWeb } = require('../src/local-web');
const { attest, verified } = require('../scripts/frontend-only-release');

test('versioned login media is attested, cached and served as an exact TLS byte range', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hdwork-night-'));
  let server;
  try {
    const windowsOpenSSL = 'C:/Program Files/Git/usr/bin/openssl.exe';
    const openssl = process.env.HDWORK2_OPENSSL || (process.platform === 'win32' && fs.existsSync(windowsOpenSSL) ? windowsOpenSSL : 'openssl');
    const keyFile = path.join(folder, 'fixture.key'), certFile = path.join(folder, 'fixture.crt');
    execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost', '-keyout', keyFile, '-out', certFile], { stdio: 'ignore', windowsHide: true });
    const cert = fs.readFileSync(certFile);
    const dist = path.join(folder, 'dist');
    const video = '/assets/HDWork-night-loop-AbCd_123.mp4';
    const poster = '/assets/night-poster-AbCd_123.webp';
    const bytes = Buffer.from('0123456789abcdef');
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.writeFileSync(dist + video, bytes);
    fs.writeFileSync(dist + poster, 'poster fixture');
    fs.writeFileSync(path.join(dist, 'index.html'), '<script src="/assets/app.js"></script>');
    fs.writeFileSync(path.join(dist, 'assets/app.js'), 'void 0;');
    const digest = await attest(dist, 'https://localhost', {});
    const { files } = await verified(dist, digest);
    assert.ok(files[video.slice(1)] && files[poster.slice(1)]);
    fs.writeFileSync(path.join(dist, 'assets', 'unrelated-AbCd_123.mp4'), bytes);
    await assert.rejects(attest(dist, 'https://localhost', {}), /NON_STATIC_FILE_REJECTED/);

    server = createLocalWeb({ cert, key: fs.readFileSync(keyFile), dist, applicationSessionOnly: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    async function read(url, headers = {}, method = 'GET') {
      return new Promise((resolve, reject) => {
        const req = https.request({ hostname: '127.0.0.1', port: server.address().port, servername: 'localhost', ca: cert,
          path: url, headers, method, agent: false }, res => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('error', reject);
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.end();
      });
    }
    const full = await read(video);
    assert.equal(full.status, 200);
    assert.equal(full.headers['content-type'], 'video/mp4');
    assert.equal(full.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(full.headers['accept-ranges'], 'bytes');
    assert.deepEqual(full.body, bytes);
    for (const [range, start, end] of [['bytes=0-1',0,1], ['bytes=4-',4,15], ['bytes=-3',13,15], ['bytes=14-99',14,15]]) {
      const response = await read(video, { Range: range });
      assert.equal(response.status, 206);
      assert.equal(response.headers['content-range'], `bytes ${start}-${end}/16`);
      assert.deepEqual(response.body, bytes.subarray(start, end + 1));
    }
    const invalid = await read(video, { Range: 'bytes=16-' });
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers['content-range'], 'bytes */16');
    assert.equal((await read(video, { Range: 'bytes=1-2', 'If-Range': full.headers.etag })).status, 206);
    assert.equal((await read(video, { Range: 'bytes=1-2', 'If-Range': '"stale"' })).status, 200);
    assert.equal((await read(video, { 'If-None-Match': full.headers.etag })).status, 304);
    const head = await read(video, {}, 'HEAD');
    assert.equal(head.headers['content-length'], '16');
    assert.equal(head.body.length, 0);
    assert.equal((await read(poster)).headers['content-type'], 'image/webp');
    assert.equal((await read('/login')).headers['cache-control'], 'no-cache');
    assert.equal((await read('/preview/login')).status, 404);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
