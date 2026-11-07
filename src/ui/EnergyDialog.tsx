import { useMemo, useState } from 'react';
import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import { useT, type StringKey } from '../i18n';
import { HOUR_MS } from '../lib/format';
import { panelShare, powerSeries, powerWatts, resolveArray, simulateEnergy, surfaceTempK, type ArrayType, type PowerConfig } from '../lib/power';
import { useNavigator } from '../state/store';
import { Dialog } from './Dialog';
import { MiniChart } from './MiniChart';

type Props = { analysis: SiteAnalysis; onClose: () => void };

const ARRAYS: { type: ArrayType; label: StringKey }[] = [
  { type: 'auto', label: 'energy.auto' },
  { type: 'horizontal', label: 'energy.horizontal' },
  { type: 'vertical', label: 'energy.vertical' },
  { type: 'tracking', label: 'energy.tracking' },
];

type NumericField = 'areaM2' | 'efficiency' | 'loadW' | 'batteryWh';

/** Efficiency shows as a percentage; everything else as stored. */
const FIELDS: { key: NumericField; label: StringKey; scale: number; max: number }[] = [
  { key: 'areaM2', label: 'energy.area', scale: 1, max: 10_000 },
  { key: 'efficiency', label: 'energy.efficiency', scale: 100, max: 100 },
  { key: 'loadW', label: 'energy.load', scale: 1, max: 1_000_000 },
  { key: 'batteryWh', label: 'energy.battery', scale: 1, max: 100_000_000 },
];

const KELVIN_ZERO_C = 273.15;

/** The month's power at this site for an array and load the user can change. */
export function EnergyDialog({ analysis, onClose }: Props) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const power = useNavigator((s) => s.power);
  const setPower = useNavigator((s) => s.setPower);
  const [drafts, setDrafts] = useState<Partial<Record<NumericField, string>>>({});
  const [isInvalid, setInvalid] = useState(false);
  const { timeline, site, state } = analysis;
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';
  const stepHours = timeline.stepMs / HOUR_MS;

  const series = useMemo(() => powerSeries(power, site.lat, timeline.sunElevation, timeline.sun), [power, site.lat, timeline]);
  const energy = useMemo(() => simulateEnergy(series, stepHours, power), [series, stepHours, power]);
  const array = resolveArray(power.arrayType, site.lat);
  const nowW = powerWatts(power, panelShare(array, state.sun.elDeg, state.sun.visibleFraction));
  const groundK = surfaceTempK(state.sun.elDeg, state.sun.visibleFraction);

  const watts = (value: number) => `${Math.round(value).toLocaleString(locale)} ${t('energy.unitW')}`;
  const emptyDate = energy.firstEmptyIndex === null ? null : new Date(timeline.start + energy.firstEmptyIndex * timeline.stepMs).toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });

  const change = (field: (typeof FIELDS)[number], text: string) => {
    setDrafts((d) => ({ ...d, [field.key]: text }));
    const value = Number(text);
    const isValid = text.trim() !== '' && Number.isFinite(value) && value > 0 && value <= field.max;
    setInvalid(!isValid);
    if (isValid) setPower({ ...power, [field.key]: value / field.scale } as PowerConfig);
  };

  const tiles: [StringKey, string][] = [
    ['energy.now', watts(nowW)],
    ['energy.mean', watts(energy.meanW)],
    ['energy.total', `${energy.generatedKWh.toLocaleString(locale, { maximumFractionDigits: 1 })} ${t('energy.unitKwh')}`],
    ['energy.needed', `${Math.round(energy.batteryNeededWh).toLocaleString(locale)} ${t('energy.unitWh')}`],
  ];

  return (
    <Dialog title={t('energy.title')} subtitle={t('energy.intro')} className="energy" onClose={onClose}>
      <div className="tool-row">
        <span className="tool-label" title={t('energy.autoHint')}>{t('energy.array')}</span>
        <div className="segmented" role="group" aria-label={t('energy.array')}>
          {ARRAYS.map((a) => (
            <button key={a.type} type="button" className={power.arrayType === a.type ? 'is-active' : undefined} aria-pressed={power.arrayType === a.type} onClick={() => setPower({ ...power, arrayType: a.type })}>
              {t(a.label)}
            </button>
          ))}
        </div>
      </div>
      <p className="muted tool-note">{t('energy.autoHint')}</p>
      <div className="tool-fields">
        {FIELDS.map((f) => (
          <label key={f.key}>
            <span>{t(f.label)}</span>
            <input inputMode="decimal" value={drafts[f.key] ?? String(+(power[f.key] * f.scale).toFixed(2))} onChange={(e) => change(f, e.target.value)} />
          </label>
        ))}
      </div>
      {isInvalid && <p className="form-error" role="alert">{t('energy.invalid')}</p>}
      <dl className="tool-tiles">
        {tiles.map(([label, value]) => (
          <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <p className="tool-verdict">
        {emptyDate
          ? t('energy.empty', { date: emptyDate, wh: Math.round(energy.batteryNeededWh).toLocaleString(locale) })
          : t('energy.ok', { p: `${Math.round(energy.minCharge * 100)}%` })}
      </p>
      <MiniChart label={t('energy.chart')} values={series} start={timeline.start} stepMs={timeline.stepMs} tone="sun" format={watts} reference={{ value: power.loadW, label: t('energy.loadLine') }} locale={locale} />
      <p className="muted tool-note">
        {t('energy.ground', { k: Math.round(groundK), c: Math.round(groundK - KELVIN_ZERO_C) })}. {t('energy.groundNote')}
      </p>
    </Dialog>
  );
}
