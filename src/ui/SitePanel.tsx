import { useState } from 'react';
import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import { siteLabel, useT, type Translate } from '../i18n';
import { formatDeg, formatDuration, formatHours, formatLatLon, formatPercent } from '../lib/format';
import type { BodyView } from '../lib/visibility';
import { MAX_COMPARE, siteKey, useNavigator } from '../state/store';
import { HorizonChart } from './HorizonChart';
import { LandingCalendar } from './LandingCalendar';

interface SitePanelProps {
  analysis: SiteAnalysis;
  time: number;
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
export function SitePanel({ analysis, time }: SitePanelProps) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const toggleCompare = useNavigator((s) => s.toggleCompare);
  const [showDetails, setShowDetails] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
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
        <button type="button" className={inCompare ? 'ghost-button is-on' : 'ghost-button'} disabled={compareFull} onClick={() => toggleCompare(site)}>
          {inCompare ? t('panel.inCompare') : t('panel.compare')}
        </button>
      </header>

      <div className="readouts" data-tour="readouts">
        <Readout tone="sun" body={state.sun} nextChange={analysis.nextSunChange} time={time} detail={t('panelOut', { p: formatPercent(sunPower) })} />
        <Readout
          tone="earth"
          body={state.earth}
          nextChange={analysis.nextEarthChange}
          time={time}
          detail={t('kmAway', { km: Math.round(state.earth.distanceKm).toLocaleString('en-US') })}
        />
      </div>

      <HorizonChart profile={profile} timeline={timeline} state={state} />

      <div className="month" data-tour="month">
        <div className="month__summary">
          <span><b>{formatPercent(summary.sunlitShare)}</b> {t('sunlight')}</span>
          <span><b>{formatPercent(summary.earthShare)}</b> {t('earthView')}</span>
          <span><b>{formatPercent(summary.bothShare)}</b> {t('both')}</span>
        </div>
        <div className="month__actions">
          <button type="button" className="link-button" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>
            {t('panel.details')} {showDetails ? '▾' : '▸'}
          </button>
          <button type="button" className="ghost-button" onClick={() => setShowCalendar(true)}>
            {t('panel.windows')}
          </button>
        </div>
        {showDetails && (
          <dl className="month__grid">
            <div><dt>{t('night')}</dt><dd>{summary.longestDarkHours > 0 ? formatHours(summary.longestDarkHours, lang) : '—'}</dd></div>
            <div><dt>{t('blackout')}</dt><dd>{summary.longestCommsGapHours > 0 ? formatHours(summary.longestCommsGapHours, lang) : '—'}</dd></div>
          </dl>
        )}
      </div>
      {showCalendar && <LandingCalendar analysis={analysis} onClose={() => setShowCalendar(false)} />}
    </section>
  );
}
