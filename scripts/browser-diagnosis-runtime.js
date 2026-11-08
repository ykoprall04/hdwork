// Pure utilities: importing this module never opens a file, socket or process.
function failure(code, operation) { return Object.assign(Error('Browser diagnosis failed'), { code, operation }); }
function safeCode(error) { return typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code) ? error.code : 'DIAGNOSIS_FAILED'; }
function withSignal(promise, signal) {
  if (signal.aborted) { Promise.resolve(promise).catch(() => {}); return Promise.reject(signal.reason); }
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
function sleep(ms, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
function deadline(ms, operation = 'overall-timeout') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(failure('OVERALL_TIMEOUT', operation)), ms);
  return { signal: controller.signal, abort: error => controller.abort(error), stop() { clearTimeout(timer); } };
}
async function retryBusy(operation, action, { signal, onRetry = () => {}, delays = [50, 100, 200, 400, 800], pause = sleep }) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try { return await withSignal(action(signal), signal); }
    catch (error) {
      signal.throwIfAborted();
      if (error.code !== 'EBUSY' || attempt >= delays.length) {
        // Preserve the original code; do not retry EACCES, EPERM, ENOENT, etc.
        error.operation = operation; throw error;
      }
      onRetry({ operation, code: 'EBUSY', retry: attempt + 1, delayMs: delays[attempt] });
      await pause(delays[attempt], signal);
    }
  }
}
module.exports = { failure, safeCode, withSignal, sleep, deadline, retryBusy };
