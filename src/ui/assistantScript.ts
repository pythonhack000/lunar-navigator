import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import type { Lang } from '../i18n';
import { formatDeg, formatDuration, formatHours, formatPercent } from '../lib/format';
import type { RankedSite, RankGoal } from '../lib/ranking';

export interface TourStep {
  /** `data-tour` value of the element to spotlight, or null for a centred message. */
  target: string | null;
  title: string;
  body: string;
}

const TOUR_EN: TourStep[] = [
  { target: null, title: "Hi, I'm LUNA", body: 'I help pick where and when to land near the lunar south pole. A lander there needs sunlight on its solar panels and Earth above the horizon to radio home. Mountains and crater rims block both. Let me show you around.' },
  { target: 'sites', title: 'Pick a landing site', body: 'Start with the Artemis III regions, or choose a south pole target, a robotic lander or an Apollo site. You can also click anywhere on the Moon.' },
  { target: 'camera', title: 'Fly in 3D', body: 'Drag to move, right-drag or Shift-drag to tilt toward the horizon, scroll to zoom. Switch the map to Sunlight or Ice to see where the Sun shines all year — and where it never does.' },
  { target: 'readouts', title: 'Sun and Earth right now', body: 'How high the Sun and Earth stand above the real terrain, and how long until they set behind it. At the pole the Sun skims the horizon, so a small ridge can cause night.' },
  { target: 'horizon', title: 'The real horizon', body: 'The 360° skyline around the site, traced from NASA LOLA laser altimetry, with the paths of the Sun and Earth over the coming days.' },
  { target: 'timeline', title: 'A whole lunar month', body: 'Amber is sunlight, blue is Earth in view. Drag to scrub through time or press play to watch shadows sweep the craters.' },
  { target: 'month', title: 'Decide', body: 'Month totals, landing windows by the hour, and Compare for side-by-side sites. Or just ask me for the best site.' },
];

const TOUR_RU: TourStep[] = [
  { target: null, title: 'Привет, я LUNA', body: 'Я помогаю выбрать, где и когда садиться у южного полюса Луны. Посадочному модулю нужны две вещи: Солнце на солнечных панелях и Земля над горизонтом для связи. Горы и края кратеров закрывают и то и другое. Давай покажу, как тут всё устроено.' },
  { target: 'sites', title: 'Выбери место посадки', body: 'Начни с районов Artemis III или выбери точку южного полюса, автоматическую станцию или место Аполлона. Можно просто кликнуть в любое место Луны.' },
  { target: 'camera', title: 'Летай в 3D', body: 'Тяни мышью, чтобы двигаться, правой кнопкой или с Shift — наклоняй к горизонту, колесом — приближай. Переключи карту на «Свет» или «Лёд», чтобы увидеть, где Солнце светит весь год, а где не бывает никогда.' },
  { target: 'readouts', title: 'Солнце и Земля сейчас', body: 'Как высоко стоят Солнце и Земля над настоящим рельефом и через сколько они зайдут за него. На полюсе Солнце ползёт по горизонту, поэтому даже небольшой хребет устраивает ночь.' },
  { target: 'horizon', title: 'Настоящий горизонт', body: 'Линия гор на 360° вокруг места по лазерной съёмке NASA LOLA и пути Солнца и Земли на ближайшие дни.' },
  { target: 'timeline', title: 'Целый лунный месяц', body: 'Жёлтое — свет, синее — Земля видна. Тяни, чтобы листать время, или нажми «пуск» и смотри, как тени ползут по кратерам.' },
  { target: 'month', title: 'Принимай решение', body: 'Итоги месяца, окна посадки по часам и «Сравнить» для нескольких мест. Или просто спроси меня, где лучше всего.' },
];

export const tourFor = (lang: Lang): readonly TourStep[] => (lang === 'ru' ? TOUR_RU : TOUR_EN);

const UI = {
  en: {
    explain: 'Explain this site',
    goals: { power: 'Best site for solar power', comms: 'Best site for Earth link', both: 'Best for power + link' },
    howTo: 'How do I use it?',
    about: 'What is this about?',
    tour: 'Take the tour',
    artemis: 'Rank Artemis III regions',
    empty: 'Ask me about the selected site, or let me find the best one.',
    thinking: 'Comparing sites over the next lunar month…',
    tourDone: "That's the tour! Ask me anything below.",
    fly: 'Fly there →',
    addCompare: 'Add top 3 to compare',
    skip: 'Skip',
    next: 'Next',
    done: 'Done',
    role: 'mission assistant',
    voiceOn: 'Voice on',
    voiceOff: 'Voice off',
    error: 'Sorry, I could not compare the sites.',
    howToLines: [
      'Drag with the left mouse button to slide over the ground.',
      'Right-drag or hold Shift and drag to turn and tilt toward the horizon.',
      'Scroll or pinch to zoom; click the Moon to drop a new site.',
      'Use the timeline at the bottom to change the date, or press play.',
    ],
    aboutLines: [
      "NASA's Artemis and CLPS missions target the lunar south pole, where water ice hides in craters that never see the Sun.",
      'There the Sun and Earth hover near the horizon, so a few kilometres or a few days decide whether a lander has power and radio contact.',
      'This tool turns NASA ephemerides and LOLA terrain into an instant answer for any site and date.',
    ],
  },
  ru: {
    explain: 'Объясни это место',
    goals: { power: 'Где больше всего солнца?', comms: 'Где лучше связь с Землёй?', both: 'Где и свет, и связь?' },
    howTo: 'Как пользоваться?',
    about: 'О чём этот проект?',
    tour: 'Экскурсия',
    artemis: 'Сравни районы Artemis III',
    empty: 'Спроси меня про выбранное место или попроси найти лучшее.',
    thinking: 'Сравниваю места на ближайший лунный месяц…',
    tourDone: 'Экскурсия окончена! Спрашивай что угодно ниже.',
    fly: 'Лететь →',
    addCompare: 'Добавить топ-3 в сравнение',
    skip: 'Пропустить',
    next: 'Дальше',
    done: 'Готово',
    role: 'ассистент миссии',
    voiceOn: 'Голос вкл.',
    voiceOff: 'Голос выкл.',
    error: 'Не получилось сравнить места.',
    howToLines: [
      'Тяни левой кнопкой мыши, чтобы двигаться над поверхностью.',
      'Правой кнопкой или с зажатым Shift — поворот и наклон к горизонту.',
      'Колесо или щипок — приближение; клик по Луне ставит новую точку.',
      'Таймлайн внизу меняет дату, кнопка «пуск» запускает время.',
    ],
    aboutLines: [
      'Миссии NASA Artemis и CLPS летят к южному полюсу Луны: там в кратерах, куда никогда не светит Солнце, прячется водяной лёд.',
      'Солнце и Земля там висят у самого горизонта, поэтому пара километров или пара дней решают, будет ли у модуля энергия и связь.',
      'Этот инструмент превращает эфемериды NASA и рельеф LOLA в мгновенный ответ для любого места и даты.',
    ],
  },
} as const;

export const assistantText = (lang: Lang) => UI[lang];

/** A plain-language briefing on the selected site, built from the live analysis. */
export function explainSite(name: string, a: SiteAnalysis, lang: Lang): string[] {
  const { state, summary, nextSunChange, nextEarthChange } = a;
  const now = state.time;
  const dur = (ms: number) => formatDuration(ms, lang);
  const sunUp = state.sun.visibleFraction >= 0.5;
  const earthUp = state.earth.visibleFraction >= 0.5;
  const ru = lang === 'ru';
  const lines: string[] = [];
  if (sunUp) {
    const tail = nextSunChange ? (ru ? ` — зайдёт за рельеф через ${dur(nextSunChange - now)}` : ` — it sets behind terrain in ${dur(nextSunChange - now)}`) : ru ? ' и не зайдёт весь месяц' : ' and stays up all month';
    lines.push(ru ? `☀ Над ${name} светит Солнце, ${formatDeg(state.sun.elDeg)} над горизонтом${tail}.` : `☀ The Sun is up at ${name}, ${formatDeg(state.sun.elDeg)} above the horizon${tail}.`);
  } else {
    const tail = nextSunChange ? (ru ? `, взойдёт через ${dur(nextSunChange - now)}` : `, rising in ${dur(nextSunChange - now)}`) : '';
    lines.push(ru ? `☾ В ${name} сейчас ночь: Солнце за хребтом${tail}.` : `☾ It is night at ${name}: the Sun is behind the ridge line${tail}.`);
  }
  if (earthUp) {
    const tail = nextEarthChange ? (ru ? ` ещё ${dur(nextEarthChange - now)}` : ` for another ${dur(nextEarthChange - now)}`) : '';
    lines.push(ru ? `🛰 Земля видна — модуль может связываться напрямую${tail}.` : `🛰 Earth is in view, so a lander could radio home directly${tail}.`);
  } else {
    const span = nextEarthChange ? dur(nextEarthChange - now) : null;
    lines.push(ru ? `🛰 Земля скрыта${span ? ` ещё ${span}` : ' весь месяц'} — понадобится спутник-ретранслятор.` : `🛰 Earth is hidden${span ? ` for ${span}` : ' all month'} — a relay satellite would be needed.`);
  }
  lines.push(
    ru
      ? `За ближайший месяц: свет ${formatPercent(summary.sunlitShare)}, Земля видна ${formatPercent(summary.earthShare)}, и то и другое ${formatPercent(summary.bothShare)}.`
      : `Over the next lunar month: ${formatPercent(summary.sunlitShare)} sunlight, ${formatPercent(summary.earthShare)} Earth in view, ${formatPercent(summary.bothShare)} both at once.`,
  );
  if (summary.longestDarkHours > 0) {
    const h = formatHours(summary.longestDarkHours, lang);
    lines.push(ru ? `Самая длинная ночь — ${h}: батареи и обогрев должны её пережить.` : `The longest night lasts ${h} — batteries and heaters must survive it.`);
  }
  if (summary.sunlitShare > 0.8) lines.push(ru ? 'Отличное место для солнечной энергии: оно выше большинства соседних хребтов.' : 'Excellent for solar power: this spot sees over most ridges.');
  else if (summary.sunlitShare < 0.3) lines.push(ru ? 'Энергии здесь мало — соседний гребень или край кратера обычно намного лучше.' : 'Power would be scarce; a nearby ridge or rim usually does much better.');
  return lines;
}

export function describeRanking(goal: RankGoal, ranked: readonly RankedSite[], lang: Lang): string {
  const best = ranked[0];
  if (!best) return lang === 'ru' ? 'Не удалось ничего сравнить.' : 'I could not rank any sites.';
  const words = lang === 'ru' ? { power: 'света', comms: 'связи с Землёй', both: 'света и связи одновременно' } : { power: 'sunlight', comms: 'Earth in view', both: 'sunlight and Earth together' };
  return lang === 'ru'
    ? `Больше всего ${words[goal]} у ${best.site.name}: ${formatPercent(best.score)} ближайшего месяца. Лучшие варианты:`
    : `For ${words[goal]}, ${best.site.name} wins with ${formatPercent(best.score)} of the next month. Top picks:`;
}
