// Writes only a new local receipt. Input exports must be obtained by the tunnel administrator.
const fs=require('fs');
try{const [before,after,target,output]=process.argv.slice(2);if(!output||process.argv.length!==6)throw Error('USAGE_BEFORE_AFTER_TARGET_NEW_RECEIPT');const receipt=require('./lib/web-ingress-review.cjs').review({before:JSON.parse(fs.readFileSync(before)),after:JSON.parse(fs.readFileSync(after)),target});fs.writeFileSync(output,JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify(receipt));}catch(e){console.error(e.message);process.exitCode=1;}
