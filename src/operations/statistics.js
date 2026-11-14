function combine(a,b){const result=Object.fromEntries(Object.keys(a).map(key=>[key,a[key]+b[key]]));result.averageDurationSeconds=result.durationCount?result.durationSeconds/result.durationCount:0;return result;}
module.exports={combine};
