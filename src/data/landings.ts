/**
 * The moment real missions touched down (UTC, as published), for visiting a site on its landing day.
 * The Sun's height is never written here: the app computes it for that moment with its own ephemeris.
 */
export interface Landing {
  siteId: string;
  time: string;
  note: { en: string; ru: string };
}

export const LANDINGS: readonly Landing[] = [
  { siteId: 'apollo11', time: '1969-07-20T20:17:40Z', note: { en: 'NASA picked a low morning Sun: long shadows make craters and boulders easy to see on the way down.', ru: 'NASA выбрала низкое утреннее Солнце: длинные тени делают кратеры и камни заметными при спуске.' } },
  { siteId: 'apollo12', time: '1969-11-19T06:54:35Z', note: { en: 'A pinpoint landing, within walking distance of the Surveyor 3 probe.', ru: 'Точнейшая посадка: в пешей доступности от зонда Surveyor 3.' } },
  { siteId: 'apollo14', time: '1971-02-05T09:18:11Z', note: { en: 'The Fra Mauro formation, the target Apollo 13 never reached.', ru: 'Формация Фра Мауро, цель, до которой не долетел Аполлон-13.' } },
  { siteId: 'apollo15', time: '1971-07-30T22:16:29Z', note: { en: 'Beside Hadley Rille and the Apennine mountains, a dramatic place to land.', ru: 'Рядом с бороздой Хэдли и Апеннинскими горами, очень непростое место для посадки.' } },
  { siteId: 'apollo16', time: '1972-04-21T02:23:35Z', note: { en: 'The Descartes Highlands, the first Apollo landing in the lunar highlands proper.', ru: 'Высокогорье Декарта: посадка Аполлона прямо в лунных горах.' } },
  { siteId: 'apollo17', time: '1972-12-11T19:54:58Z', note: { en: 'The last time people landed on the Moon, so far.', ru: 'Последний на сегодня раз, когда люди садились на Луну.' } },
  { siteId: 'change3', time: '2013-12-14T13:11:00Z', note: { en: 'Aimed for Sinus Iridum and came down on Mare Imbrium.', ru: 'Целилась в Залив Радуги, а села в Море Дождей.' } },
  { siteId: 'change4', time: '2019-01-03T02:26:00Z', note: { en: 'The first landing on the far side. Earth never rises here, so a relay satellite, Queqiao, carried the signal.', ru: 'Первая посадка на обратной стороне. Земля здесь не восходит, поэтому связь шла через спутник-ретранслятор Цюэцяо.' } },
  { siteId: 'change5', time: '2020-12-01T15:11:00Z', note: { en: 'Came for rock and soil samples, and brought them back to Earth.', ru: 'Прилетела за образцами грунта и доставила их на Землю.' } },
  { siteId: 'change6', time: '2024-06-01T22:23:16Z', note: { en: 'The far side again, in the Apollo basin. The Moon hides Earth from here too.', ru: 'Снова обратная сторона, бассейн Аполлон. Отсюда Земля тоже не видна.' } },
  { siteId: 'chandrayaan3', time: '2023-08-23T12:33:00Z', note: { en: 'Built to work for one lunar day, 14 Earth days, because the night would end it.', ru: 'Рассчитана на один лунный день, 14 земных суток: ночь её бы остановила.' } },
  { siteId: 'slim', time: '2024-01-19T15:20:00Z', note: { en: 'It came down on its side with its solar panels facing west, and woke up days later when the light shifted.', ru: 'Села на бок, панелями на запад, и ожила через несколько дней, когда свет сместился.' } },
  { siteId: 'im-1', time: '2024-02-22T23:23:53Z', note: { en: 'Near Malapert A at the south pole. It tipped over, and the polar Sun left it short of power.', ru: 'У кратера Малаперт A на южном полюсе. Модуль опрокинулся, и низкое Солнце оставило его без энергии.' } },
  { siteId: 'blue-ghost-1', time: '2025-03-02T08:34:00Z', note: { en: 'A CLPS lander in Mare Crisium, with ten NASA payloads on board.', ru: 'Модуль CLPS в Море Кризисов с десятью приборами NASA на борту.' } },
];

export const landingFor = (siteId: string | null): Landing | undefined => LANDINGS.find((l) => l.siteId === siteId);
