export type SiteGroup = 'Artemis' | 'South pole' | 'Future missions' | 'Robotic landers' | 'Apollo';

export interface NamedSite {
  id: string;
  name: string;
  nameRu: string;
  lat: number;
  lon: number;
  group: SiteGroup;
  note: string;
  noteRu: string;
}

/**
 * Notable sites. Apollo and robotic coordinates are published landing points. NASA named nine
 * candidate regions for the first crewed landing (chosen for Artemis III; since February 2026 that
 * landing is planned for Artemis IV) but published no outlines as coordinates, so those points are
 * approximate centres placed on the named features (marked ≈ in the interface). South pole targets
 * were snapped to the local LOLA high point of each ridge or rim.
 *
 * Future targets name only what is public. Most missions announce a region, not a point, so those
 * sit on the region (≈) and may share coordinates with a site above. Dates are the operators' plans
 * as of November 2026 and keep moving. Blue Ghost Mission 2 is left out: "lunar far side" is all
 * that has been published.
 */
export const SITES: readonly NamedSite[] = [
  { id: 'cabeus-b', name: 'Peak near Cabeus B', nameRu: 'Пик у кратера Кабеус B', lat: -83.2, lon: -49.0, group: 'Artemis', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'haworth', name: 'Haworth', nameRu: 'Хаворт', lat: -87.0, lon: -4.0, group: 'Artemis', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'malapert', name: 'Malapert Massif', nameRu: 'Массив Малаперт', lat: -86.0, lon: 0.0, group: 'Artemis', note: 'High peak facing Earth', noteRu: 'Высокая гора, обращённая к Земле' },
  { id: 'mouton-plateau', name: 'Mons Mouton Plateau', nameRu: 'Плато горы Мутон', lat: -85.5, lon: 35.0, group: 'Artemis', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'mons-mouton', name: 'Mons Mouton', nameRu: 'Гора Мутон', lat: -84.8, lon: 29.2, group: 'Artemis', note: 'IM-2 landed here in 2025', noteRu: 'Здесь сел IM-2 в 2025' },
  { id: 'nobile', name: 'Nobile Rim 1', nameRu: 'Край кратера Нобиле 1', lat: -85.3, lon: 37.0, group: 'Artemis', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'nobile-2', name: 'Nobile Rim 2', nameRu: 'Край кратера Нобиле 2', lat: -83.8, lon: 58.0, group: 'Artemis', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'de-gerlache', name: 'de Gerlache Rim 2', nameRu: 'Край кратера де Герлах 2', lat: -88.7, lon: -68.0, group: 'Artemis', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'slater', name: 'Slater Plain', nameRu: 'Равнина Слейтер', lat: -87.7, lon: 105.0, group: 'Artemis', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'shackleton', name: 'Shackleton rim', nameRu: 'Край кратера Шеклтон', lat: -89.45, lon: -137.0, group: 'South pole', note: 'Near-permanent sunlight on the rim', noteRu: 'Почти вечный свет на краю кратера' },
  { id: 'connecting-ridge', name: 'Connecting Ridge', nameRu: 'Соединительный хребет', lat: -89.28, lon: -113.2, group: 'South pole', note: 'Ridge between Shackleton and de Gerlache', noteRu: 'Хребет между Шеклтоном и де Герлахом' },
  { id: 'griffin-1', name: 'Griffin-1', nameRu: 'Griffin-1', lat: -85.3, lon: 37.0, group: 'Future missions', note: 'CLPS, Astrobotic · ≈ Nobile region · plan 2027', noteRu: 'CLPS, Astrobotic · ≈ район Нобиле · план 2027' },
  { id: 'blue-moon-mk1', name: 'Blue Moon Mark 1', nameRu: 'Blue Moon Mark 1', lat: -89.28, lon: -113.2, group: 'Future missions', note: 'Blue Origin · ≈ Connecting Ridge · plan 2027', noteRu: 'Blue Origin · ≈ Соединительный хребет · план 2027' },
  { id: 'im-3', name: 'IM-3', nameRu: 'IM-3', lat: 7.5, lon: -59.0, group: 'Future missions', note: 'CLPS · ≈ Reiner Gamma swirl · plan 2027', noteRu: 'CLPS · ≈ вихрь Рейнер-гамма · план 2027' },
  { id: 'im-4', name: 'IM-4', nameRu: 'IM-4', lat: -84.8, lon: 29.2, group: 'Future missions', note: 'CLPS · ≈ Mons Mouton · plan 2027–28', noteRu: 'CLPS · ≈ гора Мутон · план 2027–28' },
  { id: 'blue-ghost-3', name: 'Blue Ghost 3', nameRu: 'Blue Ghost 3', lat: 36.56, lon: -40.72, group: 'Future missions', note: 'CLPS, Firefly · ≈ Gruithuisen Gamma · plan 2028', noteRu: 'CLPS, Firefly · ≈ купол Груйтуйзена · план 2028' },
  { id: 'change7', name: "Chang'e 7", nameRu: 'Чанъэ-7', lat: -88.8, lon: 123.4, group: 'Future missions', note: 'CNSA · Shackleton ridge · plan 2027', noteRu: 'CNSA · хребет Шеклтона · план 2027' },
  { id: 'blue-ghost-1', name: 'Blue Ghost 1', nameRu: 'Blue Ghost 1', lat: 18.56, lon: 61.81, group: 'Robotic landers', note: 'CLPS, Mare Crisium, 2025', noteRu: 'CLPS, Море Кризисов, 2025' },
  { id: 'im-1', name: 'IM-1 Odysseus', nameRu: 'IM-1 Одиссей', lat: -80.13, lon: 1.44, group: 'Robotic landers', note: 'CLPS, Malapert A, 2024', noteRu: 'CLPS, Малаперт A, 2024' },
  { id: 'chandrayaan3', name: 'Chandrayaan-3', nameRu: 'Чандраян-3', lat: -69.37, lon: 32.32, group: 'Robotic landers', note: 'ISRO, 2023', noteRu: 'ISRO, 2023' },
  { id: 'slim', name: 'SLIM', nameRu: 'SLIM', lat: -13.32, lon: 25.25, group: 'Robotic landers', note: 'JAXA, 2024', noteRu: 'JAXA, 2024' },
  { id: 'change3', name: "Chang'e 3", nameRu: 'Чанъэ-3', lat: 44.1214, lon: -19.5116, group: 'Robotic landers', note: 'CNSA, Mare Imbrium, 2013', noteRu: 'CNSA, Море Дождей, 2013' },
  { id: 'change4', name: "Chang'e 4", nameRu: 'Чанъэ-4', lat: -45.44, lon: 177.59, group: 'Robotic landers', note: 'Far side — no direct Earth link', noteRu: 'Обратная сторона — нет прямой связи' },
  { id: 'change5', name: "Chang'e 5", nameRu: 'Чанъэ-5', lat: 43.0576, lon: -51.9161, group: 'Robotic landers', note: 'CNSA, Mons Rümker, 2020', noteRu: 'CNSA, гора Рюмкер, 2020' },
  { id: 'change6', name: "Chang'e 6", nameRu: 'Чанъэ-6', lat: -41.6385, lon: -153.9852, group: 'Robotic landers', note: 'Far side, Apollo basin, 2024', noteRu: 'Обратная сторона, бассейн Аполлон, 2024' },
  { id: 'apollo11', name: 'Apollo 11', nameRu: 'Аполлон-11', lat: 0.674, lon: 23.473, group: 'Apollo', note: 'Mare Tranquillitatis, 1969', noteRu: 'Море Спокойствия, 1969' },
  { id: 'apollo12', name: 'Apollo 12', nameRu: 'Аполлон-12', lat: -3.01239, lon: -23.42157, group: 'Apollo', note: 'Oceanus Procellarum, 1969', noteRu: 'Океан Бурь, 1969' },
  { id: 'apollo14', name: 'Apollo 14', nameRu: 'Аполлон-14', lat: -3.6453, lon: -17.47136, group: 'Apollo', note: 'Fra Mauro, 1971', noteRu: 'Фра Мауро, 1971' },
  { id: 'apollo15', name: 'Apollo 15', nameRu: 'Аполлон-15', lat: 26.132, lon: 3.634, group: 'Apollo', note: 'Hadley–Apennine, 1971', noteRu: 'Хэдли–Апеннины, 1971' },
  { id: 'apollo16', name: 'Apollo 16', nameRu: 'Аполлон-16', lat: -8.97301, lon: 15.50019, group: 'Apollo', note: 'Descartes Highlands, 1972', noteRu: 'Высокогорье Декарта, 1972' },
  { id: 'apollo17', name: 'Apollo 17', nameRu: 'Аполлон-17', lat: 20.191, lon: 30.772, group: 'Apollo', note: 'Taurus–Littrow, 1972', noteRu: 'Тавр–Литтров, 1972' },
];

export const DEFAULT_SITE_ID = 'connecting-ridge';

/** One entry per place: a mission and the region it targets may share coordinates. */
export function uniquePlaces<T extends { lat: number; lon: number }>(sites: readonly T[]): T[] {
  const seen = new Set<string>();
  return sites.filter((s) => {
    const key = `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
