/**
 * Preflight checks tests (T056).
 *
 * Validates startup checks for:
 * - Copilot SDK availability
 * - MCP server configuration presence
 * - Environment variable requirements
 * - Graceful degradation when services unavailable
 */
import { describe, it, expect } from 'vitest';

import {
  runPreflightChecks,
} from '../../../src/cli/preflight.js';

describe('preflight checks', () => {
  it('returns all-pass when all checks succeed', async () => {
    const result = await runPreflightChecks({
      checkCopilotSdk: async () => ({ name: 'copilot-sdk', status: 'pass', message: 'SDK available' }),
      checkMcpConfig: async () => ({ name: 'mcp-config', status: 'pass', message: 'Config found' }),
    });
    expect(result.passed).toBe(true);
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('returns failed when a required check fails', async () => {
    const result = await runPreflightChecks({
      checkCopilotSdk: async () => ({ name: 'copilot-sdk', status: 'fail', message: 'SDK not found', required: true }),
      checkMcpConfig: async () => ({ name: 'mcp-config', status: 'pass', message: 'Config found' }),
    });
    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.name === 'copilot-sdk')?.status).toBe('fail');
  });

  it('returns pass with warnings for optional failures', async () => {
    const result = await runPreflightChecks({
      checkCopilotSdk: async () => ({ name: 'copilot-sdk', status: 'pass', message: 'SDK available' }),
      checkMcpConfig: async () => ({ name: 'mcp-config', status: 'warn', message: 'Config not found, will use defaults' }),
    });
    expect(result.passed).toBe(true);
    expect(result.checks.find((c) => c.name === 'mcp-config')?.status).toBe('warn');
  });

  it('handles check functions that throw', async () => {
    const result = await runPreflightChecks({
      checkCopilotSdk: async () => { throw new Error('Unexpected failure'); },
      checkMcpConfig: async () => ({ name: 'mcp-config', status: 'pass', message: 'OK' }),
    });
    expect(result.passed).toBe(false);
    const failedCheck = result.checks.find((c) => c.status === 'fail');
    expect(failedCheck).toBeDefined();
    expect(failedCheck!.message).toContain('Unexpected failure');
  });

  it('collects all check results even when some fail', async () => {
    const result = await runPreflightChecks({
      checkCopilotSdk: async () => ({ name: 'copilot-sdk', status: 'fail', message: 'Missing', required: true }),
      checkMcpConfig: async () => ({ name: 'mcp-config', status: 'fail', message: 'Missing', required: true }),
    });
    expect(result.checks).toHaveLength(2);
    expect(result.checks.filter((c) => c.status === 'fail')).toHaveLength(2);
  });

  it('includes check names and messages in results', async () => {
    const result = await runPreflightChecks({
      checkCopilotSdk: async () => ({ name: 'copilot-sdk', status: 'pass', message: 'v1.0.0 available' }),
    });
    expect(result.checks[0].name).toBe('copilot-sdk');
    expect(result.checks[0].message).toBe('v1.0.0 available');
  });
});
