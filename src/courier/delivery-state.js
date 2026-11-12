// A transport error does not prove Telegram rejected a message. Never replay it.
const uncertainCodes=new Set(['NETWORK','UNKNOWN','ECONNRESET','ETIMEDOUT','LEASE_EXPIRED']);
function uncertain(code){return uncertainCodes.has(code);}
function settlementState(result,code,attempts,maxAttempts){
 if(result==='sent')return 'SENT';
 if(uncertain(code))return 'DEAD';
 return result==='retry'&&code==='RATE_LIMIT'&&attempts<maxAttempts?'QUEUED':'DEAD';
}
function feedbackState(row){
 if(!row)return null;
 if(row.state==='SENT'&&row.telegram_message_id)return 'TERKIRIM';
 if(uncertain(row.last_error_code)||row.state==='SENDING'&&(!Number.isFinite(Number(row.lease_until_ms))||Number(row.lease_until_ms)<=Date.now()))return 'TIDAK_PASTI';
 if(row.state==='SENT'||row.state==='DEAD'&&!row.last_error_code)return 'TIDAK_PASTI';
 if(row.state==='SENDING')return 'MENGIRIM';
 return row.state==='DEAD'?'GAGAL':'ANTRE';
}
module.exports={uncertain,settlementState,feedbackState};
