import { LinearMipmapLinearFilter, NearestFilter, SRGBColorSpace, type Texture } from 'three';

const MAX_ANISOTROPY = 8;

export const textureUrl = (name: string): string => `${import.meta.env.BASE_URL}textures/${name}`;

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
