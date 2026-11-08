const fs=require('node:fs'),path=require('node:path');
function run(){
 if(process.argv[2]!=='--dry-run'||process.argv.length>4)throw Error('Explicit dry-run required');
 const root=path.resolve(__dirname,'..'),file=path.resolve(root,process.argv[3]||'ops/examples/courier-dry-run.fixture.json');
 if(!file.startsWith(root+path.sep)||fs.statSync(file).size>2*1024*1024)throw Error('Fixture rejected');
 const result=require('../src/courier/dry-run').dryRun(JSON.parse(fs.readFileSync(file,'utf8')));
 console.log(JSON.stringify(result));
}
if(require.main===module)try{run();}catch{console.error('Courier dry-run rejected; no network/database action attempted.');process.exitCode=1;}
module.exports={run};
