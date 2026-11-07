// SQL contract double: no driver, socket, database or external service.
const clone = value => structuredClone(value);
function mockPool(state = { inbox: [], outbox: [], orders: [], keys: [], audit: [] }) {
  let tail = Promise.resolve();
  const pool = { state, calls: [], failAt: null, async getConnection() {
    const previous = tail; let unlock; tail = new Promise(resolve => { unlock = resolve; }); await previous;
    let snapshot;
    return {
      async beginTransaction() { snapshot = clone(state); },
      async commit() {},
      async rollback() { for (const key of Object.keys(state)) state[key] = snapshot[key]; },
      release() { unlock(); },
      async execute(sql, p = []) {
        pool.calls.push(sql);
        if (pool.failAt && sql.includes(pool.failAt)) throw Error('Synthetic failure');
        let rows = [], row;
        if (sql.startsWith('INSERT INTO hd2_courier_')) {
          const inbox = sql.includes('inbox'), table = inbox ? state.inbox : state.outbox, key = inbox ? 'update_id' : 'idem_key';
          if (!table.some(r => r.bot_id === p[1] && r[key] === p[2])) table.push({ id: p[0], bot_id: p[1], [key]: p[2], payload_hash: p[3], payload: p[4], due_ms: p[5], state: inbox ? 'PENDING' : 'QUEUED', attempts: 0 });
        } else if (sql.startsWith('SELECT') && sql.includes('hd2_courier_')) {
          const table = sql.includes('hd2_courier_inbox') ? state.inbox : state.outbox;
          if (sql.includes('update_id=?')) rows = table.filter(r => r.bot_id === p[0] && r.update_id === p[1]);
          else if (sql.includes('idem_key=?')) rows = table.filter(r => r.bot_id === p[0] && r.idem_key === p[1]);
          else if (sql.includes('WHERE id=?')) rows = table.filter(r => r.id === p[0] && r.bot_id === p[1]);
          else if (sql.includes("state='SENDING'")) rows = table.filter(r => r.bot_id === p[0] && r.state === 'SENDING' && r.lease_until_ms <= p[1]).slice(0, 100);
          else if (sql.includes("state='QUEUED'")) rows = table.filter(r => r.bot_id === p[0] && r.state === 'QUEUED' && r.due_ms <= p[1] && r.attempts < p[2]).sort((a,b) => a.due_ms-b.due_ms || a.id.localeCompare(b.id)).slice(0,p[3]);
          else if (sql.includes("state='PENDING'")) rows = table.filter(r => r.bot_id === p[0] && r.state === 'PENDING' && r.due_ms <= p[1]).sort((a,b) => a.due_ms-b.due_ms || a.id.localeCompare(b.id)).slice(0,1);
          else throw Error('Unrecognized SELECT');
        } else if (sql.startsWith('UPDATE hd2_courier_outbox')) {
          row = state.outbox.find(r => r.id === p.at(-2) && r.bot_id === p.at(-1));
          if (!row) throw Error('Missing outbox');
          if (sql.includes("state='SENDING'")) Object.assign(row,{state:'SENDING',attempts:row.attempts+1,lease_token:p[0],lease_until_ms:p[1]});
          else if (sql.includes('last_ack_token')) Object.assign(row,{state:p[0],due_ms:p[1],last_ack_token:p[2],last_ack_hash:p[3],telegram_message_id:p[4],last_error_code:p[5]});
          else Object.assign(row,{state:p[0],due_ms:p[1],last_error_code:p[2]});
        } else if (sql.startsWith('UPDATE hd2_courier_inbox')) {
          row = state.inbox.find(r => r.id === p.at(-2) && r.bot_id === p.at(-1));
          if (sql.includes('processed_at')) Object.assign(row,{state:p[0],attempts:row.attempts+1});
          else Object.assign(row,{attempts:p[0],state:p[1],due_ms:p[2],last_error_code:p[3]});
        } else throw Error('Unrecognized SQL contract');
        return [clone(rows)];
      }
    };
  }};
  return pool;
}
module.exports = { mockPool };
