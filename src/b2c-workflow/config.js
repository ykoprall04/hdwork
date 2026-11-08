const { id, messageId, fail } = require('../courier/contract');
function validateConfig(input) {
  if (!input || input.enabled !== true || typeof input.botId !== 'string' || !/^[a-z][a-z0-9_-]{1,63}$/.test(input.botId) || typeof input.identityKey !== 'string' || Buffer.byteLength(input.identityKey) < 32 || !['sc_in','inet','both'].includes(input.dedupeBy) || !Array.isArray(input.groups) || !input.groups.length || !Array.isArray(input.actors) || !input.actors.length) throw fail();
  const groups = input.groups.map(group => {
    if (!['TIAL','LOGIC_PSB','LOGIC_MO'].includes(group.module) || !['thread','non_topic'].includes(group.threadMode)) throw fail();
    const chatId = id(group.chatId, true), threadId = messageId(group.threadId, true);
    if ((group.threadMode === 'thread') !== (threadId !== null)) throw fail();
    if (group.commandProfile !== undefined && !['TIAL1','TIAL2','SOLVER1'].includes(group.commandProfile)) throw fail();
    if (['TIAL1','TIAL2'].includes(group.commandProfile) && group.module !== 'TIAL') throw fail();
    return { module: group.module, chatId, threadId, threadMode: group.threadMode, commandProfile:group.commandProfile };
  });
  if (new Set(groups.map(g=>`${g.chatId}:${g.threadId}`)).size !== groups.length) throw fail();
  const actors = input.actors.map(actor => {
    if (typeof actor.name !== 'string' || !/^[\p{L}\p{N} ._-]{1,80}$/u.test(actor.name)) throw fail();
    return { id: id(actor.id), name: actor.name };
  });
  if (new Set(actors.map(a=>a.id)).size !== actors.length) throw fail();
  return { botId: input.botId, identityKey: input.identityKey, dedupeBy: input.dedupeBy, groups, actors };
}
module.exports = { validateConfig };
