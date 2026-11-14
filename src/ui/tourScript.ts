import type { Lang } from '../i18n';

/**
 * LUNA's tour as a script. Each step is a few beats: she lights something up and says a line, and
 * `press` makes her really click it when the beat ends, so the visitor sees how each thing is done.
 */
export type TourRun = 'play-slow' | 'play-fast' | 'polar-view';

export interface TourBeat {
  /** What to light up, or null for nothing. */
  spot: string | null;
  say: string;
  /** Clicked for real when the beat ends. */
  press?: string;
  run?: TourRun;
  /** A window is open, so her panel moves aside for it. */
  inDialog?: boolean;
  /** Her panel sits on the right for this beat, because the left column is being shown. */
  panelRight?: boolean;
  /** On the surface: 3D LUNA turns to this and lights it with a beam. */
  point?: 'sun' | 'earth';
  /** Longer than the words need, while something is happening on screen. */
  ms?: number;
  /** Said only if this is on the page (the polar photo exists only near the south pole). */
  when?: string;
}

export interface TourStep {
  /** Picks the live number from the visitor's own site. */
  key: string;
  title: string;
  beats: readonly TourBeat[];
}

const tag = (name: string) => `[data-tour="${name}"]`;
const CLOSE_LAYER = tag('layer-none');
/** NASA's sunlight map exists only at 88–90°S; the site panel says which case this is. */
const NASA_MAP = '[data-tour="nasa"][data-nasa-map="yes"]';
const NO_NASA_MAP = '[data-tour="nasa"][data-nasa-map="no"]';
const DESCENT_MS = 4200;
const LOOK_MS = 4200;
const MAP_MS = 7500;
const TIME_MS = 8000;

const EN: readonly TourStep[] = [
  {
    key: 'sites',
    title: 'Pick a landing site',
    beats: [
      { spot: tag('sites'), panelRight: true, say: 'Start here: Artemis regions, the south pole, future missions, robotic landers and all six Apollo sites. You can also type coordinates, or just click anywhere on the Moon.' },
    ],
  },
  {
    key: 'maps',
    title: 'Three maps of the Moon',
    beats: [
      { spot: tag('layer-light'), run: 'polar-view', say: "Let me back up so you can see the whole pole. Now I'll press Sunlight.", press: tag('layer-light'), ms: 4200 },
      { spot: null, say: 'Bright means sunlit most of the year. The high rims glow, and those are the best places for solar power.', ms: 4500 },
      { spot: tag('layer-ice'), say: 'Now Ice.', press: tag('layer-ice') },
      { spot: null, say: 'Blue never sees the Sun. Water ice can survive in these cold traps for billions of years.', ms: 4500 },
      { spot: tag('layer-slope'), say: 'And Slopes.', press: tag('layer-slope') },
      { spot: null, say: 'Green is gentle enough to land on. Red would tip a lander over.', ms: 4500 },
    ],
  },
  {
    key: 'relief',
    title: 'Change the relief',
    beats: [
      { spot: CLOSE_LAYER, say: 'Back to plain terrain.', press: CLOSE_LAYER },
      { spot: tag('relief'), say: 'This button stretches the mountains so they are easier to see. Watch, I will press it.', press: tag('relief') },
      { spot: null, say: 'Five times taller! It is only for your eyes: every number here uses the true heights. Drag to move, right-drag to tilt, scroll to zoom.', ms: 5500 },
    ],
  },
  {
    key: 'ground',
    title: 'Stand at the site',
    beats: [
      { spot: tag('ground'), say: "Now let's go down. This button puts you on the surface.", press: tag('ground') },
      { spot: null, say: "Let's fly down together!", ms: DESCENT_MS },
      { spot: tag('look-sun'), point: 'sun', say: 'This button turns us toward the Sun.', press: tag('look-sun') },
      { spot: null, point: 'sun', say: 'If it is night, the Sun is under the horizon, so we look along the horizon in its direction.', ms: LOOK_MS },
      { spot: tag('look-earth'), point: 'earth', say: 'This one finds the Earth.', press: tag('look-earth') },
      { spot: null, point: 'earth', say: "There's home. From here it hardly moves across the sky, it only rocks.", ms: LOOK_MS },
      { spot: tag('ground-arrows'), say: 'Looking around yourself? These arrows show which way to turn to find the Sun and the Earth. Click one to turn at once.', ms: LOOK_MS, press: tag('look-sun') },
      { spot: tag('timeline'), run: 'play-fast', point: 'sun', say: "Now I'll pull time forward. Watch the Sun creep along the horizon and the shadows turn.", ms: TIME_MS },
    ],
  },
  {
    key: 'readouts',
    title: 'Sun and Earth right now',
    beats: [{ spot: tag('readouts'), run: 'play-slow', say: "I'm pulling time forward, so watch the numbers change: how high the Sun and Earth stand, and how long until they set behind the terrain." }],
  },
  {
    key: 'horizon',
    title: 'The real horizon',
    beats: [{ spot: tag('horizon'), run: 'play-slow', say: 'The 360° skyline around the site, from NASA laser altimetry. The dots moving along it are the Sun and the Earth.' }],
  },
  {
    key: 'score',
    title: 'One score out of 100',
    beats: [
      { spot: tag('score'), say: 'Sunlight, a direct link, a gentle slope and ice nearby, in one number.' },
      { spot: tag('nasa'), when: NASA_MAP, say: 'Here we check ourselves against NASA: our year of sunlight next to the figure from 3,807 orbital images. Let me open the photo of this spot.', press: tag('nasa-photo'), ms: 6500 },
      { spot: tag('nasa'), when: NO_NASA_MAP, say: 'Our year of sunlight is here. NASA measured it from orbit only right at the pole, but the photo works anywhere. Let me open it.', press: tag('nasa-photo'), ms: 6500 },
      { spot: '.orbit__frame', inDialog: true, when: '.orbit', say: 'This is the real place, photographed from orbit by NASA. The ring is your landing site.', ms: 6000 },
    ],
  },
  {
    key: 'timeline',
    title: 'A whole lunar month',
    beats: [
      { spot: tag('timeline'), run: 'play-fast', say: "I'm running a day per second. Amber is sunlight, blue is Earth in view, and the third row shows which NASA antenna can talk to the lander." },
      { spot: tag('jumps'), say: 'These buttons step a day or a whole lunar month. I will jump a month ahead.', press: tag('jump-month') },
      { spot: tag('timeline'), say: 'Done, a new month. To reach any moment, just drag the white handle: the date shows above it.', ms: 5500 },
    ],
  },
  {
    key: 'compare',
    title: 'Compare sites and dates',
    beats: [
      { spot: tag('compare'), say: 'To compare, press this. I will do it now.', press: tag('compare') },
      { spot: tag('slip-7'), say: 'What if the launch slips a week? This adds the same site, seven days later.', press: tag('slip-7') },
      { spot: tag('compare-panel'), say: 'Now you can see both. Each row can have its own date, and the best value in each column lights up. Pick another site and add it the same way.', ms: 6500 },
    ],
  },
  {
    key: 'windows',
    title: 'Windows for your mission',
    beats: [
      { spot: tag('windows'), say: 'When can a mission land? This opens the landing windows.', press: tag('windows') },
      { spot: '.mission-filter', inDialog: true, say: 'Enter how long your mission lasts and how much sunlight and link it needs. I search the next year for every date that works.' },
      { spot: '.month-grid', inDialog: true, say: 'Bright days have both power and a link. A white dot means your mission fits if it lands that day. Click a day to go there.' },
    ],
  },
  {
    key: 'search',
    title: 'Where can it land?',
    beats: [
      { spot: tag('site-search'), panelRight: true, say: 'Now the question the other way round: where can a mission land? This button searches the whole south pole. Let me open it.', press: tag('site-search') },
      { spot: '.site-search__presets', inDialog: true, say: 'Pick a goal in one click: the most sunlight, the best radio link, both together, or eternal shadow where ice can hide. I will take sunlight and link.', press: '.site-search__presets button:nth-child(3)' },
      { spot: '.site-search__period', inDialog: true, say: 'Search over your own dates, from one day to another, or on average over a whole year.' },
      { spot: '.need-field', inDialog: true, say: 'Each need can be a floor or a ceiling, or "any" to leave it out. So you can search by light alone, or by the link alone.' },
      { spot: '.site-search__map', inDialog: true, say: 'Spots light up as I check them: amber fits, dark amber almost, grey does not. The best three get numbers. Now look at the Moon.', ms: 7000, press: tag('search-show') },
      { spot: '.search-chip', say: 'There they are, glowing on the real terrain. Click any spot to fly there. This bar brings the list back, and the cross switches the lights off.', ms: 7000, press: '.search-chip .icon-button' },
    ],
  },
  {
    key: 'energy',
    title: 'Power, in watts',
    beats: [
      { spot: tag('energy'), say: 'How much power would a lander get? Let me open it.', press: tag('energy') },
      { spot: '.energy .tool-row', inDialog: true, say: 'First choose the panels. At the pole a flat panel gets almost nothing, so landers stand them upright.' },
      { spot: '.tool-tiles', inDialog: true, say: 'Then see the watts now, the month’s energy and the battery you would need.' },
      { spot: '.mini-chart', inDialog: true, say: 'The line is your power over the month, the dashes are your load. Where the line falls below them, you are living on the battery.' },
    ],
  },
  {
    key: 'whatif',
    title: 'What if?',
    beats: [
      { spot: tag('whatif'), say: 'Why do small changes matter so much? This answers it.', press: tag('whatif') },
      { spot: '.what-if-map', inDialog: true, say: 'Sunlight around this site, cell by cell. Look how much it changes in just a few kilometres.', ms: MAP_MS, press: '.what-if-tabs button:nth-child(2)' },
      { spot: '.what-if-table', inDialog: true, say: 'The same mission, delayed. Some delays cost nothing, others cost the whole mission.', ms: 5500, press: '.what-if-tabs button:nth-child(3)' },
      { spot: '.what-if-charts', inDialog: true, say: 'And libration: the Moon wobbles, which lifts the Earth in and out of view at the pole.', ms: 5500 },
    ],
  },
  {
    key: 'report',
    title: 'Take it with you',
    beats: [
      { spot: tag('report'), say: 'Last one: take your results with you.', press: tag('report') },
      { spot: '.report-dialog__actions', inDialog: true, say: 'A one-page PDF for people, a CSV table for their tools.' },
      { spot: '.report-dialog__share', inDialog: true, say: 'And a link that opens this exact site, date and comparison for your team.' },
    ],
  },
  {
    key: 'done',
    title: 'Your turn, commander',
    beats: [{ spot: null, say: 'That is everything! Now try Mission commander, where you find a landing site yourself. And on Apollo and robotic sites, press Landing day to stand there on the very day they touched down.', ms: 7000 }],
  },
];

const RU: readonly TourStep[] = [
  {
    key: 'sites',
    title: 'Выбери место посадки',
    beats: [
      { spot: tag('sites'), panelRight: true, say: 'Начни отсюда: районы Artemis, южный полюс, будущие миссии, автоматические станции и все шесть мест Аполлона. Можно ввести координаты или просто кликнуть в любое место Луны.' },
    ],
  },
  {
    key: 'maps',
    title: 'Три карты Луны',
    beats: [
      { spot: tag('layer-light'), run: 'polar-view', say: 'Отойду подальше, чтобы был виден весь полюс. Теперь нажимаю «Свет».', press: tag('layer-light'), ms: 4200 },
      { spot: null, say: 'Ярко там, где Солнце светит большую часть года. Светятся высокие края кратеров: это лучшие места для солнечных панелей.', ms: 4500 },
      { spot: tag('layer-ice'), say: 'Теперь «Лёд».', press: tag('layer-ice') },
      { spot: null, say: 'Голубое никогда не видит Солнца. В таких холодных ловушках водяной лёд сохраняется миллиарды лет.', ms: 4500 },
      { spot: tag('layer-slope'), say: 'И «Склоны».', press: tag('layer-slope') },
      { spot: null, say: 'На зелёное садиться можно, а на красном модуль опрокинется.', ms: 4500 },
    ],
  },
  {
    key: 'relief',
    title: 'Меняй рельеф',
    beats: [
      { spot: CLOSE_LAYER, say: 'Возвращаю обычный рельеф.', press: CLOSE_LAYER },
      { spot: tag('relief'), say: 'Эта кнопка вытягивает горы, чтобы их было лучше видно. Смотри, нажимаю.', press: tag('relief') },
      { spot: null, say: 'В пять раз выше! Это только для глаз: все цифры считаются по настоящим высотам. Тяни мышью, чтобы двигаться, правой кнопкой наклоняй, колесом приближай.', ms: 5500 },
    ],
  },
  {
    key: 'ground',
    title: 'Встань на место',
    beats: [
      { spot: tag('ground'), say: 'А теперь вниз. Эта кнопка ставит тебя на поверхность.', press: tag('ground') },
      { spot: null, say: 'Давай полетим вместе!', ms: DESCENT_MS },
      { spot: tag('look-sun'), point: 'sun', say: 'Эта кнопка повернёт нас к Солнцу.', press: tag('look-sun') },
      { spot: null, point: 'sun', say: 'Если сейчас ночь, Солнце под горизонтом, поэтому мы смотрим вдоль горизонта в его сторону.', ms: LOOK_MS },
      { spot: tag('look-earth'), point: 'earth', say: 'А эта найдёт Землю.', press: tag('look-earth') },
      { spot: null, point: 'earth', say: 'Вот наш дом. Отсюда он почти не движется по небу, только покачивается.', ms: LOOK_MS },
      { spot: tag('ground-arrows'), say: 'Осматриваешься сам? Эти стрелки показывают, куда повернуть, чтобы найти Солнце и Землю. Нажми на стрелку, и повернёшься сразу.', ms: LOOK_MS, press: tag('look-sun') },
      { spot: tag('timeline'), run: 'play-fast', point: 'sun', say: 'А теперь потяну время вперёд. Смотри, как Солнце ползёт вдоль горизонта и как поворачиваются тени.', ms: TIME_MS },
    ],
  },
  {
    key: 'readouts',
    title: 'Солнце и Земля сейчас',
    beats: [{ spot: tag('readouts'), run: 'play-slow', say: 'Тяну время вперёд, смотри, как меняются цифры: как высоко стоят Солнце и Земля и через сколько зайдут за рельеф.' }],
  },
  {
    key: 'horizon',
    title: 'Настоящий горизонт',
    beats: [{ spot: tag('horizon'), run: 'play-slow', say: 'Линия гор на 360° вокруг места по лазерной съёмке NASA. Точки, что движутся вдоль неё, это Солнце и Земля.' }],
  },
  {
    key: 'score',
    title: 'Одна оценка из 100',
    beats: [
      { spot: tag('score'), say: 'Свет, прямая связь, пологий склон и лёд рядом сведены в одно число.' },
      { spot: tag('nasa'), when: NASA_MAP, say: 'А здесь мы сверяемся с NASA: наш год света рядом с цифрой по 3 807 снимкам с орбиты. Сейчас открою снимок этого места.', press: tag('nasa-photo'), ms: 6500 },
      { spot: tag('nasa'), when: NO_NASA_MAP, say: 'Здесь наш год света. С орбиты NASA измерила его только у самого полюса, а снимок есть для любого места. Сейчас открою.', press: tag('nasa-photo'), ms: 6500 },
      { spot: '.orbit__frame', inDialog: true, when: '.orbit', say: 'Это настоящее место, снятое с орбиты аппаратом NASA. Кольцо — твоя точка посадки.', ms: 6000 },
    ],
  },
  {
    key: 'timeline',
    title: 'Целый лунный месяц',
    beats: [
      { spot: tag('timeline'), run: 'play-fast', say: 'Кручу по дню в секунду. Жёлтое — свет, синее — Земля видна, а третья строка показывает, какая антенна NASA может говорить с модулем.' },
      { spot: tag('jumps'), say: 'Эти кнопки шагают на сутки или на целый лунный месяц. Сейчас перелистну на месяц вперёд.', press: tag('jump-month') },
      { spot: tag('timeline'), say: 'Готово, новый месяц. А чтобы попасть в любой момент, просто тащи белую ручку: над ней видна дата.', ms: 5500 },
    ],
  },
  {
    key: 'compare',
    title: 'Сравни места и даты',
    beats: [
      { spot: tag('compare'), say: 'Чтобы сравнить, нажми сюда. Сейчас нажму сама.', press: tag('compare') },
      { spot: tag('slip-7'), say: 'А если запуск перенесут на неделю? Эта кнопка добавит то же место на семь дней позже.', press: tag('slip-7') },
      { spot: tag('compare-panel'), say: 'Теперь видно оба варианта. У каждой строки своя дата, а лучшее значение в столбце светится. Другое место выбирается и добавляется так же.', ms: 6500 },
    ],
  },
  {
    key: 'windows',
    title: 'Окна под твою миссию',
    beats: [
      { spot: tag('windows'), say: 'Когда миссия может сесть? Эта кнопка открывает окна посадки.', press: tag('windows') },
      { spot: '.mission-filter', inDialog: true, say: 'Укажи, сколько длится миссия и сколько ей нужно света и связи. Я найду на год вперёд все подходящие даты.' },
      { spot: '.month-grid', inDialog: true, say: 'Яркие дни — есть и энергия, и связь. Белая точка значит, что твоя миссия подойдёт, если сесть в этот день. Кликни день, чтобы перейти к нему.' },
    ],
  },
  {
    key: 'search',
    title: 'Где можно сесть?',
    beats: [
      { spot: tag('site-search'), panelRight: true, say: 'А теперь вопрос наоборот: где миссия вообще может сесть? Эта кнопка ищет по всему южному полюсу. Сейчас открою.', press: tag('site-search') },
      { spot: '.site-search__presets', inDialog: true, say: 'Цель выбирается в один клик: больше света, лучшая связь, и то и другое, или вечная тень, где прячется лёд. Возьму свет и связь.', press: '.site-search__presets button:nth-child(3)' },
      { spot: '.site-search__period', inDialog: true, say: 'Искать можно на свои даты, с одного дня по другой, или в среднем за целый год.' },
      { spot: '.need-field', inDialog: true, say: 'Каждое условие может быть «не меньше», «не больше» или «неважно». Так что можно искать только по свету или только по связи.' },
      { spot: '.site-search__map', inDialog: true, say: 'Места загораются по мере проверки: оранжевые подходят, тёмно-оранжевые почти, серые нет. Три лучших пронумерованы. А теперь смотри на Луну.', ms: 7000, press: tag('search-show') },
      { spot: '.search-chip', say: 'Вот они, светятся прямо на рельефе. Нажми на любое место, и полетишь туда. Эта плашка возвращает список, а крестик гасит подсветку.', ms: 7000, press: '.search-chip .icon-button' },
    ],
  },
  {
    key: 'energy',
    title: 'Энергия в ваттах',
    beats: [
      { spot: tag('energy'), say: 'Сколько энергии получит модуль? Сейчас открою.', press: tag('energy') },
      { spot: '.energy .tool-row', inDialog: true, say: 'Сначала выбери панели. На полюсе лежачая панель почти ничего не получает, поэтому их ставят вертикально.' },
      { spot: '.tool-tiles', inDialog: true, say: 'Затем смотри ватты сейчас, энергию за месяц и какая нужна батарея.' },
      { spot: '.mini-chart', inDialog: true, say: 'Линия — твоя мощность за месяц, пунктир — нагрузка. Где линия ниже пунктира, модуль живёт на батарее.' },
    ],
  },
  {
    key: 'whatif',
    title: 'Что если?',
    beats: [
      { spot: tag('whatif'), say: 'Почему маленькие изменения так важны? Ответ здесь.', press: tag('whatif') },
      { spot: '.what-if-map', inDialog: true, say: 'Свет вокруг этого места по клеткам. Смотри, как сильно он меняется всего за несколько километров.', ms: MAP_MS, press: '.what-if-tabs button:nth-child(2)' },
      { spot: '.what-if-table', inDialog: true, say: 'Та же миссия с задержкой. Одна задержка ничего не стоит, другая стоит всей миссии.', ms: 5500, press: '.what-if-tabs button:nth-child(3)' },
      { spot: '.what-if-charts', inDialog: true, say: 'И либрация: Луна покачивается, и на полюсе Земля из-за этого то появляется, то скрывается.', ms: 5500 },
    ],
  },
  {
    key: 'report',
    title: 'Забери с собой',
    beats: [
      { spot: tag('report'), say: 'Последнее: забери результаты с собой.', press: tag('report') },
      { spot: '.report-dialog__actions', inDialog: true, say: 'Одностраничный PDF для людей и таблица CSV для их программ.' },
      { spot: '.report-dialog__share', inDialog: true, say: 'И ссылка, которая откроет команде это место, дату и сравнение.' },
    ],
  },
  {
    key: 'done',
    title: 'Твоя очередь, командир',
    beats: [{ spot: null, say: 'Вот и всё! Теперь попробуй «Командира миссии», там ты сам находишь место посадки. А на местах Аполлона и автоматических станций нажми «День посадки» и окажись там в тот самый день.', ms: 7000 }],
  },
];

/** Steps that show the 3D scene itself: the map layers, the relief and standing on the surface. */
const NEEDS_3D: ReadonlySet<string> = new Set(['maps', 'relief', 'ground']);

/** On the flat map, one step about the map itself takes their place. */
const FLAT_EN: TourStep = {
  key: 'flat-map',
  title: 'The Moon as a map',
  beats: [
    { spot: tag('flat-map'), say: 'This device shows the Moon as a flat map, and every number on the right is the same as in 3D. Drag to move it, scroll to zoom. I will zoom in.', press: tag('flat-zoom-in'), ms: 6500 },
    { spot: tag('flat-view-globe'), say: 'These switch between the south pole and the whole Moon. Here is the whole Moon.', press: tag('flat-view-globe') },
    { spot: tag('flat-map'), say: 'Click any spot and I work out its Sun, Earth and score. Back to the pole now.', press: tag('flat-view-pole'), ms: 5500 },
  ],
};

const FLAT_RU: TourStep = {
  key: 'flat-map',
  title: 'Луна как карта',
  beats: [
    { spot: tag('flat-map'), say: 'На этом устройстве Луна — плоская карта, и все цифры справа те же, что в 3D. Тащи карту, чтобы двигать, колесом — приближай. Сейчас приближу.', press: tag('flat-zoom-in'), ms: 6500 },
    { spot: tag('flat-view-globe'), say: 'Эти кнопки переключают южный полюс и всю Луну. Вот вся Луна.', press: tag('flat-view-globe') },
    { spot: tag('flat-map'), say: 'Нажми в любое место — посчитаю для него Солнце, Землю и оценку. А теперь обратно на полюс.', press: tag('flat-view-pole'), ms: 5500 },
  ],
};

/**
 * The tour in the visitor's language. On the flat map the steps that need the 3D Moon give way to
 * one about the map, right after choosing a site.
 */
export const tourFor = (lang: Lang, isFlat = false): readonly TourStep[] => {
  const steps = lang === 'ru' ? RU : EN;
  if (!isFlat) return steps;
  const [first, ...rest] = steps.filter((s) => !NEEDS_3D.has(s.key));
  return [first, lang === 'ru' ? FLAT_RU : FLAT_EN, ...rest];
};

const MS_PER_WORD = 330;
const BASE_MS = 1300;
const MIN_MS = 2800;
const MAX_MS = 10_000;

/** How long a beat stays: enough to read it, or what the action on screen needs. */
export function beatMs(beat: TourBeat): number {
  const reading = Math.min(MAX_MS, Math.max(MIN_MS, BASE_MS + beat.say.split(/\s+/).length * MS_PER_WORD));
  return Math.max(reading, beat.ms ?? 0);
}
