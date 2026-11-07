import { useEffect, useRef, useState } from 'react';
import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import type { SiteScoreView } from '../hooks/useSiteScore';
import { useNavigator } from '../state/store';
import { groundAnswer, groundLines, type GroundLine } from './groundLines';

type Props = { analysis: SiteAnalysis; score: SiteScoreView };

const LINE_MS = 7000;

/**
 * Keeps 3D LUNA talking on the surface: she goes through her lines once by herself, a click on her
 * words moves on, and clicking her asks her something. During the tour the script speaks through her.
 */
export function GroundTalk({ analysis, score }: Props) {
  const isGroundView = useNavigator((s) => s.isGroundView);
  const isTouring = useNavigator((s) => s.isTouring);
  const talkNonce = useNavigator((s) => s.groundTalkNonce);
  const question = useNavigator((s) => s.groundQuestion);
  const setSpeech = useNavigator((s) => s.setGroundSpeech);
  const [talk, setTalk] = useState<{ lines: readonly GroundLine[]; index: number } | null>(null);
  const isTalking = isGroundView && !isTouring;
  const latest = useRef({ analysis, score });
  useEffect(() => {
    latest.current = { analysis, score };
  }, [analysis, score]);

  // Standing on the surface starts her off; leaving it, or the tour taking over, ends it.
  useEffect(() => {
    if (!isTalking) return;
    const state = useNavigator.getState();
    setTalk({ lines: groundLines(latest.current.analysis, state.power, state.lang), index: 0 });
    return () => {
      setTalk(null);
      useNavigator.getState().setGroundSpeech(null);
      useNavigator.getState().setGroundMenuOpen(false);
    };
  }, [isTalking]);

  useEffect(() => {
    if (talkNonce === 0) return;
    setTalk((t) => (t ? { ...t, index: t.index + 1 } : t));
  }, [talkNonce]);

  useEffect(() => {
    if (!question || !useNavigator.getState().isGroundView) return;
    const state = useNavigator.getState();
    setTalk({ lines: groundAnswer(question.key, { ...latest.current, site: state.site, power: state.power, lang: state.lang }), index: 0 });
  }, [question]);

  useEffect(() => {
    if (!talk || !isTalking) return;
    const line = talk.lines[talk.index];
    if (!line) {
      setSpeech(null);
      return;
    }
    setSpeech(line);
    if (line.point) useNavigator.getState().lookFromGround(line.point);
    const id = window.setTimeout(() => setTalk((t) => (t ? { ...t, index: t.index + 1 } : t)), line.ms ?? LINE_MS);
    return () => window.clearTimeout(id);
  }, [talk, isTalking, setSpeech]);

  return null;
}
