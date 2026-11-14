/**
 * The state a teammate needs to see the same thing: the site, the date and the compared scenarios,
 * all carried in the page address. Links come from anywhere, so every value is checked on the way in.
 */
export interface SharedPlace {
  id: string | null;
  lat: number;
  lon: number;
  /** Landing date of a scenario; absent means "the period the comparison shows". */
  at?: number;
}

export interface SharedState {
  site?: SharedPlace;
  time?: number;
  compare: SharedPlace[];
}

interface ShareInput {
  lang: string;
  site: SharedPlace;
  time: number;
  compare: readonly SharedPlace[];
}

const MAX_SCENARIOS = 4;
const SCENARIO_SEPARATOR = '|';
const ID_PATTERN = /^[\w-]{1,40}$/;
const EARLIEST = Date.UTC(1900, 0, 1);
const LATEST = Date.UTC(2100, 0, 1);

const stamp = (time: number): string => `${new Date(time).toISOString().slice(0, 16)}Z`;
/** Six decimals is about 3 cm on the Moon: more than any map here can resolve. */
const coordinate = (value: number): string => String(Number(value.toFixed(6)));

function parseCoordinate(raw: string | null | undefined, limit: number): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

function parseTime(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const t = Date.parse(raw);
  return Number.isFinite(t) && t >= EARLIEST && t <= LATEST ? t : undefined;
}

const parseId = (raw: string | null | undefined): string | null => (raw && ID_PATTERN.test(raw) ? raw : null);

function parseScenario(raw: string): SharedPlace | null {
  const [latRaw, lonRaw, timeRaw, idRaw] = raw.split(',');
  const lat = parseCoordinate(latRaw, 90);
  const lon = parseCoordinate(lonRaw, 180);
  if (lat === null || lon === null) return null;
  const at = parseTime(timeRaw);
  return { id: parseId(idRaw), lat, lon, ...(at === undefined ? {} : { at }) };
}

export function parseShareQuery(search: string): SharedState {
  const params = new URLSearchParams(search);
  const lat = parseCoordinate(params.get('lat'), 90);
  const lon = parseCoordinate(params.get('lon'), 180);
  const time = parseTime(params.get('t'));
  const compare = (params.get('c') ?? '')
    .split(SCENARIO_SEPARATOR)
    .filter((part) => part !== '')
    .map(parseScenario)
    .filter((s): s is SharedPlace => s !== null)
    .slice(0, MAX_SCENARIOS);
  return {
    ...(lat !== null && lon !== null ? { site: { id: parseId(params.get('id')), lat, lon } } : {}),
    ...(time === undefined ? {} : { time }),
    compare,
  };
}

export function buildShareQuery({ lang, site, time, compare }: ShareInput): string {
  const params = new URLSearchParams({ lang, lat: coordinate(site.lat), lon: coordinate(site.lon), t: stamp(time) });
  if (site.id) params.set('id', site.id);
  if (compare.length > 0) {
    const scenarios = compare.map((s) => [coordinate(s.lat), coordinate(s.lon), s.at === undefined ? '' : stamp(s.at), s.id ?? ''].join(','));
    params.set('c', scenarios.join(SCENARIO_SEPARATOR));
  }
  return `?${params.toString()}`;
}
