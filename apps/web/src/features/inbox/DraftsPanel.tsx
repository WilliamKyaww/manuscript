import {
  type Card,
  type Drafts,
  locatorLabel,
  type Question,
  type QuestionAnswer,
} from '@skb/core';
import { Check, Copy, Lightbulb, Pencil, X } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { EmptyState } from '../../components/States';
import { formatCount } from '../../lib/format';
import { notifyError, notifySuccess } from '../../lib/notify';
import { locatorHref } from '../library/links';
import { KIND_LABELS } from '../practice/format';
import { CardMarkdown } from '../review/CardMarkdown';
import { useInboxActions } from './api';

const CardEditor = lazy(() =>
  import('../review/CardEditor').then((module) => ({ default: module.CardEditor })),
);
const QuestionEditor = lazy(() =>
  import('../practice/QuestionEditor').then((module) => ({ default: module.QuestionEditor })),
);

/**
 * Draft review (task 11.13): generated cards and questions, each with where it came from, writing
 * advice and the existing card or question it repeats, if any. Accept or reject them one by one or
 * in a batch; edit before accepting.
 */

type DraftCard = Drafts['cards'][number];
type DraftQuestion = Drafts['questions'][number];

function answerText(answer: QuestionAnswer): string {
  switch (answer.kind) {
    case 'mcq':
    case 'multi':
      return answer.options
        .filter((option) => option.correct)
        .map((option) => option.text)
        .join('; ');
    case 'true_false':
      return answer.value ? 'True' : 'False';
    case 'numeric':
      return `${answer.value}${answer.unit ? ` ${answer.unit}` : ''}`;
    case 'short':
      return answer.accepted.join(' · ');
    default:
      return answer.model;
  }
}

function Source({ locator }: { locator: Card['locator'] }) {
  if (!locator) return <span className="text-danger">No source</span>;
  return (
    <a href={locatorHref(locator)} target="_blank" rel="noopener" className="underline">
      {locatorLabel(locator)}
    </a>
  );
}

function Row({
  selected,
  onSelect,
  label,
  children,
  meta,
  onAccept,
  onEdit,
  onReject,
  busy,
}: {
  selected: boolean;
  onSelect(selected: boolean): void;
  label: string;
  children: ReactNode;
  meta: ReactNode;
  onAccept(): void;
  onEdit(): void;
  onReject(): void;
  busy: boolean;
}) {
  return (
    <li className="flex gap-3 px-4 py-3" data-draft>
      <input
        type="checkbox"
        className="mt-1"
        aria-label={`Select ${label}`}
        checked={selected}
        onChange={(event) => onSelect(event.target.checked)}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        {children}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">{meta}</div>
      </div>
      <div className="flex shrink-0 items-start gap-1">
        <IconButton
          label={`Accept ${label}`}
          icon={<Check size={16} />}
          size="sm"
          onClick={onAccept}
          disabled={busy}
        />
        <IconButton
          label={`Edit ${label}`}
          icon={<Pencil size={16} />}
          size="sm"
          onClick={onEdit}
        />
        <IconButton
          label={`Reject ${label}`}
          icon={<X size={16} />}
          size="sm"
          onClick={onReject}
          disabled={busy}
        />
      </div>
    </li>
  );
}

function Duplicate({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-1 text-warning">
      <Copy aria-hidden="true" size={12} />
      Like one you have: “{text.length > 80 ? `${text.slice(0, 77)}…` : text}”
    </span>
  );
}

export function DraftsPanel({ drafts, onEdited }: { drafts: Drafts; onEdited(): void }) {
  const actions = useInboxActions();
  const [cards, setCards] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<Set<string>>(new Set());
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const busy = actions.acceptDrafts.isPending || actions.rejectDrafts.isPending;

  const toggle = (
    set: Set<string>,
    update: (next: Set<string>) => void,
    id: string,
    on: boolean,
  ) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    update(next);
  };
  const decide = (accept: boolean, cardIds: string[], questionIds: string[]) => {
    const mutation = accept ? actions.acceptDrafts : actions.rejectDrafts;
    mutation.mutate(
      { cardIds, questionIds },
      {
        onSuccess: (result) => {
          setCards(new Set());
          setQuestions(new Set());
          const what = [
            result.cards ? formatCount(result.cards, 'card') : '',
            result.questions ? formatCount(result.questions, 'question') : '',
          ]
            .filter(Boolean)
            .join(' and ');
          if (what) notifySuccess(accept ? `${what} accepted` : `${what} rejected`);
        },
        onError: notifyError,
      },
    );
  };

  if (drafts.cards.length === 0 && drafts.questions.length === 0)
    return (
      <EmptyState
        icon={<Check size={22} />}
        title="No drafts waiting"
        description="Generate flashcards or questions from a lecture, a source or a note; they wait here until you accept them."
      />
    );

  const selectedCount = cards.size + questions.size;
  const allSelected =
    cards.size === drafts.cards.length && questions.size === drafts.questions.length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Drafts">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(event) => {
              setCards(
                event.target.checked ? new Set(drafts.cards.map((card) => card.id)) : new Set(),
              );
              setQuestions(
                event.target.checked
                  ? new Set(drafts.questions.map((question) => question.id))
                  : new Set(),
              );
            }}
          />
          Select all
        </label>
        <span className="text-sm text-muted">
          {selectedCount ? `${selectedCount} selected` : ''}
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={selectedCount === 0}
            loading={actions.acceptDrafts.isPending}
            onClick={() => decide(true, [...cards], [...questions])}
          >
            Accept selected
          </Button>
          <Button
            size="sm"
            disabled={selectedCount === 0}
            loading={actions.rejectDrafts.isPending}
            onClick={() => decide(false, [...cards], [...questions])}
          >
            Reject selected
          </Button>
        </div>
      </div>

      {drafts.cards.length > 0 && (
        <section aria-labelledby="draft-cards">
          <h2 id="draft-cards" className="mb-2 text-sm font-semibold">
            Flashcards <Badge>{drafts.cards.length}</Badge>
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {drafts.cards.map((card: DraftCard) => (
              <Row
                key={card.id}
                label={`card “${card.front.slice(0, 40)}”`}
                selected={cards.has(card.id)}
                onSelect={(on) => toggle(cards, setCards, card.id, on)}
                busy={busy}
                onAccept={() => decide(true, [card.id], [])}
                onReject={() => decide(false, [card.id], [])}
                onEdit={() => setEditingCard(card)}
                meta={
                  <>
                    <Badge>{card.kind === 'cloze' ? 'Cloze' : 'Basic'}</Badge>
                    <Source locator={card.locator} />
                    {card.concepts.length > 0 && (
                      <span>{card.concepts.map((concept) => concept.name).join(', ')}</span>
                    )}
                    {card.duplicateOf && <Duplicate text={card.duplicateOf.text} />}
                    {card.advice.map((advice) => (
                      <span key={advice} className="flex items-center gap-1">
                        <Lightbulb aria-hidden="true" size={12} />
                        {advice}
                      </span>
                    ))}
                  </>
                }
              >
                <CardMarkdown content={card.front} cardId={card.id} className="text-sm" />
                {card.back && (
                  <CardMarkdown
                    content={card.back}
                    cardId={card.id}
                    className="text-sm text-muted"
                  />
                )}
              </Row>
            ))}
          </ul>
        </section>
      )}

      {drafts.questions.length > 0 && (
        <section aria-labelledby="draft-questions">
          <h2 id="draft-questions" className="mb-2 text-sm font-semibold">
            Questions <Badge>{drafts.questions.length}</Badge>
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {drafts.questions.map((question: DraftQuestion) => (
              <Row
                key={question.id}
                label={`question “${question.stem.slice(0, 40)}”`}
                selected={questions.has(question.id)}
                onSelect={(on) => toggle(questions, setQuestions, question.id, on)}
                busy={busy}
                onAccept={() => decide(true, [], [question.id])}
                onReject={() => decide(false, [], [question.id])}
                onEdit={() => setEditingQuestion(question)}
                meta={
                  <>
                    <Badge>{KIND_LABELS[question.kind]}</Badge>
                    <span>Difficulty {question.difficulty}</span>
                    <Source locator={question.locator} />
                    {question.duplicateOf && <Duplicate text={question.duplicateOf.text} />}
                  </>
                }
              >
                <CardMarkdown content={question.stem} cardId={question.id} className="text-sm" />
                <p className="text-sm text-muted">
                  <span className="font-medium text-text">Answer:</span>{' '}
                  {answerText(question.answer)}
                </p>
              </Row>
            ))}
          </ul>
        </section>
      )}

      <Suspense fallback={null}>
        {editingCard && (
          <CardEditor
            card={editingCard}
            onClose={() => {
              setEditingCard(null);
              onEdited();
            }}
          />
        )}
        {editingQuestion && (
          <QuestionEditor
            question={editingQuestion}
            onClose={() => {
              setEditingQuestion(null);
              onEdited();
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
