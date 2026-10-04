import { describe, expect, it } from 'vitest';
import type { LogLevel } from '../config/config';
import { createLogger, localClockTime, redact } from './logger';

function capture(level: LogLevel = 'debug', format: 'json' | 'pretty' = 'json') {
  const lines: { line: string; level: LogLevel }[] = [];
  const logger = createLogger({
    level,
    format,
    now: () => new Date('2026-10-04T13:00:00.000Z'),
    write: (line, lineLevel) => lines.push({ line, level: lineLevel }),
  });
  return { logger, lines };
}

describe('logger', () => {
  it('filters below the configured level', () => {
    const { logger, lines } = capture('warn');
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    expect(lines.map((entry) => entry.level)).toEqual(['warn', 'error']);
  });

  it('writes structured JSON with bindings from child loggers', () => {
    const { logger, lines } = capture();
    logger.child({ module: 'vault' }).info('opened', { notes: 3 });
    expect(JSON.parse(lines[0]?.line ?? '')).toEqual({
      time: '2026-10-04T13:00:00.000Z',
      level: 'info',
      msg: 'opened',
      module: 'vault',
      notes: 3,
    });
  });

  it('redacts secrets at any depth', () => {
    const { logger, lines } = capture();
    logger.info('request', {
      headers: { authorization: 'Bearer abc', cookie: 'skb_session=xyz', accept: 'json' },
      provider: { apiKey: 'sk-123', name: 'anthropic' },
      token: 'secret-token',
    });
    const entry = JSON.parse(lines[0]?.line ?? '');
    expect(entry.headers).toEqual({
      authorization: '[redacted]',
      cookie: '[redacted]',
      accept: 'json',
    });
    expect(entry.provider).toEqual({ apiKey: '[redacted]', name: 'anthropic' });
    expect(entry.token).toBe('[redacted]');
    expect(lines[0]?.line).not.toContain('sk-123');
  });

  it('serialises errors including code and cause', () => {
    const cause = new Error('inner');
    const error = Object.assign(new Error('outer', { cause }), { code: 'E_TEST' });
    const value = redact({ error }) as { error: Record<string, unknown> };
    expect(value.error.message).toBe('outer');
    expect(value.error.code).toBe('E_TEST');
    expect((value.error.cause as Record<string, unknown>).message).toBe('inner');
  });

  it('formats readable lines in pretty mode using local time', () => {
    const { logger, lines } = capture('debug', 'pretty');
    logger.info('Server ready', { port: 4317 });
    const expectedTime = localClockTime(new Date('2026-10-04T13:00:00.000Z'));
    expect(lines[0]?.line).toBe(`${expectedTime} INFO  Server ready port=4317`);
    expect(expectedTime).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
