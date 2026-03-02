/**
 * Unit tests for workshopCommand client creation — silent mock fallback bug.
 *
 * Verifies:
 * - When createCopilotClient() throws, the error is logged (not swallowed)
 * - The fake client is never silently substituted in production mode
 * - The user receives a clear error message when the SDK is unavailable
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock copilotClient module so createCopilotClient always rejects
vi.mock('../../../src/shared/copilotClient.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../src/shared/copilotClient.js')>();
  return {
    ...orig,
    createCopilotClient: vi.fn().mockRejectedValue(new Error('SDK not available')),
  };
});

// Mock the logger so we can assert error logging
vi.mock('../../../src/logging/logger.js', () => {
  const fakeLogger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    getLogger: vi.fn(() => fakeLogger),
    createLogger: vi.fn(() => fakeLogger),
    initGlobalLogger: vi.fn(() => fakeLogger),
  };
});

import { workshopCommand } from '../../../src/cli/workshopCommand.js';
import { getLogger } from '../../../src/logging/logger.js';

describe('workshopCommand — client creation failure', () => {
  let exitCodeBefore: number | undefined;

  beforeEach(() => {
    exitCodeBefore = process.exitCode as number | undefined;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = exitCodeBefore;
    vi.restoreAllMocks();
  });

  it('logs the error when createCopilotClient fails', async () => {
    // Run with --new-session --non-interactive so no menus block
    await workshopCommand({
      newSession: true,
      nonInteractive: true,
      json: true,
    });

    const logger = getLogger();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('Copilot'),
    );
  });

  it('sets non-zero exit code when SDK is unavailable', async () => {
    await workshopCommand({
      newSession: true,
      nonInteractive: true,
      json: true,
    });

    expect(process.exitCode).not.toBe(0);
    expect(process.exitCode).toBeDefined();
  });

  it('does not silently fall back to fake client', async () => {
    // Capture stdout to check there is no fake "Welcome" response
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await workshopCommand({
      newSession: true,
      nonInteractive: true,
      json: true,
    });

    const allOutput = writeSpy.mock.calls.map((c) => String(c[0])).join('');

    // Should NOT contain the canned fake response
    expect(allOutput).not.toContain('Welcome to the AI Discovery Workshop');
    // Should contain an error indication
    expect(allOutput).toContain('error');

    writeSpy.mockRestore();
  });
});
