// Validate existing encrypted bundles without rotating/removing dormant trial secrets.
function validateProtectedBundle(value, env, {validateOperationalBundle}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('PROTECTED_BUNDLE_REJECTED');
  const trial = ['testingTelegramToken', 'testingWritePassword'];
  const present = trial.filter(key => Object.hasOwn(value, key)).length;
  const active = env.HDWORK2_TESTING_SOLVER_ENABLED === 'true';
  if (present === 1 || (active && present !== 2)) throw Error('PROTECTED_TRIAL_BUNDLE_REJECTED');
  const base = Object.fromEntries(Object.entries(value).filter(([key]) => !trial.includes(key)));
  validateOperationalBundle(base, env); // Reject unknown keys and unauthorized writer credentials.
  if (present && (typeof value.testingWritePassword !== 'string' || !value.testingWritePassword ||
      typeof value.testingTelegramToken !== 'string' || !/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(value.testingTelegramToken))) {
    throw Error('PROTECTED_TRIAL_BUNDLE_REJECTED');
  }
  // Caller retains the original object so its existing finally block clears every secret.
  return value;
}
module.exports = {validateProtectedBundle};
