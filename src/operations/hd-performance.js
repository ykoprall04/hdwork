const { randomUUID } = require('node:crypto');
const { chartSelection } = require('./recap-chart');
const { filters, fail } = require('./policy');
const { readTx } = require('./read');
const { digest } = require('../access/service');
const { run } = require('./transaction-gate');

const commands = ['order', 'config_psb', 'mo', 'req'];
const offset = 7 * 3600000;
const day = 86400000;
const calendarDate = ms => new Date(ms).toISOString().slice(0, 10);
const utcSql = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const viewer = user => {
  if (!['HD', 'ADMIN', 'SUPER_ADMIN'].includes(user?.role) || user.username === 'trial_yanto') throw fail(403);
};
const validWeight = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000 && /^\d+(?:\.\d{1,2})?$/.test(String(value));
const weightError = () => fail(503, 'Pengaturan bobot belum tersedia. Hubungi administrator.');

async function readWeights(connection, lock = false) {
  const [rows] = await connection.execute(
    'SELECT command, done_weight, failed_weight, version FROM hd2_performance_weights ORDER BY command' + (lock ? ' FOR UPDATE' : '')
  );
  const weights = {}, versions = [];
  for (const command of commands) {
    const row = rows.find(row => row.command === command);
    if (!row || row.done_weight == null || row.failed_weight == null || !validWeight(Number(row.done_weight)) ||
        !validWeight(Number(row.failed_weight)) || !Number.isSafeInteger(Number(row.version)) || Number(row.version) < 0) throw weightError();
    weights[command] = { done: Number(row.done_weight), failed: Number(row.failed_weight) };
    versions.push(row.version);
  }
  return { weights, version: versions.join(':') };
}

// Current finalization is a single order row. EXISTS corroborates a Web action,
// even when the audit has repeated rows. A reopened order loses finished_at.
const verified = `EXISTS (
  SELECT 1 FROM hd2_audit a
  WHERE a.order_id=o.id AND a.user_id=o.final_user_id AND a.inbox_id IS NULL
    AND a.action=o.status AND a.to_status=o.status AND a.from_status='IN_PROGRESS'
    AND a.created_at>=o.finished_at
)`;
const placeholders = list => list.map(() => '?').join(',');
const activeHd = "u.role='HD' AND u.is_active=TRUE";

async function performance(pool, query, user) {
  viewer(user);
  const { area, start, end, commands: selected } = chartSelection(query);
  const moduleFilter = scope => filters({ area: scope === 'ALL' ? 'B2C' : scope }, user, { recap: true }).allowed;
  const allowed = moduleFilter(area);
  const yearModules = moduleFilter('ALL');
  const filterSql = (modules, selectedCommands) => `o.access_module IN (${placeholders(modules)})
    AND o.command IN (${placeholders(selectedCommands)}) AND o.status IN ('DONE','FAILED')
    AND o.finished_at IS NOT NULL AND ${activeHd} AND ${verified}`;
  return readTx(pool, async connection => {
    const config = await readWeights(connection);
    const [people] = await connection.execute(`SELECT u.id,u.name FROM users u WHERE ${activeHd} ORDER BY u.name,u.id`);
    const [rows] = allowed.length ? await connection.execute(
      `SELECT o.final_user_id AS id,o.command,o.status,COUNT(*) AS count
       FROM hd2_orders o JOIN users u ON u.id=o.final_user_id
       WHERE ${filterSql(allowed, selected)} AND o.finished_at>=? AND o.finished_at<?
       GROUP BY o.final_user_id,o.command,o.status`,
      [...allowed, ...selected, utcSql(start - offset), utcSql(end - offset)]
    ) : [[]];
    const [yearRows] = yearModules.length ? await connection.execute(
      `SELECT DISTINCT YEAR(DATE_ADD(o.finished_at, INTERVAL 7 HOUR)) AS year
       FROM hd2_orders o JOIN users u ON u.id=o.final_user_id
       WHERE ${filterSql(yearModules, commands)} ORDER BY year DESC`, [...yearModules, ...commands]
    ) : [[]];

    const byId = new Map(people.map(person => [String(person.id), {
      id: String(person.id), name: person.name,
      commands: Object.fromEntries(commands.map(command => [command, { done: 0, failed: 0, points: 0 }])),
      done: 0, failed: 0, points: 0
    }]));
    let totalCents = 0, done = 0, failed = 0;
    for (const row of rows) {
      const person = byId.get(String(row.id));
      const status = row.status === 'DONE' ? 'done' : 'failed';
      person.commands[row.command][status] = Number(row.count);
    }
    for (const person of byId.values()) {
      let personCents = 0;
      for (const command of commands) {
        const stats = person.commands[command], weight = config.weights[command];
        const cents = stats.done * Math.round(weight.done * 100) + stats.failed * Math.round(weight.failed * 100);
        stats.points = cents / 100;
        personCents += cents;
        person.done += stats.done;
        person.failed += stats.failed;
      }
      person.points = personCents / 100;
      totalCents += personCents;
      done += person.done;
      failed += person.failed;
    }
    const active = people.length;
    return {
      ...config, people: [...byId.values()], commands: commands.filter(command => selected.includes(command)),
      years: yearRows.map(row => Number(row.year)), from: calendarDate(start), to: calendarDate(end - day),
      totals: { done, failed, points: totalCents / 100, active, average: active ? totalCents / 100 / active : 0 }
    };
  });
}

async function saveWeights(pool, user, token, input) {
  if (user?.role !== 'SUPER_ADMIN') throw fail(403);
  if (!input || Object.keys(input).length !== 2 || typeof input.version !== 'string' ||
      !/^\d{1,10}(:\d{1,10}){3}$/.test(input.version) ||
      !input.weights || Object.keys(input.weights).length !== commands.length ||
      commands.some(command => {
        const value = input.weights[command];
        return !value || Object.keys(value).length !== 2 || !validWeight(value.done) || !validWeight(value.failed);
      })) throw fail();
  return run(async () => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[actor]] = await connection.execute('SELECT role,is_active FROM users WHERE id=? FOR SHARE', [user.id]);
      if (actor?.role !== 'SUPER_ADMIN' || ![true, 1].includes(actor.is_active)) throw fail(403);
      const [[session]] = await connection.execute(
        'SELECT token_hash FROM hd2_sessions WHERE token_hash=? AND user_id=? AND revoked=FALSE AND expires_at>UTC_TIMESTAMP(3) FOR SHARE',
        [digest(token), user.id]
      );
      if (!session) throw fail(401);
      const previous = await readWeights(connection, true);
      if (previous.version !== input.version) throw fail(409, 'Bobot sudah berubah. Muat ulang untuk melihat bobot terbaru.');
      const next = Object.fromEntries(commands.map(command => [command, {
        done: input.weights[command].done, failed: input.weights[command].failed
      }]));
      let changed = false;
      for (const command of commands) {
        if (previous.weights[command].done === next[command].done && previous.weights[command].failed === next[command].failed) continue;
        changed = true;
        await connection.execute(
          'UPDATE hd2_performance_weights SET done_weight=?, failed_weight=?, version=version+1 WHERE command=?',
          [next[command].done, next[command].failed, command]
        );
      }
      if (changed) await connection.execute('INSERT INTO hd2_audit(id,action,user_id,detail) VALUES (?,?,?,?)', [
        randomUUID(), 'HD_PERFORMANCE_WEIGHTS_CHANGED', user.id, JSON.stringify({ before: previous.weights, after: next })
      ]);
      const saved = changed ? await readWeights(connection) : previous;
      await connection.commit();
      return saved;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
}

module.exports = { performance, saveWeights };
