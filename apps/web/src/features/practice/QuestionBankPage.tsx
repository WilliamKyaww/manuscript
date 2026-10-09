import { QUESTION_KINDS, type Question, type QuestionKind } from '@skb/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FilePlus2, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { Page } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { formatCount } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { modulesQuery } from '../learning/api';
import { selectClasses } from '../learning/Field';
import { questionsQuery, usePracticeActions } from './api';
import { KIND_LABELS, percent } from './format';
import { QuestionEditor } from './QuestionEditor';

/** The question bank (task 9.10): every question, filtered by module, kind and text. */

function firstLine(text: string) {
  return text.trim().split('\n')[0] ?? '';
}

function QuestionRow({
  question,
  onEdit,
  onDelete,
}: {
  question: Question;
  onEdit(): void;
  onDelete(): void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{firstLine(question.stem)}</p>
        <p className="text-xs text-muted">
          {[
            question.module?.code,
            question.concepts.map((concept) => concept.name).join(', ') || 'no concepts',
            `difficulty ${question.difficulty}`,
            question.stats.answers === 0
              ? 'not answered yet'
              : `${formatCount(question.stats.answers, 'answer')} · last ${percent(question.stats.lastScore)}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      {question.status !== 'active' && <Badge tone="warning">{question.status}</Badge>}
      <Badge>{KIND_LABELS[question.kind]}</Badge>
      <IconButton
        label={`Edit “${firstLine(question.stem)}”`}
        icon={<Pencil size={14} />}
        size="sm"
        onClick={onEdit}
      />
      <IconButton
        label={`Delete “${firstLine(question.stem)}”`}
        icon={<Trash2 size={14} />}
        size="sm"
        onClick={onDelete}
      />
    </li>
  );
}

export function QuestionBankPage() {
  const api = useApi();
  const actions = usePracticeActions();
  const [module, setModule] = useState('');
  const [kind, setKind] = useState<QuestionKind | ''>('');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Question | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Question | null>(null);
  const modules = useQuery(modulesQuery(api));
  const filter = { module, kind, q: text.trim() };
  const questions = useQuery({ ...questionsQuery(api, filter), placeholderData: keepPreviousData });
  const list = questions.data?.questions ?? [];
  const filtered = Boolean(module || kind || text.trim());

  return (
    <Page
      title="Question bank"
      breadcrumbs={[{ label: 'Practice', to: '/practice' }, { label: 'Question bank' }]}
      description={questions.data ? formatCount(list.length, 'question') : undefined}
      actions={
        <Button variant="primary" onClick={() => setEditing('new')}>
          <FilePlus2 aria-hidden="true" size={16} /> New question
        </Button>
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Module"
            className={cn(selectClasses, 'w-56')}
            value={module}
            onChange={(event) => setModule(event.target.value)}
          >
            <option value="">Every module</option>
            {(modules.data?.modules ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} — {option.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Kind"
            className={cn(selectClasses, 'w-44')}
            value={kind}
            onChange={(event) => setKind(event.target.value as QuestionKind | '')}
          >
            <option value="">Every kind</option>
            {QUESTION_KINDS.map((value) => (
              <option key={value} value={value}>
                {KIND_LABELS[value]}
              </option>
            ))}
          </select>
          <Input
            aria-label="Search questions"
            placeholder="Search questions"
            className="w-64"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
      }
    >
      {questions.isPending && <LoadingState label="Loading questions" />}
      {questions.isError && (
        <ErrorState message="Questions could not be loaded." onRetry={() => questions.refetch()} />
      )}
      {questions.data && list.length === 0 && (
        <EmptyState
          title={filtered ? 'No questions match' : 'No questions yet'}
          description={
            filtered
              ? 'Try another module, kind or search.'
              : 'Link questions to concepts so that answering them counts towards mastery.'
          }
          action={
            !filtered && (
              <Button variant="primary" onClick={() => setEditing('new')}>
                <FilePlus2 aria-hidden="true" size={16} /> Write a question
              </Button>
            )
          }
        />
      )}
      {list.length > 0 && (
        <ul
          aria-label="Questions"
          className="divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {list.map((question) => (
            <QuestionRow
              key={question.id}
              question={question}
              onEdit={() => setEditing(question)}
              onDelete={() => setDeleting(question)}
            />
          ))}
        </ul>
      )}
      {editing && (
        <QuestionEditor
          question={editing === 'new' ? undefined : editing}
          draft={editing === 'new' && module ? { moduleId: module } : undefined}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Dialog
          open
          onOpenChange={(next) => !next && setDeleting(null)}
          title="Delete this question?"
          size="sm"
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={actions.deleteQuestion.isPending}
                onClick={() =>
                  actions.deleteQuestion.mutate(deleting.id, {
                    onSuccess: () => setDeleting(null),
                    onError: notifyError,
                  })
                }
              >
                Delete question
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            It will no longer be asked, and its past answers stop counting towards mastery.
          </p>
        </Dialog>
      )}
    </Page>
  );
}
