const path=require('node:path');
function webBuild(root,env) {
  if(env.LOCAL_WEB_DIST===undefined)return path.join(root,'frontend/dist');
  const dist=path.resolve(root,env.LOCAL_WEB_DIST);
  const relative=path.relative(path.join(root,'.local'),dist);
  if(!/^online-candidate-[A-Za-z0-9_-]+[\\/]dist$/.test(relative))throw Error('Candidate build path rejected');
  return dist;
}
module.exports={webBuild};
