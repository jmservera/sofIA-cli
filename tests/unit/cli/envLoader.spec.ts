/**
 * Environment loader tests.
 *
 * Validates that dotenv is loaded at startup to populate process.env
 * from a .env file in the project root.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('loadEnvFile', () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sofia-env-'));
    // Save and clear any existing values
    savedEnv['FOUNDRY_PROJECT_ENDPOINT'] = process.env.FOUNDRY_PROJECT_ENDPOINT;
    savedEnv['FOUNDRY_MODEL_DEPLOYMENT_NAME'] = process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME;
    delete process.env.FOUNDRY_PROJECT_ENDPOINT;
    delete process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME;
  });

  afterEach(() => {
    // Restore original env
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads variables from .env file into process.env', async () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(
      envPath,
      [
        'FOUNDRY_PROJECT_ENDPOINT="https://my-endpoint.cognitiveservices.azure.com"',
        'FOUNDRY_MODEL_DEPLOYMENT_NAME="gpt-4.1-mini"',
      ].join('\n'),
    );

    // Dynamic import to avoid caching
    const { loadEnvFile } = await import('../../../src/cli/envLoader.js');
    loadEnvFile(envPath);

    expect(process.env.FOUNDRY_PROJECT_ENDPOINT).toBe(
      'https://my-endpoint.cognitiveservices.azure.com',
    );
    expect(process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME).toBe('gpt-4.1-mini');
  });

  it('does not overwrite existing env vars', async () => {
    process.env.FOUNDRY_PROJECT_ENDPOINT = 'already-set';

    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'FOUNDRY_PROJECT_ENDPOINT="from-file"');

    const { loadEnvFile } = await import('../../../src/cli/envLoader.js');
    loadEnvFile(envPath);

    expect(process.env.FOUNDRY_PROJECT_ENDPOINT).toBe('already-set');
  });

  it('does nothing when .env file does not exist', async () => {
    const envPath = path.join(tmpDir, '.env-nonexistent');

    const { loadEnvFile } = await import('../../../src/cli/envLoader.js');
    // Should not throw
    expect(() => loadEnvFile(envPath)).not.toThrow();
  });
});
