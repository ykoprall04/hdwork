const {feedbackState}=require('../courier/delivery-state');
// Join via committed idempotency requests: works for existing actions as well.
async function attachFeedback(pool,orders){
 if(!orders.length)return;
 const ids=orders.map(o=>o.id);
 const [rows]=await pool.execute(`SELECT o.id AS order_id,b.id,b.state,b.telegram_message_id,b.last_error_code,b.lease_until_ms FROM hd2_orders o JOIN hd2_courier_outbox b ON b.id=(SELECT b2.id FROM hd2_web_requests r JOIN hd2_courier_outbox b2 ON b2.idem_key=CONCAT('web:',r.user_id,':',r.request_id) AND b2.bot_id=o.bot_id WHERE r.order_id=o.id ORDER BY b2.created_at DESC,b2.id DESC LIMIT 1) WHERE o.id IN (${ids.map(()=>'?').join(',')})`,ids);
 const latest=new Map();for(const row of rows)if(!latest.has(row.order_id))latest.set(row.order_id,row);
 for(const order of orders){const row=latest.get(order.id);order.feedback=row?{status:feedbackState(row),deliveryId:row.id,errorCode:row.last_error_code||null}:null;}
}
module.exports={attachFeedback};
