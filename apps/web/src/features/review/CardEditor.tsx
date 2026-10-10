import {
  type Card,
  type CardKind,
  cardHints,
  faceContent,
  faceOrdinals,
  type Locator,
  nextClozeNumber,
} from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { formatCount } from '../../lib/format';
import { describeError, notifySuccess } from '../../lib/notify';
import { readPreference, writePreference } from '../../lib/storage';
import { ConceptPicker } from '../concepts/ConceptPicker';
import { Field, FormError, selectClasses } from '../learning/Field';
import { cardSetsQuery, useCardActions } from './api';
import { CardMarkdown } from './CardMarkdown';
import type { CardDraft } from './quick-add';

/**
 * Writing a card (task 8.07): basic, reversed or cloze, Markdown with maths, a live preview of the
 * first face, concepts, and hints for good cards. Used for new cards (quick add, set pages, "make
 * card from selection") and for editing (set pages, the review session).
 */

const LAST_SET = 'skb.cards.last-set';

const KINDS: { value: CardKind; label: string; hint: string }[] = [
  { value: 'basic', label: 'Basic', hint: 'Question → answer' },
  { value: 'reversed', label: 'Reversed', hint: 'Both ways round' },
  { value: 'cloze', label: 'Cloze', hint: 'Fill in the gap' },
];

const textareaClasses =
  'w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-text';

export function CardEditor({
  card,
  draft,
  onClose,
  onSaved,
}: {
  card?: Card;
  draft?: CardDraft;
  onClose(): void;
  onSaved?(card: Card): void;
}) {
  const api = useApi();
  const sets = useQuery(cardSetsQuery(api));
  const actions = useCardActions();
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const formId = useId();
  const [setId, setSetId] = useState(card?.setId ?? draft?.setId ?? readPreference(LAST_SET) ?? '');
  const [newSetTitle, setNewSetTitle] = useState('');
  const [kind, setKind] = useState<CardKind>(card?.kind ?? draft?.kind ?? 'basic');
  const [front, setFront] = useState(card?.front ?? draft?.front ?? '');
  const [back, setBack] = useState(card?.back ?? draft?.back ?? '');
  const [extra, setExtra] = useState(card?.extra ?? draft?.extra ?? '');
  const [conceptIds, setConceptIds] = useState<string[]>(
    card?.concepts.map((concept) => concept.id) ?? draft?.conceptIds ?? [],
  );
  const [draftOnly, setDraftOnly] = useState(card?.status === 'draft');
  const [error, setError] = useState<string | null>(null);
  const locator: Locator | null = card?.locator ?? draft?.locator ?? null;

  const allSets = sets.data?.sets ?? [];
  const chosenSet = allSets.some((set) => set.id === setId) ? setId : (allSets[0]?.id ?? '');
  const content = { kind, front, back: kind === 'cloze' ? '' : back, extra };
  const hints = front.trim() ? cardHints(content) : [];
  const faces = faceOrdinals(kind, front);
  const preview = faces.length > 0 ? faceContent(content, faces[0] as number) : null;

  const insertCloze = () => {
    const area = frontRef.current;
    const start = area?.selectionStart ?? front.length;
    const end = area?.selectionEnd ?? front.length;
    const selected = front.slice(start, end) || 'answer';
    const cloze = `{{c${nextClozeNumber(front)}::${selected}}}`;
    setFront(`${front.slice(0, start)}${cloze}${front.slice(end)}`);
    setKind('cloze');
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + cloze.length, start + cloze.length);
    });
  };

  const saving =
    actions.createCard.isPending || actions.updateCard.isPending || actions.createSet.isPending;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      let target = chosenSet;
      if (!target) {
        if (!newSetTitle.trim()) {
          setError('Name a set for the card first.');
          return;
        }
        target = (await actions.createSet.mutateAsync({ title: newSetTitle.trim() })).id;
      }
      writePreference(LAST_SET, target);
      const body = {
        setId: target,
        kind,
        front,
        back: kind === 'cloze' ? '' : back,
        extra,
        conceptIds,
        status: draftOnly ? ('draft' as const) : ('active' as const),
        ...(locator ? { locator } : {}),
      };
      const saved = card
        ? await actions.updateCard.mutateAsync({ id: card.id, ...body })
        : await actions.createCard.mutateAsync(body);
      if (!card) notifySuccess(`Card added: ${formatCount(saved.faces.length, 'face')} to review`);
      onSaved?.(saved);
      onClose();
    } catch (reason) {
      setError(describeError(reason).description);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={card ? 'Edit card' : 'New card'}
      size="lg"
      footer={
        // In the footer, so saving is always in view however long the card is.
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draftOnly} onChange={() => setDraftOnly(!draftOnly)} />
            Keep as a draft (not reviewed yet)
          </label>
          <div className="flex gap-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={saving}>
              {card ? 'Save' : 'Add card'}
            </Button>
          </div>
        </div>
      }
    >
      <form id={formId} className="space-y-4" onSubmit={submit}>
        <div className="flex flex-wrap items-end gap-3">
          {allSets.length > 0 ? (
            <Field label="Set" className="min-w-56 flex-1">
              {(id) => (
                <select
                  id={id}
                  className={selectClasses}
                  value={chosenSet}
                  onChange={(event) => setSetId(event.target.value)}
                >
                  {allSets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.module ? `${set.module.code} · ` : ''}
                      {set.title}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : (
            <Field label="New set" hint="You have no card sets yet." className="min-w-56 flex-1">
              {(id, hint) => (
                <Input
                  id={id}
                  aria-describedby={hint}
                  value={newSetTitle}
                  placeholder="e.g. Distributed Systems"
                  onChange={(event) => setNewSetTitle(event.target.value)}
                />
              )}
            </Field>
          )}
          <fieldset className="flex gap-1">
            <legend className="mb-1 text-sm font-medium">Kind</legend>
            {KINDS.map((option) => (
              <label
                key={option.value}
                title={option.hint}
                className={cn(
                  'cursor-pointer rounded-md border px-3 py-1.5 text-sm',
                  kind === option.value
                    ? 'border-accent bg-accent-subtle text-text'
                    : 'border-border-strong hover:bg-surface-hover',
                )}
              >
                <input
                  type="radio"
                  name="card-kind"
                  value={option.value}
                  checked={kind === option.value}
                  onChange={() => setKind(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </div>

        <Field
          label={kind === 'cloze' ? 'Text' : 'Front'}
          hint={
            kind === 'cloze'
              ? 'Select what to recall and press Cloze (Ctrl+Shift+C). Each number becomes one face.'
              : 'A question with one right answer. Markdown and $maths$ work.'
          }
        >
          {(id, hint) => (
            <div className="space-y-1.5">
              <textarea
                id={id}
                ref={frontRef}
                aria-describedby={hint}
                required
                rows={3}
                className={textareaClasses}
                value={front}
                onChange={(event) => setFront(event.target.value)}
                onKeyDown={(event) => {
                  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c') {
                    event.preventDefault();
                    insertCloze();
                  }
                }}
              />
              <Button type="button" size="sm" onClick={insertCloze}>
                Cloze
              </Button>
            </div>
          )}
        </Field>
        {kind !== 'cloze' && (
          <Field label="Back">
            {(id) => (
              <textarea
                id={id}
                rows={3}
                className={textareaClasses}
                value={back}
                onChange={(event) => setBack(event.target.value)}
              />
            )}
          </Field>
        )}
        <Field label="Extra" hint="Shown after the answer: context, a mnemonic, where it is from.">
          {(id, hint) => (
            <textarea
              id={id}
              aria-describedby={hint}
              rows={2}
              className={textareaClasses}
              value={extra}
              onChange={(event) => setExtra(event.target.value)}
            />
          )}
        </Field>

        <ConceptPicker value={conceptIds} onChange={setConceptIds} />

        {preview && (
          <section
            aria-label="Preview"
            className="rounded-lg border border-border bg-surface-sunken p-3"
          >
            <p className="eyebrow mb-1">
              Preview{faces.length > 1 ? ` (face 1 of ${faces.length})` : ''}
            </p>
            <CardMarkdown content={preview.front} cardId={card?.id ?? 'new-card'} />
            <hr className="my-2 border-border" />
            <CardMarkdown content={preview.back} cardId={card?.id ?? 'new-card'} />
          </section>
        )}
        {hints.length > 0 && (
          <ul
            aria-label="Hints"
            className="space-y-1 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning"
          >
            {hints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        )}
        <FormError error={error} />
      </form>
    </Dialog>
  );
}
