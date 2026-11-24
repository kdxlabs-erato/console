// What an agent account's product last said of what its subscription allows (ADR-0156), as the
// pages and the command read it: which windows still stand, and how a share is said.

/** From this share on, a window is shown as near its limit: the first mark an agent is told at (ADR-0150). */
export const USAGE_NEAR = 0.8;

/** A window as it is answered: its name, how much of it is used, when it resets, and when the product said so. */
export interface UsageReading {
  readonly name: string;
  readonly used: number | null;
  readonly resetsAt: string | null;
  readonly near?: boolean | undefined;
  readonly at: string;
}

/**
 * The windows that still stand at a moment. One whose reset has passed says nothing of the
 * window after it, and an account whose runner is away keeps what it last said: such a window
 * is left out, so that no page shows a share of a window that is over.
 */
export function usageStanding<T extends { readonly resetsAt: string | null }>(
  usage: readonly T[] | null | undefined,
  now: number,
): readonly T[] {
  return (usage ?? []).filter(
    (window) => window.resetsAt === null || !(Date.parse(window.resetsAt) <= now),
  );
}

/** A share as a whole number of hundredths, never more than was said: 0.899 is 89. */
export const usedHundredths = (share: number): number =>
  Math.min(100, Math.max(0, Math.floor(share * 100 + 1e-9)));

/** Whether a window is near its limit: by its share, or because the product itself says so. */
export const usageNear = (window: {
  readonly used: number | null;
  readonly near?: boolean | undefined;
}): boolean => window.near === true || (window.used !== null && window.used >= USAGE_NEAR);
