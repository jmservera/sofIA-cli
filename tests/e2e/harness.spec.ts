import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: optional dependency may not be present in all environments
import pty from 'node-pty';
import { join } from 'node:path';

// Placeholder E2E test harness using node-pty. Initially marked TODO to flesh out interactive flows.
describe('CLI E2E (PTY harness)', () => {
  it.skip('runs the workshop command end-to-end in a pseudo-terminal', async () => {
    const shell = process.env.SHELL || 'bash';
    const bin = join(process.cwd(), 'dist', 'cli', 'index.js');
    const ptyProcess = pty.spawn(shell, ['-lc', `node ${bin} workshop`], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
    });

    let output = '';
    ptyProcess.onData((data: string) => {
      output += data;
      if (output.includes('phases completed')) {
        ptyProcess.kill();
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(output).toContain('phases completed');
  });
});
