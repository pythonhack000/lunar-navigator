import { useState } from 'react';
import { useT, type StringKey } from '../i18n';
import type { MissionRequirements, MissionWindow } from '../lib/missionWindow';
import { useNavigator } from '../state/store';

type Props = {
  requirements: MissionRequirements;
  onChange: (requirements: MissionRequirements) => void;
  windows: readonly MissionWindow[];
  onGo: (time: number) => void;
};

type Field = keyof MissionRequirements;

/** Shares show as percentages, days and degrees as stored. */
const FIELDS: { key: Field; label: StringKey; scale: number; min: number; max: number }[] = [
  { key: 'durationDays', label: 'mission.duration', scale: 1, min: 1, max: 90 },
  { key: 'minSunShare', label: 'mission.sun', scale: 100, min: 0, max: 100 },
  { key: 'minLinkShare', label: 'mission.link', scale: 100, min: 0, max: 100 },
  { key: 'antennaMaskDeg', label: 'mission.mask', scale: 1, min: 0, max: 30 },
];

const SHOWN_WINDOWS = 3;

/** The planner's question: when can a mission like mine land here at all? */
export function MissionFilter({ requirements, onChange, windows, onGo }: Props) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const [drafts, setDrafts] = useState<Partial<Record<Field, string>>>({});
  const locale = lang === 'ru' ? 'ru-RU' : 'en-GB';
  const date = (time: number) => new Date(time).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const change = (field: (typeof FIELDS)[number], text: string) => {
    setDrafts((d) => ({ ...d, [field.key]: text }));
    const value = Number(text);
    if (text.trim() === '' || !Number.isFinite(value) || value < field.min || value > field.max) return;
    onChange({ ...requirements, [field.key]: value / field.scale });
  };

  let summary = t('mission.none');
  if (windows.length === 1) summary = t('mission.foundOne');
  if (windows.length > 1) summary = t('mission.found', { n: windows.length });

  return (
    <details className="mission-filter" open>
      <summary>{t('mission.title')}</summary>
      <div className="tool-fields">
        {FIELDS.map((f) => (
          <label key={f.key}>
            <span>{t(f.label)}</span>
            <input inputMode="decimal" value={drafts[f.key] ?? String(+(requirements[f.key] * f.scale).toFixed(1))} onChange={(e) => change(f, e.target.value)} />
          </label>
        ))}
      </div>
      <p className="mission-filter__summary">{summary}</p>
      {windows.length > 0 && (
        <ul className="mission-filter__list">
          {windows.slice(0, SHOWN_WINDOWS).map((w) => (
            <li key={w.from}>
              <span className="mono">{t('mission.range', { from: date(w.from), to: date(w.to) })}</span>
              <button type="button" className="link-button" onClick={() => onGo(w.from)}>{t('mission.go')} →</button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
