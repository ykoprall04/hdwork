// One-shot viewer check, using argv instead of Windows PowerShell native -e quoting.
const path=require('node:path'),{errorInfo}=require('../src/observability/raw-log');
async function check(directory,viewer=path.join(__dirname,'courier-log.js')){
 const {lines}=await require(path.resolve(viewer)).initial(directory);
 if(!lines.length)throw Object.assign(Error('LOG_VIEWER_NO_COMPLETE_RECORDS'),{code:'LOG_VIEWER_EMPTY'});
 for(const line of lines)JSON.parse(line);
 return {status:'RAW_LOG_VIEWER_READ_PASS',completeRecords:lines.length};
}
if(require.main===module)check(process.argv[2],process.argv[3]).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(JSON.stringify({status:'RAW_LOG_VIEWER_READ_FAILED',error:errorInfo(e)}));process.exitCode=1;});
module.exports={check};
