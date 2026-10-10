import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { buttonClasses } from '../../components/Button';
import { Card } from '../../components/Card';
import { InlineError, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { progressQuery } from '../practice/api';
import { LearnStarter } from '../practice/LearnStarter';
import { RollUpFigures } from './MasteryBits';

/** How ready a module is (task 9.14): readiness, mastery and coverage, and a Learn session. */
export function ModuleReadiness({ moduleId }: { moduleId: string }) {
  const api = useApi();
  const progress = useQuery(progressQuery(api, moduleId));
  const module = progress.data?.modules[0];
  return (
    <Card className="mb-8 space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Readiness</h2>
        <Link to="/progress" className={buttonClasses('link', 'sm')}>
          All progress
          <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </div>
      {progress.isPending && <LoadingState label="Working out readiness" />}
      {progress.isError && (
        <InlineError
          message="Readiness could not be worked out."
          onRetry={() => void progress.refetch()}
        />
      )}
      {module &&
        (module.rollUp.total === 0 ? (
          <p className="text-sm text-muted">
            Add concepts to this module (on Concepts) and link cards and questions to them to see
            how ready you are.
          </p>
        ) : (
          <>
            <RollUpFigures rollUp={module.rollUp} />
            <LearnStarter scope={{ moduleId }} />
          </>
        ))}
    </Card>
  );
}
