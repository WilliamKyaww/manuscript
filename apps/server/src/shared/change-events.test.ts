import { describe, expect, it, vi } from 'vitest';
import { notifyingAfter } from './change-events';

describe('notifyingAfter', () => {
  it('notifies after successful writes only', async () => {
    const notify = vi.fn();
    const service = notifyingAfter(
      {
        read: () => 'read',
        write: (value: number) => value * 2,
        fail: (): number => {
          throw new Error('no');
        },
        later: async (value: number) => value + 1,
      },
      ['write', 'fail', 'later'],
      notify,
    );
    expect(service.read()).toBe('read');
    expect(notify).not.toHaveBeenCalled();
    expect(service.write(2)).toBe(4);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(() => service.fail()).toThrow('no');
    expect(notify).toHaveBeenCalledTimes(1);
    await expect(service.later(1)).resolves.toBe(2);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
