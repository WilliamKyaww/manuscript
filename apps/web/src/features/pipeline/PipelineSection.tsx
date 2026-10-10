import {
  PIPELINE_STEP_LABELS,
  PIPELINE_STEPS,
  type PipelineRun,
  type PipelineStep,
} from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Check, CircleAlert, Minus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button, buttonClasses } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { StickySection } from '../../components/Page';
import { ProgressBar } from '../../components/ProgressBar';
import { Spinner } from '../../components/Spinner';
import { useApi } from '../../lib/api/context';
import { describeError, notifyError } from '../../lib/notify';
import { aiStatusQuery } from '../ai/api';
import { FormError } from '../learning/Field';
import { pipelineRunQuery, pipelineSettingsQuery, usePipelineActions } from './api';

/**
 * Study materials from a lecture (task 15.01): one request that makes a summary note, concepts and
 * links, flashcards, questions and a quiz from the lecture's material — all waiting in the Inbox.
 */

const STATUS_ICON = {
  pending: <Minus aria-hidden="true" size={14} className="text-muted" />,
  running: <Spinner size="sm" label="" />,
  done: <Check aria-hidden="true" size={14} className="text-success" />,
  skipped: <Minus aria-hidden="true" size={14} className="text-muted" />,
  failed: <CircleAlert aria-hidden="true" size={14} className="text-danger" />,
} as const;

function RunView({ run }: { run: PipelineRun }) {
  const active = run.status === 'queued' || run.status === 'running';
  return (
    <div className="space-y-3" data-pipeline-run data-status={run.status}>
      {active && (
        <ProgressBar
          value={run.progress}
          label={`Making study materials: ${run.message ?? 'starting'}`}
        />
      )}
      <ol aria-label="Pipeline steps" className="space-y-1.5 text-sm">
        {run.steps.map((step) => (
          <li key={step.step} className="flex items-start gap-2">
            <span className="mt-1 flex size-4 shrink-0 items-center justify-center">
              {STATUS_ICON[step.status]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{PIPELINE_STEP_LABELS[step.step]}</span>
              {step.summary && <span className="block text-xs text-muted">{step.summary}</span>}
            </span>
          </li>
        ))}
      </ol>
      {!active && (
        <p className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>{run.message}</span>
          <Link to="/inbox" className={buttonClasses('secondary', 'sm')}>
            Open the Inbox
          </Link>
        </p>
      )}
    </div>
  );
}

function StartDialog({ lectureId, onClose }: { lectureId: string; onClose(): void }) {
  const api = useApi();
  const settings = useQuery(pipelineSettingsQuery(api));
  const actions = usePipelineActions();
  const [chosen, setChosen] = useState<PipelineStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const steps =
    chosen ?? PIPELINE_STEPS.filter((step) => (settings.data ? settings.data[step] : true));
  const toggle = (step: PipelineStep) =>
    setChosen(steps.includes(step) ? steps.filter((entry) => entry !== step) : [...steps, step]);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Make study materials"
      description="Everything goes to the Inbox for you to accept, edit or reject; nothing is studied or saved until you do."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={steps.length === 0}
            loading={actions.run.isPending}
            onClick={() =>
              actions.run.mutate(
                { lectureId, steps },
                {
                  onSuccess: onClose,
                  onError: (reason) => setError(describeError(reason).description),
                },
              )
            }
          >
            <Sparkles aria-hidden="true" size={16} /> Make them
          </Button>
        </>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Steps</legend>
        {PIPELINE_STEPS.map((step) => (
          <label key={step} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={steps.includes(step)} onChange={() => toggle(step)} />
            {PIPELINE_STEP_LABELS[step]}
          </label>
        ))}
        <p className="text-xs text-muted">
          A quiz is made from the questions of this run, so it needs the questions step. Each step
          is a request to your AI model; the estimate for one is in Generate….
        </p>
      </fieldset>
      <div className="mt-3">
        <FormError error={error} />
      </div>
    </Dialog>
  );
}

export function PipelineSection({
  lectureId,
  hasSources,
}: {
  lectureId: string;
  hasSources: boolean;
}) {
  const api = useApi();
  const status = useQuery(aiStatusQuery(api));
  const current = useQuery(pipelineRunQuery(api, lectureId));
  const [starting, setStarting] = useState(false);
  const run = current.data?.run ?? null;
  const ready = status.data?.enabled ?? false;
  const active = run?.status === 'queued' || run?.status === 'running';
  return (
    <StickySection
      title="Study materials"
      description="A summary note, concepts, flashcards, questions and a quiz from this lecture’s material, for you to review."
      actions={
        <Button
          size="sm"
          disabled={!hasSources || !ready || active}
          onClick={() => setStarting(true)}
        >
          <Sparkles aria-hidden="true" size={14} />
          {run ? 'Make them again…' : 'Make study materials…'}
        </Button>
      }
    >
      {!hasSources && (
        <p className="text-sm text-muted">Attach the lecture’s slides or documents first.</p>
      )}
      {hasSources && !ready && (
        <p className="text-sm text-muted">
          This needs an AI model.{' '}
          <Link to="/settings" className="underline">
            Set one up in Settings
          </Link>
          ; everything else about the lecture works without one.
        </p>
      )}
      {hasSources && ready && !run && (
        <p className="text-sm text-muted">
          Not made yet. Press the button, or switch on “Run by itself” in Settings → Lecture
          pipeline.
        </p>
      )}
      {run && <RunView run={run} />}
      {starting && (
        <StartDialog
          lectureId={lectureId}
          onClose={() => {
            setStarting(false);
            void current.refetch().catch(notifyError);
          }}
        />
      )}
    </StickySection>
  );
}
