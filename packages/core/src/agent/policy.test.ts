import { describe, expect, it } from 'vitest';
import { BULK_THRESHOLD, decideApproval, effectiveRisk } from './policy';

describe('the permission policy', () => {
  it('lets reads and writes run, and always asks for destructive calls', () => {
    expect(decideApproval({ risk: 'read' })).toMatchObject({ decision: 'approve', risk: 'read' });
    expect(decideApproval({ risk: 'write' })).toMatchObject({ decision: 'approve', risk: 'write' });
    expect(decideApproval({ risk: 'destructive' })).toMatchObject({ decision: 'ask' });
  });

  it('never lets a destructive tool run automatically, whatever the override says', () => {
    expect(decideApproval({ risk: 'destructive', override: 'auto' }).decision).toBe('ask');
    expect(decideApproval({ risk: 'destructive', override: 'ask' }).decision).toBe('ask');
    expect(decideApproval({ risk: 'destructive', override: 'deny' }).decision).toBe('deny');
  });

  it('applies per-tool overrides to reads and writes', () => {
    expect(decideApproval({ risk: 'write', override: 'ask' })).toMatchObject({
      decision: 'ask',
      reason: expect.stringMatching(/each time/u),
    });
    expect(decideApproval({ risk: 'read', override: 'deny' }).decision).toBe('deny');
    expect(decideApproval({ risk: 'write', override: 'auto' }).decision).toBe('approve');
  });

  it('treats a write touching more than 20 items as destructive', () => {
    expect(effectiveRisk('write', BULK_THRESHOLD)).toBe('write');
    expect(effectiveRisk('write', BULK_THRESHOLD + 1)).toBe('destructive');
    expect(effectiveRisk('read', 500)).toBe('read');
    expect(decideApproval({ risk: 'write', items: 21 })).toMatchObject({
      decision: 'ask',
      risk: 'destructive',
      reason: expect.stringMatching(/21 items/u),
    });
    // Even an "auto" override cannot wave a bulk write through.
    expect(decideApproval({ risk: 'write', items: 21, override: 'auto' }).decision).toBe('ask');
  });
});
