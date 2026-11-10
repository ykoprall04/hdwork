// Windows PowerShell 5 may write JSON as UTF-16LE; accept it without lossy decoding.
function operatorJson(bytes) {
  const text = bytes[0] === 0xff && bytes[1] === 0xfe
    ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8').replace(/^\uFEFF/, '');
  try { return JSON.parse(text); } catch { throw Error('ROUTING_JSON_INVALID_USE_UTF8_OR_UTF16LE_WITH_BOM'); }
}
module.exports = {operatorJson};
