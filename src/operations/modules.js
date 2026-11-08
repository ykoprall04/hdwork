// These identifiers fit the existing VARCHAR module columns; no DDL is needed.
const modules = ['TIAL', 'LOGIC_PSB', 'LOGIC_MO', 'REQ', 'ASSUREN', 'B2B', 'REPLACEMENT'];
const areas = { ALL: modules, B2C: modules.slice(0, 4), TIAL: ['TIAL', 'REQ'], LOGIC: ['LOGIC_PSB', 'LOGIC_MO'], ASSUREN: ['ASSUREN'], B2B: ['B2B'], REPLACEMENT: ['REPLACEMENT'] };
const isWebOrder = order => order.bot_id === 'web-local' && order.chat_id === 'web' && order.command === null;
module.exports = { modules, areas, isWebOrder };
