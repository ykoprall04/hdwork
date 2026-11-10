// Explicitly reviewed transition; never widens existing operational-write approvals.
function transition(env,routePlan,{disableTrial=false}={}){
 const activation=require('./live-chat-activation').prepare(env);
 const trialScope=require('../operations/testing-solver-scope').configuration(env);
 if(disableTrial){
  if(!routePlan)throw Error('VERIFIED_ROUTING_REQUIRED_TO_DISABLE_TRIAL');
  if(env.HDWORK2_TESTING_SOLVER_ENABLED==='true'){
   const previous=JSON.parse(env.HDWORK2_TESTING_SOLVER_SCOPE);
   if(!routePlan.targets?.length||routePlan.targets.some(t=>t.botId!==previous.botId||t.botUsername!==previous.botUsername))throw Error('TRIAL_NAMESPACE_DOES_NOT_MATCH_PRODUCTION_BOT');
  }
  activation.patch.HDWORK2_TESTING_SOLVER_ENABLED='false';
  activation.candidate={...env,...activation.patch};
  require('./persistent-auth').validatePersistentAuth(activation.candidate);
  activation.changes=Object.keys(activation.patch).filter(k=>env[k]!==activation.patch[k]).map(key=>({key,before:env[key]??null,after:activation.patch[key]}));
 }
 return {...activation,routing:routePlan?require('./live-chat-production').routing(routePlan,{trialScope:disableTrial?null:trialScope}):null};
}
module.exports={transition};
