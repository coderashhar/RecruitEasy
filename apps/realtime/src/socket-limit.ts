/**
 * A fixed-window event counter for one socket.
 *
 * Chat messages and integrity signals are each a database write, and both
 * arrive from a client that is only authenticated, not trusted — a script
 * holding a valid join token could otherwise fill a table in a loop. Per
 * socket and in memory is enough for that: a reconnect gets a fresh window,
 * but reconnecting is itself slow and rate-limited by the handshake.
 *
 * Returns `allow()`, which records an event and reports whether it fits.
 */
export function createSocketLimit(limit: number, windowMs: number, now: () => number = Date.now) {
  let windowStart = now();
  let count = 0;

  return function allow(): boolean {
    const current = now();
    if (current - windowStart >= windowMs) {
      windowStart = current;
      count = 0;
    }
    if (count >= limit) return false;
    count += 1;
    return true;
  };
}
