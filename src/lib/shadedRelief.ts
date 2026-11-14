/**
 * Relief shading for the flat map: the colour maps are bare albedo, so without light craters barely
 * show. Each pixel is lit from the upper left using the matching normal map, the way printed
 * relief maps are, and a flat pixel keeps exactly its own colour.
 */
const LIGHT = (() => {
  const v = [-1, 1, 1.4];
  const n = Math.hypot(...v);
  return v.map((c) => c / n) as [number, number, number];
})();
const AMBIENT = 0.25;
const DIRECT = 0.75;

/** Lights `color` (RGBA) by `normal` (RGBA, the same size) into `out`. */
export function shadePixels(color: Uint8ClampedArray, normal: Uint8ClampedArray, out: Uint8ClampedArray): void {
  const [lx, ly, lz] = LIGHT;
  for (let i = 0; i < color.length; i += 4) {
    const nx = normal[i] / 127.5 - 1;
    const ny = normal[i + 1] / 127.5 - 1;
    const nz = normal[i + 2] / 127.5 - 1;
    // Divided by the light's height, so a flat pixel gets exactly 1.
    const k = AMBIENT + (DIRECT * Math.max(0, nx * lx + ny * ly + nz * lz)) / lz;
    out[i] = color[i] * k;
    out[i + 1] = color[i + 1] * k;
    out[i + 2] = color[i + 2] * k;
    out[i + 3] = 255;
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

const cache = new Map<string, Promise<string>>();

/** An object URL of the shaded map, made once per visit; a failure is retried next time. */
export function shadedMap(colorUrl: string, normalUrl: string): Promise<string> {
  const key = `${colorUrl}|${normalUrl}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = (async () => {
      const [color, normal] = await Promise.all([loadImage(colorUrl), loadImage(normalUrl)]);
      const canvas = document.createElement('canvas');
      canvas.width = color.naturalWidth;
      canvas.height = color.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('2D canvas is not available');
      ctx.drawImage(normal, 0, 0, canvas.width, canvas.height);
      const normalPixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      ctx.drawImage(color, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      shadePixels(image.data, normalPixels, image.data);
      ctx.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Could not encode the shaded map');
      return URL.createObjectURL(blob);
    })().catch((err: unknown) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, entry);
  }
  return entry;
}
