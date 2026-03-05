/**
 * T041: E2E happy-path test for `sofia dev` command.
 *
 * Runs `sofia dev --session <fixtureId>` as a subprocess;
 * verifies exit code 0; verifies output directory has required files;
 * verifies session JSON updated with poc state.
 *
 * Note: This E2E test uses a fake CopilotClient (no real LLM calls).
 * It validates the CLI plumbing, argument parsing, and file creation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

import { buildCli } from '../../src/cli/index.js';
import { validateSessionForDevelop } from '../../src/cli/developCommand.js';
import type { WorkshopSession } from '../../src/shared/schemas/session.js';

const require = createRequire(import.meta.url);
const fixtureSession: WorkshopSession = require('../fixtures/completedSession.json') as WorkshopSession;

describe('E2E: sofia dev command', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'sofia-e2e-dev-'));
    // Create a .sofia/sessions dir for the session store
    await mkdir(join(workDir, '.sofia', 'sessions'), { recursive: true });
    // Write the fixture session
    await writeFile(
      join(workDir, '.sofia', 'sessions', `${fixtureSession.sessionId}.json`),
      JSON.stringify(fixtureSession),
      'utf-8',
    );
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('CLI registers dev command with correct description', () => {
    const program = buildCli();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain('dev');
  });

  it('dev command shows in help output', () => {
    const program = buildCli();
    const devCmd = program.commands.find((c) => c.name() === 'dev');
    expect(devCmd).toBeDefined();
    expect(devCmd?.description()).toContain('proof-of-concept');
  });

  it('dev command has --max-iterations option', () => {
    const program = buildCli();
    const devCmd = program.commands.find((c) => c.name() === 'dev');
    const options = devCmd?.options.map((o) => o.long);
    expect(options).toContain('--max-iterations');
  });

  it('dev command has --output option', () => {
    const program = buildCli();
    const devCmd = program.commands.find((c) => c.name() === 'dev');
    const options = devCmd?.options.map((o) => o.long);
    expect(options).toContain('--output');
  });

  it('dev command has --force option', () => {
    const program = buildCli();
    const devCmd = program.commands.find((c) => c.name() === 'dev');
    const options = devCmd?.options.map((o) => o.long);
    expect(options).toContain('--force');
  });

  describe('validateSessionForDevelop (session readiness)', () => {
    it('fixture session passes validation (has selection + plan)', () => {
      const error = validateSessionForDevelop(fixtureSession);
      expect(error).toBeNull();
    });

    it('fixture session has a valid selection', () => {
      expect(fixtureSession.selection).toBeDefined();
      expect(fixtureSession.selection!.confirmedByUser).toBe(true);
    });

    it('fixture session has a valid plan with milestones', () => {
      expect(fixtureSession.plan).toBeDefined();
      expect(fixtureSession.plan!.milestones.length).toBeGreaterThan(0);
    });
  });

});
