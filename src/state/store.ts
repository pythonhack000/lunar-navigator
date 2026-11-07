import { create } from 'zustand';
import { DEFAULT_SITE_ID, SITES } from '../data/sites';
import type { Lang } from '../i18n';
import { DEFAULT_POWER, type PowerConfig } from '../lib/power';
import { parseShareQuery, type SharedPlace } from '../lib/shareLink';

export interface SelectedSite {
  /** Id of a named site, or null for a custom pin. */
  id: string | null;
  name: string;
  lat: number;
  lon: number;
  /** Unnamed places get their label from the current language instead of a stored name. */
  kind?: SiteKind;
}

/** A row of the comparison: a place and, optionally, its own landing date. */
export interface Scenario extends SelectedSite {
  at?: number;
}

/** The windows opened from the site panel; LUNA's tour opens them too. */
export type ToolName = 'windows' | 'energy' | 'whatIf';

export type GroundQuestionKey = 'explain' | 'sun' | 'earth' | 'power' | 'moon';

export type PlaybackSpeed = 1 | 6 | 24;

export type ReliefScale = 1 | 3 | 5;

export type MapLayer = 'none' | 'light' | 'ice' | 'slope';

/** Unnamed places: clicked on the map, or found on the light map. */
export type SiteKind = 'custom' | 'brightest' | 'nearIce';

const LANG_KEY = 'lunar-lang';

/**
 * `?lang=en` in the link wins (handy for sending the jury an English link), then the visitor's own
 * earlier choice, then the browser language.
 */
function initialLang(): Lang {
  if (typeof window !== 'undefined') {
    const fromLink = new URLSearchParams(window.location.search).get('lang');
    if (fromLink === 'en' || fromLink === 'ru') return fromLink;
  }
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ru') return saved;
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

interface NavigatorState {
  time: number;
  playing: boolean;
  /** Simulated hours per real second. */
  speed: PlaybackSpeed;
  site: SelectedSite;
  compare: readonly Scenario[];
  /** False until the detailed polar elevation grids replace the coarse first ones. */
  isTerrainDetailed: boolean;
  setTerrainDetailed: () => void;
  openTool: ToolName | null;
  setOpenTool: (tool: ToolName | null) => void;
  /** The solar array and load behind every power figure. */
  power: PowerConfig;
  setPower: (power: PowerConfig) => void;
  /** True while the camera shows the whole Moon instead of hovering over the selected site. */
  isGlobeView: boolean;
  /** Bumped on every fly request, so asking again for the same view still flies the camera. */
  flyNonce: number;
  /** Camera height above the surface, km, updated a few times a second for the HUD. */
  cameraAltitudeKm: number;
  flyToSite: () => void;
  /** Bumped to pull the camera back over the whole south polar cap. */
  polarViewNonce: number;
  showPolarView: () => void;
  showWholeMoon: () => void;
  setCameraAltitude: (km: number) => void;
  /** Vertical exaggeration of the 3D terrain; purely visual. */
  relief: ReliefScale;
  setRelief: (relief: ReliefScale) => void;
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Overlay on the south polar terrain: annual sunlight or permanent shadow (ice). */
  layer: MapLayer;
  setLayer: (layer: MapLayer) => void;
  /** True once the first (preview) textures are on screen and the Moon is visible. */
  sceneReady: boolean;
  setSceneReady: () => void;
  /** True once the opening flight has reached the Moon; the heavy 3D scene starts then. */
  introArrived: boolean;
  arriveIntro: () => void;
  /** True once the opening flight from Earth has handed over to the main camera. */
  introDone: boolean;
  finishIntro: () => void;
  /** True once the opening descent to the first site is over (or the user took the controls). */
  landed: boolean;
  setLanded: () => void;
  /** The "How accurate is this?" comparison with published results. */
  isValidationOpen: boolean;
  setValidationOpen: (open: boolean) => void;
  /** Standing on the site, looking around at the real horizon (relief 1× while there). */
  isGroundView: boolean;
  enterGroundView: () => void;
  exitGroundView: () => void;
  /** What 3D LUNA is saying beside you on the surface, and what she points at. */
  groundSpeech: { text: string; point: 'sun' | 'earth' | null } | null;
  setGroundSpeech: (speech: { text: string; point: 'sun' | 'earth' | null } | null) => void;
  /** Bumped by a click on her words: the next line. */
  groundTalkNonce: number;
  talkOnGround: () => void;
  /** The questions you can ask her on the surface, opened by clicking her. */
  isGroundMenuOpen: boolean;
  setGroundMenuOpen: (isOpen: boolean) => void;
  groundQuestion: { key: GroundQuestionKey; nonce: number } | null;
  askOnGround: (key: GroundQuestionKey) => void;
  /** True while she is 3D: from the start of the descent until the climb back to orbit ends. */
  isCompanion3D: boolean;
  setCompanion3D: (is3D: boolean) => void;
  /** The tour speaks through her while it runs. */
  isTouring: boolean;
  setTouring: (isTouring: boolean) => void;
  /** Relief to restore when leaving the ground view. */
  reliefBeforeGround: ReliefScale;
  /** Turn the ground view toward the Sun or the Earth; the nonce repeats a request. */
  groundLook: { body: 'sun' | 'earth' | 'luna'; nonce: number } | null;
  lookFromGround: (body: 'sun' | 'earth' | 'luna') => void;
  setTime: (time: number) => void;
  setGlobeView: (isGlobeView: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  selectSite: (site: SelectedSite) => void;
  toggleCompare: (site: SelectedSite) => void;
  /** Adds the place with its own landing date, unless that exact row exists or the list is full. */
  addScenario: (site: SelectedSite, at: number) => void;
  removeScenario: (key: string) => void;
  setScenarioDate: (key: string, at: number) => void;
}

export const MAX_COMPARE = 4;

export const siteKey = (s: SelectedSite): string => `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
export const scenarioKey = (s: Scenario): string => `${siteKey(s)}@${s.at ?? ''}`;

const defaultSite = SITES.find((s) => s.id === DEFAULT_SITE_ID) ?? SITES[0];
const startOfHour = (t: number) => Math.floor(t / 3_600_000) * 3_600_000;

/** A place from a shared link: a known site by its id (if it really sits there), else a scout point. */
function placeFromLink(place: SharedPlace): SelectedSite {
  const named = place.id ? SITES.find((s) => s.id === place.id && s.lat === place.lat && s.lon === place.lon) : undefined;
  if (named) return { id: named.id, name: named.name, lat: named.lat, lon: named.lon };
  return { id: null, name: '', kind: 'custom', lat: place.lat, lon: place.lon };
}

const shared = typeof window === 'undefined' ? { compare: [] } : parseShareQuery(window.location.search);

const placeWithoutDate = ({ id, name, lat, lon, kind }: Scenario): SelectedSite => ({ id, name, lat, lon, ...(kind ? { kind } : {}) });

export { placeWithoutDate };

export const useNavigator = create<NavigatorState>((set) => ({
  time: shared.time ?? startOfHour(Date.now()),
  playing: false,
  speed: 6,
  site: shared.site ? placeFromLink(shared.site) : { id: defaultSite.id, name: defaultSite.name, lat: defaultSite.lat, lon: defaultSite.lon },
  compare: shared.compare.map((place) => ({ ...placeFromLink(place), ...(place.at === undefined ? {} : { at: place.at }) })),
  isTerrainDetailed: false,
  setTerrainDetailed: () => set({ isTerrainDetailed: true }),
  openTool: null,
  setOpenTool: (openTool) => set({ openTool }),
  power: DEFAULT_POWER,
  setPower: (power) => set({ power }),
  isGlobeView: false,
  flyNonce: 0,
  cameraAltitudeKm: 4000,
  flyToSite: () => set((s) => ({ isGlobeView: false, flyNonce: s.flyNonce + 1 })),
  polarViewNonce: 0,
  showPolarView: () => set((s) => ({ polarViewNonce: s.polarViewNonce + 1 })),
  showWholeMoon: () => set((s) => ({ isGlobeView: true, flyNonce: s.flyNonce + 1 })),
  setCameraAltitude: (cameraAltitudeKm) => set({ cameraAltitudeKm }),
  relief: 3,
  setRelief: (relief) => set({ relief }),
  lang: initialLang(),
  setLang: (lang) => {
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Not persisted; the choice still applies for this visit.
    }
    set({ lang });
  },
  layer: 'none',
  setLayer: (layer) => set({ layer }),
  sceneReady: false,
  setSceneReady: () => set({ sceneReady: true }),
  introArrived: false,
  arriveIntro: () => set({ introArrived: true }),
  introDone: false,
  finishIntro: () => set({ introDone: true }),
  landed: false,
  setLanded: () => set({ landed: true }),
  isValidationOpen: false,
  setValidationOpen: (isValidationOpen) => set({ isValidationOpen }),
  isGroundView: false,
  groundSpeech: null,
  setGroundSpeech: (groundSpeech) => set({ groundSpeech }),
  groundTalkNonce: 0,
  talkOnGround: () => set((s) => ({ groundTalkNonce: s.groundTalkNonce + 1 })),
  isGroundMenuOpen: false,
  setGroundMenuOpen: (isGroundMenuOpen) => set({ isGroundMenuOpen }),
  groundQuestion: null,
  askOnGround: (key) => set((s) => ({ groundQuestion: { key, nonce: (s.groundQuestion?.nonce ?? 0) + 1 }, isGroundMenuOpen: false })),
  isCompanion3D: false,
  setCompanion3D: (isCompanion3D) => set({ isCompanion3D }),
  isTouring: false,
  setTouring: (isTouring) => set({ isTouring }),
  reliefBeforeGround: 3,
  enterGroundView: () => set((s) => (s.isGroundView ? s : { isGroundView: true, reliefBeforeGround: s.relief, relief: 1 })),
  exitGroundView: () => set((s) => (s.isGroundView ? { isGroundView: false, relief: s.reliefBeforeGround, groundLook: null } : s)),
  groundLook: null,
  lookFromGround: (body) => set((s) => ({ groundLook: { body, nonce: (s.groundLook?.nonce ?? 0) + 1 } })),
  setTime: (time) => set({ time }),
  setGlobeView: (isGlobeView) => set({ isGlobeView }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  selectSite: (site) => set((s) => ({ site, isGlobeView: false, isGroundView: false, relief: s.isGroundView ? s.reliefBeforeGround : s.relief })),
  toggleCompare: (site) =>
    set((state) => {
      const key = siteKey(site);
      const exists = state.compare.some((s) => siteKey(s) === key);
      if (exists) return { compare: state.compare.filter((s) => siteKey(s) !== key) };
      if (state.compare.length >= MAX_COMPARE) return state;
      return { compare: [...state.compare, site] };
    }),
  addScenario: (site, at) =>
    set((state) => {
      const row: Scenario = { ...placeWithoutDate(site), at };
      if (state.compare.length >= MAX_COMPARE || state.compare.some((s) => scenarioKey(s) === scenarioKey(row))) return state;
      return { compare: [...state.compare, row] };
    }),
  removeScenario: (key) => set((state) => ({ compare: state.compare.filter((s) => scenarioKey(s) !== key) })),
  setScenarioDate: (key, at) => set((state) => ({ compare: state.compare.map((s) => (scenarioKey(s) === key ? { ...s, at } : s)) })),
}));

/** Resolves as soon as the store satisfies `isReady` (at once if it already does). */
export function whenNavigator(isReady: (s: NavigatorState) => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (isReady(useNavigator.getState())) return resolve();
    const stop = useNavigator.subscribe((s) => {
      if (!isReady(s)) return;
      stop();
      resolve();
    });
  });
}
