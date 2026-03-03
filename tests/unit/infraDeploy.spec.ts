/**
 * Deploy script tests (T007).
 *
 * Tests for infra/deploy.sh:
 * - Parameter parsing (subscription, resource-group, location, account-name, model)
 * - Default values for optional parameters
 * - Missing required arguments
 * - Script file properties (executable, shebang, error handling)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';

const DEPLOY_SCRIPT_PATH = resolve(__dirname, '../../infra/deploy.sh');

describe('deploy.sh (T007)', () => {
  const script = readFileSync(DEPLOY_SCRIPT_PATH, 'utf-8');

  describe('script file properties', () => {
    it('has bash shebang', () => {
      expect(script.startsWith('#!/usr/bin/env bash')).toBe(true);
    });

    it('is executable', () => {
      expect(() => accessSync(DEPLOY_SCRIPT_PATH, constants.X_OK)).not.toThrow();
    });

    it('uses strict error handling (set -euo pipefail)', () => {
      expect(script).toContain('set -euo pipefail');
    });
  });

  describe('parameter parsing', () => {
    it('supports --subscription / -s flag', () => {
      expect(script).toMatch(/--subscription\b|-s\b/);
    });

    it('supports --resource-group / -g flag', () => {
      expect(script).toMatch(/--resource-group\b|-g\b/);
    });

    it('supports --location / -l flag', () => {
      expect(script).toMatch(/--location\b|-l\b/);
    });

    it('supports --account-name / -n flag', () => {
      expect(script).toMatch(/--account-name\b|-n\b/);
    });

    it('supports --model / -m flag', () => {
      expect(script).toMatch(/--model\b|-m\b/);
    });
  });

  describe('default values', () => {
    it('defaults location to swedencentral', () => {
      expect(script).toContain('swedencentral');
    });

    it('defaults account name to sofia-foundry', () => {
      expect(script).toContain('sofia-foundry');
    });

    it('defaults model to gpt-4.1-mini', () => {
      expect(script).toContain('gpt-4.1-mini');
    });
  });

  describe('prerequisite validation', () => {
    it('checks for az CLI installation', () => {
      expect(script).toMatch(/command -v az|which az/);
    });

    it('checks for Azure login status', () => {
      expect(script).toContain('az account show');
    });
  });

  describe('exit codes', () => {
    it('uses exit code 1 for prerequisite failures', () => {
      expect(script).toContain('exit 1');
    });

    it('uses exit code 2 for deployment failures', () => {
      expect(script).toContain('exit 2');
    });
  });

  describe('output', () => {
    it('outputs FOUNDRY_PROJECT_ENDPOINT env var instruction', () => {
      expect(script).toContain('FOUNDRY_PROJECT_ENDPOINT');
    });

    it('outputs FOUNDRY_MODEL_DEPLOYMENT_NAME env var instruction', () => {
      expect(script).toContain('FOUNDRY_MODEL_DEPLOYMENT_NAME');
    });

    it('references teardown script', () => {
      expect(script).toContain('teardown.sh');
    });
  });
});
