import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import type { SiteScoreView } from '../hooks/useSiteScore';
import { DSN_STATIONS } from '../lib/dsn';
import { siteLabel, type Lang } from '../i18n';
import { formatDeg, formatDuration, formatHours, formatPercent } from '../lib/format';
import { SITES } from '../data/sites';
import { NIGHT_SURFACE_K, panelShare, powerWatts, surfaceTempK, type PowerConfig } from '../lib/power';
import type { RankedSite, RankGoal } from '../lib/ranking';

/** Only sites where the Earth dips near the horizon get the libration remark. */
const LIBRATION_NOTE_BELOW_DEG = 12;
const KELVIN_ZERO_C = 273.15;
/** Below this the shadow length is a meaningless huge number. */
const MIN_SHADOW_SUN_DEG = 0.3;

/** A number from the visitor's own site, so the tour shows real data instead of general words. */
export function tourFact(key: string, a: SiteAnalysis, view: SiteScoreView, power: PowerConfig, lang: Lang): string | null {
  const ru = lang === 'ru';
  const { sun } = a.state;
  const watts = (type: 'horizontal' | 'vertical') => Math.round(powerWatts(power, panelShare(type, sun.elDeg, sun.visibleFraction))).toLocaleString('en-US');
  switch (key) {
    case 'sites':
      return ru ? `В списке ${SITES.length} мест, а можно выбрать любую точку Луны.` : `${SITES.length} sites listed, and any spot on the Moon works.`;
    case 'horizon': {
      const highest = Math.max(...a.profile.elevationsDeg);
      return ru ? `Самая высокая гора здесь закрывает небо до ${formatDeg(highest)}.` : `The tallest terrain here blocks the sky up to ${formatDeg(highest)}.`;
    }
    case 'score':
      return ru ? `У этого места ${view.score.total} из 100.` : `This site scores ${view.score.total} out of 100.`;
    case 'timeline':
      return ru ? `Здесь связь с Землёй есть ${formatPercent(a.linkShare)} месяца.` : `Here the link home works ${formatPercent(a.linkShare)} of the month.`;
    case 'energy':
      return ru ? `Прямо сейчас здесь: панель лёжа ${watts('horizontal')} Вт, стоя ${watts('vertical')} Вт.` : `Right now here: a flat panel ${watts('horizontal')} W, an upright one ${watts('vertical')} W.`;
    default:
      return null;
  }
}

const UI = {
  en: {
    explain: 'Explain this site',
    goals: { power: 'Best site for solar power', comms: 'Best site for Earth link', both: 'Best for power + link' },
    howTo: 'How do I use it?',
    about: 'What is this about?',
    tour: 'Take the tour',
    artemis: 'Rank Artemis regions',
    game: 'Mission commander',
    moonVsEarth: 'Why is the Moon so different?',
    empty: 'Ask me about the selected site, or let me find the best one.',
    thinking: 'Comparing sites over the next lunar month…',
    tourDone: "That's the tour! Ask me anything below.",
    fly: 'Fly there →',
    addCompare: 'Add top 3 to compare',
    skip: 'Skip',
    next: 'Next',
    pause: 'Pause',
    resume: 'Go on',
    role: 'mission assistant',
    best: 'Top 5 south pole sites',
    accuracy: 'How accurate is this?',
    more: 'More…',
    less: 'Less',
    bestThinking: 'Searching the whole south polar cap…',
    bestIntro: 'I swept the south polar cap for bright, gentle ground with ice within 20 km, then ran a full month of Sun and DSN link on the shortlist. The best five:',
    bestNone: 'No spot passed the filters this month.',
    candidate: 'Candidate',
    greetTitle: 'Hi! First time here?',
    greetBody: "I'm LUNA, your mission assistant. Give me a minute and I'll show you how to pick where and when to land on the Moon.",
    greetYes: 'Show me',
    greetNo: "I'll explore myself",
    switched: 'Switched to English. Ask me anything.',
    voiceOn: 'Voice on',
    voiceOff: 'Voice off',
    error: 'Sorry, I could not compare the sites.',
    howToLines: [
      'Drag with the left mouse button to slide over the ground.',
      'Right-drag or hold Shift and drag to turn and tilt toward the horizon.',
      'Scroll or pinch to zoom; click the Moon to drop a new site.',
      'Use the timeline at the bottom to change the date, or press play.',
      'Map → Slopes shows where the ground is safe to land; the site score sums up light, DSN link, slope and ice.',
      'The DSN row shows which NASA antenna (Goldstone, Madrid, Canberra) could talk to the lander.',
      '"Stand at the site" puts you on the surface with the Sun\'s and Earth\'s paths in the sky; "PDF report" saves a one-page summary for any period.',
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
    artemis: 'Сравни районы Artemis',
    game: 'Командир миссии',
    moonVsEarth: 'Чем Луна так не похожа на Землю?',
    empty: 'Спроси меня про выбранное место или попроси найти лучшее.',
    thinking: 'Сравниваю места на ближайший лунный месяц…',
    tourDone: 'Экскурсия окончена! Спрашивай что угодно ниже.',
    fly: 'Лететь →',
    addCompare: 'Добавить топ-3 в сравнение',
    skip: 'Пропустить',
    next: 'Дальше',
    pause: 'Пауза',
    resume: 'Продолжить',
    role: 'ассистент миссии',
    best: 'Топ-5 мест южного полюса',
    accuracy: 'Насколько это точно?',
    more: 'Ещё…',
    less: 'Свернуть',
    bestThinking: 'Ищу по всему южному полюсу…',
    bestIntro: 'Я прошлась по всей полярной шапке: яркие и пологие места со льдом в пределах 20 км, а для лучших посчитала целый месяц света и связи DSN. Лучшая пятёрка:',
    bestNone: 'В этом месяце ни одно место не прошло фильтры.',
    candidate: 'Кандидат',
    greetTitle: 'Привет! Ты здесь впервые?',
    greetBody: 'Я LUNA, ассистент миссии. Дай мне минуту, и я покажу, как выбрать, где и когда садиться на Луну.',
    greetYes: 'Покажи',
    greetNo: 'Сам разберусь',
    switched: 'Перешла на русский. Спрашивай!',
    voiceOn: 'Голос вкл.',
    voiceOff: 'Голос выкл.',
    error: 'Не получилось сравнить места.',
    howToLines: [
      'Тяни левой кнопкой мыши, чтобы двигаться над поверхностью.',
      'Правой кнопкой или с зажатым Shift — поворот и наклон к горизонту.',
      'Колесо или щипок — приближение; клик по Луне ставит новую точку.',
      'Таймлайн внизу меняет дату, кнопка «пуск» запускает время.',
      'Карта → «Склоны» показывает, где садиться безопасно; оценка места сводит свет, связь DSN, уклон и лёд.',
      'Строка «Связь DSN» показывает, какая антенна NASA (Голдстоун, Мадрид, Канберра) может говорить с модулем.',
      '«Встать на место» ставит тебя на поверхность с путями Солнца и Земли в небе; «Отчёт PDF» сохраняет сводку за любой период.',
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
export function explainSite(name: string, a: SiteAnalysis, lang: Lang, view?: SiteScoreView): string[] {
  const { state, summary, nextSunChange, nextEarthChange } = a;
  const now = state.time;
  const dur = (ms: number) => formatDuration(ms, lang);
  const sunUp = state.sun.visibleFraction >= 0.5;
  const earthUp = state.earth.visibleFraction >= 0.5;
  const ru = lang === 'ru';
  const lines: string[] = [];
  if (sunUp) {
    const tail = nextSunChange ? (ru ? ` — зайдёт за рельеф через ${dur(nextSunChange - now)}` : ` — it sets behind terrain in ${dur(nextSunChange - now)}`) : ru ? ' и не зайдёт весь месяц' : ' and stays up all month';
    lines.push(ru ? `Над ${name} светит Солнце, ${formatDeg(state.sun.elDeg)} над горизонтом${tail}.` : `The Sun is up at ${name}, ${formatDeg(state.sun.elDeg)} above the horizon${tail}.`);
  } else {
    const tail = nextSunChange ? (ru ? `, взойдёт через ${dur(nextSunChange - now)}` : `, rising in ${dur(nextSunChange - now)}`) : '';
    lines.push(ru ? `В ${name} сейчас ночь: Солнце за хребтом${tail}.` : `It is night at ${name}: the Sun is behind the ridge line${tail}.`);
  }
  if (earthUp) {
    const tail = nextEarthChange ? (ru ? ` ещё ${dur(nextEarthChange - now)}` : ` for another ${dur(nextEarthChange - now)}`) : '';
    lines.push(ru ? `Земля видна — модуль может связываться напрямую${tail}.` : `Earth is in view, so a lander could radio home directly${tail}.`);
    if (a.linkNow >= 0) {
      const st = DSN_STATIONS[a.linkNow];
      lines.push(ru ? `Сейчас Луну видит антенна NASA в ${st.nameRu} (${st.place.ru}).` : `Right now NASA's antenna at ${st.name} (${st.place.en}) can see the Moon.`);
    }
  } else {
    const span = nextEarthChange ? dur(nextEarthChange - now) : null;
    lines.push(ru ? `Земля скрыта${span ? ` ещё ${span}` : ' весь месяц'} — понадобится спутник-ретранслятор.` : `Earth is hidden${span ? ` for ${span}` : ' all month'} — a relay satellite would be needed.`);
  }
  lines.push(
    ru
      ? `За ближайший месяц: свет ${formatPercent(summary.sunlitShare)}, Земля видна ${formatPercent(summary.earthShare)}, и то и другое ${formatPercent(summary.bothShare)}.`
      : `Over the next lunar month: ${formatPercent(summary.sunlitShare)} sunlight, ${formatPercent(summary.earthShare)} Earth in view, ${formatPercent(summary.bothShare)} both at once.`,
  );
  lines.push(
    ru
      ? `Прямая связь через DSN ${formatPercent(a.linkShare)} месяца, свет и связь одновременно ${formatPercent(a.powerLinkShare)}.`
      : `A direct DSN link is possible ${formatPercent(a.linkShare)} of the month, with sunlight at the same time ${formatPercent(a.powerLinkShare)}.`,
  );
  if (view) {
    const ice = view.iceKm === null ? (ru ? 'льда в пределах 20 км нет' : 'no ice within 20 km') : ru ? `лёд в ${view.iceKm.toFixed(1)} км` : `ice ${view.iceKm.toFixed(1)} km away`;
    lines.push(
      ru
        ? `Оценка места ${view.score.total}/100: уклон ${formatDeg(view.slopeDeg)}${view.slopeDeg > 8 ? ' — круто для посадки' : ' — садиться можно'}, ${ice}.`
        : `Site score ${view.score.total}/100: slope ${formatDeg(view.slopeDeg)}${view.slopeDeg > 8 ? ', too steep to land' : ', fine to land'}, ${ice}.`,
    );
  }
  if (summary.longestDarkHours > 0) {
    const h = formatHours(summary.longestDarkHours, lang);
    lines.push(ru ? `Самая длинная ночь — ${h}: батареи и обогрев должны её пережить.` : `The longest night lasts ${h} — batteries and heaters must survive it.`);
  }
  const earthLow = Math.min(...a.timeline.earthElevation);
  const earthHigh = Math.max(...a.timeline.earthElevation);
  if (earthHigh >= 0 && earthLow <= LIBRATION_NOTE_BELOW_DEG) {
    lines.push(
      ru
        ? `Либрация качает Землю: за месяц она ходит от ${formatDeg(earthLow)} до ${formatDeg(earthHigh)} над ровным горизонтом.`
        : `Libration rocks the Earth: over the month it moves from ${formatDeg(earthLow)} to ${formatDeg(earthHigh)} above the flat horizon.`,
    );
  }
  if (summary.sunlitShare > 0.8) lines.push(ru ? 'Отличное место для солнечной энергии: оно выше большинства соседних хребтов.' : 'Excellent for solar power: this spot sees over most ridges.');
  else if (summary.sunlitShare < 0.3) lines.push(ru ? 'Энергии здесь мало — соседний гребень или край кратера обычно намного лучше.' : 'Power would be scarce; a nearby ridge or rim usually does much better.');
  return lines;
}

/** Shadow of a person this tall, for a picture of how low the polar Sun stands. */
const PERSON_HEIGHT_M = 2;
const EARTH_DAY_HOURS = 24;
const LUNAR_DAY_EARTH_DAYS = 29.5;

/** For students and the public: the same numbers as the panels, told against life on Earth. */
export function moonVsEarth(a: SiteAnalysis, lang: Lang): string[] {
  const ru = lang === 'ru';
  const sunEl = a.state.sun.elDeg;
  const highestSun = Math.max(...a.timeline.sunElevation);
  const hottest = Math.round(surfaceTempK(highestSun, 1) - KELVIN_ZERO_C);
  const coldest = Math.round(NIGHT_SURFACE_K - KELVIN_ZERO_C);
  const lines = [
    ru
      ? `День и ночь: на Земле сутки длятся ${EARTH_DAY_HOURS} часа, на Луне около ${LUNAR_DAY_EARTH_DAYS} земных суток. Две недели света, потом две недели темноты.`
      : `Day and night: an Earth day lasts ${EARTH_DAY_HOURS} hours, a lunar day about ${LUNAR_DAY_EARTH_DAYS} Earth days. Two weeks of light, then two weeks of dark.`,
    ru
      ? 'Воздуха нет: небо чёрное даже днём, тени резкие, а за хребтом сразу наступает ночь, без сумерек.'
      : 'No air: the sky is black even by day, shadows are sharp, and behind a ridge it is night at once, with no twilight.',
    ru
      ? `Температура: здесь грунт может прогреться примерно до ${hottest} °C, а ночью остыть примерно до ${coldest} °C. Это простая оценка.`
      : `Temperature: the ground here can reach about ${hottest} °C and fall to about ${coldest} °C at night. This is a simple estimate.`,
  ];
  if (sunEl > MIN_SHADOW_SUN_DEG) {
    const shadow = PERSON_HEIGHT_M / Math.tan((sunEl * Math.PI) / 180);
    lines.push(
      ru
        ? `Солнце сейчас на ${formatDeg(sunEl)} над горизонтом, поэтому тень человека ростом ${PERSON_HEIGHT_M} м длиной около ${Math.round(shadow)} м.`
        : `The Sun now stands ${formatDeg(sunEl)} above the horizon, so a ${PERSON_HEIGHT_M} m person casts a shadow about ${Math.round(shadow)} m long.`,
    );
  }
  lines.push(
    ru
      ? 'Земля с Луны почти не движется по небу: с ближней стороны она висит на одном месте и лишь покачивается, а с обратной её не видно совсем.'
      : 'From the Moon the Earth hardly moves across the sky: on the near side it hangs in one place and only rocks, and from the far side it is never seen.',
  );
  return lines;
}

export function describeRanking(goal: RankGoal, ranked: readonly RankedSite[], lang: Lang): string {
  const best = ranked[0];
  if (!best) return lang === 'ru' ? 'Не удалось ничего сравнить.' : 'I could not rank any sites.';
  const words = lang === 'ru' ? { power: 'света', comms: 'связи с Землёй', both: 'света и связи одновременно' } : { power: 'sunlight', comms: 'Earth in view', both: 'sunlight and Earth together' };
  return lang === 'ru'
    ? `Больше всего ${words[goal]} у ${siteLabel(best.site, lang)}: ${formatPercent(best.score)} ближайшего месяца. Лучшие варианты:`
    : `For ${words[goal]}, ${siteLabel(best.site, lang)} wins with ${formatPercent(best.score)} of the next month. Top picks:`;
}
