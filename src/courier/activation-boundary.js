// A fixed release boundary is retained across restarts and rollback. No rows are moved.
function boundary(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw Error('COURIER_ACTIVATION_BOUNDARY_INVALID');
  return {iso: value, ms: Date.parse(value), sql: value.replace('T', ' ').slice(0, -1)};
}
module.exports = {boundary};
