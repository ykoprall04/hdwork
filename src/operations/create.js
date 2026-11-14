// Manual creation is retired. Telegram ingestion uses its own internal storage.
async function create(){throw Object.assign(new Error('Order baru hanya melalui Telegram'),{statusCode:403});}
module.exports={create};
