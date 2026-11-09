const { id, messageId, eventEnvelope, outbound, fail } = require('./contract');
const { parseCommand } = require('../b2c-workflow/commands');

function validateGroups(groups) {
  if (!Array.isArray(groups) || !groups.length || groups.length > 20) throw fail();
  const seen = new Set();
  return groups.map(group => {
    if (!group || !['TIAL1', 'TIAL2', 'SOLVER1','ASSUREN','B2B','REPLACEMENT'].includes(group.profile) ||
        !['thread','non_topic'].includes(group.threadMode) ||
        !Array.isArray(group.commands) || !group.commands.length ||
        group.commands.some(c => !(['ASSUREN','B2B','REPLACEMENT'].includes(group.profile)?[group.profile.toLowerCase()]:['order', 'req', 'config_psb', 'mo']).includes(c)) ||
        new Set(group.commands).size !== group.commands.length ||
        (group.profile === 'SOLVER1' && group.commands.includes('order'))) throw fail();
    const chatId = id(group.chatId, true);
    const threadId=messageId(group.threadId,true),pair=chatId+':'+threadId;
    if (!chatId.startsWith('-') || seen.has(pair)||(group.threadMode==='thread')!==(threadId!==null)) throw fail();
    seen.add(pair);
    return { chatId, threadId, threadMode:group.threadMode, profile: group.profile, commands: [...group.commands] };
  });
}

function createGroupPolicy({ botId, botUsername, groups, allowReplies=false }) {
  const allowed = validateGroups(groups);
  if (!/^[A-Za-z0-9_]{5,32}$/.test(botUsername || '')) throw fail();
  function groupFor(chatId,threadId) { return allowed.find(g => g.chatId === chatId&&g.threadId===threadId); }
  return {
    groups: allowed,
    ingress(body) {
      const value = eventEnvelope(body, botId), e = value.event, group = groupFor(e.chat_id,e.telegram_thread_id);
      if (!group) throw fail(403);
      if (e.kind !== 'message') throw fail(400);
      if(allowReplies&&e.reply_to_message_id!==null)return value;
      const parsed = parseCommand(e.text, group.profile, botUsername);
      if (!parsed.valid || !group.commands.includes(parsed.command)) throw fail(400);
      return value;
    },
    async outgoing(body, connection) {
      let value;
      try { value = outbound(body); } catch { return false; }
      const group = groupFor(value.chat_id,value.telegram_thread_id);
      if (!group || value.thread_mode !== group.threadMode || !value.reply_to_message_id) return false;
      const [[order]] = await connection.execute(
        'SELECT command,thread_id FROM hd2_orders WHERE bot_id=? AND chat_id=? AND message_id=?',
        [botId, value.chat_id, value.reply_to_message_id]
      );
      return !!order && (order.thread_id??null)===group.threadId&&group.commands.includes(order.command);
    }
  };
}
module.exports = { validateGroups, createGroupPolicy };
