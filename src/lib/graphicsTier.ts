import { isWeakGpu } from './textureQuality';

/**
 * How much 3D this device can take, decided once on arrival and lowered (never raised) if the
 * frame rate later sags: 'none' is the flat map for devices without WebGL; 'low' drops resolution,
 * anti-aliasing and glow; 'medium' drops the glow; 'high' is everything.
 */
export type GraphicsTier = 'none' | 'low' | 'medium' | 'high';

export interface GpuFacts {
  hasWebGL: boolean;
  renderer: string;
  maxTextureSize: number;
  cores: number;
  /** navigator.deviceMemory, in GB; null where the browser does not tell (Safari, Firefox). */
  memoryGb: number | null;
}

/** Discrete graphics and Apple silicon: enough for glow at full resolution. */
const STRONG_RENDERER = /nvidia|geforce|quadro|rtx|radeon (rx|pro)|apple m\d/i;
const STRONG_MIN_CORES = 8;
const WEAK_MAX_CORES = 2;
const WEAK_MAX_MEMORY_GB = 2;

export function pickTier(facts: GpuFacts): GraphicsTier {
  if (!facts.hasWebGL) return 'none';
  if (isWeakGpu(facts.renderer, facts.maxTextureSize)) return 'low';
  if (facts.cores <= WEAK_MAX_CORES || (facts.memoryGb !== null && facts.memoryGb <= WEAK_MAX_MEMORY_GB)) return 'low';
  if (STRONG_RENDERER.test(facts.renderer) && facts.cores >= STRONG_MIN_CORES) return 'high';
  return 'medium';
}

export const lowerTier = (tier: GraphicsTier): GraphicsTier => (tier === 'high' ? 'medium' : tier === 'medium' ? 'low' : tier);

const QUERY_TIERS: Record<string, GraphicsTier> = { '2d': 'none', low: 'low', medium: 'medium', high: 'high' };

/** `?graphics=2d|low|medium|high` forces a tier, for checking each mode on any machine. */
export function tierFromQuery(search: string): GraphicsTier | null {
  const value = new URLSearchParams(search).get('graphics');
  return value ? (QUERY_TIERS[value.toLowerCase()] ?? null) : null;
}

export interface TierSettings {
  dpr: [number, number];
  antialias: boolean;
  /** Bloom and the post-processing chain; without it the renderer's own ACES tone mapping stays. */
  glow: boolean;
}

/** The 3D settings for a tier; 'none' never reaches a 3D scene, so it reads as the lightest one. */
export const tierOrLow = (tier: GraphicsTier): Exclude<GraphicsTier, 'none'> => (tier === 'none' ? 'low' : tier);

export const TIER_SETTINGS: Record<Exclude<GraphicsTier, 'none'>, TierSettings> = {
  low: { dpr: [0.75, 1], antialias: false, glow: false },
  medium: { dpr: [1, 1.25], antialias: true, glow: false },
  // Full retina sharpness: only discrete graphics and Apple silicon get here, and they keep 60 fps.
  high: { dpr: [1, 2], antialias: true, glow: true },
};

/** Looks at the device once: a throwaway WebGL context, released straight after. */
export function probeGpu(): GpuFacts {
  const cores = navigator.hardwareConcurrency || 4;
  const memoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return { hasWebGL: false, renderer: '', maxTextureSize: 0, cores, memoryGb };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { hasWebGL: true, renderer, maxTextureSize, cores, memoryGb };
  } catch (err: unknown) {
    console.warn('WebGL probe failed; using the flat map', err);
    return { hasWebGL: false, renderer: '', maxTextureSize: 0, cores, memoryGb };
  }
}

/** The tier to start with: a forced one from the link, else what the device can take. */
export function initialTier(search: string): GraphicsTier {
  return tierFromQuery(search) ?? pickTier(probeGpu());
}
