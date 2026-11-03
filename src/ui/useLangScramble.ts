import { useLayoutEffect, useRef } from 'react';
import { useNavigator } from '../state/store';

const DURATION_MS = 600;
/** Glyphs change at this pace instead of every frame, so the decode reads as calm, not as noise. */
const GLYPH_TICK_MS = 55;
const FALLBACK_GLYPHS = '01#*+<>';
/** Labels only: anything with digits is live data (times, angles, altitudes) and is left alone. */
const HAS_DIGIT = /\d/;
const MAX_LABEL = 60;

interface Target {
  node: Text;
  text: string;
  /** The label's own letters: scrambling with them keeps its width steady, so nothing jumps. */
  glyphs: string;
  /** Each character settles at its own moment, left to right with a little jitter. */
  settleAt: number[];
}

function collectTargets(root: Element): Target[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Target[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue ?? '';
    const parent = n.parentElement;
    if (!parent || parent.closest('canvas, svg, input, [data-no-scramble]')) continue;
    if (!text.trim() || text.length > MAX_LABEL || HAS_DIGIT.test(text)) continue;
    const glyphs = text.replace(/\s/g, '') || FALLBACK_GLYPHS;
    const settleAt = Array.from(text, (_, i) => Math.min(1, (i / text.length) * 0.8 + Math.random() * 0.2));
    targets.push({ node: n as Text, text, glyphs, settleAt });
  }
  return targets;
}

function render({ text, glyphs, settleAt }: Target, p: number): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += ch === ' ' || p >= settleAt[i] ? ch : glyphs[Math.floor(Math.random() * glyphs.length)];
  }
  return out;
}

/**
 * When the language changes, the interface labels "decode" into the new language: letters shuffle
 * and settle left to right. It starts before the browser paints, so the new text never flashes first.
 */
export function useLangScramble(rootSelector = '#root') {
  const lang = useNavigator((s) => s.lang);
  const first = useRef(true);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.querySelector(rootSelector);
    if (!root) return;

    const targets = collectTargets(root);
    const start = performance.now();
    let lastGlyphs = -Infinity;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS);
      if (p >= 1) {
        for (const t of targets) if (t.node.isConnected) t.node.nodeValue = t.text;
        return;
      }
      if (now - lastGlyphs >= GLYPH_TICK_MS) {
        lastGlyphs = now;
        // Skip nodes React has since replaced or rewritten.
        for (const t of targets) if (t.node.isConnected) t.node.nodeValue = render(t, p);
      }
      frame = requestAnimationFrame(tick);
    };
    tick(start);
    return () => {
      cancelAnimationFrame(frame);
      for (const t of targets) if (t.node.isConnected) t.node.nodeValue = t.text;
    };
  }, [lang, rootSelector]);
}
