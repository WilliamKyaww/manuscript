import { PLAN, PLAN_ITEM_STATUSES, PlanItemIdSchema } from '@skb/core';
import { z } from 'zod';
import type { PlanSnapshot } from '../../plan/service';
import { defineTool, type Json } from '../types';

/**
 * Planning tools (task 14.08): read the study plan, make it again, and tick items off. Making the
 * plan is undone by putting back the plan as it was; the planner keeps whatever was done.
 */

const ItemView = z.object({
  id: z.string(),
  date: z.string(),
  kind: z.string(),
  title: z.string(),
  minutes: z.number().int(),
  reason: z.string(),
  status: z.string(),
});

export const getStudyPlan = defineTool({
  name: 'get_study_plan',
  category: 'learning',
  description:
    'Read the student’s current study plan: what is planned for each of the coming days, how long each item takes and why it is there, and what has been done. Returns exists: false when no plan has been made yet.',
  input: z.object({ days: z.number().int().min(1).max(PLAN.maxDays).default(7) }),
  output: z.object({
    exists: z.boolean(),
    today: z.string(),
    items: z.array(ItemView),
    unscheduled: z.array(z.object({ title: z.string(), reason: z.string() })),
  }),
  risk: 'read',
  execute(context, input) {
    const { plan } = context.services;
    const today = plan.today();
    const current = plan.current();
    if (!current) return { output: { exists: false, today, items: [], unscheduled: [] } };
    const last = new Date(Date.parse(`${today}T00:00:00Z`) + (input.days - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return {
      output: {
        exists: true,
        today,
        items: current.items
          .filter((item) => item.date >= today && item.date <= last)
          .map((item) => ({
            id: item.id,
            date: item.date,
            kind: item.kind,
            title: item.title,
            minutes: item.minutes,
            reason: item.reason,
            status: item.status,
          })),
        unscheduled: current.unscheduled,
      },
    };
  },
  describe: (_input, output) =>
    output
      ? output.exists
        ? `Read the study plan (${output.items.length} items)`
        : 'Checked for a study plan: none yet'
      : 'Reading the study plan',
});

export const createStudyPlan = defineTool({
  name: 'create_study_plan',
  category: 'learning',
  description:
    'Make the student’s study plan for the next few days from their availability, due reviews, deadlines, weak concepts and lectures not yet studied. Anything already done or skipped stays; the rest is planned again. Every item says why it is there. Undo puts the plan back as it was.',
  input: z.object({ days: z.number().int().min(1).max(PLAN.maxDays).default(PLAN.defaultDays) }),
  output: z.object({
    planId: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    items: z.number().int(),
    minutes: z.number().int(),
    unscheduled: z.number().int(),
    updatedAt: z.string(),
  }),
  risk: 'write',
  execute(context, input) {
    const { plan } = context.services;
    const previous = plan.snapshot();
    const made = plan.generate(input.days, 'agent');
    return {
      output: {
        planId: made.id,
        startDate: made.startDate,
        endDate: made.endDate,
        items: made.items.length,
        minutes: made.items.reduce((sum, item) => sum + item.minutes, 0),
        unscheduled: made.unscheduled.length,
        updatedAt: made.updatedAt,
      },
      undo: {
        planId: made.id,
        previous: previous && previous.plan.id === made.id ? previous : null,
      } as unknown as Json,
    };
  },
  describe: (input, output) =>
    output
      ? `Made a study plan: ${output.items} items over ${input.days} ${input.days === 1 ? 'day' : 'days'}`
      : 'Making a study plan',
  canUndo: (context, record) =>
    context.services.plan.changedSince(
      (record.undo as { planId: string }).planId,
      (record.output as { updatedAt: string }).updatedAt,
    ),
  undo(context, record) {
    const { planId, previous } = record.undo as unknown as {
      planId: string;
      previous: PlanSnapshot | null;
    };
    context.services.plan.restore(planId, previous);
  },
});

export const updateStudyPlan = defineTool({
  name: 'update_study_plan',
  category: 'learning',
  description:
    'Mark one item of the study plan done, skipped, or planned again. Use it when the student tells you they have done something from the plan.',
  input: z.object({ itemId: PlanItemIdSchema, status: z.enum(PLAN_ITEM_STATUSES) }),
  output: z.object({
    itemId: z.string(),
    title: z.string(),
    status: z.string(),
    before: z.string(),
  }),
  risk: 'write',
  execute(context, input) {
    const { plan } = context.services;
    const before = plan.item(input.itemId);
    const after = plan.setStatus(input.itemId, input.status);
    return {
      output: { itemId: after.id, title: after.title, status: after.status, before: before.status },
      undo: { itemId: after.id, before: before.status, after: after.status } as Json,
    };
  },
  describe: (input, output) =>
    output
      ? `Marked “${output.title}” ${output.status === 'planned' ? 'to do' : output.status}`
      : `Marking a plan item ${input.status}`,
  canUndo(context, record) {
    const { itemId, after } = record.undo as { itemId: string; after: string };
    return context.services.plan.item(itemId).status === after
      ? null
      : 'The item has been changed since.';
  },
  undo(context, record) {
    const { itemId, before } = record.undo as {
      itemId: string;
      before: 'planned' | 'done' | 'skipped';
    };
    context.services.plan.setStatus(itemId, before);
  },
});

export const planningTools = [getStudyPlan, createStudyPlan, updateStudyPlan];
