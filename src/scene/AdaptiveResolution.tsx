import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useCallback } from 'react';
import { useNavigator } from '../state/store';

/** Weak GPUs drop to this: a little softer, but the camera moves smoothly. */
const LOW_DPR = 0.75;
/** Only a sustained rate below this counts as a weak GPU; above it the scene stays sharp. */
const LOW_FPS = 30;
const fpsBounds = (refreshRate: number): [number, number] => [LOW_FPS, refreshRate];

/**
 * Steps the graphics down (see graphicsTier.ts) when the GPU cannot keep up, ending at a lower
 * render resolution, so zooming and flying stay smooth on
 * weak machines. It starts watching only after landing: the loading and descent stutter on every
 * machine and must not blur the view on a good one.
 */
export function AdaptiveResolution() {
  const landed = useNavigator((s) => s.landed);
  const setDpr = useThree((s) => s.setDpr);
  // First the glow goes (a whole pass), then the resolution: each step only when the last was not enough.
  const lower = useCallback(() => {
    const { graphicsTier, lowerGraphics } = useNavigator.getState();
    if (graphicsTier === 'high' || graphicsTier === 'medium') lowerGraphics();
    else setDpr(LOW_DPR);
  }, [setDpr]);
  if (!landed) return null;
  // One way only: switching back up and down again is what makes the picture blink and resize.
  return <PerformanceMonitor bounds={fpsBounds} onDecline={lower} />;
}
