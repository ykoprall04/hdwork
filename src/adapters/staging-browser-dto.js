// Explicit browser allowlist. Internal Telegram provenance stays on the server.
function browserResult(result) {
  return {
    source: result.source, readOnly: true, page: result.page, hasMore: result.hasMore,
    identityScope: result.identityScope, dateBasis: result.dateBasis, stoFilterAvailable: result.stoFilterAvailable,
    data: result.data.map(row => ({
      id: row.id, module: row.module, date: row.date, status: row.status,
      sto: row.sto, scIn: row.scIn, inet: row.inet,
      reference_syntax_valid: row.reference_syntax_valid,
      reference_complete: row.reference_complete, reference_verified: false,
    })),
  };
}
module.exports = { browserResult };
