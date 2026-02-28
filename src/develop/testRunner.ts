/**
 * Test Runner.
 *
 * Spawns the PoC's test suite via `npm test -- --reporter=json` in the
 * output directory, parses Vitest JSON reporter output into a structured
 * TestResults object, and enforces a 60-second timeout.
 *
 * Contract: specs/002-poc-generation/contracts/ralph-loop.md
 */
import { spawn } from 'node:child_process';

import type { TestFailure, TestResults } from '../shared/schemas/session.js';

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RAW_OUTPUT_CHARS = 2_000;

// ── Vitest JSON output types ─────────────────────────────────────────────────

interface VitestAssertionResult {
  title: string;
  fullName: string;
  status: 'passed' | 'failed' | 'skipped' | 'todo' | 'pending';
  duration?: number;
  failureMessages?: string[];
  ancestorTitles?: string[];
}

interface VitestTestResult {
  testFilePath: string;
  status: 'passed' | 'failed';
  assertionResults: VitestAssertionResult[];
  startTime?: number;
  endTime?: number;
  message?: string;
}

interface VitestJsonReport {
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  numTotalTests?: number;
  success?: boolean;
  testResults?: VitestTestResult[];
  startTime?: number;
  endTime?: number;
}

// ── TestRunner ────────────────────────────────────────────────────────────────

export interface TestRunnerOptions {
  /** Timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
}

export class TestRunner {
  private readonly timeoutMs: number;

  constructor(options: TestRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Run the test suite in the given output directory.
   *
   * Spawns `npm test -- --reporter=json` and parses the JSON output.
   * On timeout, returns an error result.
   */
  async run(outputDir: string): Promise<TestResults> {
    const startTime = Date.now();

    let rawOutput = '';
    let timedOut = false;

    try {
      rawOutput = await this.spawnTests(outputDir, (timed) => {
        timedOut = timed;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.buildErrorResult(startTime, `Test runner error: ${msg}`);
    }

    if (timedOut) {
      return this.buildErrorResult(startTime, `Test runner timed out after ${this.timeoutMs}ms`);
    }

    // Truncate rawOutput to max chars from the end
    const truncatedOutput =
      rawOutput.length > MAX_RAW_OUTPUT_CHARS
        ? rawOutput.slice(-MAX_RAW_OUTPUT_CHARS)
        : rawOutput;

    return this.parseOutput(truncatedOutput, startTime, rawOutput);
  }

  /**
   * Spawn npm test and collect output.
   */
  private spawnTests(
    outputDir: string,
    onTimeout: (timed: boolean) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const child = spawn('npm', ['test', '--', '--reporter=json'], {
        cwd: outputDir,
        shell: false,
        env: {
          ...process.env,
          // Disable color output for reliable JSON parsing
          NO_COLOR: '1',
          FORCE_COLOR: '0',
        },
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      const timer = setTimeout(() => {
        onTimeout(true);
        child.kill('SIGTERM');
        // Force kill after 5 more seconds
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 5_000);
      }, this.timeoutMs);

      child.on('close', () => {
        clearTimeout(timer);
        // Combine stdout and stderr for parsing (Vitest may output to stderr)
        const combined = [
          Buffer.concat(stdoutChunks).toString('utf-8'),
          Buffer.concat(stderrChunks).toString('utf-8'),
        ]
          .filter(Boolean)
          .join('\n');
        resolve(combined);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Parse Vitest JSON reporter output into TestResults.
   * Exposed as protected for unit testing purposes.
   */
  protected parseOutput(output: string, startTime: number, rawOutput: string): TestResults {
    const durationMs = Date.now() - startTime;

    // Try to extract JSON from the output (Vitest may mix JSON with other output)
    const json = this.extractJson(output);

    if (!json) {
      // Could not parse JSON — return raw output as error info
      return {
        passed: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        durationMs,
        failures: [],
        rawOutput: rawOutput.slice(-MAX_RAW_OUTPUT_CHARS),
      };
    }

    const passed = json.numPassedTests ?? 0;
    const failed = json.numFailedTests ?? 0;
    const skipped = json.numPendingTests ?? 0;
    const total = json.numTotalTests ?? passed + failed + skipped;

    const failures: TestFailure[] = this.extractFailures(json);

    return {
      passed,
      failed,
      skipped,
      total,
      durationMs,
      failures: failures.slice(0, 10), // max 10 failures
      rawOutput: rawOutput.slice(-MAX_RAW_OUTPUT_CHARS),
    };
  }

  /**
   * Extract JSON object from potentially mixed output.
   */
  private extractJson(output: string): VitestJsonReport | null {
    // Try to find a JSON object/array in the output
    const lines = output.split('\n');

    // Try each line (Vitest may output JSON on a single line)
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          return JSON.parse(trimmed) as VitestJsonReport;
        } catch {
          // Not valid JSON on this line
        }
      }
    }

    // Try the entire output
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(output.slice(start, end + 1)) as VitestJsonReport;
      } catch {
        // Not valid JSON
      }
    }

    return null;
  }

  /**
   * Extract TestFailure objects from Vitest JSON output.
   */
  private extractFailures(json: VitestJsonReport): TestFailure[] {
    const failures: TestFailure[] = [];

    for (const testResult of json.testResults ?? []) {
      for (const assertion of testResult.assertionResults ?? []) {
        if (assertion.status === 'failed') {
          const message = assertion.failureMessages?.join('\n') ?? 'Test failed';
          failures.push({
            testName: assertion.fullName || assertion.title,
            message: message.substring(0, 500), // Truncate individual messages
            file: testResult.testFilePath,
          });
        }
      }
    }

    return failures;
  }

  /**
   * Build an error result (timeout or spawn failure).
   */
  private buildErrorResult(startTime: number, errorMessage: string): TestResults {
    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      durationMs: Date.now() - startTime,
      failures: [],
      rawOutput: errorMessage,
    };
  }
}
