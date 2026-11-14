import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { siteLabel, useT } from '../i18n';
import { uniquePlaces } from '../data/sites';
import {
  clampView,
  fitBox,
  fromScreen,
  globeToMap,
  HOME_VIEW,
  mapToGlobe,
  mapToPole,
  MAX_SCALE,
  poleToMap,
  toScreen,
  zoomAt,
  type MapPoint,
  type MapView,
} from '../lib/flatMap';
import { pickTier, probeGpu } from '../lib/graphicsTier';
import type { PolarTile } from '../lib/loadTerrain';
import { shadedMap } from '../lib/shadedRelief';
import { siteKey, useNavigator, type SelectedSite } from '../state/store';

interface FlatMapProps {
  /** The south polar map that reaches furthest north (60°S). */
  polar: PolarTile;
  /** The finer map of the pole itself (80°S), laid over the middle of the first. */
  inner?: PolarTile;
  onPick: (lat: number, lon: number) => void;
}

type View = 'pole' | 'globe';

const BASE = import.meta.env.BASE_URL;
const ASPECT: Record<View, number> = { pole: 1, globe: 2 };
/** One button press or wheel notch zooms by this much. */
const ZOOM_STEP = 1.6;
const WHEEL_ZOOM = 1.0018;
/** A press that moves less than this is a click (pick a site), more is a drag (move the map). */
const DRAG_PX = 5;


/**
 * The map lit by its relief once that is ready (a few tens of ms); the plain colour map until then.
 * Nothing is downloaded or computed for a map that is not on screen.
 */
function useShaded(colorUrl: string, normalUrl: string, isWanted: boolean): string {
  const [shaded, setShaded] = useState<{ key: string; url: string }>();
  const key = `${colorUrl}|${normalUrl}`;
  useEffect(() => {
    if (!isWanted) return undefined;
    let alive = true;
    shadedMap(colorUrl, normalUrl)
      .then((url) => alive && setShaded({ key, url }))
      .catch((err: unknown) => console.warn('Relief shading unavailable; showing the plain map', err));
    return () => {
      alive = false;
    };
  }, [colorUrl, normalUrl, key, isWanted]);
  return shaded?.key === key ? shaded.url : colorUrl;
}

/** The frame's size in pixels, kept up to date as the window changes. */
function useSize(ref: React.RefObject<HTMLDivElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * The Moon as a flat picture, for the rare device that cannot draw 3D: drag to move, scroll or
 * double-click to zoom, click to choose a site. Every calculation (Sun, Earth, horizon, NASA data)
 * runs exactly as in 3D; only the scene is flat.
 */
export function FlatMap({ polar, inner, onPick }: FlatMapProps) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const introDone = useNavigator((s) => s.introDone);
  const slowLink = useNavigator((s) => s.slowLink);
  const setGraphicsTier = useNavigator((s) => s.setGraphicsTier);
  const [view, setView] = useState<View>(() => (site.lat < polar.edgeLat ? 'pole' : 'globe'));
  const [mapView, setMapView] = useState<MapView>(HOME_VIEW);
  const [isDragging, setDragging] = useState(false);
  const [canDo3d] = useState(() => probeGpu().hasWebGL);
  const frame = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const { w, h } = useSize(frame);
  const base = fitBox(w, h, ASPECT[view]);
  const tex = (file: string) => `${BASE}textures/${file}`;
  const outerSrc = useShaded(tex(`${polar.name}_color_1k.jpg`), tex(`${polar.name}_normal_1k.jpg`), view === 'pole');
  const innerSrc = useShaded(tex(`${(inner ?? polar).name}_color_1k.jpg`), tex(`${(inner ?? polar).name}_normal_1k.jpg`), view === 'pole' && Boolean(inner));
  const globeSrc = useShaded(tex(`moon_color_${slowLink ? '1k' : '2k'}.jpg`), tex('moon_normal_2k.jpg'), view === 'globe');
  const src = view === 'pole' ? outerSrc : globeSrc;

  // There is no flight to wait for: the map is ready as soon as it is on screen.
  useEffect(() => {
    useNavigator.getState().setSceneReady();
  }, []);
  useEffect(() => {
    if (introDone && !useNavigator.getState().landed) useNavigator.getState().setLanded();
  }, [introDone]);

  const showView = (next: View) => {
    setView(next);
    setMapView(HOME_VIEW);
  };

  const toMap = (lat: number, lon: number): MapPoint | null => {
    if (view === 'globe') return globeToMap(lat, lon);
    return lat < polar.edgeLat ? poleToMap(lat, lon, polar.rhoMax) : null;
  };

  const zoomBy = useCallback(
    (factor: number, x = w / 2, y = h / 2) => setMapView((v) => zoomAt(v, factor, x, y, fitBox(w, h, ASPECT[view]), w, h)),
    [w, h, view],
  );

  // The wheel must zoom the map, not scroll the page, so it is a non-passive listener.
  useEffect(() => {
    const el = frame.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomBy(WHEEL_ZOOM ** -e.deltaY, e.clientX - box.left, e.clientY - box.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const local = (e: ReactPointerEvent) => {
    const box = frame.current!.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = local(e);
    press.current = { x, y, panX: mapView.panX, panY: mapView.panY, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = press.current;
    if (!start) return;
    const { x, y } = local(e);
    if (!start.moved && Math.hypot(x - start.x, y - start.y) < DRAG_PX) return;
    start.moved = true;
    setDragging(true);
    setMapView((v) => clampView({ ...v, panX: start.panX + x - start.x, panY: start.panY + y - start.y }, base));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = press.current;
    press.current = null;
    setDragging(false);
    if (!start || start.moved) return;
    const { x, y } = local(e);
    const point = fromScreen(x, y, base, mapView, w, h);
    if (point.u < 0 || point.u > 1 || point.v < 0 || point.v > 1) return;
    const place = view === 'globe' ? mapToGlobe(point) : mapToPole(point, polar.rhoMax);
    if (place) onPick(place.lat, place.lon);
  };

  const pins = [site, ...uniquePlaces(compare).filter((c: SelectedSite) => siteKey(c) !== siteKey(site))]
    .map((p, i) => ({ place: p, at: toMap(p.lat, p.lon), isPrimary: i === 0 }))
    .filter((p): p is { place: SelectedSite; at: MapPoint; isPrimary: boolean } => p.at !== null)
    .map((p) => ({ ...p, screen: toScreen(p.at, base, mapView, w, h) }));
  // Every picture is scaled about the frame centre, so each needs that point in its own box.
  const placed = (box: { left: number; top: number; width: number; height: number }) => ({
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    transformOrigin: `${w / 2 - box.left}px ${h / 2 - box.top}px`,
    transform: `translate(${mapView.panX}px, ${mapView.panY}px) scale(${mapView.scale})`,
  });
  const innerShare = inner ? inner.rhoMax / polar.rhoMax : 0;
  const innerBox = {
    width: base.width * innerShare,
    height: base.height * innerShare,
    left: base.left + (base.width * (1 - innerShare)) / 2,
    top: base.top + (base.height * (1 - innerShare)) / 2,
  };

  return (
    <div className={`flat-map flat-map--${view}`} data-tour="flat-map">
      <div className="flat-map__bar">
        <p className="flat-map__note">{t(canDo3d ? 'flat.chosen' : 'flat.no3d')}</p>
        <div className="segmented" role="group" aria-label={t('flat.view')}>
          {(['pole', 'globe'] as const).map((v) => (
            <button key={v} type="button" data-tour={`flat-view-${v}`} className={v === view ? 'is-active' : undefined} aria-pressed={v === view} onClick={() => showView(v)}>
              {t(v === 'pole' ? 'flat.pole' : 'flat.globe')}
            </button>
          ))}
        </div>
        {canDo3d && (
          <button type="button" className="ghost-button" onClick={() => setGraphicsTier(pickTier(probeGpu()))}>{t('flat.try3d')}</button>
        )}
      </div>
      <div
        ref={frame}
        className={isDragging ? 'flat-map__frame is-dragging' : 'flat-map__frame'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          press.current = null;
          setDragging(false);
        }}
        onDoubleClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          zoomBy(ZOOM_STEP, e.clientX - box.left, e.clientY - box.top);
        }}
      >
        {w > 0 && <img src={src} alt={t(view === 'pole' ? 'flat.poleAlt' : 'flat.globeAlt')} style={placed(base)} draggable={false} />}
        {w > 0 && view === 'pole' && inner && (
          <img className="flat-map__inner" src={innerSrc} alt="" style={placed(innerBox)} draggable={false} />
        )}
        {pins.map(({ place, screen, isPrimary }) => (
          <span key={siteKey(place)} className={isPrimary ? 'flat-map__pin is-primary' : 'flat-map__pin'} style={{ left: screen.x, top: screen.y }}>
            <span className="flat-map__label">{siteLabel(place, lang)}</span>
          </span>
        ))}
        <div className="flat-map__zoom">
          <button type="button" data-tour="flat-zoom-in" aria-label={t('trek.zoomIn')} title={t('trek.zoomIn')} disabled={mapView.scale >= MAX_SCALE} onClick={() => zoomBy(ZOOM_STEP)}>+</button>
          <button type="button" aria-label={t('trek.zoomOut')} title={t('trek.zoomOut')} disabled={mapView.scale <= 1} onClick={() => zoomBy(1 / ZOOM_STEP)}>−</button>
          <button type="button" aria-label={t('flat.home')} title={t('flat.home')} disabled={mapView.scale <= 1} onClick={() => setMapView(HOME_VIEW)}>⌂</button>
        </div>
        <p className="flat-map__help">{t('flat.help')}</p>
      </div>
    </div>
  );
}
