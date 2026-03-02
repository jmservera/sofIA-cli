/**
 * Teardown script tests (T032).
 *
 * Tests for infra/teardown.sh:
 * - Required --resource-group flag
 * - Script file properties (executable, shebang, error handling)
 * - Exit codes (0=success/not-found, 1=prereq fail, 2=deletion fail)
 * - Handles non-existent resource group gracefully
 * - Supports --yes flag for non-interactive confirmation
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';

const TEARDOWN_SCRIPT_PATH = resolve(__dirname, '../../infra/teardown.sh');

describe('teardown.sh (T032)', () => {
  const script = readFileSync(TEARDOWN_SCRIPT_PATH, 'utf-8');

  describe('script file properties', () => {
    it('has bash shebang', () => {
      expect(script.startsWith('#!/usr/bin/env bash')).toBe(true);
    });

    it('is executable', () => {
      expect(() => accessSync(TEARDOWN_SCRIPT_PATH, constants.X_OK)).not.toThrow();
    });

    it('uses strict error handling (set -euo pipefail)', () => {
      expect(script).toContain('set -euo pipefail');
    });
  });

  describe('parameter parsing', () => {
    it('supports --resource-group / -g flag', () => {
      expect(script).toMatch(/--resource-group\b|-g\b/);
    });

    it('supports --yes flag for non-interactive confirmation', () => {
      expect(script).toMatch(/--yes\b/);
    });
  });

  describe('prerequisite validation', () => {
    it('checks for az CLI installation', () => {
      expect(script).toMatch(/command -v az|which az/);
    });
  });

  describe('exit codes', () => {
    it('uses exit code 0 for success or not-found', () => {
      expect(script).toContain('exit 0');
    });

    it('uses exit code 1 for prerequisite failures', () => {
      expect(script).toContain('exit 1');
    });

    it('uses exit code 2 for deletion failures', () => {
      expect(script).toContain('exit 2');
    });
  });

  describe('resource group handling', () => {
    it('checks if resource group exists', () => {
      expect(script).toContain('az group exists');
    });

    it('uses az group delete for deletion', () => {
      expect(script).toContain('az group delete');
    });

    it('uses --no-wait for non-blocking deletion', () => {
      expect(script).toContain('--no-wait');
    });
  });
});
