import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { buttonClasses } from '../../components/Button';
import { Page } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { AttemptResults } from './AttemptResults';
import { attemptQuery, practiceKeys } from './api';
import { MockExamRunner } from './MockExamRunner';
import { PracticeRunner } from './PracticeRunner';

/** A practice quiz or mock exam being taken, or its results once finished (tasks 9.11–9.12). */
export function AttemptPage() {
  const { attemptId } = useParams({ from: '/practice/attempts/$attemptId' });
  const api = useApi();
  const queryClient = useQueryClient();
  const attempt = useQuery(attemptQuery(api, attemptId));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: practiceKeys.attempt(attemptId) });
    void queryClient.invalidateQueries({ queryKey: practiceKeys.quizzes() });
  };
  const data = attempt.data;
  const kind = data?.quiz.kind;

  return (
    <Page
      title={data?.quiz.title ?? 'Practice'}
      breadcrumbs={[{ label: 'Practice', to: '/practice' }, { label: data?.quiz.title ?? '…' }]}
      description={
        data
          ? data.finishedAt
            ? 'Finished — every answer with its feedback.'
            : kind === 'mock_exam'
              ? 'Answer everything, then submit: no feedback until the end.'
              : 'Feedback after each answer.'
          : undefined
      }
    >
      {attempt.isPending && <LoadingState label="Loading the quiz" />}
      {attempt.isError && (
        <ErrorState message="This attempt could not be loaded." onRetry={() => attempt.refetch()} />
      )}
      {data &&
        (data.finishedAt ? (
          <AttemptResults attempt={data} onChanged={refresh} />
        ) : kind === 'mock_exam' ? (
          <MockExamRunner attempt={data} onChanged={refresh} />
        ) : kind === 'practice' ? (
          <PracticeRunner attempt={data} onChanged={refresh} />
        ) : (
          <EmptyState
            title="This is a Learn session"
            description="Carry on with it from its own page."
            action={
              <Link
                to="/practice/learn/$attemptId"
                params={{ attemptId }}
                className={buttonClasses('primary')}
              >
                Open the session
              </Link>
            }
          />
        ))}
    </Page>
  );
}
