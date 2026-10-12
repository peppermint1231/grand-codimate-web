function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Only for the read-only workspace restore. Never retry a save or login POST here. */
export async function restoreConnection<T>(
  read: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  progress: (attempt: number) => void,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    signal.throwIfAborted();
    progress(attempt);
    const request = new AbortController();
    const abort = () => request.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      request.abort();
    }, 15000);
    let failure: any;
    try {
      return await read(request.signal);
    } catch (error) {
      signal.throwIfAborted();
      failure = timedOut
        ? Object.assign(
            new Error(
              "서버 응답이 지연되고 있습니다. 잠시 후 다시 연결해주세요.",
            ),
            { status: 504 },
          )
        : error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
    const temporary =
      failure instanceof TypeError ||
      [502, 503, 504, 520, 521, 522, 523, 524].includes(failure?.status);
    if (!temporary || failure?.code === "STORAGE_DAILY_LIMIT" || attempt === 3)
      throw failure;
    await pause(attempt === 1 ? 1000 : 3000, signal);
  }
}
