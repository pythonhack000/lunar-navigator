import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import type { SiteScoreView } from '../hooks/useSiteScore';
import { siteLabel } from '../i18n';
import { DSN_STATIONS } from '../lib/dsn';
import { formatDeg, formatHours, formatLatLon, formatPercent } from '../lib/format';
import { bestLandingDays, stationShares } from '../lib/report';
import { useNavigator } from '../state/store';
import { HorizonChart } from './HorizonChart';
import { reportText } from './reportText';

type Props = { analysis: SiteAnalysis; score: SiteScoreView; onDone: () => void };

const BEST_DAYS = 5;

/**
 * A one-page report for the selected site, laid out for paper: it is rendered off screen and handed
 * to the browser's print dialog, where "Save as PDF" turns it into a document to leave with a jury.
 */
export function MissionReport({ analysis, score, onDone }: Props) {
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const text = reportText(lang);
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';
  const { summary, timeline, profile, state } = analysis;
  const end = timeline.start + (timeline.sun.length - 1) * timeline.stepMs;
  const date = (t: number) => new Date(t).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const days = bestLandingDays(timeline, analysis.link, BEST_DAYS);
  const shares = stationShares(analysis.link, DSN_STATIONS.length);

  useEffect(() => {
    window.addEventListener('afterprint', onDone);
    // One frame so the report is laid out before the dialog snapshots the page.
    const id = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('afterprint', onDone);
    };
  }, [onDone]);

  const rows: [string, string][] = [
    [text.rows.sun, formatPercent(summary.sunlitShare)],
    [text.rows.earth, formatPercent(summary.earthShare)],
    [text.rows.link, formatPercent(analysis.linkShare)],
    [text.rows.powerLink, formatPercent(analysis.powerLinkShare)],
    [text.rows.night, summary.longestDarkHours > 0 ? formatHours(summary.longestDarkHours, lang) : '—'],
    [text.rows.blackout, summary.longestCommsGapHours > 0 ? formatHours(summary.longestCommsGapHours, lang) : '—'],
  ];
  const factors: [string, string, number][] = [
    [text.factors.sun, formatPercent(score.score.parts.sun), score.score.parts.sun],
    [text.factors.link, formatPercent(score.score.parts.link), score.score.parts.link],
    [text.factors.slope, formatDeg(score.slopeDeg), score.score.parts.slope],
    [text.factors.ice, score.iceKm === null ? text.noIce : `${score.iceKm.toFixed(1)} ${text.km}`, score.score.parts.ice],
  ];

  return createPortal(
    <article className="print-report" data-no-scramble>
      <header className="report__head">
        <div>
          <p className="report__kicker">Lunar Landing Site Navigator · {text.title}</p>
          <h1>{siteLabel(site, lang)}</h1>
          <p>{formatLatLon(site.lat, site.lon)} · {Math.round(profile.siteHeightM).toLocaleString('en-US')} m</p>
        </div>
        <div className="report__score">
          <span>{text.score}</span>
          <b>{score.score.total}</b>
          <small>/100</small>
        </div>
      </header>
      <p className="report__meta">
        {text.window}: {date(timeline.start)} – {date(end)} · {text.generated}: {date(Date.now())}
      </p>

      <section className="report__factors">
        {factors.map(([label, value, share]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{value}</b>
            <i><em style={{ width: `${Math.round(share * 100)}%` }} /></i>
          </div>
        ))}
      </section>

      <div className="report__cols">
        <section>
          <h2>{text.month}</h2>
          <table>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2>{text.dsn}</h2>
          <table>
            <tbody>
              {DSN_STATIONS.map((s, i) => (
                <tr key={s.id}><th scope="row">{s.name}, {s.place[lang]}</th><td>{formatPercent(shares[i])}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="report__note">{text.dsnNote}</p>
        </section>
      </div>

      <section>
        <h2>{text.days}</h2>
        {days.length === 0 ? (
          <p>{text.noDays}</p>
        ) : (
          <ol className="report__days">
            {days.map((d) => (
              <li key={d.day}><span>{date(d.day)}</span><b>{d.hours} {text.hours}</b></li>
            ))}
          </ol>
        )}
        <p className="report__note">{text.daysNote}</p>
      </section>

      <section className="report__horizon">
        <h2>{text.horizon}</h2>
        <HorizonChart profile={profile} timeline={timeline} state={state} lat={site.lat} />
      </section>

      <footer className="report__sources">
        <h2>{text.sources}</h2>
        <ul>{text.sourceLines.map((l) => <li key={l}>{l}</li>)}</ul>
        <p>{window.location.origin + window.location.pathname}</p>
      </footer>
    </article>,
    document.body,
  );
}
