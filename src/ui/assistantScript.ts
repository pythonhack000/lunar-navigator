import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import type { SiteScoreView } from '../hooks/useSiteScore';
import { DSN_STATIONS } from '../lib/dsn';
import { siteLabel, type Lang } from '../i18n';
import { formatDeg, formatDuration, formatHours, formatPercent } from '../lib/format';
import { NIGHT_SURFACE_K, surfaceTempK } from '../lib/power';
import type { RankedSite, RankGoal } from '../lib/ranking';

/** Only sites where the Earth dips near the horizon get the libration remark. */
const LIBRATION_NOTE_BELOW_DEG = 12;
const KELVIN_ZERO_C = 273.15;
/** Below this the shadow length is a meaningless huge number. */
const MIN_SHADOW_SUN_DEG = 0.3;

export interface TourStep {
  /** `data-tour` value of the element to spotlight, or null for a centred message. */
  target: string | null;
  title: string;
  body: string;
}

const TOUR_EN: TourStep[] = [
  { target: null, title: "Hi, I'm LUNA", body: 'I help pick where and when to land near the lunar south pole. A lander there needs sunlight on its solar panels and Earth above the horizon to radio home. Mountains and crater rims block both. Let me show you around.' },
  { target: 'sites', title: 'Pick a landing site', body: 'Start with the Artemis regions or the south pole. There are also future missions (CLPS and commercial), robotic landers from several countries and all six Apollo sites. You can also type coordinates or click anywhere on the Moon.' },
  { target: 'camera', title: 'Fly in 3D', body: 'Drag to move, right-drag or Shift-drag to tilt toward the horizon, scroll to zoom. Switch the map to Sunlight or Ice to see where the Sun shines all year — and where it never does — or to Slopes: green ground is gentle enough to land on, red is too steep.' },
  { target: 'ground', title: 'Stand at the site', body: 'This button takes you down to the surface, as if you stood next to the lander. Drag to look around the real mountains; the Sun and the Earth show their paths for the month — solid while in view, dashed while behind the terrain. Press play and watch them move.' },
  { target: 'readouts', title: 'Sun and Earth right now', body: 'How high the Sun and Earth stand above the real terrain, and how long until they set behind it. At the pole the Sun skims the horizon, so a small ridge can cause night.' },
  { target: 'horizon', title: 'The real horizon', body: 'The 360° skyline around the site, traced from NASA LOLA laser altimetry, with the paths of the Sun and Earth over the coming days.' },
  { target: 'score', title: 'One score out of 100', body: 'Sunlight for power, a direct link to Earth, a gentle slope and ice within reach, weighed into one number. "Check against NASA papers" puts our results next to published LOLA studies.' },
  { target: 'timeline', title: 'A whole lunar month', body: 'Amber is sunlight, blue is Earth in view. The third row is the real link home: which NASA Deep Space Network antenna — G Goldstone, M Madrid, C Canberra — can see the Moon. Press play to watch shadows sweep the craters.' },
  { target: 'compare', title: 'Compare sites and dates', body: 'Compare puts up to four scenarios side by side. Each row can have its own landing date, so you can weigh this site against that one, or this month against next. If a launch slips, the +1, +7 and +30 day buttons add the delayed version in one click.' },
  { target: 'windows', title: 'Windows for your mission', body: 'The calendar shows, day by day, when there is both power and a link. Enter your mission\'s length, its sunlight and link needs and the antenna margin, and I search the next year for every date you could land.' },
  { target: 'energy', title: 'Power, in watts', body: 'At the pole the Sun skims the horizon, so a flat panel gets almost nothing and landers stand their arrays upright. Choose the array, area, load and battery, and see the month\'s energy and whether the battery survives the night.' },
  { target: 'whatif', title: 'What if?', body: 'Why do small changes matter so much? Move it maps sunlight and link around the site, cell by cell. Delay it shows the same mission starting up to 90 days later. Libration shows the wobble that lifts the Earth in and out of view.' },
  { target: 'report', title: 'Take it with you', body: 'Report makes a one-page PDF for people and a CSV for their tools. Copy link saves this exact site, date and comparison, so a teammate opens the same view.' },
  { target: null, title: 'For the curious', body: 'Ask me why the Moon is so unlike Earth, or open More and play Mission commander: three rounds of choosing the best site, scored from the real data. I can also find the top 5 sites of the whole south pole.' },
];

const TOUR_RU: TourStep[] = [
  { target: null, title: 'Привет, я LUNA', body: 'Я помогаю выбрать, где и когда садиться у южного полюса Луны. Посадочному модулю нужны две вещи: Солнце на солнечных панелях и Земля над горизонтом для связи. Горы и края кратеров закрывают и то и другое. Давай покажу, как тут всё устроено.' },
  { target: 'sites', title: 'Выбери место посадки', body: 'Начни с районов Artemis или южного полюса. Здесь же будущие миссии (CLPS и коммерческие), автоматические станции разных стран и все шесть мест Аполлона. Можно ввести координаты или просто кликнуть в любое место Луны.' },
  { target: 'camera', title: 'Летай в 3D', body: 'Тяни мышью, чтобы двигаться, правой кнопкой или с Shift — наклоняй к горизонту, колесом — приближай. Переключи карту на «Свет» или «Лёд», чтобы увидеть, где Солнце светит весь год, а где не бывает никогда, или на «Склоны»: на зелёное садиться можно, красное слишком круто.' },
  { target: 'ground', title: 'Встань на место', body: 'Эта кнопка опустит тебя на поверхность, будто ты стоишь рядом с посадочным модулем. Тяни мышью, чтобы осмотреть настоящие горы; у Солнца и Земли видны пути на месяц — сплошные, пока они видны, и пунктирные, когда за рельефом. Нажми «пуск» и смотри, как они движутся.' },
  { target: 'readouts', title: 'Солнце и Земля сейчас', body: 'Как высоко стоят Солнце и Земля над настоящим рельефом и через сколько они зайдут за него. На полюсе Солнце ползёт по горизонту, поэтому даже небольшой хребет устраивает ночь.' },
  { target: 'horizon', title: 'Настоящий горизонт', body: 'Линия гор на 360° вокруг места по лазерной съёмке NASA LOLA и пути Солнца и Земли на ближайшие дни.' },
  { target: 'score', title: 'Одна оценка из 100', body: 'Свет для энергии, прямая связь с Землёй, пологий склон и лёд рядом — всё сведено в одно число. «Сверить со статьями NASA» показывает наши расчёты рядом с опубликованными исследованиями LOLA.' },
  { target: 'timeline', title: 'Целый лунный месяц', body: 'Жёлтое — свет, синее — Земля видна. Третья строка — настоящая связь: какая антенна NASA Deep Space Network видит Луну — G Голдстоун, M Мадрид, C Канберра. Нажми «пуск» и смотри, как тени ползут по кратерам.' },
  { target: 'compare', title: 'Сравни места и даты', body: '«Сравнить» ставит рядом до четырёх сценариев. У каждой строки может быть своя дата посадки, так что можно взвесить одно место против другого или этот месяц против следующего. Если запуск сдвинулся, кнопки +1, +7 и +30 дней добавят отложенный вариант в один клик.' },
  { target: 'windows', title: 'Окна под твою миссию', body: 'Календарь показывает по дням, когда есть и энергия, и связь. Укажи длительность миссии, сколько нужно света и связи и запас антенны, и я найду на год вперёд все даты, когда можно садиться.' },
  { target: 'energy', title: 'Энергия в ваттах', body: 'На полюсе Солнце ползёт по горизонту, поэтому лежачая панель почти ничего не получает, и модули ставят панели вертикально. Выбери панели, площадь, нагрузку и батарею и посмотри энергию за месяц и переживёт ли батарея ночь.' },
  { target: 'whatif', title: 'Что если?', body: 'Почему маленькие изменения так важны? «Сдвинуть» показывает свет и связь вокруг места по клеткам. «Отложить» показывает ту же миссию с задержкой до 90 дней. «Либрация» показывает покачивание Луны, из-за которого Земля то появляется, то скрывается.' },
  { target: 'report', title: 'Забери с собой', body: '«Отчёт» делает одностраничный PDF для людей и CSV для их программ. «Скопировать ссылку» сохраняет это место, дату и сравнение, так что коллега откроет то же самое.' },
  { target: null, title: 'Для любопытных', body: 'Спроси меня, чем Луна так не похожа на Землю, или открой «Ещё» и сыграй в «Командира миссии»: три раунда выбора лучшего места с оценкой по настоящим данным. А ещё я могу найти топ-5 мест всего южного полюса.' },
];

export const tourFor = (lang: Lang): readonly TourStep[] => (lang === 'ru' ? TOUR_RU : TOUR_EN);

const UI = {
  en: {
    explain: 'Explain this site',
    goals: { power: 'Best site for solar power', comms: 'Best site for Earth link', both: 'Best for power + link' },
    howTo: 'How do I use it?',
    about: 'What is this about?',
    tour: 'Take the tour',
    artemis: 'Rank Artemis regions',
    game: 'Play Mission commander',
    moonVsEarth: 'Why is the Moon so different?',
    empty: 'Ask me about the selected site, or let me find the best one.',
    thinking: 'Comparing sites over the next lunar month…',
    tourDone: "That's the tour! Ask me anything below.",
    fly: 'Fly there →',
    addCompare: 'Add top 3 to compare',
    skip: 'Skip',
    next: 'Next',
    done: 'Done',
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
    game: 'Сыграть в «Командира миссии»',
    moonVsEarth: 'Чем Луна так не похожа на Землю?',
    empty: 'Спроси меня про выбранное место или попроси найти лучшее.',
    thinking: 'Сравниваю места на ближайший лунный месяц…',
    tourDone: 'Экскурсия окончена! Спрашивай что угодно ниже.',
    fly: 'Лететь →',
    addCompare: 'Добавить топ-3 в сравнение',
    skip: 'Пропустить',
    next: 'Дальше',
    done: 'Готово',
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
