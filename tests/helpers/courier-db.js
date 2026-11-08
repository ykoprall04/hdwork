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
        } else if (sql.startsWith('INSERT INTO hd2_tial_keys')) {
          state.tialKeys ||= [];if(!state.tialKeys.some(r=>r.dedupe_key===p[0]))state.tialKeys.push({dedupe_key:p[0],order_id:null});
        } else if (sql.startsWith('SELECT order_id FROM hd2_tial_keys')) {
          rows=state.tialKeys.filter(r=>r.dedupe_key===p[0]);
        } else if (sql.startsWith('UPDATE hd2_tial_keys')) {
          state.tialKeys.find(r=>r.dedupe_key===p[1]).order_id=p[0];
        } else if (sql.startsWith('INSERT INTO hd2_daily_keys')) {
          if (!state.keys.some(r=>r.bot_id===p[0] && r.module===p[1] && r.business_day===p[2] && r.dedupe_key===p[3])) state.keys.push({bot_id:p[0],module:p[1],business_day:p[2],dedupe_key:p[3],order_id:null});
        } else if (sql.startsWith('SELECT order_id FROM hd2_daily_keys')) {
          rows=state.keys.filter(r=>r.bot_id===p[0] && r.module===p[1] && r.business_day===p[2] && r.dedupe_key===p[3]);
        } else if (sql.startsWith('UPDATE hd2_daily_keys')) {
          row=state.keys.find(r=>r.bot_id===p[1] && r.module===p[2] && r.business_day===p[3] && r.dedupe_key===p[4]); row.order_id=p[0];
        } else if (sql.startsWith('SELECT * FROM hd2_orders')) {
          rows=state.orders.filter(r=>r.bot_id===p[0] && r.chat_id===p[1] && r.message_id===p[2]);
        } else if (sql.startsWith('INSERT INTO hd2_orders')) {
          if (state.orders.some(r=>r.bot_id===p[1] && r.chat_id===p[4] && r.message_id===p[5])) throw Error('Unique original message');
          const names=['id','bot_id','module','business_day','chat_id','message_id','thread_id','sc_in','inet','status','duplicate_of','command','command_fields','raw_text','sender_id','telegram_timestamp'];
          state.orders.push(Object.fromEntries(names.map((name,i)=>[name,p[i]])));
        } else if (sql.startsWith('UPDATE hd2_orders')) {
          row=state.orders.find(r=>r.id===p[4] && r.bot_id===p[5]);
          Object.assign(row,{status:p[0],last_actor_id:p[1]});
          if (p[0]==='IN_PROGRESS') row.started_at='mock-processing-time'; else row.finished_at='mock-processing-time';
        } else if (sql.startsWith('INSERT INTO hd2_audit')) {
          const names=['id','inbox_id','order_id','action','actor_id','from_status','to_status','detail'];
          state.audit.push(Object.fromEntries(names.map((name,i)=>[name,p[i]])));
        } else throw Error('Unrecognized SQL contract');
        return [clone(rows)];
      }
    };
  }};
  return pool;
}
module.exports = { mockPool };
