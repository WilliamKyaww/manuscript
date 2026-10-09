import type { QuizSummary } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  BookOpenCheck,
  Download,
  FilePlus2,
  GraduationCap,
  Play,
  Timer,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button, buttonClasses } from '../../components/Button';
import { Card } from '../../components/Card';
import { Dialog } from '../../components/Dialog';
import { IconButton } from '../../components/IconButton';
import { Page, StickySection } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { downloadText } from '../../lib/download';
import { formatCount } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { questionsQuery, quizzesQuery, usePracticeActions } from './api';
import { percent } from './format';
import { LearnStarter } from './LearnStarter';
import { QuestionEditor } from './QuestionEditor';
import { QuizBuilderDialog } from './QuizBuilderDialog';

/**
 * Practice (tasks 9.04, 9.09, 9.11–9.12): start a Learn session, build a practice quiz or mock
 * exam, and come back to the ones made before. The question bank has its own page.
 */

function QuizRow({ quiz, onDelete }: { quiz: QuizSummary; onDelete(): void }) {
  const actions = usePracticeActions();
  const navigate = useNavigate();
  const open = quiz.lastAttempt && !quiz.lastAttempt.finishedAt ? quiz.lastAttempt : null;
  const start = async () => {
    try {
      const attempt = open ?? (await actions.startAttempt.mutateAsync(quiz.id));
      await navigate({ to: '/practice/attempts/$attemptId', params: { attemptId: attempt.id } });
    } catch (reason) {
      notifyError(reason);
    }
  };
  const exportMarkdown = async () => {
    try {
      const file = await actions.exportQuiz.mutateAsync(quiz.id);
      downloadText(file.filename, file.content, 'text/markdown');
    } catch (reason) {
      notifyError(reason);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{quiz.title}</p>
        <p className="text-xs text-muted">
          {formatCount(quiz.questionCount, 'question')}
          {` · made ${new Date(quiz.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
          {quiz.config.timeLimitMinutes ? ` · ${quiz.config.timeLimitMinutes} min` : ''}
          {' · '}
          {quiz.attempts === 0
            ? 'not taken yet'
            : `${formatCount(quiz.attempts, 'attempt')} · best ${percent(quiz.bestScore)}`}
        </p>
      </div>
      <Badge tone={quiz.kind === 'mock_exam' ? 'warning' : 'neutral'}>
        {quiz.kind === 'mock_exam' ? 'Mock exam' : 'Practice'}
      </Badge>
      {quiz.lastAttempt?.finishedAt && (
        <Link
          to="/practice/attempts/$attemptId"
          params={{ attemptId: quiz.lastAttempt.id }}
          className={buttonClasses('ghost', 'sm')}
        >
          Last result
        </Link>
      )}
      <Button
        size="sm"
        onClick={() => void start()}
        aria-label={`${open ? 'Continue' : 'Start'} ${quiz.title}`}
      >
        <Play aria-hidden="true" size={14} /> {open ? 'Continue' : 'Start'}
      </Button>
      <IconButton
        label={`Export ${quiz.title} as Markdown`}
        icon={<Download size={14} />}
        size="sm"
        onClick={() => void exportMarkdown()}
      />
      <IconButton
        label={`Delete ${quiz.title}`}
        icon={<Trash2 size={14} />}
        size="sm"
        onClick={onDelete}
      />
    </li>
  );
}

export function PracticePage() {
  const api = useApi();
  const quizzes = useQuery(quizzesQuery(api));
  const questions = useQuery(questionsQuery(api));
  const actions = usePracticeActions();
  const [building, setBuilding] = useState<'practice' | 'mock_exam' | null>(null);
  const [writing, setWriting] = useState(false);
  const [deleting, setDeleting] = useState<QuizSummary | null>(null);
  const count = questions.data?.questions.length ?? 0;

  return (
    <Page
      title="Practice"
      description="Questions that test understanding: every answer counts towards mastery."
      actions={
        <>
          <Link to="/practice/questions" className={buttonClasses()}>
            <BookOpenCheck aria-hidden="true" size={16} /> Question bank
          </Link>
          <Button onClick={() => setWriting(true)}>
            <FilePlus2 aria-hidden="true" size={16} /> New question
          </Button>
        </>
      }
    >
      {(questions.isPending || quizzes.isPending) && <LoadingState label="Loading practice" />}
      {quizzes.isError && (
        <ErrorState message="Quizzes could not be loaded." onRetry={() => quizzes.refetch()} />
      )}
      {questions.data && count === 0 && (
        <EmptyState
          icon={<GraduationCap size={28} />}
          title="No questions yet"
          description="Write questions for your concepts — multiple choice, numbers, short answers, explanations, derivations or code — then practise them in quizzes, mock exams or Learn sessions."
          action={
            <Button variant="primary" onClick={() => setWriting(true)}>
              <FilePlus2 aria-hidden="true" size={16} /> Write a question
            </Button>
          }
        />
      )}
      {count > 0 && quizzes.data && (
        <>
          <StickySection
            title="Learn"
            description="Adaptive: the weakest, most pressing concepts first, climbing from recognising to explaining."
          >
            <Card className="p-5">
              <LearnStarter />
            </Card>
          </StickySection>
          <StickySection
            title="Quizzes and mock exams"
            description={`${formatCount(count, 'question')} in the bank`}
            actions={
              <>
                <Button size="sm" onClick={() => setBuilding('practice')}>
                  <Play aria-hidden="true" size={14} /> New quiz
                </Button>
                <Button size="sm" onClick={() => setBuilding('mock_exam')}>
                  <Timer aria-hidden="true" size={14} /> New mock exam
                </Button>
              </>
            }
          >
            {quizzes.data.quizzes.length === 0 ? (
              <p className="text-sm text-muted">
                No quizzes yet. A quiz draws questions by module, lecture, topic, kind and
                difficulty; a mock exam is timed and shows feedback only at the end.
              </p>
            ) : (
              <ul
                aria-label="Quizzes"
                className="divide-y divide-border rounded-lg border border-border bg-surface"
              >
                {quizzes.data.quizzes.map((quiz) => (
                  <QuizRow key={quiz.id} quiz={quiz} onDelete={() => setDeleting(quiz)} />
                ))}
              </ul>
            )}
          </StickySection>
        </>
      )}
      {building && <QuizBuilderDialog initialKind={building} onClose={() => setBuilding(null)} />}
      {writing && <QuestionEditor onClose={() => setWriting(false)} />}
      {deleting && (
        <Dialog
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          title="Delete this quiz?"
          size="sm"
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={actions.deleteQuiz.isPending}
                onClick={() =>
                  actions.deleteQuiz.mutate(deleting.id, {
                    onSuccess: () => setDeleting(null),
                    onError: notifyError,
                  })
                }
              >
                Delete quiz
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            “{deleting.title}” leaves the list. Its questions stay in the bank, and answers already
            given still count towards mastery.
          </p>
        </Dialog>
      )}
    </Page>
  );
}
