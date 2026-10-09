/**
 * Mastery performance check (Phase 9, ADR-0032). Mastery is recomputed in one pass over all the
 * evidence whenever something changed, so the pass must stay cheap. Generates a year's worth of
 * learning — 1,000 concepts in 10 modules, 5,000 reviewed cards with 15,000 review logs, 2,000
 * questions with 20,000 answers over 60 days — straight into the database, then times the pass.
 * Run with `npm run test:perf:mastery`. Exits with code 1 if the budget is exceeded.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createIdFactory, DEFAULT_REVIEW_SETTINGS } from '@skb/core';
import { loadMigrations, migrate } from '../../src/db/migrate';
import { openDatabase } from '../../src/db/sqlite';
import { computeSnapshot } from '../../src/modules/mastery/compute';
import { createMasteryRepository } from '../../src/modules/mastery/repository';
import { cacheRows } from '../../src/modules/mastery/service';
import { systemClock } from '../../src/shared/clock';

const BUDGET_MS = 500;
const MODULES = 10;
const CONCEPTS = 1_000;
const CARDS = 5_000;
const REVIEWS_PER_CARD = 3;
const QUESTIONS = 2_000;
const ANSWERS = 20_000;
const DAY = 86_400_000;

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const dir = mkdtempSync(path.join(tmpdir(), 'skb-perf-mastery-'));
const db = openDatabase(path.join(dir, 'skb.db'));
try {
  migrate(db, loadMigrations(), systemClock);
  const ids = createIdFactory();
  const next = random(9);
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const at = iso(now);

  db.transaction(() => {
    const modules: string[] = [];
    for (let m = 0; m < MODULES; m += 1) {
      const id = ids('module');
      modules.push(id);
      db.run(
        `INSERT INTO modules (id, code, code_key, title, credits, created_at, updated_at)
         VALUES (?, ?, ?, ?, 15, ?, ?)`,
        [id, `PERF${m}`, `perf${m}`, `Module ${m}`, at, at],
      );
      db.run(
        `INSERT INTO assessments (id, module_id, title, kind, weight, due_at, created_at, updated_at)
         VALUES (?, ?, 'Exam', 'exam', 0.7, ?, ?, ?)`,
        [ids('assessment'), id, iso(now + (10 + m * 5) * DAY).slice(0, 10), at, at],
      );
    }
    const concepts: string[] = [];
    for (let c = 0; c < CONCEPTS; c += 1) {
      const id = ids('concept');
      concepts.push(id);
      db.run(
        `INSERT INTO concepts (id, name, name_key, slug, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, `Concept ${c}`, `concept ${c}`, `concept-${c}`, at, at],
      );
      db.run('INSERT INTO concept_modules (concept_id, module_id) VALUES (?, ?)', [
        id,
        modules[c % MODULES] as string,
      ]);
    }
    const set = ids('cardSet');
    db.run('INSERT INTO card_sets (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      set,
      'Perf',
      at,
      at,
    ]);
    for (let k = 0; k < CARDS; k += 1) {
      const card = ids('card');
      db.run(
        `INSERT INTO cards (id, set_id, kind, front, back, created_at, updated_at)
         VALUES (?, ?, 'basic', ?, 'Back', ?, ?)`,
        [card, set, `Front ${k}`, at, at],
      );
      db.run('INSERT INTO card_concepts (card_id, concept_id) VALUES (?, ?)', [
        card,
        concepts[k % CONCEPTS] as string,
      ]);
      let last = now - 60 * DAY;
      let schedule = '';
      for (let r = 0; r < REVIEWS_PER_CARD; r += 1) {
        last += Math.floor(next() * 15 * DAY);
        const stability = 2 + next() * 40;
        const previous = schedule || null;
        schedule = JSON.stringify({
          due: iso(last + stability * DAY),
          stability,
          difficulty: 5,
          elapsedDays: 3,
          scheduledDays: Math.round(stability),
          learningSteps: 0,
          reps: r + 1,
          lapses: 0,
          state: 'review',
          lastReview: iso(last),
        });
        db.run(
          `INSERT INTO review_logs (id, kind, card_id, ordinal, rating, previous_json, next_json,
             reviewed_at) VALUES (?, 'review', ?, 0, ?, ?, ?, ?)`,
          [ids('review'), card, next() < 0.1 ? 1 : 3, previous ?? schedule, schedule, iso(last)],
        );
      }
      db.run(
        `INSERT INTO card_schedules (card_id, ordinal, state, due, schedule_json)
         VALUES (?, 0, 'review', ?, ?)`,
        [card, iso(last + DAY), schedule],
      );
    }
    const quiz = ids('quiz');
    db.run(
      `INSERT INTO quizzes (id, title, kind, config_json, created_at)
       VALUES (?, 'Perf', 'practice', '{"scope":{},"count":10}', ?)`,
      [quiz, at],
    );
    const attempt = ids('attempt');
    db.run('INSERT INTO quiz_attempts (id, quiz_id, started_at) VALUES (?, ?, ?)', [
      attempt,
      quiz,
      at,
    ]);
    const questions: string[] = [];
    for (let q = 0; q < QUESTIONS; q += 1) {
      const id = ids('question');
      questions.push(id);
      db.run(
        `INSERT INTO questions (id, kind, stem, answer_json, created_at, updated_at)
         VALUES (?, 'true_false', ?, '{"kind":"true_false","value":true}', ?, ?)`,
        [id, `Question ${q}`, at, at],
      );
      db.run('INSERT INTO question_concepts (question_id, concept_id) VALUES (?, ?)', [
        id,
        concepts[q % CONCEPTS] as string,
      ]);
    }
    for (let a = 0; a < ANSWERS; a += 1) {
      db.run(
        `INSERT INTO answers (id, attempt_id, question_id, response_json, score, graded_by,
           graded_at, assisted, answered_at)
         VALUES (?, ?, ?, '{"kind":"true_false","value":true}', ?, 'auto', ?, ?, ?)`,
        [
          ids('answer'),
          attempt,
          questions[a % QUESTIONS] as string,
          next() < 0.7 ? 1 : 0,
          at,
          next() < 0.1 ? 1 : 0,
          iso(now - Math.floor(next() * 60 * DAY)),
        ],
      );
    }
  });

  const repo = createMasteryRepository(db);
  const times: number[] = [];
  let concepts = 0;
  for (let run = 0; run < 5; run += 1) {
    const start = performance.now();
    const snapshot = computeSnapshot(repo, DEFAULT_REVIEW_SETTINGS, new Date());
    repo.writeCache(cacheRows(snapshot), snapshot.computedAt);
    times.push(performance.now() - start);
    concepts = snapshot.concepts.size;
  }
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] as number;
  console.table([
    { measure: `Mastery pass (${concepts} concepts), first`, ms: Math.round(times[0] as number) },
    { measure: 'Mastery pass, median of 5', ms: Math.round(median), budget: `< ${BUDGET_MS} ms` },
  ]);
  if (median >= BUDGET_MS) {
    console.error('Over budget: the mastery pass.');
    process.exitCode = 1;
  } else console.log('The mastery budget is met.');
} finally {
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
