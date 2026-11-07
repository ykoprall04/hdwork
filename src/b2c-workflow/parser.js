const { fail } = require('../courier/contract');
// Deliberately narrow grammar; never infer identifiers from unrelated digits.
function parseOrder(text) {
  if (typeof text !== 'string' || text.length > 16384) throw fail();
  const fields = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(SC\s*\/\s*IN|INET|NO INET\/TELP)\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    const key = /^SC/i.test(match[1]) ? 'sc_in' : 'inet';
    const value = match[2].toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9/_-]{0,99}$/.test(value) || fields[key]) return null;
    fields[key] = value;
  }
  return fields.sc_in || fields.inet ? { sc_in: fields.sc_in || null, inet: fields.inet || null } : null;
}
function parseStatus(text) {
  if (typeof text !== 'string') return null;
  const [command, ...lines] = text.trim().split(/\r?\n/);
  const status = { 'PROSES CEK': 'IN_PROGRESS', DONE: 'DONE', GAGAL: 'FAILED' }[command.trim().toUpperCase()];
  if (!status) return null;
  const reason = lines.join('\n').trim();
  if (reason.length > 1000 || (status === 'FAILED' && !reason) || (status !== 'FAILED' && reason)) return null;
  return { status, reason: status === 'FAILED' ? reason : null };
}
function jakartaDay(timestamp) {
  const date = new Date(timestamp * 1000);
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || !Number.isFinite(date.getTime())) throw fail();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = type => parts.find(p => p.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
module.exports = { parseOrder, parseStatus, jakartaDay };
