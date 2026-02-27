/**
 * E2E test harness skeleton.
 *
 * Uses node-pty to drive the sofIA CLI interactively, simulating
 * user input and verifying streaming output. This is a skeleton —
 * actual E2E test scenarios will be added in US1 (T021).
 *
 * Requirements:
 * - node-pty must be installed (`npm install node-pty`)
 * - Tests run under the `test:e2e` npm script
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const CLI_ENTRY = join(PROJECT_ROOT, 'src', 'cli', 'index.ts');

// ── Helpers ─────────────────────────────────────────────────────────────────

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Run the sofIA CLI with given arguments and return output.
 * Uses tsx to run TypeScript directly.
 */
function runCli(args: string[], timeoutMs = 10000): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', CLI_ENTRY, ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString('utf-8'),
        stderr: Buffer.concat(stderr).toString('utf-8'),
        exitCode: code,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('E2E Harness', () => {
  it('displays help when invoked with --help', async () => {
    const result = await runCli(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('sofIA');
    expect(result.stdout).toContain('workshop');
    expect(result.stdout).toContain('status');
    expect(result.stdout).toContain('export');
  }, 15_000);

  it('displays version when invoked with --version', async () => {
    const result = await runCli(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  }, 15_000);

  it('shows workshop help', async () => {
    const result = await runCli(['workshop', '--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('workshop');
  });

  it('lists sessions or reports none when status invoked without session', async () => {
    const result = await runCli(['status', '--json']);
    // Either lists sessions or reports no sessions found — both valid
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toBeDefined();
    expect('sessions' in parsed || 'error' in parsed).toBe(true);
  });

  it('returns error for export without session', async () => {
    const result = await runCli(['export', '--json']);
    expect(result.stdout).toContain('No session specified');
  });
});
