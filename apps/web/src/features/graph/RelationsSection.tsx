import { CONCEPT_RELATIONS, RELATIONS, type Relation, type StoredRelation } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Check, Trash2, X } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { StickySection } from '../../components/Page';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { describeError, notifyError } from '../../lib/notify';
import { conceptsQuery } from '../concepts/api';
import { selectClasses } from '../learning/Field';
import { relationsQuery, useRelationActions } from './api';
import { confidenceLabel, EdgeStyleMark, hasPage, useOpenNode } from './nodes';

/**
 * A concept's typed relations (task 7.10): what it is a prerequisite for, part of, an example of,
 * contrasted with… Proposed or inferred relations can be accepted (the student then vouches for
 * them) or rejected; a rejected relation is kept, so it is not proposed again.
 */

/** Each relation offered both ways round, as it reads from this concept. */
const CHOICES = CONCEPT_RELATIONS.flatMap((relation) => {
  const { label, inverseLabel, symmetric } = RELATIONS[relation];
  const forwards = { value: `${relation}:out`, label, relation, reverse: false };
  return symmetric
    ? [forwards]
    : [forwards, { value: `${relation}:in`, label: inverseLabel, relation, reverse: true }];
});

function RelationRow({ relation, conceptId }: { relation: Relation; conceptId: string }) {
  const actions = useRelationActions();
  const open = useOpenNode();
  const outgoing = relation.from.id === conceptId;
  const other = outgoing ? relation.to : relation.from;
  const definition = RELATIONS[relation.relation];
  const phrase = outgoing ? definition.label : definition.inverseLabel;
  const unconfirmed =
    relation.status === 'proposed' ||
    relation.confidence === 'INFERRED' ||
    relation.confidence === 'AMBIGUOUS';
  const quote = relation.evidence.find((item) => item.quote)?.quote;
  return (
    <li className="flex items-start gap-3 py-2">
      <EdgeStyleMark confidence={relation.confidence} />
      <div className="min-w-0 flex-1 text-sm">
        <p>
          <span className="text-muted">{phrase} </span>
          {hasPage(other.type) ? (
            <button
              type="button"
              className="font-medium hover:underline focus-visible:outline-2 focus-visible:outline-focus"
              onClick={() => open(other)}
            >
              {other.label}
            </button>
          ) : (
            <span className="font-medium">{other.label}</span>
          )}
          {relation.status === 'proposed' && (
            <Badge tone="warning" className="ml-2">
              proposed
            </Badge>
          )}
        </p>
        {relation.confidence !== 'USER' && (
          <p className="text-xs text-muted">
            {confidenceLabel(relation.confidence)}
            {relation.score !== null && ` (score ${relation.score})`}
            {relation.createdBy === 'ai' && ' · suggested by the assistant'}
          </p>
        )}
        {quote && <p className="mt-0.5 text-xs italic text-muted">“{quote}”</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        {unconfirmed && (
          <>
            <IconButton
              label={`Accept: ${phrase} ${other.label}`}
              icon={<Check size={14} />}
              size="sm"
              onClick={() =>
                actions.update.mutate(
                  { id: relation.id, status: 'accepted', confidence: 'USER' },
                  { onError: notifyError },
                )
              }
            />
            <IconButton
              label={`Reject: ${phrase} ${other.label}`}
              icon={<X size={14} />}
              size="sm"
              onClick={() =>
                actions.update.mutate(
                  { id: relation.id, status: 'rejected' },
                  { onError: notifyError },
                )
              }
            />
          </>
        )}
        {!unconfirmed && (
          <IconButton
            label={`Remove: ${phrase} ${other.label}`}
            icon={<Trash2 size={14} />}
            size="sm"
            onClick={() => actions.remove.mutate(relation.id, { onError: notifyError })}
          />
        )}
      </div>
    </li>
  );
}

function AddRelation({ conceptId }: { conceptId: string }) {
  const api = useApi();
  const concepts = useQuery(conceptsQuery(api));
  const actions = useRelationActions();
  const listId = useId();
  const [choice, setChoice] = useState(CHOICES[1]?.value ?? '');
  const [target, setTarget] = useState('');
  const [quote, setQuote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const others = (concepts.data?.concepts ?? []).filter((concept) => concept.id !== conceptId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const selected = CHOICES.find((option) => option.value === choice);
    const wanted = target.trim().toLowerCase();
    const other = others.find(
      (concept) =>
        concept.name.toLowerCase() === wanted ||
        concept.aliases.some((alias) => alias.toLowerCase() === wanted),
    );
    if (!selected) return;
    if (!other) {
      setError('Choose an existing concept (create it first on the Concepts page).');
      return;
    }
    const [from, to] = selected.reverse ? [other.id, conceptId] : [conceptId, other.id];
    actions.create.mutate(
      {
        from,
        to,
        relation: selected.relation as StoredRelation,
        ...(quote.trim() ? { evidence: [{ quote: quote.trim() }] } : {}),
      },
      {
        onSuccess: () => {
          setTarget('');
          setQuote('');
          setError(null);
        },
        onError: (reason) => setError(describeError(reason).description),
      },
    );
  };

  return (
    <form className="space-y-2" onSubmit={submit}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Relation"
          className={cn(selectClasses, 'w-52')}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          {CHOICES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Input
          aria-label="Related concept"
          placeholder="Concept"
          list={listId}
          className="w-56"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
        <datalist id={listId}>
          {others.map((concept) => (
            <option key={concept.id} value={concept.name} />
          ))}
        </datalist>
        <Input
          aria-label="Evidence (optional)"
          placeholder="Evidence, e.g. a sentence from the slides"
          className="min-w-48 flex-1"
          value={quote}
          onChange={(event) => setQuote(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!target.trim()}
          loading={actions.create.isPending}
        >
          Add relation
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

export function RelationsSection({ conceptId }: { conceptId: string }) {
  const api = useApi();
  const relations = useQuery(relationsQuery(api, conceptId));
  return (
    <section id="relations" className="scroll-mt-4">
      <StickySection
        title="Relations"
        description="How this concept relates to others. Dashed and dotted lines were inferred, not stated."
      >
        {relations.isPending ? (
          <LoadingState label="Loading relations" />
        ) : relations.isError ? (
          <ErrorState
            message="Relations could not be loaded."
            onRetry={() => relations.refetch()}
          />
        ) : (
          <>
            {relations.data.relations.length > 0 && (
              <ul aria-label="Relations" className="mb-3 divide-y divide-border">
                {relations.data.relations.map((relation) => (
                  <RelationRow key={relation.id} relation={relation} conceptId={conceptId} />
                ))}
              </ul>
            )}
            <AddRelation conceptId={conceptId} />
          </>
        )}
      </StickySection>
    </section>
  );
}
