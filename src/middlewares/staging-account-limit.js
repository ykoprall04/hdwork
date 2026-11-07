const { createRateLimit } = require('./api-rate-limit');
// Called only after the database confirms active SUPER_ADMIN. Header-independent.
const limit = createRateLimit({ limit: 30, windowMs: 60_000, keyFor: req => req.accountId });
function allow(databaseCheckedId, res) {
  let allowed = false;
  limit({ accountId: String(databaseCheckedId) }, res, () => { allowed = true; });
  return allowed;
}
module.exports = { allow };
