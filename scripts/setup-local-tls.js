const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { X509Certificate } = require('node:crypto');
const dir = path.resolve(__dirname, '../.local/tls');
const openssl = process.env.HDWORK2_OPENSSL || 'C:/Program Files/Git/usr/bin/openssl.exe';
function run(args) {
  const result = spawnSync(openssl, args, { windowsHide: true, stdio: 'ignore' });
  if (result.status !== 0) throw Error('Pembuatan sertifikat gagal; periksa OpenSSL lokal');
}
function main() {
  const cert = path.join(dir, 'localhost.crt');
  if (fs.existsSync(cert) && fs.existsSync(path.join(dir, 'localhost.key')) && fs.existsSync(path.join(dir, 'ca.crt'))) {
    if (!new X509Certificate(fs.readFileSync(cert)).checkHost('localhost')) throw Error('Sertifikat existing tidak sesuai');
    console.log('Sertifikat lokal dipertahankan. Trust store tidak diubah.'); return;
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (fs.readdirSync(dir).length) throw Error('Direktori TLS berisi file; tidak ditimpa');
  run(['req','-x509','-newkey','rsa:2048','-nodes','-sha256','-days','30','-subj','/CN=HD Work Local Development CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-keyout',path.join(dir,'ca.key'),'-out',path.join(dir,'ca.crt')]);
  run(['req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=localhost','-keyout',path.join(dir,'localhost.key'),'-out',path.join(dir,'localhost.csr')]);
  const ext = path.join(dir, 'localhost.ext');
  fs.writeFileSync(ext, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n');
  run(['x509','-req','-in',path.join(dir,'localhost.csr'),'-CA',path.join(dir,'ca.crt'),'-CAkey',path.join(dir,'ca.key'),'-CAcreateserial','-days','30','-sha256','-extfile',ext,'-out',cert]);
  console.log('Sertifikat localhost dibuat (30 hari). Trust store tidak diubah; CA hanya untuk pengujian lokal.');
}
try { main(); } catch { console.error('TLS lokal belum siap; periksa direktori privat/OpenSSL. File existing tidak ditimpa.'); process.exitCode = 1; }
