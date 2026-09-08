/** Calculate from wall-clock time so background tabs do not delay a session. */
export function secondsLeft(
  clock: { deadline: number | null; remaining: number },
  now: number,
): number {
  return clock.deadline === null
    ? clock.remaining
    : Math.max(0, Math.ceil((clock.deadline - now) / 1000));
}
