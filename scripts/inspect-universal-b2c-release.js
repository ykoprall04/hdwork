// Operator-run compatibility check: existing native reader, metadata SELECTs only.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { hash, configuration } = require('./courier-task-runner');
const { read } = require('./prepare-shared-groups-release');
const { migration, metadataSql } = require('./backup-shared-group-metadata');
const TARGET = '126b2defd524335d05ea8b364a90b2da09202459';
const FILES = ['src/courier/shared-group.js', 'src/system/store.js', 'src/operations/b2c-readiness.js'];
async function runtime(input, { probe = require('./inspect-b2c-windows-release').probe, loadConfiguration = configuration, readFile = read, git = cp.execFileSync, validatePlan = require('../src/config/production-courier').validate } = {}) {
  if (!input || input.webProcessVerified !== true || !/^S-1-[0-9-]+$/.test(input.ownerSid || '') || !/^[a-f0-9]{64}$/.test(input.configSha256 || '')) throw Error('VERIFIED_WINDOWS_RUNTIME_METADATA_REQUIRED');
  for (const key of ['runtimeRoot', 'candidateRoot', 'courierConfig']) if (!path.isAbsolute(input[key] || '')) throw Error('ABSOLUTE_INSPECTION_PATH_REQUIRED');
  git('git', ['diff', '--exit-code', TARGET, '--', 'src', 'contracts', 'courier_bot/courier', 'courier-b2c-server.js', 'package.json', 'package-lock.json'], { cwd: input.candidateRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  const cfg = loadConfiguration(input.courierConfig, input.configSha256);
  if (cfg.ownerSid !== input.ownerSid) throw Error('COURIER_OWNER_MISMATCH');
  const plan = validatePlan(JSON.parse(readFile(cfg.productionPlan)));
  const envBytes = readFile(path.join(input.runtimeRoot, 'service/environment.json')), env = JSON.parse(envBytes);
  if (Object.keys(env).some(k => /(PASSWORD|TOKEN|SECRET|SERVICE_KEY|IDENTITY_KEY)$/.test(k) && !k.endsWith('_DPAPI_FILE'))) throw Error('PLAINTEXT_ENVIRONMENT_REJECTED');
  const files = FILES.map(file => {
    const desired = git('git', ['show', TARGET + ':' + file], { cwd: input.candidateRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    const web = readFile(path.join(input.runtimeRoot, file)), courier = readFile(path.join(cfg.snapshot, file));
    const same = bytes => bytes.toString('utf8').replace(/\r\n/g, '\n') === desired.toString('utf8').replace(/\r\n/g, '\n');
    return { file, candidateSha256: hash(desired), webSha256: hash(web), courierSha256: hash(courier), webTargetMatch: same(web), courierTargetMatch: same(courier), pinnedByCourier: Object.hasOwn(cfg.sourceHashes, file) };
  });
  const auto = path.dirname(input.courierConfig), review = JSON.parse(readFile(path.join(auto, 'autostart.review.json')));
  if (review.ownerSid !== input.ownerSid || review.configSha256 !== input.configSha256 || review.taskName !== 'HDWork2-LiveChat-Courier' || hash(readFile(path.join(auto, 'run-owner.ps1'))) !== review.wrapperSha256 || hash(readFile(path.join(auto, 'courier-task-runner.js'))) !== review.runnerSha256) throw Error('COURIER_LAUNCHER_REVIEW_CHANGED');
  const activeDist = require('../src/config/web-build').webBuild(input.runtimeRoot, env);
  const frontend = await probe(input.runtimeRoot, env, activeDist);
  return { cfg, env, environmentSha256: hash(envBytes), report: { status: 'UNIVERSAL_B2C_RUNTIME_READ_ONLY_PASS', applicationCommit: TARGET, webRuntime: input.runtimeRoot, courierSnapshot: cfg.snapshot, courierConfig: input.courierConfig, courierConfigSha256: input.configSha256, courierLauncherVerified: true, courierProcess: input.courierProcess || null, productionPlanSha256: cfg.productionPlanSha256, sharedGroupsWeb: env.HDWORK2_SHARED_GROUPS_ENABLED === 'true', courierRoutingMode: plan.routingMode || 'LEGACY_PINNED', activationNotBefore: plan.activationNotBefore, activeDist, files, frontend, runtimeChanged: false, telegramAccessed: false } };
}
async function schema({ env, readPassword, botId, connect = require('mysql2/promise').createConnection, now = Date.now }) {
  if (typeof readPassword !== 'string' || !readPassword) throw Error('NATIVE_READ_PASSWORD_REQUIRED');
  const { connectionLimit, queueLimit, waitForConnections, ...options } = require('../src/config/operational-pools').options('read', env);
  let c;
  try {
    c = await connect({ ...options, password: readPassword });
    const [[identity]] = await c.query('SELECT CURRENT_USER() AS account,DATABASE() AS db');
    if (identity.account !== 'hdwork_ops_read@localhost' || identity.db !== 'hdwork2') throw Error('NATIVE_READ_IDENTITY_MISMATCH');
    const [grants] = await c.query('SHOW GRANTS FOR CURRENT_USER');
    if (!require('../src/config/operational-grants').reviewOperationalGrants(grants, 'chatRead').ok) throw Error('NATIVE_READ_GRANTS_REJECTED');
    await c.query('SET TRANSACTION READ ONLY'); await c.beginTransaction();
    const [columns] = await c.query(metadataSql.columns), [checks] = await c.query(metadataSql.checks);
    const state = migration(checks, columns.map(column => column.name));
    const name = columns.find(c => c.name === 'group_name'), boundary = columns.find(c => c.name === 'blocked_before');
    const compatible = state.status === 'ALREADY_PRESENT' && name.type === 'varchar' && Number(name.maximumLength) === 100 && name.nullable === 'NO' && boundary.type === 'datetime' && Number(boundary.precision) === 3 && boundary.nullable === 'YES';
    const [rows] = await c.query('SELECT id,category,profile,chat_id,thread_id,enabled,verified,version FROM hd2_system_mappings WHERE bot_id=? ORDER BY id', [botId]);
    const [[worker]] = await c.query('SELECT expires_ms FROM hd2_courier_workers WHERE bot_id=?', [botId]);
    const active = rows.filter(row => [true, 1].includes(row.enabled) && [true, 1].includes(row.verified));
    // Validate effective routes without exposing destinations or changing mappings.
    const groups = active.map(r => ({ chatId: r.chat_id, threadId: r.thread_id, threadMode: r.thread_id === null ? 'non_topic' : 'thread', profile: r.profile, commands: require('../src/system/policy').categories[r.category].commands }));
    const effective = require('../src/courier/shared-group').universalB2CGroups(groups);
    const coverage = effective.length ? require('../src/operations/b2c-readiness').routes(effective) : { configured: false, categories: [] };
    await c.commit();
    return { status: compatible ? 'UNIVERSAL_B2C_SCHEMA_COMPATIBLE' : 'SHARED_GROUP_SCHEMA_REVIEW_REQUIRED', migration014: state.status, schemaCompatible: compatible, existingTableGrantsVerified: true, mappingCount: rows.length, activeVerifiedMappingCount: active.length, mappingSha256: hash(Buffer.from(JSON.stringify(rows))), mappingProfiles: [...new Set(active.map(r => r.category + '/' + r.profile))], effectiveB2CCoverage: coverage.configured, coverageIsCandidateOnly: true, courierLeaseActive: Number(worker?.expires_ms || 0) > now(), migrationRequiredByUniversalChange: false, sqlWrites: false, orderRowsRead: false, queueRowsRead: false };
  } finally { readPassword = ''; if (c) await c.end(); }
}
async function main() {
  const mode = process.argv[2]; if (process.argv.length !== 3 || !['--runtime', '--schema'].includes(mode)) throw Error('EXPLICIT_READ_ONLY_INSPECTION_MODE_REQUIRED');
  const input = await require('./office-web-service').bootstrap(process.stdin, { validate: value => value });
  try {
    const result = await runtime(input);
    if (mode === '--schema') {
      result.report.database = await schema({ env: result.env, readPassword: input.readPassword, botId: result.cfg.botId });
      configuration(input.courierConfig, input.configSha256);
      if (hash(read(path.join(input.runtimeRoot, 'service/environment.json'))) !== result.environmentSha256) throw Error('WEB_ENVIRONMENT_CHANGED_DURING_INSPECTION');
    }
    result.report.deploymentReady = false;
    result.report.blockers = ['COORDINATED_RELEASE_PACKET_NOT_PREPARED'];
    if (!result.report.sharedGroupsWeb) result.report.blockers.push('WEB_SHARED_MODE_REQUIRES_REVIEW');
    if (result.report.courierRoutingMode !== 'database') result.report.blockers.push('COURIER_LEGACY_PLAN_REQUIRES_REVIEW');
    if (result.report.database && !result.report.database.schemaCompatible) result.report.blockers.push('EXISTING_SHARED_SCHEMA_NOT_COMPATIBLE');
    if (result.report.database && !result.report.database.courierLeaseActive) result.report.blockers.push('COURIER_LEASE_NOT_ACTIVE');
    result.report.nextStep = mode === '--runtime' ? 'COLLECT_NATIVE_READ_ONLY_SCHEMA_METADATA' : result.report.blockers.length === 1 ? 'PREPARE_COORDINATED_RELEASE_FROM_VERIFIED_BASELINE' : 'REVIEW_REPORTED_COMPATIBILITY_BLOCKERS_NO_RUNTIME_CHANGES';
    console.log(JSON.stringify(result.report, null, 2));
  } finally { input.readPassword = ''; }
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ status: 'UNIVERSAL_B2C_INSPECTION_FAILED', code: /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : error.code === 'ENOENT' ? 'INSPECTION_FILE_MISSING' : 'READ_ONLY_INSPECTION_FAILED', runtimeChanged: false, sqlWrites: false, telegramAccessed: false })); process.exitCode = 1; });
module.exports = { TARGET, FILES, runtime, schema };
