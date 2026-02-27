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
