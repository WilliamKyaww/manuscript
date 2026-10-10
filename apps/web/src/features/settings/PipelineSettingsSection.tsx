import { PIPELINE_STEP_LABELS, PIPELINE_STEPS, type PipelineStep } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { StickySection } from '../../components/Page';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { notifyError } from '../../lib/notify';
import { pipelineSettingsQuery, usePipelineActions } from '../pipeline/api';

/**
 * Settings → Lecture pipeline (task 15.02): which steps make study materials from a lecture, and
 * whether it runs by itself when material is attached. Whether the results are accepted without
 * asking is the auto-accept choice per kind under Settings → AI.
 */
export function PipelineSettingsSection() {
  const api = useApi();
  const settings = useQuery(pipelineSettingsQuery(api));
  const actions = usePipelineActions();
  const save = (changes: Parameters<typeof actions.updateSettings.mutate>[0]) =>
    actions.updateSettings.mutate(changes, { onError: notifyError });
  const data = settings.data;
  return (
    <StickySection
      title="Lecture pipeline"
      description="What “Make study materials” does for a lecture, from its slides and documents."
    >
      {settings.isPending && <LoadingState label="Loading pipeline settings" />}
      {settings.isError && (
        <ErrorState
          message="Pipeline settings could not be loaded."
          onRetry={() => settings.refetch()}
        />
      )}
      {data && (
        <form className="space-y-4" aria-label="Lecture pipeline settings">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Steps</legend>
            {PIPELINE_STEPS.map((step: PipelineStep) => (
              <label key={step} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={data[step]}
                  onChange={(event) => save({ [step]: event.target.checked })}
                />
                {PIPELINE_STEP_LABELS[step]}
              </label>
            ))}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={data.autoRun}
              onChange={(event) => save({ autoRun: event.target.checked })}
            />
            <span>
              Run by itself when material is attached to a lecture
              <span className="block text-xs text-muted">
                Off by default, because each run asks your AI model several times (and costs what
                that costs). It runs once for the same material.
              </span>
            </span>
          </label>
          <p className="text-xs text-muted">
            Results wait in the Inbox unless you have switched on auto-accept for that kind under
            AI.
          </p>
        </form>
      )}
    </StickySection>
  );
}
