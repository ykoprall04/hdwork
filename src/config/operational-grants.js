// Exact table/column allowlists. SHOW GRANTS only, never changes permissions.
const read={hd2_orders:['SELECT'],hd2_audit:['SELECT'],hd2_live_events:['SELECT'],hd2_user_modules:['SELECT'],hd2_web_requests:['SELECT (order_id, request_id, user_id)'],hd2_courier_outbox:['SELECT (bot_id, created_at, id, idem_key, last_error_code, lease_until_ms, state, telegram_message_id)'],users:['SELECT (id, is_active, name, role)']};
const write={users:read.users,hd2_user_modules:['SELECT'],hd2_sessions:['SELECT'],hd2_orders:['SELECT','UPDATE (completion_note, duplicate_decision, final_user_id, finished_at, owner_user_id, started_at, status, version)'],hd2_audit:['INSERT'],hd2_web_requests:['SELECT','INSERT','UPDATE'],hd2_live_events:['INSERT'],hd2_courier_outbox:['SELECT','INSERT','UPDATE (id)']};
const courier={hd2_orders:['SELECT','INSERT'],hd2_courier_inbox:['SELECT','INSERT','UPDATE'],hd2_daily_keys:['SELECT','INSERT','UPDATE'],hd2_tial_keys:['SELECT','INSERT','UPDATE'],hd2_audit:['INSERT'],hd2_live_events:['INSERT'],hd2_courier_workers:['SELECT','INSERT','UPDATE'],hd2_courier_nonces:['SELECT','INSERT','DELETE']};
const courierSend={...courier,hd2_courier_outbox:['SELECT','INSERT','UPDATE']};
const trialWrite={...write,users:['SELECT (id, is_active, name, role, username)'],hd2_orders:['SELECT','UPDATE (completion_note, duplicate_decision, final_user_id, finished_at, owner_user_id, started_at, status, version)'],hd2_audit:['SELECT','INSERT'],hd2_courier_outbox:['SELECT','INSERT','UPDATE']};
const policies={read,write,courier,courierSend,trialWrite};
function privileges(text){
 const parts=text.match(/[A-Z_ ]+(?:\s*\([^)]*\))?(?=,|$)/gi)||[];
 return parts.map(p=>{const m=/^\s*([A-Z_ ]+?)(?:\s*\(([^)]*)\))?\s*$/i.exec(p);if(!m)throw Error('Grant rejected');return m[1].trim().toUpperCase()+(m[2]?' ('+m[2].replace(/`/g,'').split(',').map(v=>v.trim()).sort().join(', ')+')':'');});
}
function reviewOperationalGrants(rows,role){
 const policy=policies[role];if(!policy)throw Error('Pool role rejected');
 const found=Object.fromEntries(Object.keys(policy).map(t=>[t,new Set()]));let unsafe=false;
 for(const row of rows){
  const value=String(Object.values(row)[0]);if(/WITH GRANT OPTION/i.test(value)){unsafe=true;continue;}if(/^GRANT USAGE ON \*\.\* TO /i.test(value))continue;
  const m=/^GRANT (.+) ON (.+) TO /i.exec(value);
  if(!m||/WITH GRANT OPTION/i.test(value)){unsafe=true;continue;}
  const scope=m[2].replace(/`/g,'').replace(/\\_/g,'_').split('.');
  if(scope[0]!=='hdwork2'||!Object.hasOwn(policy,scope[1])){unsafe=true;continue;}
  let permissions;try{permissions=privileges(m[1]);}catch{unsafe=true;continue;}
  if(!permissions.length){unsafe=true;continue;}
  for(const p of permissions){if(!policy[scope[1]].includes(p))unsafe=true;found[scope[1]].add(p);}
 }
 const missing=Object.entries(policy).flatMap(([t,ps])=>ps.filter(p=>!found[t].has(p)).map(p=>t+':'+p));
 return {ok:!unsafe&&!missing.length,role,unsafe,missing};
}
module.exports={policies,privileges,reviewOperationalGrants};
