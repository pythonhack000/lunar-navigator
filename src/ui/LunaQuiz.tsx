import { useCallback, useEffect, useState } from 'react';
import { SITES, type NamedSite } from '../data/sites';
import { WINDOW_MS } from '../hooks/useSiteAnalysis';
import { siteLabel, useT } from '../i18n';
import { formatHours, formatPercent, HOUR_MS } from '../lib/format';
import { buildRound, QUIZ_ROUNDS, type QuizGoal, type QuizRound } from '../lib/quiz';
import { summarizeSite } from '../lib/ranking';
import type { Terrain } from '../lib/terrain';
import type { TimelineSummary } from '../lib/visibility';
import { useNavigator } from '../state/store';

type Props = { terrain: Terrain; windowStart: number; onClose: () => void };

/** A game does not need hourly data, and six-hour steps keep each round instant. */
const STEP_MS = 6 * HOUR_MS;

function valueFor(summary: TimelineSummary, goal: QuizGoal, lang: 'en' | 'ru'): string {
  if (goal === 'power') return formatPercent(summary.sunlitShare);
  if (goal === 'comms') return formatPercent(summary.earthShare);
  return summary.longestDarkHours > 0 ? formatHours(summary.longestDarkHours, lang) : '0';
}

/** "Mission commander": three rounds of choosing a site, each answered from the real analysis. */
export function LunaQuiz({ terrain, windowStart, onClose }: Props) {
  const t = useT();
  const lang = useNavigator((s) => s.lang);
  const [round, setRound] = useState<QuizRound<NamedSite> | null>(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [isFinished, setFinished] = useState(false);
  const [hasNoQuestion, setNoQuestion] = useState(false);

  // Waits a tick so "Picking sites…" paints before the calculation holds the thread.
  const loadQuestion = useCallback(() => {
    window.setTimeout(() => {
      const fresh = buildRound(SITES, (site) => summarizeSite(site, terrain, windowStart, WINDOW_MS, STEP_MS));
      setNoQuestion(fresh === null);
      setRound(fresh);
    }, 0);
  }, [terrain, windowStart]);

  useEffect(() => {
    loadQuestion();
  }, [loadQuestion]);

  const nextQuestion = () => {
    setPicked(null);
    setRound(null);
    loadQuestion();
  };

  const choose = (index: number) => {
    if (picked !== null || !round) return;
    setPicked(index);
    if (index === round.answer) setScore((s) => s + 1);
  };

  const advance = () => {
    if (roundNumber >= QUIZ_ROUNDS) {
      setFinished(true);
      return;
    }
    setRoundNumber((n) => n + 1);
    nextQuestion();
  };

  const restart = () => {
    setRoundNumber(1);
    setScore(0);
    setFinished(false);
    nextQuestion();
  };

  if (isFinished) {
    return (
      <div className="luna-quiz">
        <h3>{t('quiz.title')}</h3>
        <p className="luna-quiz__score">{t('quiz.score', { n: score, total: QUIZ_ROUNDS })}</p>
        <div className="luna-tour-nav">
          <button type="button" className="ghost-button" onClick={onClose}>{t('quiz.close')}</button>
          <button type="button" className="primary-button" onClick={restart}>{t('quiz.again')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="luna-quiz">
      <h3>{t('quiz.title')}</h3>
      <p className="muted">{t('quiz.round', { n: roundNumber, total: QUIZ_ROUNDS })}</p>
      {hasNoQuestion && <p>{t('quiz.none')}</p>}
      {!round && !hasNoQuestion && <p className="muted luna-thinking">{t('quiz.loading')}</p>}
      {round && (
        <>
          <p className="luna-quiz__question">{t(`quiz.goal.${round.goal}`)}</p>
          <div className="luna-quiz__options">
            {round.sites.map((site, i) => {
              const isAnswer = picked !== null && i === round.answer;
              return (
                <button key={site.id} type="button" className={isAnswer ? 'ghost-button is-on' : 'ghost-button'} disabled={picked !== null && !isAnswer} onClick={() => choose(i)}>
                  <span>{siteLabel(site, lang)}</span>
                  {picked !== null && <b className="mono">{valueFor(round.summaries[i], round.goal, lang)}</b>}
                </button>
              );
            })}
          </div>
          {picked !== null && (
            <p role="status">{picked === round.answer ? t('quiz.right') : t('quiz.wrong', { name: siteLabel(round.sites[round.answer], lang) })}</p>
          )}
        </>
      )}
      <div className="luna-tour-nav">
        <button type="button" className="ghost-button" onClick={onClose}>{t('quiz.close')}</button>
        {picked !== null && (
          <button type="button" className="primary-button" onClick={advance}>{roundNumber >= QUIZ_ROUNDS ? t('quiz.finish') : t('quiz.next')}</button>
        )}
      </div>
    </div>
  );
}
