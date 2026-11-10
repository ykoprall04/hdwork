const { id, messageId, fail } = require('../courier/contract');
function validateConfig(input) {
  if (!input || input.enabled !== true || typeof input.botId !== 'string' || !/^[a-z][a-z0-9_-]{1,63}$/.test(input.botId) || typeof input.identityKey !== 'string' || Buffer.byteLength(input.identityKey) < 32 || !['sc_in','inet','both'].includes(input.dedupeBy) || !Array.isArray(input.groups) || !input.groups.length || !Array.isArray(input.actors) || (!input.actors.length && input.webOnly!==true)) throw fail();
  if(input.chatEnabled!==undefined&&typeof input.chatEnabled!=='boolean'||input.chatEnabled===true&&input.webOnly!==true)throw fail();
  if(input.botUsername!==undefined&&!/^[A-Za-z0-9_]{5,32}$/.test(input.botUsername))throw fail();
  if(input.webOnly===true&&(!input.botUsername||input.actors.length))throw fail();
  const groups = input.groups.map(group => {
    if (!['TIAL','LOGIC_PSB','LOGIC_MO','ASSUREN','B2B','REPLACEMENT'].includes(group.module) || !['thread','non_topic'].includes(group.threadMode)) throw fail();
    const chatId = id(group.chatId, true), threadId = messageId(group.threadId, true);
    if ((group.threadMode === 'thread') !== (threadId !== null)) throw fail();
    if (group.commandProfile !== undefined && !['ALL','TIAL1','TIAL2','SOLVER1','ASSUREN','B2B','REPLACEMENT'].includes(group.commandProfile)) throw fail();
    const workspace=['ASSUREN','B2B','REPLACEMENT'].includes(group.commandProfile);
    if(workspace&&group.module!==group.commandProfile)throw fail();
    if (['TIAL1','TIAL2'].includes(group.commandProfile) && group.module !== 'TIAL') throw fail();
    if(group.allowedCommands!==undefined&&(!Array.isArray(group.allowedCommands)||!group.allowedCommands.length||group.allowedCommands.some(c=>!(group.commandProfile==='ALL'?require('../courier/shared-group').commands:workspace?[group.module.toLowerCase()]:['order','req','config_psb','mo']).includes(c))))throw fail();
    if(input.webOnly===true&&(!group.commandProfile||!group.allowedCommands||!chatId.startsWith('-')))throw fail();
    return { module: group.module, chatId, threadId, threadMode: group.threadMode, commandProfile:group.commandProfile,allowedCommands:group.allowedCommands };
  });
  if (new Set(groups.map(g=>`${g.chatId}:${g.threadId}`)).size !== groups.length) throw fail();
  const actors = input.actors.map(actor => {
    if (typeof actor.name !== 'string' || !/^[\p{L}\p{N} ._-]{1,80}$/u.test(actor.name)) throw fail();
    return { id: id(actor.id), name: actor.name };
  });
  if (new Set(actors.map(a=>a.id)).size !== actors.length) throw fail();
  return { botId: input.botId, identityKey: input.identityKey, dedupeBy: input.dedupeBy, groups, actors,webOnly:input.webOnly===true,botUsername:input.botUsername,chatEnabled:input.chatEnabled===true };
}
module.exports = { validateConfig };
