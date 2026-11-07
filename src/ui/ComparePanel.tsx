import { useMemo, useState } from 'react';
import { siteLabel, useT, type StringKey } from '../i18n';
import { DAY_MS, formatHours, formatPercent, fromDateTimeInput, HOUR_MS, toDateTimeInput } from '../lib/format';
import { computeHorizon } from '../lib/horizon';
import { powerSeries, simulateEnergy, type PowerConfig } from '../lib/power';
import type { Terrain } from '../lib/terrain';
import { sampleTimeline, summarizeTimeline, type TimelineSummary } from '../lib/visibility';
import { MAX_COMPARE, placeWithoutDate, scenarioKey, siteKey, useNavigator, type Scenario } from '../state/store';

interface ComparePanelProps {
  terrain: Terrain;
  windowStart: number;
}

type Period = 'week' | 'month' | 'quarter' | 'custom';

const PERIOD_DAYS: Record<Exclude<Period, 'custom'>, number> = { week: 7, month: 29.53, quarter: 90 };
/** Long spans use a coarser step: whole-month shares barely change, and it keeps comparing instant. */
const LONG_SPAN_DAYS = 45;
/** The delays a schedule slip usually comes in. */
const SLIP_DAYS = [1, 7, 30] as const;

interface RowValues extends TimelineSummary {
  energyKWh: number;
}

type Metric = { key: keyof RowValues; label: StringKey; better: 'high' | 'low'; kind: 'share' | 'duration' | 'energy' };

const METRICS: Metric[] = [
  { key: 'sunlitShare', label: 'sunlight', better: 'high', kind: 'share' },
  { key: 'energyKWh', label: 'compare.energy', better: 'high', kind: 'energy' },
  { key: 'earthShare', label: 'compare.earth', better: 'high', kind: 'share' },
  { key: 'bothShare', label: 'compare.both', better: 'high', kind: 'share' },
  { key: 'longestDarkHours', label: 'night', better: 'low', kind: 'duration' },
];

function analyze(terrain: Terrain, site: Scenario, start: number, spanMs: number, power: PowerConfig): RowValues {
  const profile = computeHorizon(terrain, site.lat, site.lon);
  const step = spanMs > LONG_SPAN_DAYS * DAY_MS ? 3 * HOUR_MS : HOUR_MS;
  const timeline = sampleTimeline({ lat: site.lat, lon: site.lon, heightM: profile.siteHeightM }, profile, start, spanMs, step);
  const series = powerSeries(power, site.lat, timeline.sunElevation, timeline.sun);
  return { ...summarizeTimeline(timeline), energyKWh: simulateEnergy(series, step / HOUR_MS, power).generatedKWh };
}

const dateOnly = (time: number) => toDateTimeInput(time).slice(0, 10);
const startOfDay = (time: number) => Math.floor(time / DAY_MS) * DAY_MS;

/**
 * Side-by-side comparison of scenarios, each a place and optionally its own landing date, so "this
 * site or that one" and "this month or next" are the same question. Bars make the winner obvious at
 * a glance; the best value in each column glows.
 */
export function ComparePanel({ terrain, windowStart }: ComparePanelProps) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const compare = useNavigator((s) => s.compare);
  const power = useNavigator((s) => s.power);
  const selectSite = useNavigator((s) => s.selectSite);
  const setTime = useNavigator((s) => s.setTime);
  const addScenario = useNavigator((s) => s.addScenario);
  const removeScenario = useNavigator((s) => s.removeScenario);
  const setScenarioDate = useNavigator((s) => s.setScenarioDate);
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState(() => dateOnly(windowStart + 2 * DAY_MS));
  const [customTo, setCustomTo] = useState(() => dateOnly(windowStart + 16 * DAY_MS));

  const scenarios = useMemo<Scenario[]>(() => {
    const isCurrentListed = compare.some((c) => siteKey(c) === siteKey(site));
    return isCurrentListed ? [...compare] : [site, ...compare];
  }, [compare, site]);

  const [start, span] = useMemo((): [number, number] => {
    if (period !== 'custom') return [windowStart, PERIOD_DAYS[period] * DAY_MS];
    const from = fromDateTimeInput(`${customFrom}T00:00`) ?? windowStart;
    const to = fromDateTimeInput(`${customTo}T00:00`) ?? from + DAY_MS;
    return [Math.min(from, to), Math.max(DAY_MS, Math.abs(to - from))];
  }, [period, windowStart, customFrom, customTo]);

  const rows = useMemo(
    () => scenarios.map((s) => ({ scenario: s, values: analyze(terrain, s, s.at ?? start, span, power) })),
    [scenarios, terrain, start, span, power],
  );

  if (compare.length === 0) return null;
  const currentKey = siteKey(site);
  const show = (m: Metric, v: number) => {
    if (m.kind === 'share') return formatPercent(v);
    if (m.kind === 'energy') return v.toFixed(1);
    return v > 0 ? formatHours(v, lang) : '—';
  };
  const extremes = METRICS.map((m) => {
    const values = rows.map((r) => r.values[m.key]);
    return { best: m.better === 'high' ? Math.max(...values) : Math.min(...values), max: Math.max(...values, 1e-9) };
  });

  const latestForSite = Math.max(...scenarios.filter((s) => siteKey(s) === currentKey).map((s) => s.at ?? start), start);
  const slip = (days: number) => addScenario(site, startOfDay(latestForSite) + days * DAY_MS);

  const changeDate = (scenario: Scenario, value: string) => {
    const at = fromDateTimeInput(`${value}T00:00`);
    if (at === null) return;
    const isListed = compare.some((c) => scenarioKey(c) === scenarioKey(scenario));
    if (isListed) setScenarioDate(scenarioKey(scenario), at);
    else addScenario(scenario, at);
  };

  const open = (scenario: Scenario) => {
    selectSite(placeWithoutDate(scenario));
    if (scenario.at !== undefined) setTime(scenario.at);
  };

  return (
    <section className="panel compare" aria-label={t('compare.titleScenarios')}>
      <header className="compare__head">
        <h3>{t('compare.titleScenarios')}</h3>
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
            const key = scenarioKey(r.scenario);
            const isListed = compare.some((c) => scenarioKey(c) === key);
            const label = siteLabel(r.scenario, lang);
            return (
              <tr key={key} className={siteKey(r.scenario) === currentKey ? 'is-current' : undefined}>
                <th scope="row">
                  <button type="button" className="link-button" onClick={() => open(r.scenario)}>{label}</button>
                  <input
                    className="compare__date"
                    type="date"
                    aria-label={t('compare.landing', { name: label })}
                    value={dateOnly(r.scenario.at ?? start)}
                    onChange={(e) => changeDate(r.scenario, e.target.value)}
                  />
                </th>
                {METRICS.map((m, i) => {
                  const v = r.values[m.key];
                  const isBest = rows.length > 1 && v === extremes[i].best;
                  return (
                    <td key={m.key} className={isBest ? 'is-best' : undefined}>
                      <span className="compare__value">{show(m, v)}</span>
                      <span className="compare__bar"><span style={{ width: `${(v / extremes[i].max) * 100}%` }} /></span>
                    </td>
                  );
                })}
                <td>
                  {isListed && (
                    <button type="button" className="icon-button" aria-label={t('compare.remove', { name: label })} onClick={() => removeScenario(key)}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="compare__slips" role="group" aria-label={t('compare.delay')}>
        <span className="muted">{t('compare.delay')}</span>
        <div className="segmented compare__periods">
          {SLIP_DAYS.map((days) => (
            <button key={days} type="button" disabled={compare.length >= MAX_COMPARE} onClick={() => slip(days)}>{t('whatIf.days', { n: days })}</button>
          ))}
        </div>
      </div>
    </section>
  );
}
