import { useMemo } from 'react';
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

type Metric = { key: keyof TimelineSummary; label: string; better: 'high' | 'low'; format: (v: number) => string };

const METRICS: Metric[] = [
  { key: 'sunlitShare', label: 'Sunlight', better: 'high', format: formatPercent },
  { key: 'earthShare', label: 'Earth', better: 'high', format: formatPercent },
  { key: 'bothShare', label: 'Both', better: 'high', format: formatPercent },
  { key: 'longestDarkHours', label: 'Longest night', better: 'low', format: (v) => (v > 0 ? formatHours(v) : '—') },
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
      <h3>Compare · next lunar month</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Site</th>
            {METRICS.map((m) => <th key={m.key} scope="col">{m.label}</th>)}
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
                  return <td key={m.key} className={best ? 'is-best' : undefined}>{m.format(v)}</td>;
                })}
                <td>
                  {listed && (
                    <button type="button" className="icon-button" aria-label={`Remove ${r.site.name}`} onClick={() => toggleCompare(r.site)}>
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
