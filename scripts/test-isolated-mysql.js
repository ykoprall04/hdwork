// Owns a short-lived MySQL instance. Never connects to the system's port 3306.
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawn } = require('node:child_process'), { randomBytes } = require('node:crypto');
const mysql = require('mysql2/promise');
const {schemaStatements,childEnvironment}=require('../tests/helpers/e2e-contracts.cjs');
const root = path.resolve(__dirname, '..');
const base = process.env.HDWORK2_TEST_MYSQL_BASE || 'C:/Program Files/MySQL/MySQL Server 8.4';
const mysqld = path.join(base, 'bin/mysqld.exe');
const port = 13316;
const wait = ms => new Promise(r => setTimeout(r, ms));
function launch(args, log) {
  const child = spawn(mysqld, ['--no-defaults', ...args], { windowsHide: true, env:childEnvironment(), stdio: ['ignore', log, log] });
  child.on('error', () => {}); return child;
}
async function finished(child) { return new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(Error('Private MySQL process failed'))); }); }
async function main() {
  if (process.argv[2] !== '--private-instance-only' || process.argv.length > 4 || (process.argv[3] && process.argv[3] !== '--browser')) throw Error('Explicit private test flag required');
  if(process.argv[3]==='--browser')process.env.HDWORK2_BROWSER_TEST='true';
  if (!fs.existsSync(mysqld)) throw Error('Private MySQL binary unavailable');
  await new Promise((resolve, reject) => { const check = net.createServer(); check.once('error', reject); check.listen(port, '127.0.0.1', () => check.close(resolve)); });
  const localRoot = path.join(root, '.local'); fs.mkdirSync(localRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(localRoot, 'mysql-test-'));
  const log = fs.openSync(path.join(dir, 'server.log'), 'a');
  const datadir = path.join(dir, 'data');
  let child, admin;
  try {
    console.log('Menyiapkan instance MySQL uji privat pada loopback:13316 (bukan service utama).');
    await finished(launch(['--initialize-insecure', '--basedir=' + base, '--datadir=' + datadir], log));
    child = launch(['--standalone','--console','--basedir=' + base,'--datadir=' + datadir,'--port=' + port,'--bind-address=127.0.0.1','--mysqlx=OFF','--skip-log-bin','--performance-schema=OFF','--innodb-buffer-pool-size=32M','--max-connections=20','--partial-revokes=ON'], log);
    for (let i = 0; i < 90; i++) {
      if (child.exitCode !== null) throw Error('Private instance stopped');
      try { admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', connectTimeout: 1000 }); break; }
      catch { await wait(500); }
    }
    if (!admin) throw Error('Private instance not ready');
    const [[instance]] = await admin.query('SELECT @@port AS port,@@datadir AS dir');
    if (Number(instance.port) !== port || path.resolve(instance.dir).toLowerCase() !== path.resolve(datadir).toLowerCase()) throw Error('Private target rejected');
    await admin.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [randomBytes(32).toString('base64url')]);
    async function target() {
      const suffix = randomBytes(8).toString('hex'), database = 'hdwork2_test_' + suffix, user = 'hdwork2_test_' + suffix, password = randomBytes(32).toString('base64url');
      await admin.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4');
      await admin.query('CREATE USER ?@? IDENTIFIED BY ?', [user, '127.0.0.1', password]);
      await admin.query('GRANT ALL PRIVILEGES ON `' + database + '`.* TO ?@?', [user, '127.0.0.1']);
      const env = { HDWORK2_MYSQL_TEST_ENABLE: 'DISPOSABLE_ONLY', HDWORK2_MYSQL_TEST_DATABASE: database, HDWORK2_MYSQL_TEST_USER: user, HDWORK2_MYSQL_TEST_PASSWORD: password, HDWORK2_MYSQL_TEST_HOST: '127.0.0.1', HDWORK2_MYSQL_TEST_PORT: String(port) };
      return env;
    }
    // Existing rehearsals populate only new, guarded hdwork2_test_* schemas.
    for (const [file,flag] of [['mysql-auth.cjs','--run-auth-disposable'],['mysql-operations.cjs','--run-operations-disposable'],['mysql-courier-integration.cjs','--run-courier-disposable'],['mysql-system.cjs','--run-system-disposable'],['mysql-chat.cjs','--run-chat-disposable'],['mysql-b2c.cjs','--run-b2c-disposable'],['mysql-full-workflow.cjs','--run-full-disposable']]) {
      // Fresh process prevents environment flags, cached pools and auth sessions crossing suites.
      const suite=spawn(process.execPath,[path.join(root,'tests/integration',file),flag],{cwd:root,env:childEnvironment(process.env,await target()),windowsHide:true,stdio:['ignore','pipe','ignore']});
      let output='';suite.stdout.on('data',b=>output+=b);
      const code=await new Promise((resolve,reject)=>{suite.once('error',reject);suite.once('exit',resolve);});
      if(code!==0)throw Error('Disposable suite failed: '+file);
      console.log(output.trim());
    }
    const env = await target(), guard = require('../ops/mysql/disposable-guard');
    const pool = mysql.createPool(guard.config(env, ['--run-disposable']));
    try {
      const c = await pool.getConnection();
      try {
        await guard.verifyTarget(c, env.HDWORK2_MYSQL_TEST_DATABASE);
        for (const sql of guard.migrationStatements()) await c.query(sql);
        for(const sql of schemaStatements())await c.query(sql);
      } finally { c.release(); }
      console.log(JSON.stringify({ suite: 'local-base-web', ...await require('../tests/integration/local-base-web.cjs').exercise(pool) }));
    } finally { await pool.end(); }
  } finally {
    if (admin) { try { await admin.query('SHUTDOWN'); } catch { /* only this owned instance */ } await admin.end().catch(() => {}); }
    if (child && child.exitCode === null) {
      for (let i = 0; i < 30 && child.exitCode === null; i++) await wait(200);
      if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
    }
    fs.closeSync(log);
    // Delete only the exact temporary directory created above, after its server stopped.
    const resolved = path.resolve(dir), expected = path.resolve(localRoot) + path.sep;
    if (resolved.startsWith(expected) && /^mysql-test-[a-zA-Z0-9]+$/.test(path.basename(resolved)) && (!child || child.exitCode !== null)) fs.rmSync(resolved, { recursive: true, force: true });
    console.log('Instance MySQL uji dihentikan; tidak ada perubahan service/PM2/database utama.');
  }
}
main().catch(error => { console.error('Integrasi privat gagal; kode aman: ' + (error.code || error.name || 'UNKNOWN'));if(error.browserDiagnostic)console.error('BROWSER_DIAGNOSTIC '+JSON.stringify(error.browserDiagnostic));process.exitCode = 1; });
