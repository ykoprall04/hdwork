const { id, eventEnvelope, outbound, fail } = require('./contract');
const { parseCommand } = require('../b2c-workflow/commands');

function validateGroups(groups) {
  if (!Array.isArray(groups) || !groups.length || groups.length > 20) throw fail();
  const seen = new Set();
  return groups.map(group => {
    if (!group || !['TIAL1', 'TIAL2', 'SOLVER1'].includes(group.profile) ||
        group.threadMode !== 'non_topic' || group.threadId !== null ||
        !Array.isArray(group.commands) || !group.commands.length ||
        group.commands.some(c => !['order', 'req', 'config_psb', 'mo'].includes(c)) ||
        new Set(group.commands).size !== group.commands.length ||
        (group.profile === 'SOLVER1' && group.commands.includes('order'))) throw fail();
    const chatId = id(group.chatId, true);
    if (!chatId.startsWith('-') || seen.has(chatId)) throw fail();
    seen.add(chatId);
    return { chatId, threadId: null, threadMode: 'non_topic', profile: group.profile, commands: [...group.commands] };
  });
}

function createGroupPolicy({ botId, botUsername, groups }) {
  const allowed = validateGroups(groups);
  if (!/^[A-Za-z0-9_]{5,32}$/.test(botUsername || '')) throw fail();
  function groupFor(chatId) { return allowed.find(g => g.chatId === chatId); }
  return {
    groups: allowed,
    ingress(body) {
      const value = eventEnvelope(body, botId), e = value.event, group = groupFor(e.chat_id);
      if (!group || e.telegram_thread_id !== null) throw fail(403);
      if (e.kind !== 'message') throw fail(400);
      const parsed = parseCommand(e.text, group.profile, botUsername);
      if (!parsed.valid || !group.commands.includes(parsed.command)) throw fail(400);
      return value;
    },
    async outgoing(body, connection) {
      let value;
      try { value = outbound(body); } catch { return false; }
      const group = groupFor(value.chat_id);
      if (!group || value.thread_mode !== 'non_topic' || value.telegram_thread_id !== null || !value.reply_to_message_id) return false;
      const [[order]] = await connection.execute(
        'SELECT command FROM hd2_orders WHERE bot_id=? AND chat_id=? AND message_id=?',
        [botId, value.chat_id, value.reply_to_message_id]
      );
      return !!order && group.commands.includes(order.command);
    }
  };
}
module.exports = { validateGroups, createGroupPolicy };
