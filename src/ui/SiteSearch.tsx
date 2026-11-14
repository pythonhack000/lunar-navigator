import { useEffect, useState } from 'react';
import { useT, type StringKey } from '../i18n';
import { track } from '../lib/analytics';
import { poleToMap } from '../lib/flatMap';
import { formatLatLon, formatPercent } from '../lib/format';
import type { PolarTile } from '../lib/loadTerrain';
import { shadedMap } from '../lib/shadedRelief';
import { rankHits, type Need, type NeedOp, type SearchCriteria, type SearchHit, type SearchPeriod } from '../lib/siteSearch';
import { DEFAULT_SEARCH_CRITERIA, useSiteSearch } from '../state/siteSearchStore';
import { MAX_COMPARE, useNavigator } from '../state/store';
import { Dialog } from './Dialog';
import { goToHit, hitTone } from './searchActions';

type Props = {
  /** The south polar tile the light map covers; its picture is the search map. */
  polar: PolarTile;
  onClose: () => void;
};

type NeedKey = 'sun' | 'link';
type OpChoice = NeedOp | 'any';
type NumberField = 'antennaMaskDeg' | 'maxSlopeDeg';

const NEEDS: { key: NeedKey; label: StringKey }[] = [
  { key: 'sun', label: 'search.sunNeed' },
  { key: 'link', label: 'search.linkNeed' },
];
const OPS: { op: OpChoice; label: StringKey }[] = [
  { op: 'atLeast', label: 'search.atLeast' },
  { op: 'atMost', label: 'search.atMost' },
  { op: 'any', label: 'search.any' },
];
const NUMBERS: { key: NumberField; label: StringKey; min: number; max: number }[] = [
  { key: 'antennaMaskDeg', label: 'mission.mask', min: 0, max: 30 },
  { key: 'maxSlopeDeg', label: 'search.slope', min: 1, max: 30 },
];
/** One-click goals: the common questions, so nobody has to work out floors and ceilings first. */
const PRESETS: { id: string; label: StringKey; sun: Need | null; link: Need | null }[] = [
  { id: 'light', label: 'search.presetLight', sun: { op: 'atLeast', value: 0.8 }, link: null },
  { id: 'link', label: 'search.presetLink', sun: null, link: { op: 'atLeast', value: 0.6 } },
  { id: 'both', label: 'search.presetBoth', sun: { op: 'atLeast', value: 0.8 }, link: { op: 'atLeast', value: 0.3 } },
  { id: 'shadow', label: 'search.presetShadow', sun: { op: 'atMost', value: 0.05 }, link: null },
];
const SHOWN_RESULTS = 6;
const NUMBERED = 3;
const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 14;
const BASE = import.meta.env.BASE_URL;

const toDateInput = (time: number) => new Date(time).toISOString().slice(0, 10);
const fromDateInput = (value: string) => Date.parse(`${value}T00:00:00Z`);
const today = () => Math.floor(useNavigator.getState().time / DAY_MS) * DAY_MS;

/** The polar picture lit by its relief, the plain one until that is ready. */
function usePolarPicture(polar: PolarTile): string {
  const color = `${BASE}textures/${polar.name}_color_1k.jpg`;
  const [shaded, setShaded] = useState<string>();
  useEffect(() => {
    let alive = true;
    shadedMap(color, `${BASE}textures/${polar.name}_normal_1k.jpg`)
      .then((url) => alive && setShaded(url))
      .catch((err: unknown) => console.warn('Relief shading unavailable; showing the plain map', err));
    return () => {
      alive = false;
    };
  }, [color, polar.name]);
  return shaded ?? color;
}

/** One need: a floor, a ceiling or "any", and its percentage. */
function NeedField({ label, need, onChange }: { label: string; need: Need | null; onChange: (need: Need | null) => void }) {
  const t = useT();
  const [value, setValue] = useState(String(Math.round((need?.value ?? 0.5) * 100)));
  const [op, setOp] = useState<OpChoice>(need?.op ?? 'any');
  const emit = (nextOp: OpChoice, text: string) => {
    const n = Number(text);
    if (nextOp === 'any') onChange(null);
    else if (text.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100) onChange({ op: nextOp, value: n / 100 });
  };
  return (
    <div className="need-field">
      <span className="need-field__label">{label}</span>
      <div className="segmented need-field__ops" role="group" aria-label={label}>
        {OPS.map((o) => (
          <button
            key={o.op}
            type="button"
            className={o.op === op ? 'is-active' : undefined}
            aria-pressed={o.op === op}
            onClick={() => {
              setOp(o.op);
              emit(o.op, value);
            }}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
      <label className="need-field__value">
        <input
          inputMode="decimal"
          aria-label={`${label}, %`}
          disabled={op === 'any'}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            emit(op, e.target.value);
          }}
        />
        <span>%</span>
      </label>
    </div>
  );
}

/**
 * "Where can my mission land?", asked either way: on average over a year, or over a stretch of
 * dates (one day when both ends match); sunlight and the link can each be a floor or a ceiling.
 * Spots light up on the 3D Moon as they are checked, and stay lit after the dialog closes.
 */
export function SiteSearch({ polar, onClose }: Props) {
  const t = useT();
  const site = useNavigator((s) => s.site);
  const compareCount = useNavigator((s) => s.compare.length);
  const { request, hits, total, status, start, clear } = useSiteSearch();
  const picture = usePolarPicture(polar);
  const [criteria, setCriteria] = useState<SearchCriteria>(request?.criteria ?? DEFAULT_SEARCH_CRITERIA);
  const [period, setPeriod] = useState<SearchPeriod>(request?.period ?? { kind: 'dates', from: today(), to: today() + (DEFAULT_DAYS - 1) * DAY_MS });
  const [drafts, setDrafts] = useState<Partial<Record<NumberField | 'maxIceKm', string>>>({});
  // Bumped by a preset, so the need fields start over from the preset's values.
  const [formNonce, setFormNonce] = useState(0);

  const run = (c: SearchCriteria, p: SearchPeriod) => {
    track('site-search');
    start(c, p);
  };
  // The first visit searches with the defaults straight away; a reopened dialog shows the last search.
  useEffect(() => {
    if (useSiteSearch.getState().status === 'idle') run(criteria, period);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open; later searches are explicit
  }, []);

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    const next = { ...criteria, sun: preset.sun, link: preset.link };
    setCriteria(next);
    setFormNonce((n) => n + 1);
    run(next, period);
  };
  const isPreset = (preset: (typeof PRESETS)[number]) =>
    JSON.stringify([preset.sun, preset.link]) === JSON.stringify([criteria.sun, criteria.link]);

  const setNumber = (field: (typeof NUMBERS)[number], text: string) => {
    setDrafts((d) => ({ ...d, [field.key]: text }));
    const value = Number(text);
    if (text.trim() !== '' && Number.isFinite(value) && value >= field.min && value <= field.max) setCriteria((c) => ({ ...c, [field.key]: value }));
  };
  const setIce = (text: string) => {
    setDrafts((d) => ({ ...d, maxIceKm: text }));
    const value = Number(text);
    if (text.trim() === '') setCriteria((c) => ({ ...c, maxIceKm: null }));
    else if (Number.isFinite(value) && value > 0 && value <= 50) setCriteria((c) => ({ ...c, maxIceKm: value }));
  };
  const showOnMoon = () => {
    onClose();
    useNavigator.getState().showPolarView();
  };

  const ranked = rankHits(hits);
  const fitting = ranked.filter((h) => h.fits);
  const shown = (fitting.length > 0 ? fitting : ranked).slice(0, SHOWN_RESULTS);
  const addTop = () => {
    const nav = useNavigator.getState();
    const at = request?.period.kind === 'dates' ? Math.min(request.period.from, request.period.to) : nav.time;
    fitting.slice(0, NUMBERED).forEach((h) => nav.addScenario({ id: null, name: '', kind: 'custom', lat: h.lat, lon: h.lon }, at));
  };
  const place = (lat: number, lon: number) => {
    const p = poleToMap(lat, lon, polar.rhoMax);
    return { left: `${p.u * 100}%`, top: `${p.v * 100}%` };
  };
  const go = (hit: SearchHit) => {
    goToHit(hit);
    onClose();
  };

  let summary = t('search.progress', { n: hits.length, total: Math.max(total, hits.length) });
  if (status === 'failed') summary = t('search.failed');
  else if (status === 'done') summary = fitting.length > 0 ? t('search.found', { n: fitting.length }) : t(request?.period.kind === 'year' ? 'search.noneYear' : 'search.none');
  const isDates = period.kind === 'dates';

  return (
    <Dialog title={t('search.title')} subtitle={t('search.sub')} className="site-search" onClose={onClose}>
      <div className="site-search__body">
        <form
          className="site-search__form"
          onSubmit={(e) => {
            e.preventDefault();
            run(criteria, period);
          }}
        >
          <div className="site-search__presets" role="group" aria-label={t('search.goal')}>
            {PRESETS.map((preset) => (
              <button key={preset.id} type="button" className={isPreset(preset) ? 'ghost-button is-active' : 'ghost-button'} aria-pressed={isPreset(preset)} onClick={() => applyPreset(preset)}>
                {t(preset.label)}
              </button>
            ))}
          </div>
          <div className="segmented site-search__period" role="group" aria-label={t('search.when')}>
            <button type="button" className={isDates ? 'is-active' : undefined} aria-pressed={isDates} onClick={() => setPeriod({ kind: 'dates', from: today(), to: today() + (DEFAULT_DAYS - 1) * DAY_MS })}>
              {t('search.dates')}
            </button>
            <button type="button" className={!isDates ? 'is-active' : undefined} aria-pressed={!isDates} onClick={() => setPeriod({ kind: 'year' })}>
              {t('search.year')}
            </button>
          </div>
          {period.kind === 'dates' ? (
            <div className="tool-fields site-search__dates">
              <label>
                <span>{t('search.from')}</span>
                <input type="date" value={toDateInput(period.from)} onChange={(e) => Number.isFinite(fromDateInput(e.target.value)) && setPeriod({ ...period, from: fromDateInput(e.target.value) })} />
              </label>
              <label>
                <span>{t('search.to')}</span>
                <input type="date" value={toDateInput(period.to)} onChange={(e) => Number.isFinite(fromDateInput(e.target.value)) && setPeriod({ ...period, to: fromDateInput(e.target.value) })} />
              </label>
              <p className="muted site-search__hint">{t('search.datesHint')}</p>
            </div>
          ) : (
            <p className="muted site-search__hint">{t('search.yearHint')}</p>
          )}
          {NEEDS.map((n) => (
            <NeedField key={`${n.key}-${formNonce}`} label={t(n.label)} need={criteria[n.key]} onChange={(need) => setCriteria((c) => ({ ...c, [n.key]: need }))} />
          ))}
          <div className="tool-fields site-search__limits">
            {NUMBERS.map((f) => (
              <label key={f.key}>
                <span>{t(f.label)}</span>
                <input inputMode="decimal" value={drafts[f.key] ?? String(criteria[f.key])} onChange={(e) => setNumber(f, e.target.value)} />
              </label>
            ))}
            <label>
              <span>{t('search.ice')}</span>
              <input inputMode="decimal" placeholder={t('search.iceAny')} value={drafts.maxIceKm ?? (criteria.maxIceKm === null ? '' : String(criteria.maxIceKm))} onChange={(e) => setIce(e.target.value)} />
            </label>
          </div>
          <div className="site-search__actions">
            <button type="submit" className="primary-button">{t('search.run')}</button>
            {hits.length > 0 && <button type="button" className="ghost-button" data-tour="search-show" onClick={showOnMoon}>{t('search.showMoon')}</button>}
            {status !== 'idle' && <button type="button" className="link-button site-search__clear" onClick={clear}>{t('search.clear')}</button>}
          </div>
          <p className="site-search__status" role="status">{status === 'idle' ? t('search.cleared') : summary}</p>
          {status === 'running' && (
            <div className="site-search__bar" aria-hidden="true">
              <span style={{ width: `${(hits.length / Math.max(1, total)) * 100}%` }} />
            </div>
          )}
          {shown.length > 0 && (
            <>
              {fitting.length === 0 && status === 'done' && <p className="muted">{t('search.closest')}</p>}
              <ol className="site-search__list">
                {shown.map((h, i) => (
                  <li key={`${h.lat}:${h.lon}`}>
                    <span className="site-search__rank">{i + 1}</span>
                    <span className="mono site-search__where">{formatLatLon(h.lat, h.lon)}</span>
                    <span className="site-search__shares">
                      {t('search.sun')} <b>{formatPercent(h.sunShare)}</b> · {t('search.link')} <b>{formatPercent(h.linkShare)}</b>
                    </span>
                    <button type="button" className="link-button" onClick={() => go(h)}>{t('mission.go')}</button>
                  </li>
                ))}
              </ol>
              {fitting.length > 1 && (
                <button type="button" className="ghost-button site-search__compare" disabled={compareCount >= MAX_COMPARE} onClick={addTop}>{t('search.compare')}</button>
              )}
            </>
          )}
        </form>
        <div className="site-search__map">
          <img src={picture} alt={t('search.mapAlt')} draggable={false} />
          {ranked
            .slice()
            .reverse()
            .map((h) => {
              const rank = fitting.indexOf(h);
              return (
                <button
                  key={`${h.lat}:${h.lon}`}
                  type="button"
                  className={`search-dot is-${hitTone(h)}`}
                  style={place(h.lat, h.lon)}
                  title={`${formatLatLon(h.lat, h.lon)} · ${t('search.sun')} ${formatPercent(h.sunShare)} · ${t('search.link')} ${formatPercent(h.linkShare)}`}
                  aria-label={formatLatLon(h.lat, h.lon)}
                  onClick={() => go(h)}
                >
                  {rank >= 0 && rank < NUMBERED ? rank + 1 : null}
                </button>
              );
            })}
          {site.lat < polar.edgeLat && <span className="search-here" style={place(site.lat, site.lon)} title={t('search.here')} />}
          <p className="site-search__legend">
            <span className="search-dot is-fit" /> {t('search.fit')}
            <span className="search-dot is-near" /> {t('search.near')}
            <span className="search-dot is-miss" /> {t('search.miss')}
          </p>
        </div>
      </div>
      <p className="muted site-search__note">{t('search.note')}</p>
    </Dialog>
  );
}
