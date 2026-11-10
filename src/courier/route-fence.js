// Filter, never rewrite, held queue rows. A disable boundary survives reactivation.
function eligible(table,incoming=false){
 if(!['hd2_courier_inbox','hd2_courier_outbox'].includes(table))throw Error('QUEUE_TABLE_REJECTED');
 const root=incoming?'$.event.':'$.';
 return ` AND EXISTS (SELECT 1 FROM hd2_system_mappings route WHERE route.bot_id=${table}.bot_id AND route.chat_id=JSON_UNQUOTE(JSON_EXTRACT(${table}.payload,'${root}chat_id')) AND route.thread_id<=>NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${table}.payload,'${root}telegram_thread_id')),'null') AND route.enabled=TRUE AND route.verified=TRUE AND (route.blocked_before IS NULL OR (${table}.created_at>route.blocked_before${incoming?` AND CAST(JSON_UNQUOTE(JSON_EXTRACT(${table}.payload,'$.event.timestamp')) AS UNSIGNED)>UNIX_TIMESTAMP(route.blocked_before)`:''})))`;
}
module.exports={eligible};
