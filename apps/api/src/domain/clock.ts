export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Calendar date (YYYY-MM-DD) of an instant in UTC. */
export function utcDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}
