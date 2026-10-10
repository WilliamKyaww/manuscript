import type { CodeLink } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Check, Trash2, X } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { StickySection } from '../../components/Page';
import { useApi } from '../../lib/api/context';
import { notifyError } from '../../lib/notify';
import { codeGraphsQuery, conceptCodeQuery, searchCodeQuery, useCodeActions } from '../data/api';

/**
 * Where a concept is implemented (task 16.06): the code of imported repositories that is linked to it,
 * and names that fit and are waiting for a decision. Shown only once a code graph has been imported.
 */

const where = (link: CodeLink) =>
  [link.entity.file, link.entity.location].filter((part) => part !== null).join(' · ');

export function ConceptCodeSection({ conceptId }: { conceptId: string }) {
  const api = useApi();
  const graphs = useQuery(codeGraphsQuery(api));
  const links = useQuery(conceptCodeQuery(api, conceptId));
  const actions = useCodeActions();

  if (!graphs.data || (graphs.data.graphs.length === 0 && (links.data?.links.length ?? 0) === 0))
    return null;

  const accepted = links.data?.links.filter((link) => link.status === 'accepted') ?? [];
  const proposed = links.data?.links.filter((link) => link.status === 'proposed') ?? [];

  return (
    <StickySection
      title="Implemented in"
      description="Code from your imported repositories that implements this concept."
    >
      {accepted.length === 0 && proposed.length === 0 && (
        <p className="text-sm text-muted">No code is linked to this concept yet.</p>
      )}
      {accepted.length > 0 && (
        <ul aria-label="Linked code" className="divide-y divide-border">
          {accepted.map((link) => (
            <li key={link.entity.id} className="flex items-start gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{link.entity.label}</p>
                <p className="text-xs text-muted">
                  {link.entity.graphName}
                  {where(link) && ` · ${where(link)}`}
                </p>
              </div>
              <IconButton
                label={`Unlink ${link.entity.label}`}
                icon={<Trash2 size={14} />}
                size="sm"
                onClick={() =>
                  actions.unlink.mutate(
                    { conceptId, entityId: link.entity.id },
                    { onError: notifyError },
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
      {proposed.length > 0 && (
        <div className="mt-3 space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Suggested from names
          </h3>
          <ul aria-label="Suggested code" className="divide-y divide-border">
            {proposed.map((link) => (
              <li key={link.entity.id} className="flex items-start gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {link.entity.label} <Badge tone="warning">suggested</Badge>
                  </p>
                  <p className="text-xs text-muted">
                    {link.reason}
                    {where(link) && ` ${where(link)}`}
                  </p>
                </div>
                <IconButton
                  label={`Accept ${link.entity.label}`}
                  icon={<Check size={14} />}
                  size="sm"
                  onClick={() =>
                    actions.decide.mutate(
                      { conceptId, entityId: link.entity.id, status: 'accepted' },
                      { onError: notifyError },
                    )
                  }
                />
                <IconButton
                  label={`Reject ${link.entity.label}`}
                  icon={<X size={14} />}
                  size="sm"
                  onClick={() =>
                    actions.decide.mutate(
                      { conceptId, entityId: link.entity.id, status: 'rejected' },
                      { onError: notifyError },
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      <LinkByHand conceptId={conceptId} />
    </StickySection>
  );
}

function LinkByHand({ conceptId }: { conceptId: string }) {
  const api = useApi();
  const actions = useCodeActions();
  const listId = useId();
  const [text, setText] = useState('');
  const found = useQuery(searchCodeQuery(api, text));
  const exact = found.data?.entities.find(
    (candidate) => candidate.label.toLowerCase() === text.trim().toLowerCase(),
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!exact) return;
    actions.link.mutate(
      { conceptId, entityId: exact.id },
      { onError: notifyError, onSuccess: () => setText('') },
    );
  };
  return (
    <form className="mt-3 flex gap-2" onSubmit={submit} aria-label="Link code by hand">
      <Input
        aria-label="Code to link"
        placeholder="Name of a class, function or file"
        list={listId}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <datalist id={listId}>
        {(found.data?.entities ?? []).map((entity) => (
          <option key={entity.id} value={entity.label}>
            {entity.graphName}
          </option>
        ))}
      </datalist>
      <Button type="submit" size="sm" disabled={!exact}>
        Link
      </Button>
    </form>
  );
}
