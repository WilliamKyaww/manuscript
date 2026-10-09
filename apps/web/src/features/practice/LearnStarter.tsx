import type { LearnScopeSchema } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import type { z } from 'zod';
import { Button } from '../../components/Button';
import { useApi } from '../../lib/api/context';
import { describeError } from '../../lib/notify';
import { modulesQuery } from '../learning/api';
import { Field, FormError, selectClasses } from '../learning/Field';
import { usePracticeActions } from './api';

type Scope = z.input<typeof LearnScopeSchema>;

/** Starts a Learn session for a module (or everything), with an optional time limit. */
export function LearnStarter({ scope: fixed }: { scope?: Scope }) {
  const api = useApi();
  const navigate = useNavigate();
  const actions = usePracticeActions();
  const modules = useQuery({ ...modulesQuery(api), enabled: !fixed });
  const [moduleId, setModuleId] = useState('');
  const [minutes, setMinutes] = useState('20');
  const [error, setError] = useState<string | null>(null);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const scope: Scope = fixed ?? (moduleId ? { moduleId } : {});
      const session = await actions.startLearn.mutateAsync({
        scope,
        ...(Number(minutes) > 0 ? { timeLimitMinutes: Number(minutes) } : {}),
      });
      await navigate({
        to: '/practice/learn/$attemptId',
        params: { attemptId: session.attemptId },
      });
    } catch (reason) {
      setError(describeError(reason).description);
    }
  };

  return (
    <form className="space-y-3" onSubmit={start}>
      <div className="flex flex-wrap items-end gap-3">
        {!fixed && (
          <Field label="Concepts from" className="min-w-48 flex-1">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={moduleId}
                onChange={(event) => setModuleId(event.target.value)}
              >
                <option value="">Every module</option>
                {(modules.data?.modules ?? []).map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.code} — {module.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Time" className="w-40">
          {(id) => (
            <select
              id={id}
              className={selectClasses}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            >
              <option value="10">10 minutes</option>
              <option value="20">20 minutes</option>
              <option value="30">30 minutes</option>
              <option value="0">Until secure</option>
            </select>
          )}
        </Field>
        <Button type="submit" variant="primary" loading={actions.startLearn.isPending}>
          <Sparkles aria-hidden="true" size={16} /> Start Learn
        </Button>
      </div>
      <FormError error={error} />
    </form>
  );
}
