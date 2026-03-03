/**
 * Preflight checks tests (T056, T023).
 *
 * Validates startup checks for:
 * - Copilot SDK availability
 * - MCP server configuration presence
 * - Environment variable requirements
 * - Graceful degradation when services unavailable
 * - Legacy env var detection (FR-016)
 */
import { describe, it, expect, afterEach } from 'vitest';

import {
  runPreflightChecks,
  checkLegacyWebSearchEnvVars,
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

describe('checkLegacyWebSearchEnvVars (T023)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('passes when no legacy env vars are set', async () => {
    delete process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT;
    delete process.env.SOFIA_FOUNDRY_AGENT_KEY;
    const result = await checkLegacyWebSearchEnvVars();
    expect(result.status).toBe('pass');
    expect(result.name).toBe('legacy-web-search-env');
  });

  it('fails when SOFIA_FOUNDRY_AGENT_ENDPOINT is set', async () => {
    process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT = 'https://old-endpoint.example.com';
    delete process.env.SOFIA_FOUNDRY_AGENT_KEY;
    const result = await checkLegacyWebSearchEnvVars();
    expect(result.status).toBe('fail');
    expect(result.required).toBe(true);
    expect(result.message).toContain('Legacy web search env vars detected');
    expect(result.message).toContain('FOUNDRY_PROJECT_ENDPOINT');
  });

  it('fails when SOFIA_FOUNDRY_AGENT_KEY is set', async () => {
    delete process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT;
    process.env.SOFIA_FOUNDRY_AGENT_KEY = 'old-api-key';
    const result = await checkLegacyWebSearchEnvVars();
    expect(result.status).toBe('fail');
    expect(result.required).toBe(true);
    expect(result.message).toContain('API key auth is no longer used');
  });

  it('fails when both legacy vars are set', async () => {
    process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT = 'https://old-endpoint.example.com';
    process.env.SOFIA_FOUNDRY_AGENT_KEY = 'old-api-key';
    const result = await checkLegacyWebSearchEnvVars();
    expect(result.status).toBe('fail');
    expect(result.required).toBe(true);
  });

  it('fails preflight when integrated with runPreflightChecks', async () => {
    process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT = 'https://old-endpoint.example.com';
    const result = await runPreflightChecks({
      checkLegacyWebSearch: checkLegacyWebSearchEnvVars,
    });
    expect(result.passed).toBe(false);
    expect(result.checks[0].name).toBe('legacy-web-search-env');
  });
});
