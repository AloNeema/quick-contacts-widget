export const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;
export const AUTO_SYNC_DELAY_MS = 8_000;

/** Manual and scheduled calls share one in-flight operation per provider. */
export function singleFlight<T>(work: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) pending = Promise.resolve().then(work).finally(() => { pending = undefined; });
    return pending;
  };
}

/** Delayed startup/resume, regular refresh, and isolated provider failures. */
export function createAutoSyncScheduler(tasks: Array<() => Promise<void>>, onError: (error: unknown) => void) {
  let active = false;
  let running = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  let delayed: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    if (!active || running) return;
    running = true;
    try {
      for (const task of tasks) {
        if (!active) break;
        try { await task(); }
        catch (error) { onError(error); }
      }
    } finally {
      running = false;
    }
  };
  const request = () => {
    if (!active) return;
    if (delayed) clearTimeout(delayed);
    delayed = setTimeout(() => {
      delayed = undefined;
      void run();
    }, AUTO_SYNC_DELAY_MS);
  };
  return {
    start() {
      if (active) return;
      active = true;
      request();
      interval = setInterval(() => { void run(); }, AUTO_SYNC_INTERVAL_MS);
    },
    request,
    stop() {
      active = false;
      if (interval) clearInterval(interval);
      if (delayed) clearTimeout(delayed);
      interval = undefined;
      delayed = undefined;
    },
  };
}
