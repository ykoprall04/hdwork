const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { AssistantError } = require('./provider');
const { seed, upgradeDefaultGuides } = require('./knowledge');

const MAX_FILE = 2 * 1024 * 1024;
const initial = () => ({ schema: 1, enabled: false, verified: false, baseUrl: 'https://api.dinero.web.id/v1', model: '', apiKey: '', articles: structuredClone(seed) });

function dpapi(action, bytes) {
  if (process.platform !== 'win32') return Promise.reject(Error('Windows DPAPI required'));
  const command = [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.Security',
    '$buffer=[Convert]::FromBase64String([Console]::In.ReadToEnd())',
    `$result=[Security.Cryptography.ProtectedData]::${action}($buffer,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    '[Console]::Write([Convert]::ToBase64String($result))'
  ].join('; ');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], signal: AbortSignal.timeout(10000)
    });
    const output = [];
    let length = 0;
    child.stdout.on('data', chunk => {
      length += chunk.length;
      if (length > MAX_FILE * 2) child.kill();
      else output.push(chunk);
    });
    child.stdin.on('error', reject);
    child.on('error', reject);
    child.on('close', code => code === 0 && length > 0 && length <= MAX_FILE * 2
      ? resolve(Buffer.from(Buffer.concat(output).toString(), 'base64')) : reject(Error('DPAPI unavailable')));
    child.stdin.end(bytes.toString('base64'));
  });
}

function createStore(directory, { seal = bytes => dpapi('Protect', bytes), open = bytes => dpapi('Unprotect', bytes) } = {}) {
  let cached, queue = Promise.resolve();
  const busy = work => {
    const current = queue.then(work);
    queue = current.catch(() => {});
    return current;
  };
  async function folder() {
    if (!directory || !path.isAbsolute(directory)) throw new AssistantError(503, 'Penyimpanan privat Tanya Yanto belum dikonfigurasi.');
    const actual = await fs.realpath(directory);
    const repo = path.resolve(__dirname, '../..');
    const relative = path.relative(repo, actual);
    if (actual === path.parse(actual).root || !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) {
      throw new AssistantError(503, 'Direktori Tanya Yanto harus berada di luar direktori aplikasi.');
    }
    return actual;
  }
  async function read(name, missing) {
    const file = path.join(await folder(), name);
    let info;
    try { info = await fs.lstat(file); }
    catch (error) { if (error.code === 'ENOENT') return missing(); throw error; }
    if (!info.isFile() || info.size > MAX_FILE) throw Error('Invalid state file');
    const data = JSON.parse((await open(await fs.readFile(file))).toString('utf8'));
    if (data.schema !== 1 || typeof data.enabled !== 'boolean' || typeof data.apiKey !== 'string' ||
        typeof data.model !== 'string' || typeof data.baseUrl !== 'string' || !Array.isArray(data.articles)) throw Error('Invalid state version');
    return { ...data, articles: upgradeDefaultGuides(data.articles) };
  }
  async function write(name, data) {
    const parent = await folder();
    const bytes = await seal(Buffer.from(JSON.stringify(data)));
    if (bytes.length > MAX_FILE) throw new AssistantError(409, 'Knowledge Base melewati kapasitas penyimpanan.');
    const temp = path.join(parent, '.tanya-' + randomUUID() + '.tmp');
    try {
      const handle = await fs.open(temp, 'wx', 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); }
      finally { await handle.close(); }
      await fs.rename(temp, path.join(parent, name));
    } finally { await fs.rm(temp, { force: true }); }
  }
  const stateFile = 'tanya-state.dpapi', backupFile = 'tanya-backup.dpapi';
  const load = async () => cached ??= await read(stateFile, initial);
  return {
    get: () => busy(load),
    update: change => busy(async () => {
      const data = change(structuredClone(await load()));
      await write(stateFile, data);
      cached = data;
      return data;
    }),
    backupAvailable: () => busy(async () => {
      try { return (await fs.lstat(path.join(await folder(), backupFile))).isFile(); }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    }),
    backup: () => busy(async () => { await write(backupFile, await load()); }),
    restore: () => busy(async () => {
      const data = await read(backupFile, () => { throw new AssistantError(404, 'Backup belum tersedia.'); });
      // Keep the current state recoverable if an administrator restores an older backup.
      const current = await load().catch(() => null);
      if (current) await write('tanya-before-restore.dpapi', current);
      const restored = { ...data, enabled: false, verified: false };
      await write(stateFile, restored);
      cached = restored;
    })
  };
}
module.exports = { createStore };
