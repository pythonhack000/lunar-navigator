/**
 * One 0-100 landing-site score from the four things a south-pole lander needs: sunlight for power,
 * a direct link to Earth through the DSN, gentle ground to touch down on, and ice within reach.
 */
export interface ScoreInputs {
  /** Share of the month in sunlight, 0..1. */
  sunShare: number;
  /** Share of the month with Earth in view AND a DSN station tracking the Moon, 0..1. */
  linkShare: number;
  slopeDeg: number;
  /** Distance to the nearest permanently shadowed crater, km; null if none within reach. */
  iceKm: number | null;
}

export interface SiteScore {
  /** 0..100, rounded. */
  total: number;
  parts: { sun: number; link: number; slope: number; ice: number };
}

/** Artemis-class landers are designed for slopes up to about 8-10°; past 15° touchdown is unsafe. */
export const SLOPE_SAFE_DEG = 8;
export const SLOPE_MAX_DEG = 15;
/** Ice next door counts fully; past a long rover drive it no longer helps. */
export const ICE_NEAR_KM = 2;
export const ICE_FAR_KM = 20;

/** Power keeps the lander alive, so it weighs most; ice is the science bonus. */
export const SCORE_WEIGHTS = { sun: 0.35, link: 0.25, slope: 0.25, ice: 0.15 } as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 1 up to the safe limit, falling linearly to 0 at the maximum. */
export const slopeFactor = (deg: number): number => clamp01((SLOPE_MAX_DEG - deg) / (SLOPE_MAX_DEG - SLOPE_SAFE_DEG));

export const iceFactor = (km: number | null): number => (km === null ? 0 : clamp01((ICE_FAR_KM - km) / (ICE_FAR_KM - ICE_NEAR_KM)));

export function siteScore(input: ScoreInputs): SiteScore {
  const parts = {
    sun: clamp01(input.sunShare),
    link: clamp01(input.linkShare),
    slope: slopeFactor(input.slopeDeg),
    ice: iceFactor(input.iceKm),
  };
  const weighted =
    parts.sun * SCORE_WEIGHTS.sun + parts.link * SCORE_WEIGHTS.link + parts.slope * SCORE_WEIGHTS.slope + parts.ice * SCORE_WEIGHTS.ice;
  return { total: Math.round(weighted * 100), parts };
}
