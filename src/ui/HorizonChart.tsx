import { useId, useMemo } from 'react';
import { useT } from '../i18n';
import type { HorizonProfile } from '../lib/horizon';
import type { SiteState, Timeline } from '../lib/visibility';

interface HorizonChartProps {
  profile: HorizonProfile;
  timeline: Timeline;
  state: SiteState;
  /** Site latitude: fixes the top of the scale so it does not jump as the time window slides. */
  lat: number;
}

const W = 720;
const H = 230;
const PAD = { left: 34, right: 8, top: 12, bottom: 22 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const COMPASS = [
  { az: 0, label: 'compass.N' },
  { az: 90, label: 'compass.E' },
  { az: 180, label: 'compass.S' },
  { az: 270, label: 'compass.W' },
  { az: 360, label: 'compass.N' },
] as const;
const SUN_R = 6;
const EARTH_R = 8;
const MIN_SPAN_DEG = 6;
const MAX_TOP_DEG = 90;
/** Highest the Sun (axial tilt 1.5°) or Earth (libration + orbit tilt ≈ 6.7°) can climb above 90° − |lat|. */
const SKY_MARGIN_DEG = 7;

interface Scale {
  x: (az: number) => number;
  y: (el: number) => number;
  ticks: number[];
}

function niceStep(span: number): number {
  for (const s of [1, 2, 5, 10, 15, 30]) if (span / s <= 6) return s;
  return 30;
}

function makeScale(bottom: number, top: number): Scale {
  const step = niceStep(top - bottom);
  const ticks: number[] = [];
  for (let t = Math.ceil(bottom / step) * step; t <= top; t += step) ticks.push(t);
  return {
    x: (az) => PAD.left + (az / 360) * PLOT_W,
    y: (el) => PAD.top + ((top - el) / (top - bottom)) * PLOT_H,
    ticks,
  };
}

/** Azimuth jump that means the path crossed north (0°/360°) rather than really moving that far. */
const WRAP_JUMP_DEG = 180;

/**
 * A body's path across the sky as one smooth line. The line breaks where the azimuth wraps past
 * north, and starts at the body's live position so it never lags behind the disc.
 */
function trackPath(az: ArrayLike<number>, el: ArrayLike<number>, from: number, scale: Scale, start?: { az: number; el: number }): string {
  const parts: string[] = [];
  let prevAz = start?.az ?? NaN;
  if (start) parts.push(`M${scale.x(start.az).toFixed(1)},${scale.y(start.el).toFixed(1)}`);
  for (let i = Math.max(0, from); i < az.length; i++) {
    const jump = Math.abs(az[i] - prevAz) > WRAP_JUMP_DEG || Number.isNaN(prevAz);
    parts.push(`${jump ? 'M' : 'L'}${scale.x(az[i]).toFixed(1)},${scale.y(el[i]).toFixed(1)}`);
    prevAz = az[i];
  }
  return parts.join('');
}

export function HorizonChart({ profile, timeline, state, lat }: HorizonChartProps) {
  const t = useT();
  const clipId = useId();
  const { elevationsDeg, stepDeg } = profile;

  const { scale, terrainPath, skyPath } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of elevationsDeg) {
      lo = Math.min(lo, e);
      hi = Math.max(hi, e);
    }
    hi = Math.max(hi, 90 - Math.abs(lat) + SKY_MARGIN_DEG);
    const bottom = Math.floor(Math.min(lo, -1) - 0.5);
    const top = Math.min(MAX_TOP_DEG, Math.max(bottom + MIN_SPAN_DEG, Math.ceil(hi + 1)));
    const s = makeScale(bottom, top);
    const pts = Array.from(elevationsDeg, (e, i) => `${s.x(i * stepDeg).toFixed(1)},${s.y(e).toFixed(1)}`);
    pts.push(`${s.x(360).toFixed(1)},${s.y(elevationsDeg[0]).toFixed(1)}`);
    const line = pts.join(' L');
    return {
      scale: s,
      terrainPath: `M${s.x(0)},${s.y(bottom)} L${line} L${s.x(360)},${s.y(bottom)} Z`,
      skyPath: `M${s.x(0)},${s.y(top)} L${line} L${s.x(360)},${s.y(top)} Z`,
    };
  }, [elevationsDeg, stepDeg, lat]);

  // The first sample after "now"; the live position is drawn in front of it.
  const nextIndex = Math.max(0, Math.ceil((state.time - timeline.start) / timeline.stepMs));
  const sunTrack = useMemo(
    () => trackPath(timeline.sunAzimuth, timeline.sunElevation, nextIndex, scale, { az: state.sun.azDeg, el: state.sun.elDeg }),
    [timeline, nextIndex, scale, state.sun.azDeg, state.sun.elDeg],
  );
  const earthTrack = useMemo(() => trackPath(timeline.earthAzimuth, timeline.earthElevation, 0, scale), [timeline, scale]);
  const plotTop = PAD.top;
  const plotBottom = PAD.top + PLOT_H;
  const clampY = (y: number) => Math.min(plotBottom - SUN_R, Math.max(plotTop + SUN_R, y));
  const sunY = clampY(scale.y(state.sun.elDeg));
  const earthY = clampY(scale.y(state.earth.elDeg));

  return (
    <figure className="horizon-chart" data-tour="horizon">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Terrain horizon with the paths of the Sun and Earth">
        <defs>
          <clipPath id={clipId}>
            <path d={skyPath} />
          </clipPath>
          <clipPath id={`${clipId}-plot`}>
            <rect x={PAD.left} y={plotTop} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>
        {scale.ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={PAD.left} x2={W - PAD.right} y1={scale.y(t)} y2={scale.y(t)} />
            <text x={PAD.left - 6} y={scale.y(t) + 3} textAnchor="end">{t}°</text>
          </g>
        ))}
        <g clipPath={`url(#${clipId}-plot)`}>
          <path d={earthTrack} className="track track--earth" />
          <path d={sunTrack} className="track track--sun" />
          <path d={terrainPath} className="terrain" />
        </g>
        {/* Behind the terrain: a dashed outline shows where the body is hiding. */}
        <circle cx={scale.x(state.earth.azDeg)} cy={earthY} r={EARTH_R} className="disc-ghost disc-ghost--earth" />
        <circle cx={scale.x(state.sun.azDeg)} cy={sunY} r={SUN_R} className="disc-ghost disc-ghost--sun" />
        <g clipPath={`url(#${clipId})`}>
          <circle cx={scale.x(state.earth.azDeg)} cy={earthY} r={EARTH_R} className="disc disc--earth" />
          <circle cx={scale.x(state.sun.azDeg)} cy={sunY} r={SUN_R} className="disc disc--sun" />
        </g>
        {COMPASS.map((c) => (
          <text key={c.az} x={scale.x(c.az)} y={H - 6} textAnchor="middle" className="compass">{t(c.label)}</text>
        ))}
      </svg>
      <figcaption>
        <span className="legend legend--sun">{t('legend.sunPath')}</span>
        <span className="legend legend--earth">{t('legend.earthPath')}</span>
        <span className="legend legend--terrain">{t('legend.terrain')}</span>
      </figcaption>
    </figure>
  );
}
