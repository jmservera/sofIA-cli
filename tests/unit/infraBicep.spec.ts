/**
 * Bicep template structure tests (T008, T013, T014).
 *
 * Validates the Bicep template:
 * - Contains all 5 expected resource types
 * - All parameters have @description() decorators (T013)
 * - Parameters have correct defaults per data-model.md (T014)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BICEP_PATH = resolve(__dirname, '../../infra/main.bicep');
const RESOURCES_BICEP_PATH = resolve(__dirname, '../../infra/resources.bicep');
const BICEPPARAM_PATH = resolve(__dirname, '../../infra/main.bicepparam');

describe('Bicep template structure (T008)', () => {
  const bicep = readFileSync(BICEP_PATH, 'utf-8');
  const resourcesBicep = readFileSync(RESOURCES_BICEP_PATH, 'utf-8');
  const allBicep = bicep + '\n' + resourcesBicep;

  describe('required resource types', () => {
    it('defines a Cognitive Services account (AIServices)', () => {
      expect(allBicep).toContain("Microsoft.CognitiveServices/accounts");
      expect(allBicep).toMatch(/kind:\s*'AIServices'/);
    });

    it('defines a model deployment', () => {
      expect(allBicep).toContain("Microsoft.CognitiveServices/accounts/deployments");
    });

    it('defines a project', () => {
      expect(allBicep).toContain("Microsoft.CognitiveServices/accounts/projects");
    });

    it('defines an account-level capability host', () => {
      expect(allBicep).toContain("Microsoft.CognitiveServices/accounts/capabilityHosts");
    });

    it('defines a project-level capability host', () => {
      expect(allBicep).toContain("Microsoft.CognitiveServices/accounts/projects/capabilityHosts");
    });

    it('uses subscription target scope', () => {
      expect(allBicep).toMatch(/targetScope\s*=\s*'subscription'/);
    });
  });

  describe('resource configuration', () => {
    it('enables project management on the account', () => {
      expect(allBicep).toContain('allowProjectManagement');
    });

    it('configures custom subdomain name', () => {
      expect(allBicep).toContain('customSubDomainName');
    });

    it('uses GlobalStandard SKU for model deployment', () => {
      expect(allBicep).toContain('GlobalStandard');
    });

    it('configures Agents capability kind', () => {
      expect(allBicep).toContain("'Agents'");
    });
  });
});

describe('Bicep parameter descriptions (T013)', () => {
  const bicep = readFileSync(BICEP_PATH, 'utf-8');

  it('every param in main.bicep has a preceding @description() decorator', () => {
    // Extract all param declarations
    const paramLines = bicep.split('\n');
    const paramIndices = paramLines
      .map((line, idx) => ({ line: line.trim(), idx }))
      .filter(({ line }) => line.startsWith('param '));

    expect(paramIndices.length).toBeGreaterThan(0);

    for (const { line, idx } of paramIndices) {
      // Check that at least one of the preceding lines (within 5 lines) has @description
      const precedingLines = paramLines.slice(Math.max(0, idx - 5), idx).join('\n');
      const paramName = line.split(/\s+/)[1];
      expect(
        precedingLines,
        `Parameter '${paramName}' at line ${idx + 1} should have a preceding @description() decorator`,
      ).toMatch(/@description\(/);
    }
  });
});

describe('Bicep parameter defaults (T014)', () => {
  const bicep = readFileSync(BICEP_PATH, 'utf-8');
  const bicepparam = readFileSync(BICEPPARAM_PATH, 'utf-8');

  it('defaults location to swedencentral', () => {
    // Check either in bicep or bicepparam
    const combined = bicep + bicepparam;
    expect(combined).toContain('swedencentral');
  });

  it('defaults model deployment name to gpt-4.1-mini', () => {
    const combined = bicep + bicepparam;
    expect(combined).toContain('gpt-4.1-mini');
  });

  it('defaults model version to 2025-04-14', () => {
    const combined = bicep + bicepparam;
    expect(combined).toContain('2025-04-14');
  });

  it('defaults model SKU to GlobalStandard', () => {
    const combined = bicep + bicepparam;
    expect(combined).toContain('GlobalStandard');
  });
});
