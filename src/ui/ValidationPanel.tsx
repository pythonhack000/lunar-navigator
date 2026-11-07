import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import horizonsReference from '../data/horizonsReference.json';
import { SITES } from '../data/sites';
import { siteLabel, useT } from '../i18n';
import { formatDeg, formatLatLon, formatPercent } from '../lib/format';
import { compareWithHorizons } from '../lib/horizonsCheck';
import type { Terrain } from '../lib/terrain';
import { combineYears, CYCLE_YEARS, illuminationOverYear, ourValue, quickYear, REFERENCES, searchPoints, yearStart, type Reference, type YearResult } from '../lib/validation';
import { useNavigator } from '../state/store';

type Props = { terrain: Terrain; onClose: () => void };

type Checked = YearResult & { lat: number; lon: number; years: number };

/** The year our check covers; any recent full year works, this one is the app's own. */
const YEAR_START = Date.UTC(2026, 0, 1);
/** Agreement bands: [match, close] in share of the year, or in days for the longest night. */
const BANDS = { sunlit: [0.05, 0.1], longestDarkDays: [1, 3] } as const;
type Grade = 'match' | 'close' | 'differs';

function grade(ref: Reference, ours: number): Grade {
  const [match, close] = BANDS[ref.metric];
  const [low, high] = ref.range ?? [ref.value, ref.value];
  const diff = Math.max(0, low - ours, ours - high);
  return diff <= match ? 'match' : diff <= close ? 'close' : 'differs';
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const siteFor = (id: Reference['siteId']) => SITES.find((s) => s.id === id)!;
const show = (ref: Reference, v: number, days: string) => (ref.metric === 'sunlit' ? formatPercent(v) : `${v.toFixed(1)} ${days}`);
const showPublished = (ref: Reference, days: string) =>
  ref.range ? `${ref.range[0]}–${ref.range[1]} ${days}` : show(ref, ref.value, days);

/**
 * "How accurate is this?": our year of sunlight at well-studied south-pole sites next to the values
 * published from LOLA data, computed live in the browser with the same code as the rest of the app.
 */
export function ValidationPanel({ terrain, onClose }: Props) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const [results, setResults] = useState<Partial<Record<Reference['siteId'], Checked>>>({});
  const ephemeris = useMemo(() => compareWithHorizons(horizonsReference.samples), []);
  const bodies = [
    { label: t('sun'), error: ephemeris.sun },
    { label: t('earth'), error: ephemeris.earth },
  ];

  useEffect(() => {
    let alive = true;
    const ids = [...new Set(REFERENCES.map((r) => r.siteId))];
    (async () => {
      for (const id of ids) {
        // The area's best spot by a quick year, then a full year there; one point per tick, so the
        // dialog stays responsive while it works.
        let best = { lat: siteFor(id).lat, lon: siteFor(id).lon, share: -1 };
        for (const p of searchPoints(best.lat, best.lon)) {
          await tick();
          if (!alive) return;
          const share = quickYear(terrain, p, YEAR_START);
          if (share > best.share) best = { ...p, share };
        }
        // Then the full precession cycle there, as the papers do, showing the running result.
        const years: YearResult[] = [];
        for (let k = 0; k < CYCLE_YEARS; k++) {
          await tick();
          if (!alive) return;
          years.push(illuminationOverYear(terrain, best.lat, best.lon, yearStart(YEAR_START, k)));
          setResults((r) => ({ ...r, [id]: { ...combineYears(years), lat: best.lat, lon: best.lon, years: years.length } }));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [terrain]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="panel validation" role="dialog" aria-label={t('val.title')} onClick={(e) => e.stopPropagation()}>
        <header className="calendar__head">
          <div>
            <h2>{t('val.title')}</h2>
            <p className="muted">{t('val.subtitle')}</p>
          </div>
          <button type="button" className="icon-button" aria-label={t('cal.close')} onClick={onClose}>×</button>
        </header>
        <table className="validation__table">
          <thead>
            <tr>
              <th scope="col">{t('val.site')}</th>
              <th scope="col">{t('val.ours')}</th>
              <th scope="col">{t('val.published')}</th>
              <th scope="col">{t('val.source')}</th>
            </tr>
          </thead>
          <tbody>
            {REFERENCES.map((ref) => {
              const result = results[ref.siteId];
              const done = result?.years === CYCLE_YEARS;
              const ours = result ? ourValue(ref, result) : null;
              const verdict = ours === null || !done ? null : grade(ref, ours);
              return (
                <tr key={`${ref.siteId}-${ref.source}-${ref.metric}`}>
                  <th scope="row">
                    {siteLabel(siteFor(ref.siteId), lang)}
                    <small className="muted">{t(ref.metric === 'sunlit' ? 'val.sunlit' : 'val.night')}</small>
                    {result && <small className="muted mono">{formatLatLon(result.lat, result.lon)}</small>}
                  </th>
                  <td className={verdict ? `is-${verdict}` : undefined}>
                    {ours === null ? '…' : show(ref, ours, t('val.days'))}
                    {verdict && <small>{t(`val.${verdict}`)}</small>}
                    {result && !done && <small>{t('val.years', { n: result.years, total: CYCLE_YEARS })}</small>}
                  </td>
                  <td>{showPublished(ref, t('val.days'))}</td>
                  <td>
                    {ref.source}
                    <small className="muted">{ref.note[lang]}</small>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted validation__note">{t('val.note')}</p>
        <h3 className="validation__heading">{t('val.ephemeris')}</h3>
        <p className="muted validation__note">{t('val.ephemerisBody', { rows: ephemeris.rows })}</p>
        <table className="validation__table">
          <thead>
            <tr>
              <th scope="col">{t('val.body')}</th>
              <th scope="col">{t('val.meanError')}</th>
              <th scope="col">{t('val.maxError')}</th>
            </tr>
          </thead>
          <tbody>
            {bodies.map((b) => (
              <tr key={b.label}>
                <th scope="row">{b.label}</th>
                <td className="mono">{formatDeg(b.error.meanDeg, 3)}</td>
                <td className="mono">{formatDeg(b.error.maxDeg, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>,
    document.body,
  );
}
