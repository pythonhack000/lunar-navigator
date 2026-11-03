import { memo, useId, useMemo } from 'react';
import type { HorizonProfile } from '../lib/horizon';
import type { SiteState, Timeline } from '../lib/visibility';

interface HorizonChartProps {
  profile: HorizonProfile;
  timeline: Timeline;
  state: SiteState;
}

const W = 720;
const H = 230;
const PAD = { left: 34, right: 8, top: 12, bottom: 22 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const COMPASS = [
  { az: 0, label: 'N' },
  { az: 90, label: 'E' },
  { az: 180, label: 'S' },
  { az: 270, label: 'W' },
  { az: 360, label: 'N' },
];
const SUN_R = 6;
const EARTH_R = 8;
const MIN_SPAN_DEG = 6;
const MAX_TOP_DEG = 90;

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

/** Sky positions over the coming days, as one dot per hour. */
function TrackDots({ az, el, from, scale, className }: { az: Float32Array; el: Float32Array; from: number; scale: Scale; className: string }) {
  const dots = [];
  for (let i = Math.max(0, from); i < az.length; i += 2) {
    dots.push(<circle key={i} cx={scale.x(az[i])} cy={scale.y(el[i])} r={1.2} />);
  }
  return <g className={className}>{dots}</g>;
}

const MemoTrack = memo(TrackDots);

export function HorizonChart({ profile, timeline, state }: HorizonChartProps) {
  const clipId = useId();
  const { elevationsDeg, stepDeg } = profile;

  const { scale, terrainPath, skyPath } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of elevationsDeg) {
      lo = Math.min(lo, e);
      hi = Math.max(hi, e);
    }
    for (const e of timeline.sunElevation) hi = Math.max(hi, e);
    for (const e of timeline.earthElevation) hi = Math.max(hi, e);
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
  }, [elevationsDeg, stepDeg, timeline]);

  const nowIndex = Math.round((state.time - timeline.start) / timeline.stepMs);
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
          <MemoTrack az={timeline.earthAzimuth} el={timeline.earthElevation} from={0} scale={scale} className="track track--earth" />
          <MemoTrack az={timeline.sunAzimuth} el={timeline.sunElevation} from={nowIndex - (nowIndex % 2)} scale={scale} className="track track--sun" />
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
          <text key={c.az} x={scale.x(c.az)} y={H - 6} textAnchor="middle" className="compass">{c.label}</text>
        ))}
      </svg>
      <figcaption>
        <span className="legend legend--sun">Sun path, next days</span>
        <span className="legend legend--earth">Earth path</span>
        <span className="legend legend--terrain">LOLA terrain horizon</span>
      </figcaption>
    </figure>
  );
}
