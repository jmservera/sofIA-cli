/**
 * Preflight checks — validates environment readiness before starting a workshop.
 *
 * Each check returns a PreflightCheck result. runPreflightChecks() collects all
 * results, never short-circuits, and returns an aggregate PreflightResult.
 */

/** Result of a single check. */
export interface PreflightCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  /** If true (default), a 'fail' status causes overall failure. */
  required?: boolean;
}

/** Aggregate result of all checks. */
export interface PreflightResult {
  passed: boolean;
  checks: PreflightCheck[];
}

/** A map of named async check functions. */
export type CheckMap = Record<string, () => Promise<PreflightCheck>>;

/**
 * Run all preflight checks in parallel and aggregate results.
 *
 * - Checks that throw are caught and reported as fail with `required: true`.
 * - Overall pass requires that no check with `required !== false` has status 'fail'.
 */
export async function runPreflightChecks(checks: CheckMap): Promise<PreflightResult> {
  const entries = Object.entries(checks);

  const results = await Promise.all(
    entries.map(async ([key, fn]) => {
      try {
        return await fn();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          name: key.replace(/^check/, '').replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''),
          status: 'fail' as const,
          message,
          required: true,
        };
      }
    }),
  );

  const passed = results.every(
    (c) => c.status !== 'fail' || c.required === false,
  );

  return { passed, checks: results };
}

/**
 * Check for legacy web search env vars (FR-016).
 *
 * If `SOFIA_FOUNDRY_AGENT_ENDPOINT` or `SOFIA_FOUNDRY_AGENT_KEY` are set,
 * returns a fail result with migration instructions.
 */
export async function checkLegacyWebSearchEnvVars(): Promise<PreflightCheck> {
  const legacyEndpoint = process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT;
  const legacyKey = process.env.SOFIA_FOUNDRY_AGENT_KEY;

  if (legacyEndpoint || legacyKey) {
    return {
      name: 'legacy-web-search-env',
      status: 'fail',
      message:
        'Legacy web search env vars detected. ' +
        'Migrate: replace SOFIA_FOUNDRY_AGENT_ENDPOINT with FOUNDRY_PROJECT_ENDPOINT ' +
        'and remove SOFIA_FOUNDRY_AGENT_KEY (API key auth is no longer used). ' +
        'See docs/environment.md',
      required: true,
    };
  }

  return {
    name: 'legacy-web-search-env',
    status: 'pass',
    message: 'No legacy web search env vars detected',
  };
}
