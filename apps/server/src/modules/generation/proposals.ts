import {
  ConflictError,
  type IdFactory,
  NotFoundError,
  type Proposal,
  type ProposalEdit,
  type ProposalKind,
  type ProposalPayload,
  ValidationError,
} from '@skb/core';
import { formatWikilink, normaliseKey, noteNameFromPath } from '@skb/core/markdown';
import type { Clock } from '../../shared/clock';
import type { EventBus } from '../../shared/events';
import type { Logger } from '../../shared/logger';
import type { ConceptsService } from '../concepts/service';
import type { RelationsService } from '../graph/relations';
import type { LearningRepository } from '../learning/repository';
import { findMentions } from '../notes/mentions';
import type { NotesService } from '../notes/service';
import type {
  Evidence,
  Origin,
  ProposalRow,
  ProposalStatus,
  ProposalsRepository,
} from './proposals-repository';

/**
 * The Inbox of proposals (tasks 11.06–11.09, 11.14, knowledge-system.md §8). AI proposes concepts,
 * relations between them, aliases (merges), links and notes; nothing enters the knowledge base until
 * the student accepts it. Accepting a relation whose end is a proposed concept accepts that concept
 * too; rejecting a concept supersedes the relations that needed it. Rejected proposals are kept, so
 * the same thing is not proposed again.
 */

export interface ProposalsDependencies {
  repo: ProposalsRepository;
  concepts: ConceptsService;
  relations: RelationsService;
  notes: NotesService;
  learning: LearningRepository;
  events: EventBus;
  clock: Clock;
  ids: IdFactory;
  logger: Logger;
}

export interface NewProposal {
  payload: ProposalPayload;
  evidence: Evidence[];
  origin: Origin;
  dedupeKey: string;
}

/** Accepting in this order lets concepts exist before the relations and aliases that use them. */
const ORDER: Record<ProposalKind, number> = { concept: 0, alias: 1, relation: 2, link: 3, note: 4 };

export function createProposalsService(deps: ProposalsDependencies) {
  const { repo, concepts, relations, notes, learning, events, clock, ids, logger } = deps;
  const now = () => clock.now().toISOString();
  const changed = () => events.publish({ type: 'data.changed', area: 'inbox' });

  const view = (row: ProposalRow): Proposal => ({
    id: row.id as Proposal['id'],
    kind: row.kind,
    status: row.status,
    payload: row.payload,
    evidence: row.evidence,
    origin: row.origin.label,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    result: row.result,
  });

  const requirePending = (id: string): ProposalRow => {
    const row = repo.byId(id);
    if (!row) throw new NotFoundError('That proposal does not exist.');
    if (row.status !== 'pending')
      throw new ConflictError(`That proposal has already been ${row.status}.`);
    return row;
  };

  /** A relation end as a concept id: existing, or made by accepting the proposed concept. */
  function endId(end: { conceptId: string | null; proposalId: string | null; name: string }) {
    if (end.conceptId) return end.conceptId;
    const proposal = end.proposalId ? repo.byId(end.proposalId) : null;
    if (!proposal) throw new ValidationError(`The concept “${end.name}” is no longer proposed.`);
    if (proposal.status === 'accepted' && proposal.result) return proposal.result.id;
    if (proposal.status === 'pending') {
      const accepted = acceptRow(proposal, {});
      if (accepted.result) return accepted.result.id;
    }
    throw new ValidationError(
      `The concept “${end.name}” was rejected, so this relation cannot be added.`,
    );
  }

  function coverConcept(conceptId: string, row: ProposalRow) {
    const covered = row.origin.coveredIn;
    if (!covered) return;
    const first = row.evidence[0];
    try {
      relations.create(
        {
          from: conceptId,
          to: covered.id,
          relation: 'covered_in',
          confidence: 'EXTRACTED',
          status: 'accepted',
          evidence: first
            ? [
                {
                  quote: first.quote.slice(0, 1_000),
                  ...(first.locator ? { locator: first.locator } : {}),
                },
              ]
            : [],
        },
        'ai',
      );
    } catch (error) {
      // Already covered there (or the place is gone): the concept itself is what matters.
      if (!(error instanceof ConflictError || error instanceof ValidationError)) throw error;
    }
  }

  function acceptConcept(
    row: ProposalRow,
    payload: Extract<ProposalPayload, { kind: 'concept' }>,
    edit: ProposalEdit,
  ) {
    const name = edit.name ?? payload.name;
    const aliases = edit.aliases ?? payload.aliases;
    if (edit.mergeInto) {
      const target = concepts.get(edit.mergeInto);
      const known = new Set([target.name, ...target.aliases].map(normaliseKey));
      const added = [name, ...aliases].filter((alias) => !known.has(normaliseKey(alias)));
      concepts.update(target.id, { aliases: [...target.aliases, ...new Set(added)] });
      coverConcept(target.id, row);
      return { kind: 'concept', id: target.id };
    }
    const created = concepts.create(
      {
        name,
        aliases: aliases.filter((alias) => normaliseKey(alias) !== normaliseKey(name)),
        summary: edit.summary ?? payload.summary,
        moduleIds: payload.moduleIds as never,
      },
      'ai',
    );
    coverConcept(created.id, row);
    return { kind: 'concept', id: created.id };
  }

  /**
   * Turns the mention into a link. The note may have changed since the suggestion (another link
   * accepted first, an edit), so the mention is found again: the same words, nearest where they were.
   */
  function insertMention(payload: Extract<ProposalPayload, { kind: 'link' }>) {
    const note = notes.get(payload.noteId);
    let names: string[];
    if (payload.target.kind === 'note') {
      const target = notes.get(payload.target.id);
      names = [target.title, noteNameFromPath(target.path)];
    } else {
      const target = concepts.get(payload.target.id);
      names = [target.name, ...target.aliases];
    }
    const match = findMentions(note.content, names)
      .filter((candidate) => candidate.text === payload.text)
      .sort((a, b) => Math.abs(a.offset - payload.offset) - Math.abs(b.offset - payload.offset))[0];
    if (!match)
      throw new ConflictError(`“${payload.text}” is no longer an unlinked mention in this note.`);
    if (payload.target.kind === 'note') {
      const result = notes.linkMention(payload.target.id, {
        sourceId: note.id,
        sourceHash: note.hash,
        offset: match.offset,
        text: match.text,
      });
      return { kind: 'note', id: result.source.id };
    }
    const link =
      normaliseKey(payload.target.title) === normaliseKey(payload.text)
        ? formatWikilink({ target: payload.text })
        : formatWikilink({ target: payload.target.title, alias: payload.text });
    const content = `${note.content.slice(0, match.offset)}${link}${note.content.slice(match.offset + match.length)}`;
    notes.update(note.id, { content, baseHash: note.hash });
    return { kind: 'note', id: note.id };
  }

  function appendRelated(payload: Extract<ProposalPayload, { kind: 'link' }>) {
    const note = notes.get(payload.noteId);
    const link = `- ${formatWikilink({ target: payload.target.title })}`;
    const lines = note.content.replace(/\s+$/u, '').split('\n');
    const heading = lines.findIndex((line) => /^##\s+Related\s*$/iu.test(line));
    if (heading === -1) lines.push('', '## Related', '', link);
    else {
      let end = heading + 1;
      while (end < lines.length && !/^#{1,2}\s/u.test(lines[end] ?? '')) end += 1;
      while (end > heading + 1 && !(lines[end - 1] ?? '').trim()) end -= 1;
      lines.splice(end, 0, link);
    }
    notes.update(note.id, { content: `${lines.join('\n')}\n`, baseHash: note.hash });
    return { kind: 'note', id: note.id };
  }

  function acceptNote(
    row: ProposalRow,
    payload: Extract<ProposalPayload, { kind: 'note' }>,
    edit: ProposalEdit,
  ) {
    const module = row.origin.moduleId ? learning.module(row.origin.moduleId) : null;
    const lecture = row.origin.lectureId ? learning.lecture(row.origin.lectureId) : null;
    const created = notes.create({
      folder: payload.folder,
      title: edit.title ?? payload.title,
      content: edit.content ?? payload.content,
      ...(module ? { module: module.code } : {}),
      ...(module && lecture ? { lecture: `${module.code}/${lecture.key}` } : {}),
    });
    return { kind: 'note', id: created.id };
  }

  function acceptRow(row: ProposalRow, edit: ProposalEdit): ProposalRow {
    const payload = row.payload;
    let result: { kind: string; id: string };
    switch (payload.kind) {
      case 'concept':
        result = acceptConcept(row, payload, edit);
        break;
      case 'alias': {
        const concept = concepts.get(payload.conceptId);
        concepts.update(concept.id, { aliases: [...concept.aliases, payload.alias] });
        coverConcept(concept.id, row);
        result = { kind: 'concept', id: concept.id };
        break;
      }
      case 'relation': {
        const from = endId(payload.from);
        const to = endId(payload.to);
        try {
          const relation = relations.create(
            {
              from,
              to,
              relation: payload.relation,
              // What the student accepts is theirs (data-model.md §5.5); the evidence stays.
              confidence: 'USER',
              status: 'accepted',
              evidence: row.evidence.slice(0, 10).map((item) => ({
                quote: item.quote.slice(0, 1_000),
                ...(item.locator ? { locator: item.locator } : {}),
              })),
            },
            'ai',
          );
          result = { kind: 'relation', id: relation.id };
        } catch (error) {
          if (!(error instanceof ConflictError)) throw error;
          // The relation (or its reverse) was stated meanwhile: nothing left to add.
          repo.decide(row.id, 'superseded', now());
          return repo.byId(row.id) as ProposalRow;
        }
        break;
      }
      case 'link':
        result = payload.variant === 'mention' ? insertMention(payload) : appendRelated(payload);
        break;
      default:
        result = acceptNote(row, payload, edit);
    }
    repo.decide(row.id, 'accepted', now(), result);
    return repo.byId(row.id) as ProposalRow;
  }

  function rejectRow(row: ProposalRow): void {
    repo.decide(row.id, 'rejected', now());
    // Relations that needed this concept can no longer be added.
    if (row.kind === 'concept')
      for (const relation of repo.relationsReferring(row.id))
        repo.decide(relation.id, 'superseded', now());
  }

  return {
    /** Records new proposals, skipping any already pending (returned instead) or once rejected. */
    propose(proposal: NewProposal): ProposalRow | null {
      const existing = repo.byKey(proposal.dedupeKey);
      if (existing.pending) return existing.pending;
      if (existing.rejected) return null;
      const id = ids('proposal');
      repo.insert({ id, kind: proposal.payload.kind, ...proposal, createdAt: now() });
      return repo.byId(id);
    },

    list(status: ProposalStatus, kind?: ProposalKind): Proposal[] {
      return repo.list(status, kind).map(view);
    },

    pendingCount: () => repo.pendingCount(),

    accept(id: string, edit: ProposalEdit = {}): Proposal {
      const row = requirePending(id);
      const accepted = acceptRow(row, edit);
      changed();
      return view(accepted);
    },

    /** Accepts without announcing (auto-accept during a generation job, which announces once). */
    acceptQuietly(id: string): ProposalRow {
      return acceptRow(requirePending(id), {});
    },

    reject(id: string): Proposal {
      const row = requirePending(id);
      rejectRow(row);
      changed();
      return view(repo.byId(id) as ProposalRow);
    },

    bulk(proposalIds: readonly string[], action: 'accept' | 'reject') {
      const rows = proposalIds
        .map((id) => repo.byId(id))
        .filter((row): row is ProposalRow => row !== null)
        .sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
      let done = 0;
      const failed: string[] = [];
      for (const row of rows) {
        // An earlier accept may have accepted (or a reject superseded) this one already.
        const current = repo.byId(row.id);
        if (current?.status !== 'pending') continue;
        try {
          if (action === 'accept') acceptRow(current, {});
          else rejectRow(current);
          done += 1;
        } catch (error) {
          logger.warn('inbox.bulk.failed', { id: row.id, error });
          failed.push(row.id);
        }
      }
      changed();
      return { done, failed };
    },
  };
}

export type ProposalsService = ReturnType<typeof createProposalsService>;
