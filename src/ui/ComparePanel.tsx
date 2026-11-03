import { useMemo, useState } from 'react';
import { siteLabel, useT, type StringKey } from '../i18n';
import { DAY_MS, formatHours, formatPercent, fromDateTimeInput, HOUR_MS, toDateTimeInput } from '../lib/format';
import { computeHorizon } from '../lib/horizon';
import type { Terrain } from '../lib/terrain';
import { sampleTimeline, summarizeTimeline, type TimelineSummary } from '../lib/visibility';
import { siteKey, useNavigator, type SelectedSite } from '../state/store';

interface ComparePanelProps {
  terrain: Terrain;
  windowStart: number;
}

type Period = 'week' | 'month' | 'quarter' | 'custom';

const PERIOD_DAYS: Record<Exclude<Period, 'custom'>, number> = { week: 7, month: 29.53, quarter: 90 };
/** Long spans use a coarser step: whole-month shares barely change, and it keeps comparing instant. */
const LONG_SPAN_DAYS = 45;

type Metric = { key: keyof TimelineSummary; label: StringKey; better: 'high' | 'low'; isDuration?: boolean };

const METRICS: Metric[] = [
  { key: 'sunlitShare', label: 'sunlight', better: 'high' },
  { key: 'earthShare', label: 'compare.earth', better: 'high' },
  { key: 'bothShare', label: 'compare.both', better: 'high' },
  { key: 'longestDarkHours', label: 'night', better: 'low', isDuration: true },
];

function summarize(terrain: Terrain, site: SelectedSite, start: number, spanMs: number): TimelineSummary {
  const profile = computeHorizon(terrain, site.lat, site.lon);
  const step = spanMs > LONG_SPAN_DAYS * DAY_MS ? 3 * HOUR_MS : HOUR_MS;
  const timeline = sampleTimeline({ lat: site.lat, lon: site.lon, heightM: profile.siteHeightM }, profile, start, spanMs, step);
  return summarizeTimeline(timeline);
}

const dateOnly = (time: number) => toDateTimeInput(time).slice(0, 10);

/**
 * Side-by-side comparison of the selected site and the ones added with "+ Compare", over a period
 * the user picks. Bars make the winner obvious at a glance; the best value in each column glows.
 */
export function ComparePanel({ terrain, windowStart }: ComparePanelProps) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const selectSite = useNavigator((s) => s.selectSite);
  const toggleCompare = useNavigator((s) => s.toggleCompare);
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState(() => dateOnly(windowStart + 2 * DAY_MS));
  const [customTo, setCustomTo] = useState(() => dateOnly(windowStart + 16 * DAY_MS));

  const sites = useMemo(() => {
    const current = compare.some((c) => siteKey(c) === siteKey(site));
    return current ? compare : [site, ...compare];
  }, [compare, site]);

  const [start, span] = useMemo((): [number, number] => {
    if (period !== 'custom') return [windowStart, PERIOD_DAYS[period] * DAY_MS];
    const from = fromDateTimeInput(`${customFrom}T00:00`) ?? windowStart;
    const to = fromDateTimeInput(`${customTo}T00:00`) ?? from + DAY_MS;
    return [Math.min(from, to), Math.max(DAY_MS, Math.abs(to - from))];
  }, [period, windowStart, customFrom, customTo]);

  const rows = useMemo(() => sites.map((s) => ({ site: s, summary: summarize(terrain, s, start, span) })), [sites, terrain, start, span]);

  if (compare.length === 0) return null;
  const currentKey = siteKey(site);
  const show = (m: Metric, v: number) => (m.isDuration ? (v > 0 ? formatHours(v, lang) : '—') : formatPercent(v));
  const extremes = METRICS.map((m) => {
    const values = rows.map((r) => r.summary[m.key]);
    return { best: m.better === 'high' ? Math.max(...values) : Math.min(...values), max: Math.max(...values, 1e-9) };
  });

  return (
    <section className="panel compare" aria-label={t('compare.title')}>
      <header className="compare__head">
        <h3>{t('compare.title')}</h3>
        <div className="segmented compare__periods" role="group" aria-label={t('compare.period')}>
          {(['week', 'month', 'quarter', 'custom'] as const).map((p) => (
            <button key={p} type="button" className={p === period ? 'is-active' : undefined} aria-pressed={p === period} onClick={() => setPeriod(p)}>
              {t(`period.${p}`)}
            </button>
          ))}
        </div>
      </header>
      {period === 'custom' && (
        <div className="compare__range">
          <label>{t('compare.from')} <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label>
          <label>{t('compare.to')} <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th scope="col">{t('compare.site')}</th>
            {METRICS.map((m) => <th key={m.key} scope="col">{t(m.label)}</th>)}
            <th aria-label="×" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = siteKey(r.site);
            const listed = compare.some((c) => siteKey(c) === key);
            return (
              <tr key={key} className={key === currentKey ? 'is-current' : undefined}>
                <th scope="row">
                  <button type="button" className="link-button" onClick={() => selectSite(r.site)}>{siteLabel(r.site, lang)}</button>
                </th>
                {METRICS.map((m, i) => {
                  const v = r.summary[m.key];
                  const isBest = rows.length > 1 && v === extremes[i].best;
                  return (
                    <td key={m.key} className={isBest ? 'is-best' : undefined}>
                      <span className="compare__value">{show(m, v)}</span>
                      <span className="compare__bar"><span style={{ width: `${(v / extremes[i].max) * 100}%` }} /></span>
                    </td>
                  );
                })}
                <td>
                  {listed && (
                    <button type="button" className="icon-button" aria-label={t('compare.remove', { name: siteLabel(r.site, lang) })} onClick={() => toggleCompare(r.site)}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
