// Telegram IDs remain strings: no lossy conversion or inferred General topic.
function chatId(value) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === 'string' && /^-[1-9]\d{0,15}$/.test(text) && BigInt(text) >= -4503599627370495n ? text : null;
}
function messageId(value) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === 'string' && /^[1-9]\d{0,9}$/.test(text) && BigInt(text) <= 2147483647n ? text : null;
}
function normalizeTelegramReference(module, payload, mapping = {}) {
  const reasons = [];
  const config = mapping[module] || {};
  let chat = null, message = null;
  const raw = payload[module === 'LOGIC_MO' ? 'MSG_ID' : 'Message ID'];
  const empty = raw === undefined || raw === null || raw === '';
  if (module === 'TIAL') {
    // Confirmed Orders field is a strict chat_id:message_id string.
    // Never parse either component through Number; keep canonical decimal text.
    const parts = typeof raw === 'string' && raw.length <= 28 ? raw.split(':') : [];
    if (parts.length === 2 && chatId(parts[0]) && messageId(parts[1])) {
      chat = parts[0]; message = parts[1];
    } else reasons.push(empty ? 'reference_missing' : 'reference_format_invalid');
  } else if (module === 'LOGIC_PSB' || module === 'LOGIC_MO') {
    chat = chatId(config.chat_id);
    if (!chat) reasons.push('group_mapping_missing_or_invalid');
    message = messageId(raw);
    if (!message) reasons.push(empty ? 'message_id_missing' : 'message_id_invalid');
  } else reasons.push('module_unknown');
  const bot = typeof config.source_bot === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(config.source_bot) ? config.source_bot : null;
  if (!bot) reasons.push('source_bot_unknown');
  // A current allowlisted group does not prove a historical message belongs to it.
  reasons.push('historical_reference_unverified', 'thread_unknown');
  return {
    source_bot: bot, telegram_chat_id: chat, telegram_message_id: message,
    telegram_thread_id: null, reference_verified: false,
    // A syntactically complete reference is still not verified with Telegram.
    reference_syntax_valid: chat !== null && message !== null,
    reference_complete: chat !== null && message !== null,
    reference_issues: [...new Set(reasons)],
  };
}
module.exports = { normalizeTelegramReference };
