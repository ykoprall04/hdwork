const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
async function simulate(stage,code,cleanupFailure=false){
 const frames=[],env={},secrets={authPassword:'synthetic-secret',signingSecret:'synthetic-secret'},m={exports:{}};
 const fail=at=>{if(stage===at)throw Object.assign(Error('SYNTHETIC_SECRET_DO_NOT_RECORD'),code?{code}:{});};
 const pools={status(){return {};},async initializeWithSecrets(){fail('OPERATIONAL_POOLS');},async close(){if(cleanupFailure)throw Error('cleanup-secret');}};
 const deps={
  'node:path':path,
  'node:fs':{readFileSync(){fail('CONFIG');return JSON.stringify({HDWORK2_PUBLIC_ORIGIN:'https://hdwork2.yoloo.space',HDWORK2_EDGE_AUTH_MODE:'application-session'});},writeFileSync(){fail('READY_STATE');}},
  '../src/config/persistent-auth':{validatePersistentAuth(){}},
  '../src/operations/testing-solver-scope':{configuration(){return true;}},
  './office-web-service':{async bootstrap(){fail('BOOTSTRAP');return secrets;}},
  '../src/config/api-only-startup':{validateApiOnlyConfig(){fail('API_CONFIG');}},
  '../src/config/database':{async end(){}},'../src/access/http':{service(){}},
  '../src/config/operational-pools':pools,
  '../src/config/testing-solver-runtime':{async initialize(){fail('TESTING_RUNTIME');},async close(){}},
  '../local-web-server':{async startLocalWeb(){fail('LOCAL_WEB');return {async close(){}};}}
 };
 const mocked=name=>{if(!Object.hasOwn(deps,name))throw Error('Unexpected mock dependency '+name);return deps[name];};mocked.main={};
 const proc={env,stdin:{once(){},destroy(){}},once(){},pid:123};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../scripts/protected-web-service.js'),'utf8'),{module:m,require:mocked,__dirname:path.resolve(__dirname,'../../scripts'),process:proc,console:{error(line){frames.push(JSON.parse(line));}}});
 await m.exports.run();return {frames,exitCode:proc.exitCode,env,secrets};
}
module.exports={simulate};
