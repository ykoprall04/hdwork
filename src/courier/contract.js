const { createHash } = require('node:crypto');
const fail = (status = 400) => Object.assign(new Error('Courier request rejected'), { statusCode: status });
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(); return value; }
function id(value, signed = false, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !(signed ? /^-?[1-9]\d{0,15}$/ : /^[1-9]\d{0,15}$/).test(value) || BigInt(value) > 4503599627370495n || BigInt(value) < -4503599627370495n) throw fail();
  return value;
}
function messageId(value, nullable = false) { if (nullable && value === null) return null; id(value); if (BigInt(value) > 2147483647n) throw fail(); return value; }
function text(value, max) { if (typeof value !== 'string' || value.length > max) throw fail(); return value; }
function eventEnvelope(body, botId) {
  object(body); const e = object(body.event);
  if (body.version !== 1 || body.bot_id !== botId || typeof body.update_id !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(body.update_id) || BigInt(body.update_id) > 9007199254740991n || !['message', 'edited_message'].includes(e.kind)) throw fail();
  if (!Number.isSafeInteger(e.timestamp) || e.timestamp < 0 || !Array.isArray(e.attachments) || e.attachments.length > 10) throw fail();
  const attachments = e.attachments.map(a => {
    object(a); if (!['photo', 'document', 'video', 'audio', 'voice', 'animation', 'sticker'].includes(a.kind)) throw fail();
    if (a.size !== null && (!Number.isSafeInteger(a.size) || a.size < 0)) throw fail();
    if (!a.file_id) throw fail();
    return { kind: a.kind, file_id: text(a.file_id, 512), file_unique_id: a.file_unique_id === null ? null : text(a.file_unique_id, 512), name: a.name === null ? null : text(a.name, 255), mime_type: a.mime_type === null ? null : text(a.mime_type, 100), size: a.size };
  });
  return { version: 1, bot_id: botId, update_id: body.update_id, event: {
    kind: e.kind, chat_id: id(e.chat_id, true), message_id: messageId(e.message_id),
    telegram_thread_id: messageId(e.telegram_thread_id, true), sender_id: id(e.sender_id, false, true),
    reply_to_message_id: messageId(e.reply_to_message_id, true), timestamp: e.timestamp,
    text: text(e.text, 16384), attachments,
  } };
}
function outbound(body) {
  object(body); if (body.method !== 'sendMessage' || !['thread', 'non_topic'].includes(body.thread_mode)) throw fail();
  const thread = messageId(body.telegram_thread_id, true);
  if ((body.thread_mode === 'thread') !== (thread !== null)) throw fail();
  const content = text(body.text, 4096); if (!content) throw fail();
  return { method: 'sendMessage', chat_id: id(body.chat_id, true), telegram_thread_id: thread, thread_mode: body.thread_mode, reply_to_message_id: messageId(body.reply_to_message_id, true), text: content };
}
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
module.exports = { fail, object, id, messageId, eventEnvelope, outbound, digest };
