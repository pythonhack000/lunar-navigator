import { useEffect, useRef, useState } from 'react';
import type { SiteAnalysis } from '../hooks/useSiteAnalysis';
import type { SiteScoreView } from '../hooks/useSiteScore';
import { useNavigator } from '../state/store';
import { FLIGHT_LINE_MS, groundAnswer, groundLines, landingLines, type GroundLine } from './groundLines';

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
  const visitId = useNavigator((s) => s.landingVisit?.siteId ?? null);
  const isTalking = isGroundView && !isTouring;
  const latest = useRef({ analysis, score });
  const wasOnLandingDay = useRef(false);
  useEffect(() => {
    latest.current = { analysis, score };
  }, [analysis, score]);

  // Standing on the surface starts her off; leaving it, or the tour taking over, ends it.
  useEffect(() => {
    const isBackFromLandingDay = wasOnLandingDay.current && !visitId;
    wasOnLandingDay.current = isTalking && visitId !== null;
    if (!isTalking) return;
    const state = useNavigator.getState();
    state.setGroundLookManual(false);
    // After a jump in time the numbers are read a moment later, once the panels have caught up with the date.
    let timer = 0;
    if (isBackFromLandingDay) {
      const back = state.lang === 'ru' ? 'Возвращаемся в настоящее!' : 'Back to the present!';
      setTalk({ lines: [{ text: back, point: null, ms: FLIGHT_LINE_MS }], index: 0 });
      timer = window.setTimeout(() => {
        const now = useNavigator.getState();
        setTalk({ lines: groundLines(latest.current.analysis, now.power, now.lang), index: 0 });
      }, FLIGHT_LINE_MS);
    } else if (visitId) {
      const flying = state.lang === 'ru' ? 'Летим в прошлое!' : 'Back in time we go!';
      setTalk({ lines: [{ text: flying, point: null, ms: FLIGHT_LINE_MS }], index: 0 });
      timer = window.setTimeout(() => setTalk({ lines: landingLines(latest.current.analysis, visitId, useNavigator.getState().lang), index: 0 }), FLIGHT_LINE_MS);
    } else {
      setTalk({ lines: groundLines(latest.current.analysis, state.power, state.lang), index: 0 });
    }
    return () => {
      window.clearTimeout(timer);
      setTalk(null);
      useNavigator.getState().setGroundSpeech(null);
      useNavigator.getState().setGroundMenuOpen(false);
    };
  }, [isTalking, visitId]);

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
    const { isGroundLookManual, lookFromGround } = useNavigator.getState();
    if (line.point && !isGroundLookManual) lookFromGround(line.point);
    const id = window.setTimeout(() => setTalk((t) => (t ? { ...t, index: t.index + 1 } : t)), line.ms ?? LINE_MS);
    return () => window.clearTimeout(id);
  }, [talk, isTalking, setSpeech]);

  return null;
}
