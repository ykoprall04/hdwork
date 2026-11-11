// Read existing PUBLIC certificates only; never keys, trust-store changes or TLS bypass.
const path=require('node:path'),{X509Certificate}=require('node:crypto');
function runtimeTrust(snapshot,env,read=require('./prepare-shared-groups-release').read){
 const leafPath=path.resolve(snapshot,env.LOCAL_TLS_CERT||'.local/tls/localhost.crt'),leafBytes=read(leafPath),leaf=new X509Certificate(leafBytes);
 if(leaf.checkIssued(leaf)&&leaf.verify(leaf.publicKey))return {ca:leafBytes,leaf,mode:'PINNED_SELF_SIGNED_RUNTIME_CERT'};
 const caPath=env.LOCAL_TLS_CA?path.resolve(snapshot,env.LOCAL_TLS_CA):path.join(path.dirname(leafPath),'ca.crt');let caBytes;
 try{caBytes=read(caPath);}catch(error){if(error.code==='ENOENT')throw Object.assign(Error('EXISTING_RUNTIME_ISSUER_CA_REQUIRED'),{file:caPath});throw error;}
 const ca=new X509Certificate(caBytes);
 if(!ca.ca||!ca.checkIssued(ca)||!ca.verify(ca.publicKey)||!leaf.checkIssued(ca)||!leaf.verify(ca.publicKey))throw Object.assign(Error('RUNTIME_CA_DOES_NOT_VERIFY_LEAF'),{file:caPath});
 if(Date.parse(ca.validFrom)>Date.now()||Date.parse(ca.validTo)<=Date.now())throw Error('RUNTIME_CA_OUTSIDE_VALIDITY_PERIOD');
 return {ca:caBytes,leaf,mode:'EXISTING_RUNTIME_ISSUER_CA',caFingerprint:ca.fingerprint256};
}
module.exports={runtimeTrust};
