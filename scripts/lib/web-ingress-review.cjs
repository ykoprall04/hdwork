// Offline review of a Cloudflare tunnel configuration export; no network or credentials.
const crypto=require('crypto');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=v=>crypto.createHash('sha256').update(canonical(v)).digest('hex');
function config(value){const c=value?.result?.config||value?.config||value;if(!c||!Array.isArray(c.ingress)||!c.ingress.length)throw Error('INGRESS_EXPORT_REQUIRED');return c;}
function review({before,after,target}){
 if(!['https://localhost:8444','https://localhost:8445'].includes(target))throw Error('INGRESS_TARGET_REJECTED');
 const a=config(before),b=config(after),host='hdwork2.yoloo.space';
 const select=c=>c.ingress.map((r,i)=>r.hostname===host?i:-1).filter(i=>i>=0),ai=select(a),bi=select(b);
 if(ai.length!==1||bi.length!==1||ai[0]!==bi[0])throw Error('INGRESS_HOST_SCOPE_REJECTED');
 const i=ai[0];if(a.ingress[i].path||b.ingress[i].path)throw Error('INGRESS_PATH_SCOPE_REJECTED');
 if(!['https://localhost:8443','https://localhost:8444','https://localhost:8445'].includes(a.ingress[i].service)||b.ingress[i].service!==target)throw Error('INGRESS_ORIGIN_REJECTED');
 const tls={...(a.originRequest||{}),...(a.ingress[i].originRequest||{})};
 if(tls.noTLSVerify!==false||tls.originServerName!=='localhost'||typeof tls.caPool!=='string'||!tls.caPool)throw Error('INGRESS_TLS_PIN_REQUIRED');
 const masked=c=>{const copy=structuredClone(c);copy.ingress[i].service='HDWORK_ORIGIN_ONLY';return copy;};
 if(canonical(masked(a))!==canonical(masked(b)))throw Error('UNRELATED_INGRESS_OR_TLS_CHANGED');
 return {kind:'HDWORK2_INGRESS_OFFLINE_REVIEW',beforeSha256:hash(a),afterSha256:hash(b),unchangedConfigurationSha256:hash(masked(a)),oldTarget:a.ingress[i].service,target,productionChanged:false,remoteApplied:false,authenticatedBindingVerified:false};
}
module.exports={review,config,hash};
