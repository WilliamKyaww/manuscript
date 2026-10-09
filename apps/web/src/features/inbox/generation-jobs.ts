import type { JobSummary } from '@skb/core';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import { onServerEvent } from '../../lib/events';

/**
 * Generation jobs started in this window (task 11.12): their progress for the dialogue that started
 * them, and a notification when each finishes — with a way to the Inbox, where the results wait.
 */

export const GENERATE_JOB = 'ai.generate';

interface TrackedJob {
  job: JobSummary;
  /** "Flashcards from Lecture 3". */
  label: string;
}

interface GenerationJobsState {
  jobs: Record<string, TrackedJob>;
  track(job: JobSummary, label: string): void;
  update(job: JobSummary): TrackedJob | null;
}

export const useGenerationJobs = create<GenerationJobsState>((set, get) => ({
  jobs: {},
  track: (job, label) => set((state) => ({ jobs: { ...state.jobs, [job.id]: { job, label } } })),
  update(job) {
    const tracked = get().jobs[job.id];
    if (!tracked) return null;
    const next = { ...tracked, job };
    set((state) => ({ jobs: { ...state.jobs, [job.id]: next } }));
    return next;
  },
}));

const finished = (job: JobSummary) =>
  job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled';

/** Follows generation jobs for the lifetime of the shell. */
export function useGenerationJobEvents(): void {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(
    () =>
      onServerEvent((event) => {
        if (event.type !== 'job.updated' || event.job.kind !== GENERATE_JOB) return;
        const before = useGenerationJobs.getState().jobs[event.job.id]?.job;
        const tracked = useGenerationJobs.getState().update(event.job);
        if (!finished(event.job) || (before && finished(before))) return;
        void queryClient.invalidateQueries({ queryKey: ['inbox'] });
        if (!tracked) return;
        if (event.job.status === 'succeeded')
          toast.success(`${tracked.label}: done`, {
            ...(event.job.message ? { description: event.job.message } : {}),
            action: { label: 'Open Inbox', onClick: () => void navigate({ to: '/inbox' }) },
          });
        else if (event.job.status === 'failed')
          toast.error(`${tracked.label}: failed`, {
            description: event.job.error ?? 'The generation failed.',
          });
      }),
    [queryClient, navigate],
  );
}
