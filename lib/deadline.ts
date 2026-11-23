/**
 * deadline.ts: hard time limits for every Gemini call (Entry 28).
 *
 * The Gemini SDK has its own timeout options, but they don't cover every case: a reply that starts
 * and then never finishes, or a call whose option names we got wrong, could make a student wait
 * a minute or more. withDeadline doesn't depend on the SDK: it gives the call an abort signal, and
 * if the call isn't done in time it cancels it and stops waiting, whatever the SDK is doing.
 */

/** Thrown when a call runs out of time. Its message contains "timed out", so logs say "timeout". */
export class DeadlineError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${Math.round(ms)}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Run `run(signal)`, but give up after `ms` milliseconds: abort the signal (so the network request
 * is cancelled) and throw a DeadlineError.
 */
export async function withDeadline<T>(label: string, ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DeadlineError(label, ms));
    }, Math.max(1, ms));
  });
  try {
    return await Promise.race([run(controller.signal), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/** The whole question gets this long, from arriving at the server to the reply (or a friendly error). */
export const REQUEST_BUDGET_MS = 28_000;

/** Milliseconds left until `deadlineAt` (a Date.now() timestamp). */
export const timeLeft = (deadlineAt: number) => deadlineAt - Date.now();
