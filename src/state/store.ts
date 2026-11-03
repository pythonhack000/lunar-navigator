import { create } from 'zustand';
import { DEFAULT_SITE_ID, SITES } from '../data/sites';
import type { Lang } from '../i18n';

export interface SelectedSite {
  /** Id of a named site, or null for a custom pin. */
  id: string | null;
  name: string;
  lat: number;
  lon: number;
  /** Unnamed places get their label from the current language instead of a stored name. */
  kind?: SiteKind;
}

export type PlaybackSpeed = 1 | 6 | 24;

export type ReliefScale = 1 | 3 | 5;

export type MapLayer = 'none' | 'light' | 'ice';

/** Unnamed places: clicked on the map, or found on the light map. */
export type SiteKind = 'custom' | 'brightest' | 'nearIce';

const LANG_KEY = 'lunar-lang';

function initialLang(): Lang {
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
  compare: readonly SelectedSite[];
  /** True while the camera shows the whole Moon instead of hovering over the selected site. */
  isGlobeView: boolean;
  /** Bumped on every fly request, so asking again for the same view still flies the camera. */
  flyNonce: number;
  /** Camera height above the surface, km, updated a few times a second for the HUD. */
  cameraAltitudeKm: number;
  flyToSite: () => void;
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
  setTime: (time: number) => void;
  setGlobeView: (isGlobeView: boolean) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  selectSite: (site: SelectedSite) => void;
  toggleCompare: (site: SelectedSite) => void;
}

export const MAX_COMPARE = 4;

export const siteKey = (s: SelectedSite): string => `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;

const defaultSite = SITES.find((s) => s.id === DEFAULT_SITE_ID) ?? SITES[0];
const startOfHour = (t: number) => Math.floor(t / 3_600_000) * 3_600_000;

export const useNavigator = create<NavigatorState>((set) => ({
  time: startOfHour(Date.now()),
  playing: false,
  speed: 6,
  site: { id: defaultSite.id, name: defaultSite.name, lat: defaultSite.lat, lon: defaultSite.lon },
  compare: [],
  isGlobeView: false,
  flyNonce: 0,
  cameraAltitudeKm: 4000,
  flyToSite: () => set((s) => ({ isGlobeView: false, flyNonce: s.flyNonce + 1 })),
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
  setTime: (time) => set({ time }),
  setGlobeView: (isGlobeView) => set({ isGlobeView }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  selectSite: (site) => set({ site, isGlobeView: false }),
  toggleCompare: (site) =>
    set((state) => {
      const key = siteKey(site);
      const exists = state.compare.some((s) => siteKey(s) === key);
      if (exists) return { compare: state.compare.filter((s) => siteKey(s) !== key) };
      if (state.compare.length >= MAX_COMPARE) return state;
      return { compare: [...state.compare, site] };
    }),
}));
