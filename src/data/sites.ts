export type SiteGroup = 'Apollo' | 'South pole' | 'Robotic landers';

export interface NamedSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  group: SiteGroup;
  note: string;
}

/**
 * Notable sites. Apollo coordinates are the published landing points. South pole targets are
 * approximate and were snapped to the local LOLA high point of each ridge or rim.
 */
export const SITES: readonly NamedSite[] = [
  { id: 'apollo11', name: 'Apollo 11', lat: 0.674, lon: 23.473, group: 'Apollo', note: 'Mare Tranquillitatis, 1969' },
  { id: 'apollo15', name: 'Apollo 15', lat: 26.132, lon: 3.634, group: 'Apollo', note: 'Hadley–Apennine, 1971' },
  { id: 'apollo17', name: 'Apollo 17', lat: 20.191, lon: 30.772, group: 'Apollo', note: 'Taurus–Littrow, 1972' },
  { id: 'shackleton', name: 'Shackleton rim', lat: -89.45, lon: -137.0, group: 'South pole', note: 'Near-permanent sunlight on the rim' },
  { id: 'connecting-ridge', name: 'Connecting Ridge', lat: -89.28, lon: -113.2, group: 'South pole', note: 'Ridge between Shackleton and de Gerlache' },
  { id: 'de-gerlache', name: 'de Gerlache rim', lat: -88.7, lon: -68.0, group: 'South pole', note: 'Artemis candidate region' },
  { id: 'malapert', name: 'Malapert Massif', lat: -86.0, lon: 0.0, group: 'South pole', note: 'High peak facing Earth' },
  { id: 'nobile', name: 'Nobile Rim', lat: -85.3, lon: 37.0, group: 'South pole', note: 'Artemis candidate region' },
  { id: 'mons-mouton', name: 'Mons Mouton', lat: -84.8, lon: 29.2, group: 'Robotic landers', note: 'Intuitive Machines IM-2, 2025' },
  { id: 'chandrayaan3', name: 'Chandrayaan-3', lat: -69.37, lon: 32.32, group: 'Robotic landers', note: 'ISRO, 2023' },
  { id: 'change4', name: "Chang'e 4", lat: -45.44, lon: 177.59, group: 'Robotic landers', note: 'Far side — no direct Earth link' },
  { id: 'slim', name: 'SLIM', lat: -13.32, lon: 25.25, group: 'Robotic landers', note: 'JAXA, 2024' },
];

export const DEFAULT_SITE_ID = 'connecting-ridge';
