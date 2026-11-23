const https = require('node:https');
const { lookup } = require('node:dns').promises;
const { BlockList, isIP } = require('node:net');

class AssistantError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const denied = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3]
]) denied.addSubnet(address, prefix);
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) denied.addSubnet(address, prefix, 'ipv6');

function publicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !denied.check(address);
  return family === 6 && globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
}

function baseUrl(value) {
  if (typeof value !== 'string' || value.length > 250) throw new AssistantError(400, 'Base URL tidak valid.');
  let url;
  try { url = new URL(value); } catch { throw new AssistantError(400, 'Base URL tidak valid.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) || isIP(host) ||
      /\.(localhost|local|internal|test|invalid|example|onion)$/.test(host)) {
    throw new AssistantError(400, 'Gunakan URL HTTPS publik tanpa kredensial, port khusus, atau parameter.');
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

function untilAborted(promise, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const cancel = () => reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

async function providerRequest(config, endpoint, body, signal, { resolve = lookup, request = https.request } = {}) {
  const url = new URL(baseUrl(config.baseUrl) + endpoint);
  const deadline = AbortSignal.timeout(15000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const addresses = await untilAborted(resolve(url.hostname, { all: true }), combined);
    if (!addresses.length || addresses.some(entry => !publicAddress(entry.address))) {
      throw new AssistantError(400, 'Tujuan API harus memakai alamat jaringan publik.');
    }
    const { address, family } = addresses[0];
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return await new Promise((resolveResponse, reject) => {
      const req = request(url, {
        method: payload === undefined ? 'GET' : 'POST', agent: false, signal: combined,
        // Lock the connection to the address already checked. TLS still verifies the original hostname.
        lookup: (_hostname, options, cb) => options.all ? cb(null, [{ address, family }]) : cb(null, address, family),
        headers: { Authorization: 'Bearer ' + config.apiKey, Accept: 'application/json',
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }) }
      }, response => {
        if (response.statusCode !== 200) {
          response.destroy();
          return reject(new AssistantError(response.statusCode === 429 ? 429 : 502, response.statusCode === 429
            ? 'Penyedia AI sedang membatasi permintaan. Coba lagi nanti.'
            : 'Penyedia AI menolak permintaan. Periksa konfigurasi dan model.'));
        }
        const parts = [];
        let bytes = 0;
        response.on('error', reject);
        response.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > 256 * 1024) response.destroy(new AssistantError(502, 'Respons penyedia AI terlalu besar.'));
          else parts.push(chunk);
        });
        response.on('end', () => {
          try { resolveResponse(JSON.parse(Buffer.concat(parts).toString('utf8'))); }
          catch { reject(new AssistantError(502, 'Format respons penyedia AI belum kompatibel.')); }
        });
      });
      req.on('error', reject);
      req.end(payload);
    });
  } catch (error) {
    if (error instanceof AssistantError) throw error;
    if (deadline.aborted) throw new AssistantError(504, 'Penyedia AI terlalu lama merespons.');
    throw new AssistantError(502, 'Penyedia AI tidak dapat dihubungi.');
  }
}
module.exports = { AssistantError, baseUrl, publicAddress, providerRequest };
