import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import { formatDeg, formatDuration, formatHours, formatLatLon, formatPercent } from '../lib/format';
import type { BodyView } from '../lib/visibility';
import { siteKey, useNavigator, MAX_COMPARE } from '../state/store';
import { HorizonChart } from './HorizonChart';

interface SitePanelProps {
  analysis: SiteAnalysis;
  time: number;
}

const UP_SHARE = 0.5;

function statusLine(body: BodyView, nextChange: number | null, time: number, setsWord: string, risesWord: string): string {
  const up = body.visibleFraction >= UP_SHARE;
  if (nextChange === null) return up ? 'Up for the whole month ahead' : 'Stays hidden this month';
  return `${up ? setsWord : risesWord} in ${formatDuration(nextChange - time)}`;
}

interface ReadoutProps {
  title: string;
  tone: 'sun' | 'earth';
  body: BodyView;
  status: string;
  detail: string;
}

function Readout({ title, tone, body, status, detail }: ReadoutProps) {
  const up = body.visibleFraction >= UP_SHARE;
  const partial = body.visibleFraction > 0.02 && body.visibleFraction < 0.98;
  return (
    <div className={`readout readout--${tone}`}>
      <div className="readout__head">
        <span className="readout__title">{title}</span>
        <span className={up ? 'pill pill--up' : 'pill'}>{up ? 'Visible' : 'Hidden'}</span>
      </div>
      <div className="readout__big">
        {formatDeg(body.elDeg)}
        <small> elevation</small>
      </div>
      <dl className="readout__grid">
        <div><dt>Azimuth</dt><dd>{formatDeg(body.azDeg, 0)}</dd></div>
        <div><dt>Terrain</dt><dd>{formatDeg(body.horizonDeg)}</dd></div>
        <div><dt>Clearance</dt><dd>{formatDeg(body.elDeg - body.horizonDeg)}</dd></div>
      </dl>
      <p className="readout__status">{status}</p>
      {partial && <p className="readout__detail">{formatPercent(body.visibleFraction)} of the disc above the ridge line</p>}
      <p className="readout__detail">{detail}</p>
    </div>
  );
}

export function SitePanel({ analysis, time }: SitePanelProps) {
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const toggleCompare = useNavigator((s) => s.toggleCompare);
  const { state, summary, profile, timeline } = analysis;
  const inCompare = compare.some((c) => siteKey(c) === siteKey(site));
  const compareFull = !inCompare && compare.length >= MAX_COMPARE;
  const sunPower = Math.max(0, Math.sin((state.sun.elDeg * Math.PI) / 180)) * state.sun.visibleFraction;

  return (
    <section className="panel site-panel" aria-label="Selected site">
      <header className="site-panel__head">
        <div>
          <h2>{site.name}</h2>
          <p className="muted">
            {formatLatLon(site.lat, site.lon)} · {Math.round(profile.siteHeightM).toLocaleString('en-US')} m
          </p>
        </div>
        <button type="button" className="ghost-button" disabled={compareFull} onClick={() => toggleCompare(site)}>
          {inCompare ? 'Remove from compare' : 'Compare'}
        </button>
      </header>

      <div className="readouts">
        <Readout
          title="Sun"
          tone="sun"
          body={state.sun}
          status={statusLine(state.sun, analysis.nextSunChange, time, 'Sets', 'Rises')}
          detail={`Flat panel output ${formatPercent(sunPower)} of peak`}
        />
        <Readout
          title="Earth"
          tone="earth"
          body={state.earth}
          status={statusLine(state.earth, analysis.nextEarthChange, time, 'Earthset', 'Earthrise')}
          detail={`${Math.round(state.earth.distanceKm).toLocaleString('en-US')} km away`}
        />
      </div>

      <HorizonChart profile={profile} timeline={timeline} state={state} />

      <div className="month">
        <h3>Next lunar month</h3>
        <dl className="month__grid">
          <div><dt>Sunlight</dt><dd>{formatPercent(summary.sunlitShare)}</dd></div>
          <div><dt>Earth in view</dt><dd>{formatPercent(summary.earthShare)}</dd></div>
          <div><dt>Power + link</dt><dd>{formatPercent(summary.bothShare)}</dd></div>
          <div><dt>Longest night</dt><dd>{summary.longestDarkHours > 0 ? formatHours(summary.longestDarkHours) : '—'}</dd></div>
          <div><dt>Longest blackout</dt><dd>{summary.longestCommsGapHours > 0 ? formatHours(summary.longestCommsGapHours) : '—'}</dd></div>
        </dl>
      </div>
    </section>
  );
}
