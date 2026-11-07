import type { Lang } from '../i18n';
import type { MissionKind, Rank } from '../lib/missionGame';

/** One mission's words; which sites it visits and how it scores live beside them. */
export interface MissionText {
  title: string;
  story: string;
  /** Where on the screen the answer is, so the player learns to read the real panels. */
  lookAt: string;
  reading: string;
  hint: string;
  why?: { question: string; options: readonly [string, string, string] };
  lesson: string;
}

/** What a hint in the open search does besides explaining. */
export type FreeHintAction = 'none' | 'light-map' | 'polar-view' | 'slope-map';

export const FREE_HINT_ACTIONS: readonly FreeHintAction[] = ['none', 'light-map', 'polar-view', 'slope-map'];

export interface MissionSpec {
  kind: MissionKind;
  /** Candidate site ids; 'dates' scouts one site at three dates, 'free' lets the player roam. */
  siteIds: readonly string[];
  better: 'high' | 'low';
  /** Tour spotlight on the part of the screen that holds the reading. */
  spot: string;
}

export const MISSIONS: readonly MissionSpec[] = [
  { kind: 'power', siteIds: ['haworth', 'apollo11', 'shackleton'], better: 'high', spot: '[data-tour="metric-sun"]' },
  { kind: 'comms', siteIds: ['change4', 'slater', 'im-1'], better: 'high', spot: '[data-tour="metric-earth"]' },
  { kind: 'night', siteIds: ['apollo11', 'chandrayaan3', 'shackleton'], better: 'low', spot: '[data-tour="metric-night"]' },
  { kind: 'dates', siteIds: ['apollo11'], better: 'high', spot: '[data-tour="status-sun"]' },
  { kind: 'free', siteIds: [], better: 'high', spot: '[data-tour="metric-both"]' },
];

/** The option that is right is always the first in the script; the screen shuffles them. */
export const RIGHT_WHY = 0;

const TEXT = {
  en: {
    start: 'Start scouting',
    fly: 'Fly there',
    record: 'Write it down',
    refining: 'Refining terrain…',
    journal: 'Your log',
    choose: 'All written down. Compare them: which one do you choose?',
    goScout: 'Fly to each candidate and write down what the panel shows.',
    hint: 'Hint (costs a star)',
    moreHint: 'Another hint (−★)',
    rescue: "I'm stuck, LUNA, help me",
    rescued: "Here, I found one for you: {name}. Look at its numbers, then press Check.",
    freeHints: [
      'Power + DSN is the share of the month with sunlight and a link to Earth at the same time. High places see both, low ones see neither.',
      "I've switched on the Sunlight map. Bright means sunny, so aim for the bright crater rims.",
      "I've moved the camera over the south pole, the best area to search. Click a bright rim on the near side of the pole.",
      "Now the Slopes map: green ground is safe to land on. Click a green spot near where the rims were bright.",
    ],
    next: 'Next mission',
    toLesson: 'Continue',
    results: 'See my rank',
    again: 'Play again',
    close: 'Back to LUNA',
    right: 'Right! The numbers agree with you.',
    wrong: 'Not this one. Look at your log: {best} has the best reading.',
    whyRight: 'Exactly.',
    whyWrong: 'Not quite.',
    night: 'Night now',
    check: 'Check this spot',
    freeGoal: 'Find a spot that passes both. Click anywhere on the Moon, and the check updates at once.',
    freeLink: 'Power + DSN at least {p}, here {now}',
    freeSlope: 'Slope at most {s}°, here {now}°',
    freeNo: 'Not yet. Keep looking: click another spot on the Moon.',
    freeYes: 'Found it! You chose a landing site with no list to pick from.',
    freeHelped: 'We found it together. Next time try it yourself: you know what to look for now.',
    missionOf: 'Mission {n} of {total}',
    learned: 'What you now know',
    missions: [
      {
        title: 'The solar rover',
        story: 'Your rover runs on sunlight alone. Three sites are on the table. If you choose badly, it freezes in the first week.',
        lookAt: 'Fly to each one and read the Sunlight number LUNA is lighting up.',
        reading: 'Sunlight',
        hint: 'One of these sites is a crater floor at the pole. Think about how low the Sun stands there.',
        why: { question: 'Why does the crater rim beat the crater floor?', options: ['The polar Sun is low, and a high rim sees over the terrain', 'The rim is closer to the Sun', 'Ice on the rim reflects extra light'] },
        lesson: 'At the pole the Sun creeps along the horizon. A few kilometres of height decide between almost constant light and none at all.',
      },
      {
        title: 'Call home',
        story: 'The lander must radio Earth directly, with no relay satellite. Mission control is waiting.',
        lookAt: 'At each site read the Earth in view number LUNA is lighting up.',
        reading: 'Earth in view',
        hint: "Chang'e 4 is on the far side of the Moon. Can you see Earth from there?",
        why: { question: "Why does Earth never rise at Chang'e 4?", options: ['The Moon always turns the same face to Earth, and this is the other side', 'The mountains there are the tallest', 'It is always night there'] },
        lesson: 'The Moon turns once per orbit, so Earth hangs in almost one spot in the sky. On the far side it never appears, which is why far-side landers need a relay.',
      },
      {
        title: 'The long night',
        story: 'Your batteries are small. The longer the night, the bigger the risk the lander never wakes up.',
        lookAt: 'Read "Night up to" under the percentages at each site. Shorter is better.',
        reading: 'Longest night',
        hint: 'Compare a site near the equator with one on a polar rim.',
        why: { question: 'Why does night near the equator last about 14 days?', options: ['The Moon takes almost a month to turn once', 'Earth blocks the Sun for two weeks', 'There is no air to hold the light'] },
        lesson: 'A lunar day lasts about 29.5 Earth days, so two weeks of light are followed by two weeks of dark. Only high polar rims escape most of it.',
      },
      {
        title: 'The launch slipped',
        story: 'The rocket is late and the site is fixed: Apollo 11. You choose the date. The lander needs as many sunny days ahead of it as possible.',
        lookAt: 'Each date moves the clock. Read how long until sunset on the Sun card.',
        reading: 'Sun left',
        hint: 'You want to land when the whole lunar day is still ahead.',
        why: { question: 'When should a solar lander touch down?', options: ['Just after sunrise, with the whole day ahead', 'At noon, when the Sun is highest', 'At sunset, to cool down first'] },
        lesson: 'A date matters as much as a place. Landing at sunrise gives about two weeks of power; a few days later the same lander has far less.',
      },
      {
        title: 'Your own site',
        story: 'No list this time. Find a place yourself, as mission planners do. Click anywhere on the Moon, and try the Sunlight map to see where to look.',
        lookAt: 'Watch Power + DSN and Slope in the panel, then press Check.',
        reading: 'Power + DSN',
        hint: 'Switch the map to Sunlight, go to the south pole and try the brightest rims. Slopes shows which ground is safe.',
        lesson: 'That is real site selection: light, radio and safe ground all at once. Most places fail at least one.',
      },
    ] as readonly MissionText[],
    ranks: { cadet: 'Space cadet', navigator: 'Navigator', commander: 'Mission commander' } as Record<Rank, string>,
    rankLine: { cadet: 'You now know where to look. Fly the missions again for more stars.', navigator: 'Good flying. A couple more stars and the mission is yours.', commander: 'You read the data, compared it and explained it. That is the job.' } as Record<Rank, string>,
  },
  ru: {
    start: 'Начать разведку',
    fly: 'Лететь',
    record: 'Записать',
    refining: 'Уточняю рельеф…',
    journal: 'Твой журнал',
    choose: 'Всё записано. Сравни: что выбираешь?',
    goScout: 'Слетай к каждому кандидату и запиши, что показывает панель.',
    hint: 'Подсказка (минус звезда)',
    moreHint: 'Ещё подсказка (−★)',
    rescue: 'Не получается, LUNA, помоги',
    rescued: 'Вот, я нашла тебе подходящее: {name}. Посмотри на его цифры и нажми «Проверить».',
    freeHints: [
      '«Свет + DSN» — это доля месяца, когда есть и солнце, и связь с Землёй одновременно. С высоких мест видно и то и другое, из низин ни то ни другое.',
      'Я включила карту «Свет». Ярко значит солнечно, поэтому целься в яркие края кратеров.',
      'Я перевела камеру к южному полюсу, тут лучше всего искать. Кликни по яркому краю кратера.',
      'Теперь карта «Склоны»: на зелёное садиться безопасно. Кликни зелёное место рядом с яркими краями.',
    ],
    next: 'Следующая миссия',
    toLesson: 'Дальше',
    results: 'Узнать звание',
    again: 'Сыграть ещё',
    close: 'Назад к LUNA',
    right: 'Верно! Цифры на твоей стороне.',
    wrong: 'Не то. Посмотри в журнал: лучше всего у {best}.',
    whyRight: 'Точно.',
    whyWrong: 'Не совсем.',
    night: 'Сейчас ночь',
    check: 'Проверить это место',
    freeGoal: 'Найди место, где выполнено и то и другое. Кликай по Луне, проверка обновляется сразу.',
    freeLink: 'Свет + DSN не меньше {p}, здесь {now}',
    freeSlope: 'Уклон не больше {s}°, здесь {now}°',
    freeNo: 'Пока нет. Ищи дальше: кликни другое место на Луне.',
    freeYes: 'Нашёл! Ты выбрал место посадки без всякого списка.',
    freeHelped: 'Мы нашли его вместе. В следующий раз попробуй сам: теперь ты знаешь, что искать.',
    missionOf: 'Миссия {n} из {total}',
    learned: 'Что ты теперь знаешь',
    missions: [
      {
        title: 'Солнечный ровер',
        story: 'Твой ровер работает только от солнца. На выбор три места. Ошибёшься, и он замёрзнет в первую же неделю.',
        lookAt: 'Слетай к каждому и прочитай число «Свет», которое подсвечивает LUNA.',
        reading: 'Свет',
        hint: 'Одно из мест находится на дне кратера у полюса. Подумай, как низко там стоит Солнце.',
        why: { question: 'Почему край кратера лучше его дна?', options: ['Солнце на полюсе низко, а высокий край смотрит поверх гор', 'Край кратера ближе к Солнцу', 'Лёд на краю отражает лишний свет'] },
        lesson: 'На полюсе Солнце ползёт вдоль горизонта. Несколько километров высоты решают: свет почти всегда или вообще никогда.',
      },
      {
        title: 'Звонок домой',
        story: 'Модуль должен связаться с Землёй напрямую, без спутника-ретранслятора. Центр управления ждёт.',
        lookAt: 'В каждом месте прочитай число «Земля видна», которое подсвечивает LUNA.',
        reading: 'Земля видна',
        hint: 'Чанъэ-4 на обратной стороне Луны. Видна ли оттуда Земля?',
        why: { question: 'Почему у Чанъэ-4 Земля никогда не восходит?', options: ['Луна всегда повёрнута к Земле одной стороной, а это другая', 'Там самые высокие горы', 'Там всегда ночь'] },
        lesson: 'Луна делает один оборот за один виток, поэтому Земля висит почти на одном месте неба. С обратной стороны её не видно, и таким модулям нужен ретранслятор.',
      },
      {
        title: 'Долгая ночь',
        story: 'Батареи маленькие. Чем длиннее ночь, тем выше риск, что модуль больше не проснётся.',
        lookAt: 'В каждом месте прочитай «Ночь до» под процентами. Чем меньше, тем лучше.',
        reading: 'Самая длинная ночь',
        hint: 'Сравни место у экватора с местом на краю кратера у полюса.',
        why: { question: 'Почему у экватора ночь длится около 14 суток?', options: ['Луна поворачивается вокруг оси почти месяц', 'Две недели Солнце закрывает Земля', 'Там нет воздуха, чтобы удержать свет'] },
        lesson: 'Лунные сутки длятся около 29,5 земных: две недели света, потом две недели темноты. Этого избегают только высокие края у полюсов.',
      },
      {
        title: 'Запуск перенесли',
        story: 'Ракета опаздывает, а место уже выбрано: Аполлон-11. Выбираешь только дату. Модулю нужно как можно больше солнечных дней впереди.',
        lookAt: 'Каждая дата переводит часы. Прочитай на карточке Солнца, через сколько закат.',
        reading: 'Солнца осталось',
        hint: 'Садиться надо тогда, когда весь лунный день ещё впереди.',
        why: { question: 'Когда садиться солнечному модулю?', options: ['Сразу после восхода, когда весь день впереди', 'В полдень, когда Солнце выше всего', 'На закате, чтобы сначала остыть'] },
        lesson: 'Дата важна так же, как и место. Посадка на восходе даёт около двух недель энергии, а через несколько дней тому же модулю достанется намного меньше.',
      },
      {
        title: 'Твоё собственное место',
        story: 'Теперь без списка. Найди место сам, как настоящие планировщики миссий. Кликни в любую точку Луны, а карта «Свет» подскажет, где искать.',
        lookAt: 'Смотри на панели «Свет + DSN» и «Уклон», потом нажми «Проверить».',
        reading: 'Свет + DSN',
        hint: 'Включи карту «Свет», лети к южному полюсу и пробуй самые яркие края кратеров. «Склоны» покажут, где безопасно.',
        lesson: 'Так и выбирают места на самом деле: свет, связь и безопасный грунт одновременно. Большинство мест проваливает хотя бы что-то одно.',
      },
    ] as readonly MissionText[],
    ranks: { cadet: 'Космический кадет', navigator: 'Штурман', commander: 'Командир миссии' } as Record<Rank, string>,
    rankLine: { cadet: 'Теперь ты знаешь, куда смотреть. Пройди миссии ещё раз за новыми звёздами.', navigator: 'Хороший полёт. Ещё пара звёзд, и миссия твоя.', commander: 'Ты прочитал данные, сравнил их и объяснил. Именно в этом и состоит работа.' } as Record<Rank, string>,
  },
} as const;

export const gameText = (lang: Lang) => TEXT[lang];
