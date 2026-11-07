const orderId=(page=1,index=1)=>`1000000${page}-${index}000-4000-8000-000000000001`;
const metadata={success:true,source:'HDWORK2',readOnly:true,dateBasis:'telegram_business_day_jakarta',actions:{PICK:false,CEK:false,RECEK:false,DONE:false,GAGAL:false}};
const order=(page=1,index=1)=>({id:orderId(page,index),module:'TIAL',date:'2026-11-08',status:index===2?'DUPLICATE':'WAITING',scIn:'SC-SYNTHETIC',inetMasked:'••••0001',sto:null,duplicateOf:index===2?orderId(page,1):null,receivedAt:'2026-11-08T00:00:00Z',startedAt:null,finishedAt:null});
const list=(page=1,count=2)=>({...metadata,data:Array.from({length:count},(_,i)=>order(page,i+1)),page,pageSize:25,hasMore:page===1,stoFilterAvailable:false});
module.exports={orderId,metadata,order,list};
