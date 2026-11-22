const { chartSelection } = require('./recap-chart');
const { fail } = require('./policy');

async function chartWorkbook(body, user) {
  if (user.role === 'SHOW_ONLY') throw fail(403);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail();
  const { counts, ...query } = body;
  const { period, start, end, step, commands } = chartSelection(query);
  if (!Array.isArray(counts) || counts.length !== (end - start) / step ||
      counts.some(row => !Array.isArray(row) || row.length !== commands.length ||
        row.some(value => !Number.isSafeInteger(value) || value < 0))) throw fail();

  const totals = commands.map((_, index) => counts.reduce((total, row) => total + row[index], 0));
  const sum = values => values.reduce((total, value) => total + value, 0);
  if (!Number.isSafeInteger(sum(totals))) throw fail();

  // Format only the displayed snapshot. A fresh query could include newer orders.
  const Excel = require('exceljs');
  const book = new Excel.Workbook();
  const sheet = book.addWorksheet('Data Grafik');
  sheet.addRow(['Waktu (WIB)', ...commands.map(command => '/' + command), 'Total Order']).font = { bold: true };
  sheet.getColumn(1).width = period === 'daily' ? 24 : 16;
  for (let column = 2; column <= commands.length + 2; column++) sheet.getColumn(column).width = 16;
  counts.forEach((row, index) => {
    // chartSelection uses an ISO calendar cursor representing Jakarta wall time.
    const local = new Date(start + index * step).toISOString();
    const label = period === 'daily' ? local.slice(0, 16).replace('T', ' ') : local.slice(0, 10);
    sheet.addRow([label, ...row, sum(row)]);
  });
  sheet.addRow(['Total', ...totals, sum(totals)]).font = { bold: true };
  return Buffer.from(await book.xlsx.writeBuffer());
}

module.exports = { chartWorkbook };
