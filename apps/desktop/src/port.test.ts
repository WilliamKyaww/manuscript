import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { choosePort, readRememberedPort } from './port';

/** The engine's port is kept between launches, so the page keeps its preferences (its address). */

const dirs: string[] = [];
const dataDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-port-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('the engine port', () => {
  it('is chosen once, remembered, and used again at the next launch', async () => {
    const dir = dataDir();
    const first = await choosePort(dir);
    expect(readRememberedPort(dir)).toBe(first);
    expect(await choosePort(dir)).toBe(first);
  });

  it('is replaced (and the new one remembered) when another program holds it', async () => {
    const dir = dataDir();
    const first = await choosePort(dir);
    const holder = net.createServer();
    await new Promise<void>((resolve) => holder.listen(first, '127.0.0.1', resolve));
    try {
      const second = await choosePort(dir);
      expect(second).not.toBe(first);
      expect(readRememberedPort(dir)).toBe(second);
    } finally {
      await new Promise((resolve) => holder.close(resolve));
    }
  });

  it('ignores a damaged or unlikely remembered port', () => {
    const dir = dataDir();
    writeFileSync(path.join(dir, 'desktop-port.json'), '{"port": 80}');
    expect(readRememberedPort(dir)).toBeNull();
    writeFileSync(path.join(dir, 'desktop-port.json'), 'not json');
    expect(readRememberedPort(dir)).toBeNull();
  });
});
