// Non-secret desired topology. It is reviewed input, never an activation switch.
function topology(value) {
  const reject = () => { throw Error('PRODUCTION_TOPOLOGY_REJECTED'); };
  if (!value || Object.keys(value).sort().join(',') !== 'apiOrigin,bot,environment,repository,routingReview,version,webSnapshot' ||
      value.version !== 1 || value.environment !== 'production') reject();
  for (const key of ['repository', 'webSnapshot', 'routingReview']) {
    if (typeof value[key] !== 'string' || !value[key].trim() || /[\r\n\0]/.test(value[key])) reject();
  }
  let origin;
  try { origin = new URL(value.apiOrigin); } catch { reject(); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') reject();
  const bot = value.bot;
  if (!bot || Object.keys(bot).sort().join(',') !== 'internalId,legacyNamespaceReviewed,taskName,telegramId,username' ||
      typeof bot.telegramId !== 'string' || !/^\d{6,12}$/.test(bot.telegramId) ||
      typeof bot.internalId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(bot.internalId) ||
      typeof bot.username !== 'string' || !/^[A-Za-z0-9_]{5,32}$/.test(bot.username) ||
      typeof bot.taskName !== 'string' || !/^HDWork2-[A-Za-z0-9_-]+$/.test(bot.taskName) ||
      typeof bot.legacyNamespaceReviewed !== 'boolean') reject();
  // Existing DB namespaces must not be renamed: outbox/dedup/history refer to them.
  if (/test|trial/i.test(bot.internalId) && !bot.legacyNamespaceReviewed) throw Error('LEGACY_BOT_NAMESPACE_REVIEW_REQUIRED');
  if (/testing|trial/i.test(bot.taskName)) throw Error('PRODUCTION_TASK_MUST_NOT_BE_TESTING');
  return {...value, apiOrigin: origin.origin, bot: {...bot}};
}
module.exports = {topology};
