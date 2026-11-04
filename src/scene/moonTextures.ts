import { LinearMipmapLinearFilter, NearestFilter, SRGBColorSpace, type Texture } from 'three';

const MAX_ANISOTROPY = 8;

export const textureUrl = (name: string): string => `${import.meta.env.BASE_URL}textures/${name}`;

/** Small versions load first so the Moon appears within seconds; the full set replaces them later. */
export const previewUrls = (name: string): string[] =>
  [`${name}_color_1k.jpg`, `${name}_normal_1k.jpg`, `${name}_height_1k.png`].map(textureUrl);
export const GLOBAL_PREVIEW = ['moon_color_2k.jpg', 'moon_normal_2k.jpg', 'moon_height_1k.png'].map(textureUrl);

/** Every file the Moon needs before it can first appear, given the polar tile names. */
export const firstTextures = (polarNames: string[]): string[] => [...GLOBAL_PREVIEW, ...polarNames.flatMap(previewUrls)];

export function prepareColor(t: Texture): void {
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = MAX_ANISOTROPY;
  t.minFilter = LinearMipmapLinearFilter;
  t.needsUpdate = true;
}

export function prepareNormal(t: Texture): void {
  t.anisotropy = MAX_ANISOTROPY;
  t.needsUpdate = true;
}

/** Height maps pack 16 bits into two bytes, which must never be blended by the GPU. */
export function prepareHeight(t: Texture): void {
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
}

/**
 * `useTexture` calls its onLoad again whenever the callback changes, so it must be a stable,
 * module-level function: an inline arrow would re-upload 8K textures to the GPU on every render.
 */
export function prepareTerrainSet([color, normal, height]: Texture[]): void {
  prepareColor(color);
  prepareNormal(normal);
  prepareHeight(height);
}
