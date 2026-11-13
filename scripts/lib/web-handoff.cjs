// Capability-driven handoff. No process discovery, kill, route changes or implicit approval.
async function handoff({old,candidate,route,approve,timeoutMs=30000}){
 if(approve!==true)throw Error('WEB_HANDOFF_APPROVAL_REQUIRED');
 const before=await old.inspect(),next=await candidate.inspect();
 if(before.protocol!=='HDWORK2_WEB_DRAIN_V1'||next.protocol!==before.protocol)throw Error('LEGACY_WEB_OWNER_UNSUPPORTED');
 if(!next.healthy||!next.pinsMatch||!next.writerFenceClosed)throw Error('CANDIDATE_NOT_READY');
 const original=await route.inspect();
 // Drain first: never leave an old writer reachable after asserting the new fence.
 // This may cause a bounded maintenance interval; it is not advertised as zero downtime.
 const receipt=await old.drain({timeoutMs});
 if(receipt.status!=='DRAINED'||receipt.forced||receipt.activeTransactions||receipt.activeRequests||!receipt.poolsClosed)throw Error('OLD_WEB_DRAIN_NOT_PROVEN');
 if(!(await old.inspect()).stopped)throw Error('OLD_WEB_STILL_RUNNING');
 await route.switchTarget({expectedVersion:original.version,expectedOtherIngressSha256:original.otherIngressSha256,target:next.target});
 const after=await route.inspect();
 if(after.target!==next.target||after.otherIngressSha256!==original.otherIngressSha256)throw Error('WEB_ROUTE_VERIFICATION_FAILED');
 return {status:'WEB_HANDOFF_VERIFIED',forced:false,drain:receipt,route:after};
}
module.exports={handoff};
