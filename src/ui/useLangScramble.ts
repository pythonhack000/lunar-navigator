import { useEffect, useRef } from 'react';
import { useNavigator } from '../state/store';

const DURATION_MS = 520;
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZАБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ01#$%&*+<>';
/** Labels only: anything with digits is live data (times, angles, altitudes) and is left alone. */
const HAS_DIGIT = /\d/;
const MAX_LABEL = 60;

/**
 * When the language changes, the interface labels "decode" into the new language: each character
 * flickers through random glyphs and settles left to right, like a terminal in a film.
 */
export function useLangScramble(rootSelector = '#root') {
  const lang = useNavigator((s) => s.lang);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.querySelector(rootSelector);
    if (!root) return;

    // Wait one frame so React has painted the new language before we capture the final text.
    let frame = requestAnimationFrame(() => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const targets: { node: Text; text: string }[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.nodeValue ?? '';
        const parent = n.parentElement;
        if (!parent || parent.closest('canvas, svg, input, [data-no-scramble]')) continue;
        if (!text.trim() || text.length > MAX_LABEL || HAS_DIGIT.test(text)) continue;
        targets.push({ node: n as Text, text });
      }
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / DURATION_MS);
        for (const { node, text } of targets) {
          // Skip nodes React has since replaced or rewritten.
          if (!node.isConnected) continue;
          const settled = Math.floor(text.length * p);
          let out = text.slice(0, settled);
          for (let i = settled; i < text.length; i++) {
            out += text[i] === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
          node.nodeValue = out;
        }
        if (p < 1) frame = requestAnimationFrame(tick);
        else for (const { node, text } of targets) if (node.isConnected) node.nodeValue = text;
      };
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [lang, rootSelector]);
}
