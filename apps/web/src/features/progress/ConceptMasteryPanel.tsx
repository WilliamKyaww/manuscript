import { useQuery } from '@tanstack/react-query';
import { FilePlus2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { StickySection } from '../../components/Page';
import { LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { formatCount, formatDateTime } from '../../lib/format';
import { conceptMasteryQuery } from '../practice/api';
import { decimal, percent } from '../practice/format';
import { QuestionEditor } from '../practice/QuestionEditor';
import { MasteryExplanation, StageBadge } from './MasteryBits';
import { exposureText, usePractiseConcept } from './WeakAreas';

/**
 * A concept's mastery with every component (task 9.14): the figure, its stage and confidence,
 * the sentence and sum it comes from, weak-area signals, and the answers that count with the
 * weight each carries today.
 */
export function ConceptMasteryPanel({ conceptId }: { conceptId: string }) {
  const api = useApi();
  const mastery = useQuery(conceptMasteryQuery(api, conceptId));
  const practise = usePractiseConcept();
  const [writing, setWriting] = useState(false);
  const data = mastery.data;

  return (
    <StickySection
      title="Mastery"
      description="Computed from your reviews and answers — never set by hand."
      actions={
        <>
          <Button size="sm" onClick={() => setWriting(true)}>
            <FilePlus2 aria-hidden="true" size={14} /> New question
          </Button>
          {data && data.questions.linked > 0 && (
            <Button
              size="sm"
              variant="primary"
              disabled={practise.pending}
              onClick={() => void practise.start(conceptId)}
            >
              <Sparkles aria-hidden="true" size={14} /> Practise
            </Button>
          )}
        </>
      }
    >
      {mastery.isPending && <LoadingState label="Working out mastery" />}
      {data && (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-3xl font-semibold tabular-nums" data-testid="concept-mastery">
              {data.components.mastery === null ? '—' : decimal(data.components.mastery)}
            </p>
            <StageBadge stage={data.components.stage} />
            <p className="text-sm text-muted">
              {formatCount(data.cards.linked, 'card')} ({data.cards.reviewed} reviewed) ·{' '}
              {formatCount(data.questions.linked, 'question')} ({data.questions.answered} answered)
            </p>
          </div>
          <MasteryExplanation components={data.components} />
          {data.signals.length > 0 && (
            <ul aria-label="Signals" className="space-y-1 text-sm">
              {data.signals.map((signal) => (
                <li
                  key={signal.kind}
                  className="rounded-md bg-warning-subtle px-3 py-1.5 text-warning"
                >
                  {signal.reason}
                </li>
              ))}
            </ul>
          )}
          {exposureText(data) && (
            <p className="text-xs text-muted">At stake: {exposureText(data)}.</p>
          )}
          {data.answers.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                The answers that count ({data.answers.length})
              </summary>
              <table className="mt-2 w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1 font-medium">Question</th>
                    <th className="py-1 font-medium">Score</th>
                    <th className="py-1 font-medium">Weight today</th>
                    <th className="py-1 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.answers.map((answer) => (
                    <tr
                      key={`${answer.questionId}-${answer.answeredAt}`}
                      className="border-t border-border"
                    >
                      <td className="max-w-80 truncate py-1 pr-2">{answer.stem.split('\n')[0]}</td>
                      <td className="py-1 tabular-nums">{percent(answer.score)}</td>
                      <td className="py-1 tabular-nums">
                        {decimal(answer.weight)}
                        {answer.assisted && ' (helped)'}
                      </td>
                      <td className="py-1 text-xs text-muted">
                        {formatDateTime(new Date(answer.answeredAt))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </Card>
      )}
      {writing && (
        <QuestionEditor draft={{ conceptIds: [conceptId] }} onClose={() => setWriting(false)} />
      )}
    </StickySection>
  );
}
