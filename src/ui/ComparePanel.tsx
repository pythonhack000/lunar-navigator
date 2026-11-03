import { useMemo } from 'react';
import { useT, type StringKey } from '../i18n';
import { WINDOW_MS } from '../hooks/useSiteAnalysis';
import { formatHours, formatPercent, HOUR_MS } from '../lib/format';
import { computeHorizon } from '../lib/horizon';
import type { Terrain } from '../lib/terrain';
import { sampleTimeline, summarizeTimeline, type TimelineSummary } from '../lib/visibility';
import { siteKey, useNavigator, type SelectedSite } from '../state/store';

interface ComparePanelProps {
  terrain: Terrain;
  windowStart: number;
}

interface Row {
  site: SelectedSite;
  summary: TimelineSummary;
}

type Metric = { key: keyof TimelineSummary; label: StringKey; better: 'high' | 'low'; isDuration?: boolean };

const METRICS: Metric[] = [
  { key: 'sunlitShare', label: 'sunlight', better: 'high' },
  { key: 'earthShare', label: 'compare.earth', better: 'high' },
  { key: 'bothShare', label: 'compare.both', better: 'high' },
  { key: 'longestDarkHours', label: 'night', better: 'low', isDuration: true },
];

function summarize(terrain: Terrain, site: SelectedSite, windowStart: number): TimelineSummary {
  const profile = computeHorizon(terrain, site.lat, site.lon);
  const timeline = sampleTimeline({ lat: site.lat, lon: site.lon, heightM: profile.siteHeightM }, profile, windowStart, WINDOW_MS, HOUR_MS);
  return summarizeTimeline(timeline);
}

function bestValue(rows: Row[], metric: Metric): number {
  const values = rows.map((r) => r.summary[metric.key]);
  return metric.better === 'high' ? Math.max(...values) : Math.min(...values);
}

export function ComparePanel({ terrain, windowStart }: ComparePanelProps) {
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const selectSite = useNavigator((s) => s.selectSite);
  const toggleCompare = useNavigator((s) => s.toggleCompare);
  const lang = useNavigator((s) => s.lang);
  const t = useT();
  const show = (m: Metric, v: number) => (m.isDuration ? (v > 0 ? formatHours(v, lang) : '—') : formatPercent(v));

  const sites = useMemo(() => {
    const current = compare.some((c) => siteKey(c) === siteKey(site));
    return current ? compare : [site, ...compare];
  }, [compare, site]);

  const rows = useMemo<Row[]>(
    () => sites.map((s) => ({ site: s, summary: summarize(terrain, s, windowStart) })),
    [sites, terrain, windowStart],
  );

  if (compare.length === 0) return null;
  const currentKey = siteKey(site);

  return (
    <section className="panel compare" aria-label="Site comparison">
      <h3>{t('compare.title')}</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">{t('compare.site')}</th>
            {METRICS.map((m) => <th key={m.key} scope="col">{t(m.label)}</th>)}
            <th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = siteKey(r.site);
            const listed = compare.some((c) => siteKey(c) === key);
            return (
              <tr key={key} className={key === currentKey ? 'is-current' : undefined}>
                <th scope="row">
                  <button type="button" className="link-button" onClick={() => selectSite(r.site)}>{r.site.name}</button>
                </th>
                {METRICS.map((m) => {
                  const v = r.summary[m.key];
                  const best = rows.length > 1 && v === bestValue(rows, m);
                  return <td key={m.key} className={best ? 'is-best' : undefined}>{show(m, v)}</td>;
                })}
                <td>
                  {listed && (
                    <button type="button" className="icon-button" aria-label={t('compare.remove', { name: r.site.name })} onClick={() => toggleCompare(r.site)}>
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
