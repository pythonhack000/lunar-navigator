import { DSN_STATIONS } from './dsn';
import type { Timeline } from './visibility';

const HEADER = 'time_utc,lat,lon,sun_el_deg,sun_az_deg,sun_visible,earth_el_deg,earth_az_deg,earth_visible,dsn_station,power_w';

/** The hour-by-hour data behind the panels, for planners who want it in their own tools. */
export function timelineCsv(site: { lat: number; lon: number }, timeline: Timeline, link: Int8Array, power: Float32Array): string {
  const rows = Array.from(timeline.sun, (_, i) => {
    const time = new Date(timeline.start + i * timeline.stepMs).toISOString().slice(0, 16);
    return [
      `${time}Z`,
      site.lat,
      site.lon,
      timeline.sunElevation[i].toFixed(2),
      timeline.sunAzimuth[i].toFixed(2),
      timeline.sun[i].toFixed(2),
      timeline.earthElevation[i].toFixed(2),
      timeline.earthAzimuth[i].toFixed(2),
      timeline.earth[i].toFixed(2),
      link[i] >= 0 ? DSN_STATIONS[link[i]].name : '',
      power[i].toFixed(1),
    ].join(',');
  });
  return `${[HEADER, ...rows].join('\n')}\n`;
}

export function csvFileName(siteName: string, start: number): string {
  const slug = siteName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `lunar-site-${slug}-${new Date(start).toISOString().slice(0, 10)}.csv`;
}

/** Hands the text to the browser as a file to save. */
export function downloadText(fileName: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
