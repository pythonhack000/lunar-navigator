const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const formatDeg = (deg: number, digits = 1): string => `${deg.toFixed(digits)}°`;

export const formatPercent = (share: number): string => `${Math.round(share * 100)}%`;

export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

const UNITS = { en: ['d', 'h', 'min'], ru: ['д', 'ч', 'мин'] } as const;

/** "4 d 6 h", "5 h 12 min" or "18 min" (or the Russian units). Rounds first, so 1 d 23.6 h is "2 d 0 h". */
export function formatDuration(ms: number, lang: 'en' | 'ru' = 'en'): string {
  const [d, h, m] = UNITS[lang];
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes >= 24 * 60) {
    const hours = Math.round(minutes / 60);
    return `${Math.floor(hours / 24)} ${d} ${hours % 24} ${h}`;
  }
  if (minutes >= 60) return `${Math.floor(minutes / 60)} ${h} ${minutes % 60} ${m}`;
  return `${minutes} ${m}`;
}

/** Under a minute, waits round up to this many seconds: a countdown that never promises too much. */
const WAIT_STEP_S = 5;

/** A download's time left: "35 s" under a minute, then minutes as in formatDuration. */
export function formatWait(seconds: number, lang: 'en' | 'ru' = 'en'): string {
  if (seconds < 60) return `${Math.max(WAIT_STEP_S, Math.ceil(seconds / WAIT_STEP_S) * WAIT_STEP_S)} ${lang === 'ru' ? 'с' : 's'}`;
  return formatDuration(seconds * 1000, lang);
}

export const formatHours = (hours: number, lang: 'en' | 'ru' = 'en'): string => formatDuration(hours * HOUR_MS, lang);

export function formatUtc(time: number): string {
  return `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function formatShortDate(time: number): string {
  return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Value for an <input type="datetime-local"> showing UTC. */
export const toDateTimeInput = (time: number): string => new Date(time).toISOString().slice(0, 16);

export function fromDateTimeInput(value: string): number | null {
  const t = Date.parse(`${value}:00Z`);
  return Number.isFinite(t) ? t : null;
}

export { DAY_MS, HOUR_MS };
