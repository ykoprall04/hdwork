// Explicit operator-selected loopback targets only. No public/production discovery.
function localURL(value,pathname,denied=[]){if(!value)return null;const url=new URL(value);const port=Number(url.port);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.pathname!==pathname||url.search||url.hash||url.username||url.password||!Number.isInteger(port)||port<1024||port>65535||denied.includes(port))throw Error('LOCAL_PROBE_REJECTED');return url;}
function createProbes({env,pool,fetchImpl=fetch}){
 const api=localURL(env.HDWORK2_SYSTEM_API_PROBE,'/health',[3306]);if(api&&Number(api.port)!==Number(env.PORT||3090))throw Error('API_PROBE_PORT_REJECTED');
 const tunnel=localURL(env.HDWORK2_SYSTEM_TUNNEL_PROBE,'/metrics',[3306,Number(env.PORT||3090),3091,8443]);
 const request=url=>fetchImpl(url,{signal:AbortSignal.timeout(5000),redirect:'error'});
 return {
  mysql:async()=>{await pool.execute('SELECT 1');},
  ...(api?{api:async()=>{const r=await request(api);if(r.status!==200)throw Error('PROBE_FAILED');const body=await r.json();if(body.ok!==true||body.mode!=='api-only')throw Error('PROBE_IDENTITY_REJECTED');}}:{}),
  ...(tunnel?{tunnel:async()=>{try{const r=await request(tunnel);if(r.status!==200||!r.body)throw Error('PROBE_FAILED');const reader=r.body.getReader(),decode=new TextDecoder();let text='',bytes=0;try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>262144)throw Error('PROBE_OVERSIZE');text+=decode.decode(value,{stream:true});}text+=decode.decode();}finally{await reader.cancel().catch(()=>{});}
   const metrics=[...text.matchAll(/^cloudflared_tunnel_ha_connections(?:\{[^\n]{0,512}\})?\s+(\d+(?:\.\d+)?)(?:\s+\d+)?\s*$/gm)];if(!metrics.length)return {status:'UNKNOWN',code:'TUNNEL_METRIC_UNAVAILABLE'};return {status:metrics.some(m=>Number(m[1])>0)?'ONLINE':'OFFLINE',code:'TUNNEL_EDGE_CONNECTIONS_OBSERVED'};
  }catch{return {status:'UNKNOWN',code:'TUNNEL_PROBE_UNAVAILABLE'};}}}:{})
 };
}
module.exports={createProbes};
