import { afterEach, describe, expect, it } from 'vitest';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';
import { silentLogger } from '../../shared/logger';
import { type AgentEvent, type ApprovalRequest, createAgentRunner, toolsForMode } from './runner';
import { scriptedModel, type Turn } from './scripted-model';

let bed: SourcesTestbed | undefined;
afterEach(() => {
  bed?.cleanup();
  bed = undefined;
});

async function setUp(turns: Turn[] | ((services: SourcesTestbed['modules']) => Turn[])) {
  bed = createSourcesTestbed();
  await bed.start();
  const script = scriptedModel(typeof turns === 'function' ? turns(bed.modules) : turns);
  const registry = bed.modules.agent.registry;
  const runner = createAgentRunner({ ai: script.ai, registry, logger: silentLogger });
  const asked: ApprovalRequest[] = [];
  const events: AgentEvent[] = [];
  const run = (
    mode: 'ask' | 'tutor' | 'agent',
    prompt: string,
    approve: (request: ApprovalRequest) => boolean = () => false,
    extra: { maxSteps?: number } = {},
  ) =>
    runner.run({
      mode,
      messages: [{ role: 'user', content: prompt }],
      approve: (request) => {
        asked.push(request);
        return approve(request);
      },
      onEvent: (event) => events.push(event),
      ...extra,
    });
  return { script, registry, run, asked, events, services: bed.modules };
}

describe('the agent runner', () => {
  it('limits the tools to the mode: ask reads only, tutor adds flashcards and quizzes, agent has all', async () => {
    const { registry } = await setUp([]);
    const names = (mode: 'ask' | 'tutor' | 'agent') =>
      toolsForMode(mode, registry.tools()).map((tool) => tool.name);
    expect(names('ask').every((name) => registry.tool(name)?.risk === 'read')).toBe(true);
    expect(names('ask')).not.toContain('create_note');
    expect(names('tutor')).toEqual(
      expect.arrayContaining(['get_weak_areas', 'create_flashcards', 'create_quiz']),
    );
    expect(names('tutor')).not.toContain('delete_note');
    expect(names('agent')).toContain('delete_note');
  });

  it('answers from what its read tools returned, and shows only the mode’s tools to the model', async () => {
    const { run, script, services } = await setUp([
      { calls: [{ name: 'search_knowledge', input: { query: 'ballots' } }] },
      { text: 'Paxos decides by numbered ballots.' },
    ]);
    services.notes.notes.create({ title: 'Paxos', content: 'Ballots decide.\n' });
    const result = await run('ask', 'How does Paxos decide?');
    expect(result).toMatchObject({
      text: 'Paxos decides by numbered ballots.',
      steps: 2,
      finish: 'answered',
      toolCalls: [{ tool: 'search_knowledge', status: 'ok' }],
    });
    expect(script.offered[0]).toContain('search_knowledge');
    expect(script.offered[0]).not.toContain('create_note');
    // The model was told the rules, and what the tool found.
    expect(JSON.stringify(script.prompts[0])).toContain('Only what a tool reports has happened');
    expect(JSON.stringify(script.prompts[1])).toContain('Paxos');
  });

  it('runs a write straight away, logs it and lets it be undone', async () => {
    const { run, registry, services } = await setUp([
      { calls: [{ name: 'create_note', input: { title: 'Summary', content: 'Done.\n' } }] },
      { text: 'I created the note.' },
    ]);
    const result = await run('agent', 'Make a summary note');
    expect(result.toolCalls).toEqual([
      { tool: 'create_note', status: 'ok', summary: 'Created the note “Summary”' },
    ]);
    expect(services.notes.notes.tree().notes.map((note) => note.title)).toEqual(['Summary']);
    const [action] = registry.actions(3);
    expect(action).toMatchObject({ tool: 'create_note', actor: 'agent', undoable: true });
  });

  it('pauses a destructive call for the person, and runs it only when approved', async () => {
    let id = '';
    const { run, asked, services, registry } = await setUp((modules) => {
      id = modules.notes.notes.create({ title: 'Old', content: 'x\n' }).id;
      return [{ calls: [{ name: 'delete_note', input: { id } }] }, { text: 'Deleted.' }];
    });
    const result = await run('agent', 'Delete the Old note', () => true);
    expect(asked).toEqual([
      expect.objectContaining({
        tool: 'delete_note',
        risk: 'destructive',
        // What will happen, named as the person knows it: not the past tense, not an id.
        summary: 'Move the note “Old” to the trash',
        reason: expect.stringMatching(/approval/u),
      }),
    ]);
    expect(result.text).toBe('Deleted.');
    expect(() => services.notes.notes.get(id)).toThrow();
    expect(registry.actions(3)[0]).toMatchObject({
      tool: 'delete_note',
      approval: 'user',
      status: 'executed',
    });
  });

  it('tells the model when the person declines, and changes nothing', async () => {
    let id = '';
    const { run, script, events, services, registry } = await setUp((modules) => {
      id = modules.notes.notes.create({ title: 'Keep', content: 'x\n' }).id;
      return [
        { calls: [{ name: 'delete_note', input: { id } }] },
        { text: 'Understood, I left it.' },
      ];
    });
    const result = await run('agent', 'Delete Keep', () => false);
    expect(result.text).toBe('Understood, I left it.');
    expect(services.notes.notes.get(id).title).toBe('Keep');
    expect(result.toolCalls).toEqual([
      expect.objectContaining({ tool: 'delete_note', status: 'declined' }),
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'approval', approved: false }));
    expect(JSON.stringify(script.prompts[1])).toMatch(/declined/u);
    expect(registry.actions(3)[0]).toMatchObject({ tool: 'delete_note', status: 'denied' });
  });

  it('gives the model a failed tool call as a result it can read and recover from', async () => {
    const { run, script } = await setUp([
      { calls: [{ name: 'get_note', input: { id: 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7' } }] },
      { text: 'That note does not exist.' },
    ]);
    const result = await run('ask', 'Read that note');
    expect(result.toolCalls[0]).toMatchObject({ tool: 'get_note', status: 'error' });
    expect(JSON.stringify(script.prompts[1])).toMatch(/does not exist|not found/iu);
    expect(result.text).toBe('That note does not exist.');
  });

  it('stops at the step limit, reporting that it did not finish', async () => {
    const calls = Array.from({ length: 6 }, () => ({
      calls: [{ name: 'list_notes', input: {} }],
    })) satisfies Turn[];
    const { run } = await setUp(calls);
    const result = await run('ask', 'Keep listing', undefined, { maxSteps: 3 });
    expect(result).toMatchObject({ steps: 3, finish: 'step-limit' });
    expect(result.text).toMatch(/all the steps/u);
  });
});
