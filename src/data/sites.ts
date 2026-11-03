export type SiteGroup = 'Artemis III' | 'South pole' | 'Apollo' | 'Robotic landers';

export interface NamedSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  group: SiteGroup;
  note: string;
  noteRu: string;
}

/**
 * Notable sites. Apollo coordinates are the published landing points. NASA has named the nine
 * Artemis III candidate regions but not published their outlines as coordinates, so those points
 * are approximate centres placed on the named features (marked ≈ in the interface). South pole
 * targets were snapped to the local LOLA high point of each ridge or rim.
 */
export const SITES: readonly NamedSite[] = [
  { id: 'cabeus-b', name: 'Peak near Cabeus B', lat: -83.2, lon: -49.0, group: 'Artemis III', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'haworth', name: 'Haworth', lat: -87.0, lon: -4.0, group: 'Artemis III', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'malapert', name: 'Malapert Massif', lat: -86.0, lon: 0.0, group: 'Artemis III', note: 'High peak facing Earth', noteRu: 'Высокая гора, обращённая к Земле' },
  { id: 'mouton-plateau', name: 'Mons Mouton Plateau', lat: -85.5, lon: 35.0, group: 'Artemis III', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'mons-mouton', name: 'Mons Mouton', lat: -84.8, lon: 29.2, group: 'Artemis III', note: 'IM-2 landed here in 2025', noteRu: 'Здесь сел IM-2 в 2025' },
  { id: 'nobile', name: 'Nobile Rim 1', lat: -85.3, lon: 37.0, group: 'Artemis III', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'nobile-2', name: 'Nobile Rim 2', lat: -83.8, lon: 58.0, group: 'Artemis III', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'de-gerlache', name: 'de Gerlache Rim 2', lat: -88.7, lon: -68.0, group: 'Artemis III', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'slater', name: 'Slater Plain', lat: -87.7, lon: 105.0, group: 'Artemis III', note: '≈ region centre', noteRu: '≈ центр района' },
  { id: 'shackleton', name: 'Shackleton rim', lat: -89.45, lon: -137.0, group: 'South pole', note: 'Near-permanent sunlight on the rim', noteRu: 'Почти вечный свет на краю кратера' },
  { id: 'connecting-ridge', name: 'Connecting Ridge', lat: -89.28, lon: -113.2, group: 'South pole', note: 'Ridge between Shackleton and de Gerlache', noteRu: 'Хребет между Шеклтоном и де Герлахом' },
  { id: 'apollo11', name: 'Apollo 11', lat: 0.674, lon: 23.473, group: 'Apollo', note: 'Mare Tranquillitatis, 1969', noteRu: 'Море Спокойствия, 1969' },
  { id: 'apollo15', name: 'Apollo 15', lat: 26.132, lon: 3.634, group: 'Apollo', note: 'Hadley–Apennine, 1971', noteRu: 'Хэдли–Апеннины, 1971' },
  { id: 'apollo17', name: 'Apollo 17', lat: 20.191, lon: 30.772, group: 'Apollo', note: 'Taurus–Littrow, 1972', noteRu: 'Тавр–Литтров, 1972' },
  { id: 'chandrayaan3', name: 'Chandrayaan-3', lat: -69.37, lon: 32.32, group: 'Robotic landers', note: 'ISRO, 2023', noteRu: 'ISRO, 2023' },
  { id: 'change4', name: "Chang'e 4", lat: -45.44, lon: 177.59, group: 'Robotic landers', note: 'Far side — no direct Earth link', noteRu: 'Обратная сторона — нет прямой связи' },
  { id: 'slim', name: 'SLIM', lat: -13.32, lon: 25.25, group: 'Robotic landers', note: 'JAXA, 2024', noteRu: 'JAXA, 2024' },
];

export const DEFAULT_SITE_ID = 'connecting-ridge';
