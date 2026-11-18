const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.join(__dirname,'../fixtures/global-command-compat');
function source(name){
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'provenance.json'),'utf8'))[name];
 if(!metadata)throw Error('BASELINE_UNKNOWN');
 const bytes=fs.readFileSync(path.join(root,name));
 if(createHash('sha256').update(bytes).digest('hex')!==metadata.sha256)throw Error('BASELINE_DRIFT');
 return bytes.toString('utf8');
}
module.exports={source};
