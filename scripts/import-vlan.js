// Default preview only. Explicit apply uses an operator-supplied connection adapter;
// no .env, production credential discovery, migration or service startup.
const path=require('node:path');
const {workbookRows,importRows}=require('../src/vlan/import');
async function main(argv){
 let file,session,apply=false;
 for(let i=0;i<argv.length;i++){if(argv[i]==='--file')file=argv[++i];else if(argv[i]==='--session')session=argv[++i];else if(argv[i]==='--apply')apply=true;else throw Error('VLAN_ARGUMENT_INVALID');}
 if(!file||!path.isAbsolute(file)||apply&&(!session||!path.isAbsolute(session))||!apply&&session)throw Error('VLAN_FILE_AND_EXPLICIT_APPLY_SESSION_REQUIRED');
 const rows=await workbookRows(file),regions={};for(const r of rows)regions[r.wilayah]=(regions[r.wilayah]||0)+1;
 if(!apply){console.log(JSON.stringify({mode:'PREVIEW',rows:rows.length,regions,writes:0}));return;}
 const connection=await require(session).create();
 try{const result=await importRows(connection.pool,rows);console.log(JSON.stringify({mode:'APPLIED',...result,regions}));}finally{await connection.close();}
}
if(require.main===module)main(process.argv.slice(2)).catch(e=>{console.error(/^VLAN_[A-Z_0-9]+$/.test(e.message)?e.message:'VLAN_IMPORT_FAILED');process.exitCode=1;});
module.exports={main};
