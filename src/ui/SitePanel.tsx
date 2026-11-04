import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import type { SiteScoreView } from '../hooks/useSiteScore';
import { DSN_STATIONS, stationName } from '../lib/dsn';
import { siteLabel, useT, type Translate } from '../i18n';
import { formatDeg, formatDuration, formatHours, formatLatLon, formatPercent } from '../lib/format';
import type { BodyView } from '../lib/visibility';
import { MAX_COMPARE, siteKey, useNavigator } from '../state/store';
import { HorizonChart } from './HorizonChart';
import { LandingCalendar } from './LandingCalendar';
import { MissionReport } from './MissionReport';
import { ReportDialog } from './ReportDialog';
import type { PeriodRange } from '../lib/periodReport';

interface SitePanelProps {
  analysis: SiteAnalysis;
  score: SiteScoreView;
  time: number;
}

const CalendarIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className="button-icon">
    <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const DocumentIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className="button-icon">
    <path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M9.5 1.5V5H13M6.5 9h4M6.5 11.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/** One line per factor: what it is, the measured value, and how much of its full credit it earns. */
function ScoreCard({ view }: { view: SiteScoreView }) {
  const t = useT();
  const setValidationOpen = useNavigator((s) => s.setValidationOpen);
  const { score, slopeDeg, iceKm } = view;
  const factors = [
    { key: 'score.sun', value: formatPercent(score.parts.sun), share: score.parts.sun },
    { key: 'score.link', value: formatPercent(score.parts.link), share: score.parts.link },
    { key: 'score.slope', value: formatDeg(slopeDeg), share: score.parts.slope },
    { key: 'score.ice', value: iceKm === null ? t('score.noIce') : `${iceKm.toFixed(1)} ${t('unit.km')}`, share: score.parts.ice },
  ] as const;
  return (
    <div className="score" title={t('score.hint')} data-tour="score">
      <div className="score__total">
        <span className="muted">{t('score.title')}</span>
        <b>{score.total}</b>
        <small>/100</small>
        <button type="button" className="link-button score__check" onClick={() => setValidationOpen(true)}>{t('val.open')} →</button>
      </div>
      <dl className="score__factors">
        {factors.map((f) => (
          <div key={f.key}>
            <dt>{t(f.key)}</dt>
            <dd>{f.value}</dd>
            <span className="score__bar"><span style={{ width: `${Math.round(f.share * 100)}%` }} /></span>
          </div>
        ))}
      </dl>
    </div>
  );
}

const UP_SHARE = 0.5;

interface ReadoutProps {
  tone: 'sun' | 'earth';
  body: BodyView;
  nextChange: number | null;
  time: number;
  detail: string;
}

function statusLine(t: Translate, lang: 'en' | 'ru', tone: 'sun' | 'earth', body: BodyView, next: number | null, time: number): string {
  const up = body.visibleFraction >= UP_SHARE;
  if (next === null) return up ? t('upAll') : t('hiddenAll');
  const d = formatDuration(next - time, lang);
  if (tone === 'sun') return up ? t('sets', { d }) : t('rises', { d });
  return up ? t('earthset', { d }) : t('earthrise', { d });
}

function Readout({ tone, body, nextChange, time, detail }: ReadoutProps) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const up = body.visibleFraction >= UP_SHARE;
  const partial = body.visibleFraction > 0.02 && body.visibleFraction < 0.98;
  return (
    <div className={`readout readout--${tone}`}>
      <div className="readout__head">
        <span className="readout__title">{t(tone)}</span>
        <span className={up ? 'pill pill--up' : 'pill'}>{up ? t('visible') : t('hidden')}</span>
      </div>
      <div className="readout__big">
        {formatDeg(body.elDeg)}
        <small> {t('elevation')}</small>
      </div>
      <p className="readout__status">{statusLine(t, lang, tone, body, nextChange, time)}</p>
      <p className="readout__detail">{partial ? t('disc', { p: formatPercent(body.visibleFraction) }) : detail}</p>
      <dl className="readout__grid">
        <div><dt>{t('azimuth')}</dt><dd>{formatDeg(body.azDeg, 0)}</dd></div>
        <div><dt>{t('terrain')}</dt><dd>{formatDeg(body.horizonDeg)}</dd></div>
        <div><dt>{t('clearance')}</dt><dd>{formatDeg(body.elDeg - body.horizonDeg)}</dd></div>
      </dl>
    </div>
  );
}

/**
 * The essentials first (Sun, Earth, the horizon); month totals and landing windows open on demand
 * so a first-time visitor is not faced with a wall of numbers.
 */
export function SitePanel({ analysis, score, time }: SitePanelProps) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const toggleCompare = useNavigator((s) => s.toggleCompare);
  const [showCalendar, setShowCalendar] = useState(false);
  const [report, setReport] = useState<'choosing' | PeriodRange | null>(null);
  const closeReport = useCallback(() => setReport(null), []);
  /**
   * Lays the report out synchronously, then opens the print dialog in the same click: browsers
   * may silently refuse a print() that is not a direct response to the user, which looked like
   * "nothing happens".
   */
  const printReport = useCallback((range: PeriodRange) => {
    flushSync(() => setReport(range));
    window.print();
  }, []);
  const { state, summary, profile, timeline } = analysis;
  const inCompare = compare.some((c) => siteKey(c) === siteKey(site));
  const compareFull = !inCompare && compare.length >= MAX_COMPARE;
  const sunPower = Math.max(0, Math.sin((state.sun.elDeg * Math.PI) / 180)) * state.sun.visibleFraction;

  return (
    <section className="panel site-panel" aria-label={siteLabel(site, lang)}>
      <header className="site-panel__head">
        <div>
          <h2>{siteLabel(site, lang)}</h2>
          <p className="muted">
            {formatLatLon(site.lat, site.lon)} · {Math.round(profile.siteHeightM).toLocaleString('en-US')} m
          </p>
        </div>
        <div className="site-panel__actions">
          <button type="button" className="primary-button ground-enter" data-tour="ground" onClick={() => useNavigator.getState().enterGroundView()}>
            {t('ground.enter')}
          </button>
          <button type="button" className={inCompare ? 'ghost-button is-on' : 'ghost-button'} disabled={compareFull} onClick={() => toggleCompare(site)}>
            {inCompare ? t('panel.inCompare') : t('panel.compare')}
          </button>
        </div>
      </header>

      <div className="readouts" data-tour="readouts">
        <Readout tone="sun" body={state.sun} nextChange={analysis.nextSunChange} time={time} detail={t('panelOut', { p: formatPercent(sunPower) })} />
        <Readout
          tone="earth"
          body={state.earth}
          nextChange={analysis.nextEarthChange}
          time={time}
          detail={
            state.earth.visibleFraction >= UP_SHARE
              ? analysis.linkNow >= 0
                ? t('link.via', { s: stationName(DSN_STATIONS[analysis.linkNow], lang), p: DSN_STATIONS[analysis.linkNow].place[lang] })
                : t('link.noStation')
              : t('kmAway', { km: Math.round(state.earth.distanceKm).toLocaleString('en-US') })
          }
        />
      </div>

      <HorizonChart profile={profile} timeline={timeline} state={state} lat={site.lat} />

      <ScoreCard view={score} />

      <div className="month" data-tour="month">
        <div className="month__summary">
          <span><b>{formatPercent(summary.sunlitShare)}</b> {t('sunlight')}</span>
          <span><b>{formatPercent(summary.earthShare)}</b> {t('earthView')}</span>
          <span><b>{formatPercent(analysis.powerLinkShare)}</b> {t('powerLink')}</span>
        </div>
        <p className="month__extremes">
          {t('month.extremes', {
            n: summary.longestDarkHours > 0 ? formatHours(summary.longestDarkHours, lang) : '—',
            b: summary.longestCommsGapHours > 0 ? formatHours(summary.longestCommsGapHours, lang) : '—',
          })}
        </p>
        <div className="month__actions">
          <div className="month__buttons" data-tour="report">
            <button type="button" className="ghost-button" onClick={() => setShowCalendar(true)}>
              <CalendarIcon />
              {t('panel.windows')}
            </button>
            <button type="button" className="ghost-button" onClick={() => setReport('choosing')}>
              <DocumentIcon />
              {t('panel.report')}
            </button>
          </div>
        </div>
      </div>
      {showCalendar && <LandingCalendar analysis={analysis} onClose={() => setShowCalendar(false)} />}
      {report === 'choosing' && <ReportDialog onCreate={printReport} onClose={closeReport} />}
      {report !== null && report !== 'choosing' && <MissionReport analysis={analysis} score={score} range={report} onDone={closeReport} />}
    </section>
  );
}
