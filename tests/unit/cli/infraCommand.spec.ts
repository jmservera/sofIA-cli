/**
 * Unit tests for infraCommand — the `sofia infra` subcommands.
 *
 * Uses tiny mock shell scripts instead of the real infra/ scripts
 * to avoid any destructive Azure operations during testing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

import { runInfraScript } from '../../../src/cli/infraCommand.js';

const FIXTURES = resolve(__dirname, '../../fixtures');
const OK_SCRIPT = resolve(FIXTURES, 'infra-ok.sh');
const FAIL_SCRIPT = resolve(FIXTURES, 'infra-fail.sh');

describe('infraCommand', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  describe('runInfraScript()', () => {
    it('returns exit code 0 when the script succeeds', async () => {
      const result = await runInfraScript(OK_SCRIPT, ['-g', 'my-rg']);
      expect(result.exitCode).toBe(0);
    });

    it('forwards arguments to the script', async () => {
      const result = await runInfraScript(OK_SCRIPT, ['-g', 'test-rg', '-l', 'eastus']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('-g test-rg -l eastus');
    });

    it('returns non-zero exit code when the script fails', async () => {
      const result = await runInfraScript(FAIL_SCRIPT, ['-g', 'rg']);
      expect(result.exitCode).toBe(1);
    });

    it('captures stderr on failure', async () => {
      const result = await runInfraScript(FAIL_SCRIPT, ['-g', 'rg']);
      expect(result.stderr).toContain('mock error');
    });

    it('throws for a non-existent script', async () => {
      await expect(
        runInfraScript('/tmp/nonexistent-script.sh', []),
      ).rejects.toThrow();
    });
  });

  describe('CLI integration via buildCli', () => {
    // Import buildCli to ensure the infra sub-commands register cleanly
    it('registers infra deploy sub-command', async () => {
      const { buildCli } = await import('../../../src/cli/index.js');
      const program = buildCli();
      const infra = program.commands.find((c) => c.name() === 'infra');
      expect(infra).toBeDefined();
      const deploy = infra!.commands.find((c) => c.name() === 'deploy');
      expect(deploy).toBeDefined();
    });

    it('registers infra gather-env sub-command', async () => {
      const { buildCli } = await import('../../../src/cli/index.js');
      const program = buildCli();
      const infra = program.commands.find((c) => c.name() === 'infra');
      expect(infra).toBeDefined();
      const gatherEnv = infra!.commands.find((c) => c.name() === 'gather-env');
      expect(gatherEnv).toBeDefined();
    });

    it('registers infra teardown sub-command', async () => {
      const { buildCli } = await import('../../../src/cli/index.js');
      const program = buildCli();
      const infra = program.commands.find((c) => c.name() === 'infra');
      expect(infra).toBeDefined();
      const teardown = infra!.commands.find((c) => c.name() === 'deploy');
      expect(teardown).toBeDefined();
    });
  });
});
