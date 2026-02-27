/**
 * T070: Integration tests for default command behavior (FR-004).
 *
 * Verifies:
 * - `sofia` with no subcommand enters the workshop flow (default action)
 * - `sofia workshop` still works as an alias
 * - `--help` shows workshop options (--new-session, --phase, --retry) at top level
 * - `sofia status` and `sofia export` subcommands continue to work after restructure
 */
import { describe, it, expect, vi, type Mock, beforeEach, afterEach } from 'vitest';

import type { CliHandlers } from '../../src/cli/index.js';

type HandlerMock = Mock<CliHandlers['workshopHandler']>;

// Mock all heavy dependencies so we only test CLI argument routing
vi.mock('../../src/sessions/sessionStore.js', () => ({
  createDefaultStore: vi.fn(() => ({
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    save: vi.fn(async () => {}),
    load: vi.fn(async () => ({})),
  })),
  SessionStore: vi.fn(),
}));

vi.mock('../../src/shared/copilotClient.js', () => ({
  createCopilotClient: vi.fn(async () => ({
    createSession: vi.fn(async () => ({
      send: vi.fn(async function* () {
        yield { type: 'TextDelta', text: 'hello' };
      }),
    })),
  })),
  createFakeCopilotClient: vi.fn(),
}));

vi.mock('../../src/logging/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../src/cli/ioContext.js', () => ({
  createLoopIO: vi.fn(() => ({
    write: vi.fn(),
    writeActivity: vi.fn(),
    readInput: vi.fn(async () => null),
    showDecisionGate: vi.fn(async () => ({ choice: 'exit' })),
    isJsonMode: false,
    isTTY: false,
  })),
}));

describe('Default command behavior (T070)', () => {
  let workshopSpy: HandlerMock;
  let statusSpy: HandlerMock;
  let exportSpy: HandlerMock;

  beforeEach(() => {
    workshopSpy = vi.fn<CliHandlers['workshopHandler']>(async () => {});
    statusSpy = vi.fn<CliHandlers['statusHandler']>(async () => {});
    exportSpy = vi.fn<CliHandlers['exportHandler']>(async () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sofia with no subcommand invokes the workshop handler (default action)', async () => {
    // Import buildCli which should expose the program without auto-parsing
    const { buildCli } = await import('../../src/cli/index.js');
    const program = buildCli({
      workshopHandler: workshopSpy,
      statusHandler: statusSpy,
      exportHandler: exportSpy,
    });

    // Parse with no subcommand: `sofia`
    await program.parseAsync(['node', 'sofia']);

    expect(workshopSpy).toHaveBeenCalledTimes(1);
    expect(statusSpy).not.toHaveBeenCalled();
    expect(exportSpy).not.toHaveBeenCalled();
  });

  it('sofia workshop still works as alias', async () => {
    const { buildCli } = await import('../../src/cli/index.js');
    const program = buildCli({
      workshopHandler: workshopSpy,
      statusHandler: statusSpy,
      exportHandler: exportSpy,
    });

    await program.parseAsync(['node', 'sofia', 'workshop']);

    expect(workshopSpy).toHaveBeenCalledTimes(1);
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('--help shows workshop options (--new-session, --phase, --retry) at top level', async () => {
    const { buildCli } = await import('../../src/cli/index.js');
    const program = buildCli({
      workshopHandler: workshopSpy,
      statusHandler: statusSpy,
      exportHandler: exportSpy,
    });

    const helpText = program.helpInformation();

    expect(helpText).toContain('--new-session');
    expect(helpText).toContain('--phase');
    expect(helpText).toContain('--retry');
  });

  it('sofia status routes to status handler', async () => {
    const { buildCli } = await import('../../src/cli/index.js');
    const program = buildCli({
      workshopHandler: workshopSpy,
      statusHandler: statusSpy,
      exportHandler: exportSpy,
    });

    await program.parseAsync(['node', 'sofia', 'status']);

    expect(statusSpy).toHaveBeenCalledTimes(1);
    expect(workshopSpy).not.toHaveBeenCalled();
    expect(exportSpy).not.toHaveBeenCalled();
  });

  it('sofia export routes to export handler', async () => {
    const { buildCli } = await import('../../src/cli/index.js');
    const program = buildCli({
      workshopHandler: workshopSpy,
      statusHandler: statusSpy,
      exportHandler: exportSpy,
    });

    await program.parseAsync(['node', 'sofia', 'export']);

    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(workshopSpy).not.toHaveBeenCalled();
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('top-level --new-session is passed through to workshop handler', async () => {
    const { buildCli } = await import('../../src/cli/index.js');
    const program = buildCli({
      workshopHandler: workshopSpy,
      statusHandler: statusSpy,
      exportHandler: exportSpy,
    });

    await program.parseAsync(['node', 'sofia', '--new-session']);

    expect(workshopSpy).toHaveBeenCalledTimes(1);
    const mergedOpts = workshopSpy.mock.calls[0][0];
    expect(mergedOpts.newSession).toBe(true);
  });

  it('top-level --session and --phase triggers direct command mode options', async () => {
    const { buildCli } = await import('../../src/cli/index.js');
    const program = buildCli({
      workshopHandler: workshopSpy,
      statusHandler: statusSpy,
      exportHandler: exportSpy,
    });

    await program.parseAsync(['node', 'sofia', '--session', 's123', '--phase', 'Ideate']);

    expect(workshopSpy).toHaveBeenCalledTimes(1);
    const opts = workshopSpy.mock.calls[0][0];
    expect(opts.session).toBe('s123');
    expect(opts.phase).toBe('Ideate');
  });
});
