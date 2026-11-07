import { useEffect, useMemo, useState } from 'react';
import { WINDOW_MS, type SiteAnalysis } from '../hooks/useSiteAnalysis';
import { useT } from '../i18n';
import { distanceKm } from '../lib/candidates';
import { DAY_MS, formatDeg, formatHours, formatPercent, HOUR_MS } from '../lib/format';
import { librationRange } from '../lib/libration';
import type { Terrain } from '../lib/terrain';
import { cellMetrics, dateSlips, gridOffsets, offsetPoint, radiusForLat, type CellMetrics, type LatLon } from '../lib/whatIf';
import { scenarioKey, useNavigator, type SelectedSite } from '../state/store';
import { Dialog } from './Dialog';
import { MiniChart } from './MiniChart';

type Props = { analysis: SiteAnalysis; terrain: Terrain; onClose: () => void };
type Tab = 'place' | 'date' | 'libration';
type Metric = keyof CellMetrics;

const GRID_SIZE = 9;
const GRID_STEP_MS = 6 * HOUR_MS;
const METRICS: Metric[] = ['sun', 'link', 'both'];
const DELAYS_DAYS = [0, 1, 3, 7, 14, 30, 60, 90] as const;
const DEFAULT_MISSION_DAYS = 14;
const MAX_MISSION_DAYS = 45;
const COARSE_ABOVE_LAT = -60;
const LIBRATION_STEP_MS = 6 * HOUR_MS;

interface Cell extends LatLon, CellMetrics {}

function PlaceTab({ analysis, terrain, onClose }: Props) {
  const t = useT();
  const selectSite = useNavigator((s) => s.selectSite);
  const [metric, setMetric] = useState<Metric>('sun');
  const [cells, setCells] = useState<Cell[]>([]);
  const { lat, lon } = analysis.site;
  const start = analysis.timeline.start;
  const radius = radiusForLat(lat);
  const offsets = useMemo(() => gridOffsets(radius, GRID_SIZE), [radius]);

  // One cell per tick, so the page stays alive and the map fills in as it goes.
  useEffect(() => {
    let isAlive = true;
    (async () => {
      const done: Cell[] = [];
      for (const offset of offsets) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!isAlive) return;
        const point = offsetPoint(lat, lon, offset.kmNorth, offset.kmEast);
        done.push({ ...point, ...cellMetrics(terrain, point, start, WINDOW_MS, GRID_STEP_MS) });
        setCells([...done]);
      }
    })();
    return () => {
      isAlive = false;
    };
  }, [offsets, terrain, lat, lon, start]);

  const isComplete = cells.length === offsets.length;
  const values = cells.map((c) => c[metric]);
  const centre = cells[Math.floor(offsets.length / 2)];
  const best = cells.reduce<Cell | null>((top, c) => (!top || c[metric] > top[metric] ? c : top), null);
  const go = (cell: Cell) => {
    selectSite({ id: null, name: '', kind: 'custom', lat: cell.lat, lon: cell.lon });
    onClose();
  };

  return (
    <>
      <div className="segmented" role="group" aria-label={t('whatIf.tab.place')}>
        {METRICS.map((m) => (
          <button key={m} type="button" className={m === metric ? 'is-active' : undefined} aria-pressed={m === metric} onClick={() => setMetric(m)}>{t(`whatIf.metric.${m}`)}</button>
        ))}
      </div>
      <p className="muted tool-note">{t('whatIf.gridHint', { r: radius })}</p>
      <div className="what-if-map" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
        {offsets.map((offset, i) => {
          const cell = cells[i];
          const isCentre = i === Math.floor(offsets.length / 2);
          const text = cell ? `${formatPercent(cell[metric])}` : '';
          return (
            <button
              key={`${offset.kmNorth},${offset.kmEast}`}
              type="button"
              className={isCentre ? 'what-if-cell is-centre' : 'what-if-cell'}
              style={{ ['--share' as string]: cell ? cell[metric] : 0 }}
              disabled={!cell}
              aria-label={`${offset.kmNorth} km N, ${offset.kmEast} km E: ${text}`}
              title={`${offset.kmNorth} / ${offset.kmEast} km · ${text}`}
              onClick={() => cell && go(cell)}
            >
              {text}
            </button>
          );
        })}
      </div>
      {isComplete && centre && best ? (
        <p className="tool-verdict">
          {t('whatIf.spread', { r: radius, min: formatPercent(Math.min(...values)), max: formatPercent(Math.max(...values)) })}.{' '}
          {t('whatIf.best', { km: distanceKm(centre, best).toFixed(1), value: formatPercent(best[metric]), here: formatPercent(centre[metric]) })}
        </p>
      ) : (
        <p className="muted tool-note">{t('whatIf.progress', { n: cells.length, total: offsets.length })}</p>
      )}
      {lat > COARSE_ABOVE_LAT && <p className="muted tool-note">{t('whatIf.coarse')}</p>}
    </>
  );
}

function DateTab({ analysis }: { analysis: SiteAnalysis }) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const site = useNavigator((s) => s.site);
  const time = useNavigator((s) => s.time);
  const compare = useNavigator((s) => s.compare);
  const setTime = useNavigator((s) => s.setTime);
  const addScenario = useNavigator((s) => s.addScenario);
  const [missionDays, setMissionDays] = useState(DEFAULT_MISSION_DAYS);
  const [baseTime] = useState(() => Math.floor(time / DAY_MS) * DAY_MS);
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';
  const slips = useMemo(() => dateSlips(analysis.site, analysis.profile, baseTime, DELAYS_DAYS, missionDays), [analysis.site, analysis.profile, baseTime, missionDays]);
  const place: SelectedSite = site;

  return (
    <>
      <label className="tool-inline">
        {t('whatIf.mission')}
        <input
          type="number"
          min={1}
          max={MAX_MISSION_DAYS}
          value={missionDays}
          onChange={(e) => {
            const days = Number(e.target.value);
            if (Number.isFinite(days) && days >= 1 && days <= MAX_MISSION_DAYS) setMissionDays(Math.round(days));
          }}
        />
      </label>
      <p className="muted tool-note">{t('whatIf.dateHint')}</p>
      <table className="what-if-table">
        <thead>
          <tr>
            <th scope="col">{t('whatIf.delay')}</th>
            <th scope="col">{t('whatIf.landing')}</th>
            <th scope="col">{t('sunlight')}</th>
            <th scope="col">{t('link.row')}</th>
            <th scope="col">{t('whatIf.night')}</th>
            <th aria-label={t('whatIf.add')} />
          </tr>
        </thead>
        <tbody>
          {slips.map((slip) => {
            const isAdded = compare.some((c) => scenarioKey(c) === scenarioKey({ ...place, at: slip.start }));
            return (
              <tr key={slip.delayDays}>
                <th scope="row">{slip.delayDays === 0 ? t('whatIf.noDelay') : t('whatIf.days', { n: slip.delayDays })}</th>
                <td><button type="button" className="link-button" onClick={() => setTime(slip.start)}>{new Date(slip.start).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })}</button></td>
                <td>{formatPercent(slip.sunShare)}<span className="compare__bar"><span style={{ width: formatPercent(slip.sunShare) }} /></span></td>
                <td>{formatPercent(slip.linkShare)}</td>
                <td>{slip.longestDarkHours > 0 ? formatHours(slip.longestDarkHours, lang) : '—'}</td>
                <td>
                  <button type="button" className="link-button what-if-add" disabled={isAdded} onClick={() => addScenario(place, slip.start)}>
                    {isAdded ? t('whatIf.added') : t('whatIf.add')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function LibrationTab({ analysis }: { analysis: SiteAnalysis }) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const { timeline } = analysis;
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';
  const range = useMemo(() => librationRange(timeline.start, WINDOW_MS, LIBRATION_STEP_MS), [timeline.start]);
  const lowest = Math.min(...timeline.earthElevation);
  const highest = Math.max(...timeline.earthElevation);
  const degree = (v: number) => formatDeg(v);
  let earthLine = t('whatIf.earthRange', { min: formatDeg(lowest), max: formatDeg(highest) });
  if (highest < 0) earthLine = t('whatIf.farSide');
  else if (lowest > 0) earthLine = `${earthLine} ${t('whatIf.alwaysUp')}`;

  return (
    <>
      <p className="tool-body">{t('whatIf.librationBody', { lat: (range.maxLat - range.minLat).toFixed(1), lon: (range.maxLon - range.minLon).toFixed(1) })}</p>
      <p className="tool-verdict">{earthLine}</p>
      <div className="what-if-charts">
        <MiniChart label={t('whatIf.subLat')} values={range.lats} start={timeline.start} stepMs={LIBRATION_STEP_MS} tone="earth" format={degree} locale={locale} />
        <MiniChart label={t('whatIf.subLon')} values={range.lons} start={timeline.start} stepMs={LIBRATION_STEP_MS} tone="earth" format={degree} locale={locale} />
      </div>
    </>
  );
}

/** The three questions behind a schedule slip or a hazard map, in one window. */
export function WhatIfDialog({ analysis, terrain, onClose }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('place');
  return (
    <Dialog title={t('whatIf.title')} subtitle={t('whatIf.subtitle')} className="what-if" onClose={onClose}>
      <div className="segmented what-if-tabs" role="tablist">
        {(['place', 'date', 'libration'] as const).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={id === tab} className={id === tab ? 'is-active' : undefined} onClick={() => setTab(id)}>{t(`whatIf.tab.${id}`)}</button>
        ))}
      </div>
      {tab === 'place' && <PlaceTab analysis={analysis} terrain={terrain} onClose={onClose} />}
      {tab === 'date' && <DateTab analysis={analysis} />}
      {tab === 'libration' && <LibrationTab analysis={analysis} />}
    </Dialog>
  );
}
