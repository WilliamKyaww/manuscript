/** Injectable time source so that services and tests are deterministic (AGENTS.md §8.10). */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock frozen at a given instant that tests can advance explicitly. */
export class FixedClock implements Clock {
  #time: number;

  constructor(start: Date | string | number = '2026-01-01T00:00:00.000Z') {
    this.#time = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.#time);
  }

  advance(milliseconds: number): void {
    this.#time += milliseconds;
  }
}
