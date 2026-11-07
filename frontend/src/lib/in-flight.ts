// Share pending requests only. Never cache successful authorization decisions.
export function createInFlightRequests() {
  const pending = new Map<string, { controller: AbortController; promise: Promise<unknown>; users: number; abortTimer?: ReturnType<typeof setTimeout> }>();
  return function request<T>(key: string, run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    let entry = pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, users: 0, promise: Promise.resolve().then(() => run(controller.signal)) };
      const own = entry; pending.set(key, own);
      const clean = () => { if (pending.get(key) === own) pending.delete(key); };
      own.promise.then(clean, clean);
    }
    const shared = entry; shared.users++; clearTimeout(shared.abortTimer);
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      function release() {
        if (finished) return false; finished = true; signal?.removeEventListener('abort', abort);
        shared.users--;
        if (!shared.users) shared.abortTimer = setTimeout(() => { if (pending.get(key) === shared) { pending.delete(key); shared.controller.abort(); } }, 0);
        return true;
      }
      function abort() { if (release()) reject(new DOMException('Aborted', 'AbortError')); }
      signal?.addEventListener('abort', abort, { once: true });
      shared.promise.then(value => { if (release()) resolve(value as T); }, error => { if (release()) reject(error); });
    });
  };
}
