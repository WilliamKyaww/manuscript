// The recall calibration report (Phase 21, task 21.04): does a face the scheduler gives a 90 % chance
// get recalled about nine times in ten? Reads a vault's database READ-ONLY and changes nothing.
//
//   npm run report:calibration -- "C:\Users\you\Documents\Manuscript"   (any vault folder)
//   npm run report:calibration -- --simulate                          (simulated students)
//
// Close nothing first: SQLite lets this read beside a running Manuscript. Only reviews of faces in
// the review state count (learning steps are minutes apart). A few hundred reviews make the bins
// meaningful; with fewer the report says so.
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  type CalibrationReport,
  calibrate,
  createScheduler,
  DEFAULT_REVIEW_SETTINGS,
  type RecallObservation,
  ReviewSettingsSchema,
  ScheduleSchema,
  simulateRecall,
} from '@skb/core';

const pct = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)} %`);

function print(title: string, report: CalibrationReport): void {
  console.log(`\n${title}`);
  console.log(
    `  ${report.count} reviews · predicted ${pct(report.meanPredicted)} · recalled ${pct(report.recalled)} · ` +
      `calibration error ${pct(report.expectedCalibrationError)} · Brier ${report.brier?.toFixed(3) ?? '—'} · ` +
      `log loss ${report.logLoss?.toFixed(3) ?? '—'}`,
  );
  console.log('  predicted         reviews   mean predicted   recalled');
  for (const bin of report.bins)
    console.log(
      `  ${`${pct(bin.from)}–${pct(bin.to)}`.padEnd(18)}${String(bin.count).padStart(7)}   ${pct(bin.meanPredicted).padStart(14)}   ${pct(bin.recalled).padStart(8)}`,
    );
  if (report.count < 300)
    console.log('  (Fewer than 300 reviews: read the figures as a first look, not a verdict.)');
}

function fromVault(folder: string): RecallObservation[] {
  const file = path.join(folder, '.skb', 'skb.db');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const stored = db.prepare("SELECT value_json FROM settings WHERE key = 'review'").get() as
      | { value_json: string }
      | undefined;
    const settings = ReviewSettingsSchema.parse({
      ...DEFAULT_REVIEW_SETTINGS,
      ...(stored ? (JSON.parse(stored.value_json) as object) : {}),
    });
    const scheduler = createScheduler(settings);
    const rows = db
      .prepare(
        `SELECT l.rating, l.previous_json, l.reviewed_at FROM review_logs l
         WHERE l.kind = 'review' AND NOT EXISTS (SELECT 1 FROM review_logs u WHERE u.undoes = l.id)
         ORDER BY l.reviewed_at`,
      )
      .all() as { rating: number; previous_json: string; reviewed_at: string }[];
    const observations: RecallObservation[] = [];
    for (const row of rows) {
      const previous = ScheduleSchema.parse(JSON.parse(row.previous_json));
      if (previous.state !== 'review') continue;
      const predicted = scheduler.retrievability(previous, new Date(row.reviewed_at));
      if (predicted !== null) observations.push({ predicted, recalled: row.rating > 1 });
    }
    return observations;
  } finally {
    db.close();
  }
}

const target = process.argv[2];
if (!target || target === '--help') {
  console.log('Usage: npm run report:calibration -- <vault folder> | --simulate');
  process.exit(target ? 0 : 1);
}
if (target === '--simulate') {
  for (const [memory, label] of [
    [1, 'A student who forgets exactly as FSRS predicts'],
    [0.5, 'A student whose memories last half as long as predicted'],
    [0.25, 'A student whose memories last a quarter as long'],
  ] as const)
    print(label, calibrate(simulateRecall({ faces: 500, days: 365, memory, seed: 21 })));
} else {
  print(`Recall calibration for ${target}`, calibrate(fromVault(target)));
}
