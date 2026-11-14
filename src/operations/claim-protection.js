// Use inside the transaction that writes transition, audit and outbox.
const {fail}=require('./policy');
async function lockOrder(connection,id){
 const [[order]]=await connection.execute('SELECT * FROM hd2_orders WHERE id=? FOR UPDATE',[id]);

 return order;
}
function assertVersion(order,expectedVersion){if(Number(order.version)!==expectedVersion)throw fail(409,'Order sudah diklaim atau berubah. Muat ulang data.');}
module.exports={lockOrder,assertVersion};
