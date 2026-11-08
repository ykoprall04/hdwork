// One indexed DB tail per API process while SSE clients exist. No order scans.
const {fail}=require('./policy');
function createLive({pool,authenticate,interval=2000}){
 const clients=new Set();let timer=null,cursor=0,initialized=false,running=false;
 async function tick(){if(running)return;running=true;try{if(!initialized){const [[latest]]=await pool.execute('SELECT COALESCE(MAX(id),0) AS id FROM hd2_live_events');cursor=latest.id;initialized=true;for(const c of clients)c.res.write('event: reset\ndata: {}\n\n');}const [rows]=await pool.execute('SELECT id,module,kind FROM hd2_live_events WHERE id>? ORDER BY id LIMIT 200',[cursor]);if(rows.length)cursor=rows.at(-1).id;
 for(const client of [...clients]){try{let user=client.user;if(rows.length||Date.now()>client.nextCheck){user=await authenticate(client.token);client.user=user;client.nextCheck=Date.now()+15000;}if(!clients.has(client)||client.res.destroyed||client.res.writableEnded)continue;const relevant=rows.filter(e=>user.modules.includes(e.module));if(relevant.length){if(!client.res.write(`event: change\ndata: ${JSON.stringify({arrival:relevant.some(e=>e.kind==='arrival'),changed:relevant.some(e=>e.kind==='change'),modules:[...new Set(relevant.map(e=>e.module))]})}\n\n`))client.close();}else if(!client.res.write(': keepalive\n\n'))client.close();}catch{client.close();}}
 }catch{for(const c of [...clients])c.close();}finally{running=false;if(clients.size){timer=setTimeout(tick,interval);timer.unref?.();}}}
 return {open(req,res,user,token){if(clients.size>=64||[...clients].filter(c=>String(c.uid)===String(user.id)).length>=4)throw fail(429,'Terlalu banyak koneksi live');
 res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('retry: 4000\nevent: reset\ndata: {}\n\n');
 const client={res,token,user,nextCheck:0,uid:user.id,close:()=>{if(!clients.delete(client))return;if(!res.destroyed&&!res.writableEnded)res.end();if(!clients.size){clearTimeout(timer);timer=null;}}};clients.add(client);res.on('close',client.close);res.on('error',client.close);if(!timer&&!running){timer=setTimeout(tick,0);timer.unref?.();}
 },close(){for(const c of [...clients])c.close();},tick};
}
module.exports={createLive};
