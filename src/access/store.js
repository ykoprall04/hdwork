function createStore(pool) {
 const store={
 async tx(run){const c=await pool.getConnection();try{await c.beginTransaction();const value=await run(createStore(c));await c.commit();return value;}catch(e){await c.rollback();throw e;}finally{c.release();}},
 async lock(){await pool.query('SELECT id FROM hd2_auth_guard WHERE id=1 FOR UPDATE');},
 async user(id){const [[r]]=await pool.query('SELECT id,name,username,password_hash,role,city_id,is_active,approval_status FROM users WHERE id=?',[id]);return r;},
 async username(name){const [[r]]=await pool.query('SELECT id,name,username,password_hash,role,city_id,is_active,approval_status FROM users WHERE username=?',[name]);return r;},
 async modules(id){const [r]=await pool.query('SELECT module FROM hd2_user_modules WHERE user_id=? ORDER BY module',[id]);return r.map(r=>r.module);},
 async session(hash){const [[r]]=await pool.query('SELECT user_id FROM hd2_sessions WHERE token_hash=? AND revoked=FALSE AND expires_at>UTC_TIMESTAMP(3)',[hash]);return r;},
 async addSession(hash,id){await pool.query('INSERT INTO hd2_sessions(token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 8 HOUR))',[hash,id]);},
 async revoke(id){await pool.query('UPDATE hd2_sessions SET revoked=TRUE WHERE user_id=?',[id]);},
 async logout(hash){await pool.query('UPDATE hd2_sessions SET revoked=TRUE WHERE token_hash=?',[hash]);},
 async audit(actor,target,action){await pool.query('INSERT INTO hd2_security_audit(actor_id,target_id,action) VALUES (?,?,?)',[actor,target,action]);},
 async activeSupers(){const [[r]]=await pool.query("SELECT COUNT(*) AS n FROM users WHERE role='SUPER_ADMIN' AND is_active=TRUE");return Number(r.n);},
 async save(id,data){if(id){await pool.query('UPDATE users SET name=?,role=?,is_active=?,approval_status=? WHERE id=?',[data.name,data.role,data.is_active,data.approval_status||'APPROVED',id]);if(data.password_hash)await pool.query('UPDATE users SET password_hash=? WHERE id=?',[data.password_hash,id]);}else{const [r]=await pool.query('INSERT INTO users(name,username,password_hash,role,is_active,approval_status) VALUES (?,?,?,?,?,?)',[data.name,data.username,data.password_hash,data.role,data.is_active,data.approval_status||'APPROVED']);id=r.insertId;}await pool.query('DELETE FROM hd2_user_modules WHERE user_id=?',[id]);for(const module of data.modules)await pool.query('INSERT INTO hd2_user_modules(user_id,module) VALUES (?,?)',[id,module]);return id;},
 async list(page,role){const [rows]=await pool.query("SELECT id,name,username,role,is_active,approval_status FROM users WHERE (?='SUPER_ADMIN' OR role IN ('HD','SHOW_ONLY')) ORDER BY id DESC LIMIT 26 OFFSET ?",[role,(page-1)*25]);for(const row of rows)row.modules=await store.modules(row.id);return {data:rows.slice(0,25),hasMore:rows.length>25,page};},
 async audits(page){const [rows]=await pool.query("SELECT id,actor_id,target_id,action,DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%sZ') AS created_at FROM hd2_security_audit ORDER BY id DESC LIMIT 26 OFFSET ?",[(page-1)*25]);return {data:rows.slice(0,25),hasMore:rows.length>25,page};}
 };return store;
}
module.exports={createStore};
