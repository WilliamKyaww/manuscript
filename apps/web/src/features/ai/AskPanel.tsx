import { ASK_SCOPES, type AskScope } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { ExternalLink, Sparkles, Square } from 'lucide-react';
import { type FormEvent, type MouseEvent, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button, buttonClasses } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Kbd } from '../../components/Kbd';
import { LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { readPreference, writePreference } from '../../lib/storage';
import { locatorHref } from '../library/links';
import { textareaClasses } from '../practice/AnswerKeyEditor';
import { CardMarkdown } from '../review/CardMarkdown';
import { aiStatusQuery } from './api';
import { useAsk, withCitationLinks } from './ask-store';
import { usePageScope } from './usePageScope';

/**
 * The Ask panel (task 10.10, agent-system.md §§3–5): a question about your material, answered with
 * citations that open the passage they come from, and a label saying whether the answer is from
 * your sources, mixed, or general knowledge. Ctrl+J opens it from anywhere.
 */

const SCOPE_LABELS: Record<AskScope, { label: string; hint: string }> = {
  sources: {
    label: 'My sources',
    hint: 'Lecture material only; says so if the answer is not there',
  },
  knowledge: { label: 'Sources and notes', hint: 'Your lecture material and your own notes' },
  general: { label: 'General knowledge too', hint: 'May add what the model knows, marked as such' },
};

const GROUNDING = {
  sources: { label: 'From your sources', tone: 'success' },
  mixed: { label: 'Partly general knowledge', tone: 'warning' },
  general: { label: 'General knowledge', tone: 'warning' },
  not_found: { label: 'Not in your sources', tone: 'neutral' },
} as const;

const SCOPE_KEY = 'skb.ask.scope';

function AnswerView({ onNavigate }: { onNavigate(): void }) {
  const { phase, passages, text, done, error } = useAsk();
  const router = useRouter();
  // Citation and source links go through the router (no page reload) and close the panel.
  const follow = (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('/') || anchor?.target) return;
    event.preventDefault();
    onNavigate();
    router.history.push(href);
  };
  if (phase === 'idle') return null;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: delegates clicks on its links, which handle keys themselves.
    <section aria-label="Answer" className="space-y-4" onClick={follow}>
      <div className="flex flex-wrap items-center gap-2">
        {done && (
          <Badge tone={GROUNDING[done.grounding].tone}>{GROUNDING[done.grounding].label}</Badge>
        )}
        {phase === 'streaming' && !text && <LoadingState label="Finding passages" />}
        {phase === 'stopped' && <Badge>Stopped</Badge>}
      </div>
      {text && (
        <div aria-live="polite" aria-busy={phase === 'streaming'}>
          <CardMarkdown content={withCitationLinks(text, passages)} cardId="ask" />
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          {error.message}
          {error.code === 'not_configured' || error.code === 'budget' ? (
            <>
              {' '}
              <Link to="/settings" className="underline" onClick={onNavigate}>
                Settings → AI
              </Link>
            </>
          ) : null}
        </p>
      )}
      {done && done.dropped.length > 0 && (
        <p className="text-xs text-muted">
          Removed citations to passages that were not given: {done.dropped.join(', ')}.
        </p>
      )}
      {passages.length > 0 && (
        <details open={done?.grounding !== 'sources'}>
          <summary className="cursor-pointer text-sm font-medium">
            Passages used ({passages.length})
          </summary>
          <ol aria-label="Passages" className="mt-2 space-y-2">
            {passages.map((passage) => (
              <li key={passage.key} className="rounded-md border border-border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge tone={done?.cited.includes(passage.key) ? 'accent' : 'neutral'}>
                    {passage.key}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {passage.title}
                    {passage.label ? ` · ${passage.label}` : ''}
                  </span>
                  <a
                    href={locatorHref(passage.locator)}
                    className={buttonClasses('ghost', 'sm')}
                    aria-label={`Open ${passage.key}: ${passage.title}`}
                  >
                    <ExternalLink aria-hidden="true" size={14} />
                  </a>
                </div>
                <p className="mt-1 line-clamp-3 text-xs text-muted">{passage.text}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
      {done?.usage && (
        <p className="text-xs text-muted">
          {done.usage.inputTokens.toLocaleString('en-GB')} tokens in ·{' '}
          {done.usage.outputTokens.toLocaleString('en-GB')} out
          {done.usage.cost > 0 ? ` · about $${done.usage.cost.toFixed(4)}` : ''}
        </p>
      )}
    </section>
  );
}

export function AskPanel() {
  const api = useApi();
  const status = useQuery(aiStatusQuery(api));
  const { open, setOpen, phase, question: last, ask, stop } = useAsk();
  const page = usePageScope();
  const [question, setQuestion] = useState(last);
  const [scope, setScope] = useState<AskScope>(
    () =>
      (ASK_SCOPES.find((value) => value === readPreference(SCOPE_KEY)) ?? 'sources') as AskScope,
  );
  // Narrowed to the page by default; widening applies to that page only.
  const pageKey = page ? JSON.stringify(page.filter) : null;
  const [widenedFor, setWidenedFor] = useState<string | null>(null);
  const narrow = pageKey !== null && widenedFor !== pageKey;
  const close = () => setOpen(false);
  const streaming = phase === 'streaming';

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!question.trim() || streaming) return;
    writePreference(SCOPE_KEY, scope);
    void ask(api, {
      question: question.trim(),
      scope,
      filter: page && narrow ? page.filter : {},
    });
  };

  const ready = status.data?.enabled ?? false;
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Ask your material" size="lg">
      {status.isPending && <LoadingState label="Checking AI" />}
      {status.data && !ready && (
        <div className="space-y-3 text-sm">
          <p>
            Asking needs an AI model, and none is set up. Everything else in Manuscript works
            without one.
          </p>
          <p className="text-muted">{status.data.roles.chat.reason}</p>
          <Link to="/settings" className={buttonClasses('primary')} onClick={close}>
            Set up AI in Settings
          </Link>
        </div>
      )}
      {ready && (
        <div className="space-y-4">
          <form className="space-y-3" onSubmit={submit}>
            <textarea
              aria-label="Question"
              rows={3}
              className={cn(textareaClasses, 'font-sans')}
              placeholder="e.g. Why does Raft need a majority to elect a leader?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="mb-1 text-sm font-medium">Answer from</legend>
              {ASK_SCOPES.map((value) => (
                <label
                  key={value}
                  title={SCOPE_LABELS[value].hint}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1 text-sm',
                    scope === value
                      ? 'border-accent bg-accent-subtle'
                      : 'border-border-strong hover:bg-surface-hover',
                  )}
                >
                  <input
                    type="radio"
                    name="ask-scope"
                    className="sr-only"
                    checked={scope === value}
                    onChange={() => setScope(value)}
                  />
                  {SCOPE_LABELS[value].label}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {page ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={narrow}
                    onChange={() => setWidenedFor(narrow ? pageKey : null)}
                  />
                  Only {page.label}
                </label>
              ) : (
                <span className="text-xs text-muted">{SCOPE_LABELS[scope].hint}.</span>
              )}
              {streaming ? (
                <Button type="button" onClick={stop}>
                  <Square aria-hidden="true" size={14} /> Stop
                </Button>
              ) : (
                <Button type="submit" variant="primary" disabled={!question.trim()}>
                  <Sparkles aria-hidden="true" size={14} /> Ask <Kbd>Enter</Kbd>
                </Button>
              )}
            </div>
          </form>
          <AnswerView onNavigate={close} />
          {status.data?.mock && (
            <p className="text-xs text-muted">
              Test mode: answers come from a built-in test model.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
