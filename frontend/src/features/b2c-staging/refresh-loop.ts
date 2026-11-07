export function startRefreshLoop(run: () => Promise<void>, clock: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> = globalThis) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function tick() {
    try { await run(); }
    finally { if (!stopped) timer = clock.setTimeout(() => { void tick(); }, 60_000); }
  }
  void tick();
  return () => { stopped = true; if (timer !== undefined) clock.clearTimeout(timer); };
}
