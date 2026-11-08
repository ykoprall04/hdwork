// Explicit lifecycle only; importing this module creates no timers or services.
function startInboxWorker(processor, { delay = 500, report = () => {}, timers = globalThis } = {}) {
  let stopped = false, timer, active = Promise.resolve(), failures = 0;
  const cycle = async () => {
    if (stopped) return;
    let wait = delay;
    try { const worked = await processor.processNext(); failures = 0; if (worked) wait = 20; }
    catch { failures++; wait = Math.min(60000, 1000 * 2 ** Math.min(failures, 6)); report('inbox_cycle_failed'); }
    if (!stopped) timer = timers.setTimeout(() => { active = cycle(); }, wait);
  };
  active = cycle();
  return { async close() { stopped = true; timers.clearTimeout(timer); await active; } };
}
module.exports = { startInboxWorker };
