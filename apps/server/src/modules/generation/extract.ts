import {
  type DuplicateMatch,
  findDuplicate,
  GeneratedConceptsSchema,
  type NamedConcept,
  normaliseConceptName,
  RELATIONS,
} from '@skb/core';
import { z } from 'zod';
import type { Logger } from '../../shared/logger';
import type { AiService } from '../ai/service';
import type { RelationsRepository } from '../graph/relations-repository';
import type { MaterialPassage } from './material';
import { askFor, conceptsPrompt, materialMessage, samePrompt } from './prompts';
import type { ProposalsService } from './proposals';
import type { Evidence, Origin, ProposalRow } from './proposals-repository';
import { generateStructured } from './structured';
import { passageFor, type TaskContext, type TaskOutcome, type TaskRunners } from './tasks';

/**
 * Concept and relation extraction (tasks 11.06–11.07). The model names the concepts in the material
 * and how they relate, with Graphify's confidence rubric and a quote as evidence. Each name is then
 * checked against the concepts that exist: the same name (or an alias) is the same concept; a near
 * spelling becomes an alias proposal (a merge); a name in the doubtful band is put to the fast model
 * when there is one, and otherwise proposed as new with the likely match shown beside it.
 */

export interface ExtractDependencies {
  ai: AiService;
  proposals: ProposalsService;
  relationsRepo: RelationsRepository;
  runners: TaskRunners;
  logger: Logger;
}

type End = { conceptId: string | null; proposalId: string | null; name: string };

const SameSchema = z.object({ same: z.boolean() });

export function createExtractor(deps: ExtractDependencies) {
  const { ai, proposals, relationsRepo, runners, logger } = deps;

  /** Whether a name in the doubtful band is the same concept, by the fast model; null if unknown. */
  async function judge(name: string, other: string, signal: AbortSignal): Promise<boolean | null> {
    if (!ai.status().roles.fast.ready) return null;
    try {
      const { object } = await generateStructured(ai, {
        role: 'fast',
        schema: SameSchema,
        system: samePrompt(),
        content: `First: ${name}\nSecond: ${other}`,
        purpose: 'compare concept names',
        maxOutputTokens: 100,
        signal,
      });
      return object.same;
    } catch (error) {
      logger.warn('generation.judge-failed', { error });
      return null;
    }
  }

  const evidenceOf = (passage: MaterialPassage, quote: string): Evidence => ({
    quote: (quote.trim() || passage.text).slice(0, 600),
    title: passage.title,
    label: passage.label,
    locator: passage.locator,
  });

  return {
    async run(context: TaskContext): Promise<TaskOutcome> {
      const { request, material, signal } = context;
      const known = runners.knownConcepts();
      const { object } = await generateStructured(ai, {
        role: 'chat',
        schema: GeneratedConceptsSchema,
        system: conceptsPrompt(
          request,
          known.flatMap((concept) => concept.names[0] ?? []),
        ),
        content: materialMessage(material.passages, askFor('concepts', request.count)),
        purpose: 'extract concepts',
        maxOutputTokens: context.maxOutputTokens,
        signal,
      });
      context.progress(0.75, 'Comparing with your concepts');

      const origin: Origin = {
        label: `Concepts from ${material.label}`,
        jobId: context.jobId,
        moduleId: material.moduleId,
        lectureId: material.lectureId,
        coveredIn: material.coveredIn,
      };
      const ends = new Map<string, End>();
      const batch: NamedConcept[] = [];
      const made: ProposalRow[] = [];
      let skipped = 0;
      const keep = (row: ProposalRow | null) => {
        if (row && !made.some((other) => other.id === row.id)) made.push(row);
        return row;
      };

      for (const concept of object.concepts.slice(0, request.count)) {
        const name = concept.name.replace(/\s+/gu, ' ').trim().slice(0, 120);
        const passage = passageFor(material.passages, concept.source);
        const key = normaliseConceptName(name);
        if (!name || !key || !passage || ends.has(key)) {
          skipped += 1;
          continue;
        }
        const aliases = [
          ...new Set(
            concept.aliases
              .map((alias) => alias.trim())
              .filter((alias) => alias && normaliseConceptName(alias) !== key),
          ),
        ].slice(0, 10);
        const evidence = [evidenceOf(passage, concept.quote)];
        const same = findDuplicate([name, ...aliases], batch);
        if (same && same.kind !== 'maybe') {
          ends.set(
            key,
            ends.get(normaliseConceptName(same.name)) ?? {
              conceptId: null,
              proposalId: same.id,
              name: same.name,
            },
          );
          continue;
        }
        const match: DuplicateMatch | null = findDuplicate([name, ...aliases], known);
        let judged: boolean | null = null;
        if (match?.kind === 'maybe') judged = await judge(name, match.name, signal);
        if (match && (match.kind === 'exact' || match.kind === 'similar' || judged === true)) {
          ends.set(key, { conceptId: match.id, proposalId: null, name: match.name });
          if (match.kind !== 'exact')
            keep(
              proposals.propose({
                payload: {
                  kind: 'alias',
                  conceptId: match.id,
                  conceptName: match.name,
                  alias: name,
                  similarity: 'score' in match ? match.score : 1,
                  judged: judged === true,
                },
                evidence,
                origin,
                dedupeKey: `alias:${match.id}:${key}`,
              }),
            );
          continue;
        }
        const row = keep(
          proposals.propose({
            payload: {
              kind: 'concept',
              name,
              aliases,
              summary: concept.summary.trim().slice(0, 2_000),
              moduleIds: material.moduleId ? [material.moduleId] : [],
              similarTo:
                match?.kind === 'maybe' && judged === null
                  ? { id: match.id, name: match.name, score: match.score }
                  : null,
            },
            evidence,
            origin,
            dedupeKey: `concept:${key}`,
          }),
        );
        if (!row) {
          // Rejected before: not proposed again, and relations to it are left out.
          skipped += 1;
          continue;
        }
        ends.set(key, { conceptId: null, proposalId: row.id, name });
        batch.push({ id: row.id, names: [name, ...aliases] });
      }

      const endOf = (name: string): End | null => {
        const key = normaliseConceptName(name);
        const found = ends.get(key);
        if (found) return found;
        const match = findDuplicate([name], known);
        return match && match.kind !== 'maybe'
          ? { conceptId: match.id, proposalId: null, name: match.name }
          : null;
      };
      const idOf = (end: End) => end.conceptId ?? end.proposalId ?? '';

      for (const relation of object.relations) {
        let from = endOf(relation.from);
        let to = endOf(relation.to);
        const passage = passageFor(material.passages, relation.source);
        if (!from || !to || !passage || idOf(from) === idOf(to)) {
          skipped += 1;
          continue;
        }
        // Symmetric relations are kept once, smaller id first (as stored).
        if (RELATIONS[relation.relation].symmetric && idOf(to) < idOf(from))
          [from, to] = [to, from];
        if (from.conceptId && to.conceptId) {
          const exists =
            relationsRepo.find(from.conceptId, to.conceptId, relation.relation) ??
            relationsRepo.find(to.conceptId, from.conceptId, relation.relation);
          if (exists) continue;
        }
        keep(
          proposals.propose({
            payload: {
              kind: 'relation',
              from,
              to,
              relation: relation.relation,
              confidence: relation.confidence,
              score:
                relation.confidence === 'INFERRED' && relation.score !== null
                  ? Math.min(0.95, Math.max(0.55, relation.score))
                  : null,
            },
            evidence: [evidenceOf(passage, relation.quote)],
            origin,
            dedupeKey: `relation:${idOf(from)}:${relation.relation}:${idOf(to)}`,
          }),
        );
      }

      const auto = context.autoAccept;
      let accepted = 0;
      for (const row of made) {
        const wanted =
          (row.kind === 'concept' && auto.concepts) ||
          (row.kind === 'alias' && auto.aliases) ||
          (row.kind === 'relation' && auto.relations);
        if (!wanted || row.status !== 'pending') continue;
        try {
          proposals.acceptQuietly(row.id);
          accepted += 1;
        } catch (error) {
          // A concept name taken meanwhile, say: it stays in the Inbox for the student.
          logger.warn('generation.auto-accept-failed', { id: row.id, error });
        }
      }
      const pending = made.length - accepted;
      return {
        created: made.length,
        skipped,
        summary: `${made.length} proposal${made.length === 1 ? '' : 's'} (${made.filter((row) => row.kind === 'concept').length} concepts, ${made.filter((row) => row.kind === 'relation').length} relations, ${made.filter((row) => row.kind === 'alias').length} merges)${pending ? ' to review in the Inbox' : ' accepted'}.`,
      };
    },
  };
}
