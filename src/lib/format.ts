const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const formatDeg = (deg: number, digits = 1): string => `${deg.toFixed(digits)}°`;

export const formatPercent = (share: number): string => `${Math.round(share * 100)}%`;

export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

/** "4 d 6 h", "5 h 12 min" or "18 min". */
export function formatDuration(ms: number): string {
  if (ms >= DAY_MS) {
    const d = Math.floor(ms / DAY_MS);
    return `${d} d ${Math.round((ms - d * DAY_MS) / HOUR_MS)} h`;
  }
  if (ms >= HOUR_MS) {
    const h = Math.floor(ms / HOUR_MS);
    return `${h} h ${Math.round((ms - h * HOUR_MS) / 60_000)} min`;
  }
  return `${Math.max(0, Math.round(ms / 60_000))} min`;
}

export const formatHours = (hours: number): string => formatDuration(hours * HOUR_MS);

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
