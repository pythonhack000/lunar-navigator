import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { isStruggling } from '../lib/frameRate';
import { useNavigator } from '../state/store';

/** Shader compilation and the first texture uploads stall every machine; they are not measured. */
const WARM_UP_S = 2.5;
/** Frames are counted over windows this long. */
const WINDOW_S = 3;
/** After this many fine windows the machine is trusted and the watch stops. */
const TRUSTED_AFTER = 4;
/** A struggling machine renders at half resolution: blurrier, but the view can move again. */
const STRUGGLE_DPR = 0.5;

/**
 * Watches the frame rate from the moment the Moon is on screen (not only after landing: on software
 * rendering the descent itself never ends). If it stays at a slide show, it halves the render
 * resolution and raises the notice that offers the video instead.
 */
export function FrameRateWatch() {
  const setDpr = useThree((s) => s.setDpr);
  const state = useRef({ elapsed: -WARM_UP_S, frames: 0, windows: [] as number[], finished: false });

  useFrame((_, delta) => {
    const s = state.current;
    if (s.finished) return;
    s.elapsed += delta;
    if (s.elapsed < 0) return;
    s.frames += 1;
    if (s.elapsed < WINDOW_S) return;
    s.windows.push(s.frames / s.elapsed);
    s.elapsed = 0;
    s.frames = 0;
    if (isStruggling(s.windows)) {
      s.finished = true;
      setDpr(STRUGGLE_DPR);
      useNavigator.getState().setGpuStruggling(Math.round(s.windows.at(-1) ?? 0));
    } else if (s.windows.length >= TRUSTED_AFTER) {
      s.finished = true;
    }
  });
  return null;
}
