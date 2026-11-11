// Supported existing commands only. ALL is a routing profile, never an order module.
const commands=['order','req','config_psb','mo','assuren','b2b','replacement'];
const moduleFor=command=>({order:'TIAL',req:'TIAL',config_psb:'LOGIC_PSB',mo:'LOGIC_MO',assuren:'ASSUREN',b2b:'B2B',replacement:'REPLACEMENT'})[command];

// Reuse ALL parsing/classification only for B2C routes in the existing shared mode.
// Stored profiles and historical/receive-only configuration remain unchanged.
const b2cCommands = ['order', 'req', 'config_psb', 'mo'];
function universalB2CGroups(groups) {
  if (Array.isArray(groups) && groups.length === 0) return [];
  return require('./groups').validateGroups(groups).map(group =>
    ['TIAL1', 'TIAL2', 'SOLVER1'].includes(group.profile)
      ? { ...group, profile: 'ALL', commands: [...b2cCommands] }
      : group);
}
module.exports = { commands, moduleFor, universalB2CGroups };
