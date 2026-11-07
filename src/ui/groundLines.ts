import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import type { SiteScoreView } from '../hooks/useSiteScore';
import { siteLabel, type Lang } from '../i18n';
import { DSN_STATIONS, stationName } from '../lib/dsn';
import { formatDeg, formatDuration } from '../lib/format';
import { panelShare, powerWatts, type PowerConfig } from '../lib/power';
import type { GroundQuestionKey, SelectedSite } from '../state/store';
import { explainSite, moonVsEarth } from './assistantScript';

/** What 3D LUNA says beside you on the surface; `point` turns you both toward it. */
export interface GroundLine {
  text: string;
  point: 'sun' | 'earth' | null;
  /** How long it stays, when not the usual time. */
  ms?: number;
}

const UP = 0.5;
/** The descent takes three seconds; her first words last as long. */
const FLIGHT_LINE_MS = 3200;

function sunLine(a: SiteAnalysis, lang: Lang): GroundLine {
  const ru = lang === 'ru';
  const { sun, time } = a.state;
  const left = a.nextSunChange === null ? null : formatDuration(a.nextSunChange - time, lang);
  if (sun.visibleFraction >= UP) {
    const tail = left ? (ru ? ` и зайдёт через ${left}` : ` and sets in ${left}`) : ru ? ' и не зайдёт весь месяц' : ' and stays up all month';
    return { point: 'sun', text: ru ? `Вот Солнце: ${formatDeg(sun.elDeg)} над горизонтом${tail}.` : `There's the Sun: ${formatDeg(sun.elDeg)} above the horizon${tail}.` };
  }
  const tail = left ? (ru ? ` Рассвет через ${left}.` : ` Sunrise in ${left}.`) : '';
  return { point: 'sun', text: ru ? `Сейчас здесь ночь, Солнце там, за горизонтом.${tail}` : `It is night here, the Sun is over there, past the horizon.${tail}` };
}

function earthLine(a: SiteAnalysis, lang: Lang): GroundLine {
  const ru = lang === 'ru';
  const { earth, time } = a.state;
  const left = a.nextEarthChange === null ? null : formatDuration(a.nextEarthChange - time, lang);
  if (earth.visibleFraction >= UP) {
    const station = a.linkNow >= 0 ? stationName(DSN_STATIONS[a.linkNow], lang) : null;
    if (station) return { point: 'earth', text: ru ? `А вот наш дом, Земля. Сейчас нас слышит антенна ${station}.` : `And there's home, the Earth. The ${station} antenna can hear us right now.` };
    return { point: 'earth', text: ru ? 'А вот наш дом, Земля. Но ни одна антенна NASA сейчас не видит Луну.' : "And there's home, the Earth. But no NASA antenna can see the Moon right now." };
  }
  const tail = left ? (ru ? ` Она взойдёт через ${left}.` : ` It rises in ${left}.`) : '';
  return { point: 'earth', text: ru ? `Земля сейчас там, её не видно, поэтому без спутника-ретранслятора связи нет.${tail}` : `The Earth is over there, out of sight, so there is no link without a relay satellite.${tail}` };
}

function powerLine(a: SiteAnalysis, power: PowerConfig, lang: Lang): GroundLine {
  const { sun } = a.state;
  const watts = (type: 'horizontal' | 'vertical') => Math.round(powerWatts(power, panelShare(type, sun.elDeg, sun.visibleFraction))).toLocaleString('en-US');
  return {
    point: null,
    text: lang === 'ru'
      ? `Панель, лежащая на грунте, дала бы здесь ${watts('horizontal')} Вт, а поставленная вертикально ${watts('vertical')} Вт.`
      : `A flat panel on the ground would give ${watts('horizontal')} W here, an upright one ${watts('vertical')} W.`,
  };
}

/** Her lines for this site right now, from the same numbers as the panels. */
export function groundLines(a: SiteAnalysis, power: PowerConfig, lang: Lang): GroundLine[] {
  const ru = lang === 'ru';
  return [
    { text: ru ? 'Давай полетим вместе!' : "Let's fly down together!", point: null, ms: FLIGHT_LINE_MS },
    { text: ru ? 'Мы на месте! Нажми на меня, если хочешь что-то спросить.' : "We're here! Click me if you want to ask something.", point: null },
    sunLine(a, lang),
    earthLine(a, lang),
    powerLine(a, power, lang),
    { text: ru ? 'Осмотрись: тяни мышью в любую сторону. Нажми «пуск» внизу, и тени поплывут.' : 'Look around: drag any way. Press play below and watch the shadows move.', point: null },
  ];
}

const QUESTIONS = {
  en: { explain: 'Explain this place', sun: 'Where is the Sun?', earth: 'Where is the Earth?', power: 'How much power is here?', moon: 'Why is the Moon so different?' },
  ru: { explain: 'Объясни это место', sun: 'Где Солнце?', earth: 'Где Земля?', power: 'Сколько здесь энергии?', moon: 'Чем Луна не похожа на Землю?' },
} as const;

export const GROUND_QUESTIONS: readonly GroundQuestionKey[] = ['explain', 'sun', 'earth', 'power', 'moon'];
export const groundQuestionLabel = (key: GroundQuestionKey, lang: Lang): string => QUESTIONS[lang][key];

interface AnswerContext {
  analysis: SiteAnalysis;
  score: SiteScoreView;
  site: SelectedSite;
  power: PowerConfig;
  lang: Lang;
}

/** Her answer to a question asked on the surface, line by line. */
export function groundAnswer(key: GroundQuestionKey, { analysis, score, site, power, lang }: AnswerContext): GroundLine[] {
  if (key === 'sun') return [sunLine(analysis, lang)];
  if (key === 'earth') return [earthLine(analysis, lang)];
  if (key === 'power') return [powerLine(analysis, power, lang)];
  const lines = key === 'explain' ? explainSite(siteLabel(site, lang), analysis, lang, score) : moonVsEarth(analysis, lang);
  return lines.map((text) => ({ text, point: null }));
}
