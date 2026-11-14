/**
 * Small hints that teach the app by doing, one at a time: each waits until the visitor has been idle
 * for a while and disappears for good once they have done the thing (or closed it).
 */
export const TIP_ORDER = ['luna', 'pick', 'stand', 'time', 'photo', 'mission'] as const;
export type TipId = (typeof TIP_ORDER)[number];

/** The first two answer "what can I even touch here?", so they come quickly; the rest wait longer. */
const DELAY_MS: Partial<Record<TipId, number>> = { luna: 4_000, pick: 8_000 };
const DEFAULT_DELAY_MS = 15_000;
export const tipDelayMs = (id: TipId): number => DELAY_MS[id] ?? DEFAULT_DELAY_MS;

/** On the surface the site panel is gone, so only the tips that work there may show. */
const GROUND_TIPS: readonly TipId[] = ['time', 'mission'];

/** The first tip not yet done, or null when every one is. `unavailable` tips are skipped. */
export function nextTip(done: readonly TipId[], isGroundView: boolean, unavailable: readonly TipId[] = []): TipId | null {
  const next = TIP_ORDER.find((id) => !done.includes(id) && !unavailable.includes(id)) ?? null;
  if (next === null) return null;
  return isGroundView && !GROUND_TIPS.includes(next) ? null : next;
}

export const withTip = (done: readonly TipId[], id: TipId): readonly TipId[] => (done.includes(id) ? done : [...done, id]);

const STORAGE_KEY = 'lsn.tipsDone';

export function readDoneTips(): readonly TipId[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? TIP_ORDER.filter((id) => raw.includes(id)) : [];
  } catch {
    return [];
  }
}

export function saveDoneTips(done: readonly TipId[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
  } catch {
    // Private mode or blocked storage: the tips simply come back on the next visit.
  }
}
