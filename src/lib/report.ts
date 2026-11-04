/** Figures for the printable mission report that the panels do not already compute. */
const UP = 0.5;
const DAY_MS = 86_400_000;

export interface LandingDay {
  /** Start of the UTC day, ms. */
  day: number;
  /** Hours that day with the Sun up and a DSN link. */
  hours: number;
}

/** The `count` UTC days with the most hours of power and a direct link together. */
export function bestLandingDays(timeline: { start: number; stepMs: number; sun: Float32Array }, link: Int8Array, count: number): LandingDay[] {
  const byDay = new Map<number, number>();
  const n = Math.min(timeline.sun.length, link.length);
  for (let k = 0; k < n; k++) {
    if (timeline.sun[k] < UP || link[k] < 0) continue;
    const day = Math.floor((timeline.start + k * timeline.stepMs) / DAY_MS) * DAY_MS;
    byDay.set(day, (byDay.get(day) ?? 0) + timeline.stepMs / 3_600_000);
  }
  return [...byDay.entries()]
    .map(([day, hours]) => ({ day, hours }))
    .sort((a, b) => b.hours - a.hours || a.day - b.day)
    .slice(0, count);
}

/** Share of the linked time each DSN station carries (DSN_STATIONS order). */
export function stationShares(link: Int8Array, stations: number): number[] {
  const counts = new Array<number>(stations).fill(0);
  let total = 0;
  for (const s of link) {
    if (s < 0) continue;
    counts[s]++;
    total++;
  }
  return counts.map((c) => (total ? c / total : 0));
}
