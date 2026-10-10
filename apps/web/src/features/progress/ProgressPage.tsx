import type { ConceptProgress, ModuleProgress } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChartLine, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button, buttonClasses } from '../../components/Button';
import { Card } from '../../components/Card';
import { Page, StickySection } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { formatCount } from '../../lib/format';
import { GenerateDialog } from '../inbox/GenerateDialog';
import { progressQuery, weakAreasQuery } from '../practice/api';
import { decimal, percent } from '../practice/format';
import { type QuestionDraft, QuestionEditor } from '../practice/QuestionEditor';
import { MasteryExplanation, ReadinessBar, RollUpFigures, StageBadge } from './MasteryBits';
import { WeakAreaList } from './WeakAreas';

/**
 * Progress (task 9.13): readiness, mastery and coverage for the course, each module and topic, and
 * every concept with the evidence behind it; weak areas with one-click practice.
 */

function ConceptRow({ row }: { row: ConceptProgress }) {
  const { components } = row;
  return (
    <li>
      <details className="group px-4 py-2.5">
        <summary className="flex cursor-pointer flex-wrap items-center gap-3 marker:text-muted">
          <span className="min-w-0 flex-1 font-medium">{row.concept.name}</span>
          {row.signals.some((signal) => signal.kind !== 'no_material') && (
            <Badge tone="danger">Weak area</Badge>
          )}
          <StageBadge stage={components.stage} />
          <span className="w-24 text-right text-sm tabular-nums">
            {components.mastery === null ? '—' : decimal(components.mastery)}
          </span>
        </summary>
        <div className="mt-2 space-y-2 pl-4">
          <MasteryExplanation components={components} credit={row.credit} />
          {row.signals.map((signal) => (
            <p key={signal.kind} className="text-xs text-muted">
              {signal.reason}
            </p>
          ))}
          <p className="text-xs text-muted">
            Priority {decimal(row.priority, 3)} = gap {decimal(1 - (components.mastery ?? 0))} ×
            stake {decimal(row.exposure.stake, 3)} × urgency {decimal(row.exposure.urgency)} ×
            importance {decimal(row.concept.importance, 1)}
          </p>
          <Link
            to="/concepts/$conceptId"
            params={{ conceptId: row.concept.id }}
            className={buttonClasses('ghost', 'sm')}
          >
            Open concept
          </Link>
        </div>
      </details>
    </li>
  );
}

function ModuleSection({ progress }: { progress: ModuleProgress }) {
  const { module, rollUp, topics, concepts } = progress;
  return (
    <StickySection
      title={`${module.code} — ${module.title}`}
      description={`${formatCount(rollUp.total, 'concept')} · readiness ${percent(rollUp.readiness)}`}
      actions={
        <Link
          to="/modules/$moduleId"
          params={{ moduleId: module.id }}
          className={buttonClasses('ghost', 'sm')}
        >
          Module
        </Link>
      }
    >
      <Card className="space-y-4 p-5">
        <RollUpFigures rollUp={rollUp} />
        {topics.length > 0 && (
          <ul aria-label={`Topics in ${module.code}`} className="space-y-1.5">
            {topics.map((topic) => (
              <li
                key={topic.id}
                className="grid grid-cols-[minmax(0,12rem)_1fr] items-center gap-3"
              >
                <span className="truncate text-sm">{topic.title}</span>
                <ReadinessBar rollUp={topic.rollUp} label={topic.title} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {concepts.length > 0 && (
        <ul
          aria-label={`Concepts in ${module.code}`}
          className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {concepts.map((row) => (
            <ConceptRow key={row.concept.id} row={row} />
          ))}
        </ul>
      )}
    </StickySection>
  );
}

export function ProgressPage() {
  const api = useApi();
  const progress = useQuery(progressQuery(api));
  const weak = useQuery(weakAreasQuery(api));
  const [writing, setWriting] = useState<QuestionDraft | null>(null);
  const [generating, setGenerating] = useState<{ id: string; name: string } | null>(null);
  const data = progress.data;

  return (
    <Page
      title="Progress"
      description="Mastery, readiness and coverage — each with the evidence behind it."
    >
      {progress.isPending && <LoadingState label="Working out your progress" />}
      {progress.isError && (
        <ErrorState message="Progress could not be loaded." onRetry={() => progress.refetch()} />
      )}
      {data && data.overall.total === 0 && (
        <EmptyState
          icon={<ChartLine size={28} />}
          title="Nothing to measure yet"
          description="Progress is measured per concept. Add concepts to your modules, link cards and questions to them, and practise: mastery follows from your reviews and answers."
          action={
            <Link to="/concepts" className={buttonClasses('primary')}>
              Go to Concepts
            </Link>
          }
        />
      )}
      {data && data.overall.total > 0 && (
        <>
          <Card className="mb-8 p-5">
            <RollUpFigures rollUp={data.overall} />
          </Card>
          <StickySection
            title="Weak areas"
            description="Ordered by priority: the gap, what is at stake and how soon."
          >
            {weak.data && weak.data.items.length === 0 && (
              <p className="text-sm text-muted">
                Nothing weak, slipping or being forgotten right now.
              </p>
            )}
            {weak.data && weak.data.items.length > 0 && <WeakAreaList items={weak.data.items} />}
            {weak.data && weak.data.noMaterial.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-1 text-sm font-medium">
                  No cards or questions yet ({weak.data.noMaterial.length})
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {weak.data.noMaterial.map((concept) => (
                    <li key={concept.id} className="flex items-center gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setWriting({ conceptIds: [concept.id] })}
                        aria-label={`Write a question for ${concept.name}`}
                      >
                        {concept.name} +
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setGenerating({ id: concept.id, name: concept.name })}
                        aria-label={`Make questions for ${concept.name} from your material`}
                      >
                        <Sparkles aria-hidden="true" size={14} />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </StickySection>
          {data.modules.map((module) => (
            <ModuleSection key={module.module.id} progress={module} />
          ))}
          {data.unassigned.length > 0 && (
            <StickySection title="Concepts in no module">
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {data.unassigned.map((row) => (
                  <ConceptRow key={row.concept.id} row={row} />
                ))}
              </ul>
            </StickySection>
          )}
          <StickySection title="How mastery is worked out">
            <div className="max-w-3xl space-y-2 text-sm text-muted">
              <p>
                Each concept’s mastery combines two kinds of evidence. <strong>Recall</strong> is
                the average chance, estimated by FSRS, that you remember each reviewed card face
                linked to it right now. <strong>Accuracy</strong> is your score on its last 20
                answers, with each answer’s weight halving every 21 days and halved again if you
                used a hint. Questions count 1.5 times as much as cards, because they test
                understanding rather than recall alone.
              </p>
              <p>
                Stages: learning under 0.60 (or while a card is being relearned), practised from
                0.60, confident from 0.80, mastered from 0.90 with plenty of evidence and cards that
                last three weeks. Readiness counts concepts you have not started as 0. Nothing here
                is set by hand or by AI.
              </p>
            </div>
          </StickySection>
        </>
      )}
      {writing && <QuestionEditor draft={writing} onClose={() => setWriting(null)} />}
      {generating && (
        <GenerateDialog
          scope={{ kind: 'concept', conceptId: generating.id as never }}
          title={generating.name}
          initialTask="questions"
          onClose={() => setGenerating(null)}
        />
      )}
    </Page>
  );
}
