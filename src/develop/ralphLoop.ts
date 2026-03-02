/**
 * Ralph Loop Orchestrator.
 *
 * Autonomous code-generation-test-refine cycle for the Develop phase.
 * Lifecycle: validate session → scaffold → install → iterate → terminate.
 *
 * Contract: specs/002-poc-generation/contracts/ralph-loop.md
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { CopilotClient } from '../shared/copilotClient.js';
import type { LoopIO } from '../loop/conversationLoop.js';
import type { ActivitySpinner } from '../shared/activitySpinner.js';
import type { SofiaEvent } from '../shared/events.js';
import { createActivityEvent } from '../shared/events.js';
import type {
  WorkshopSession,
  PocIteration,
  PocDevelopmentState,
  TestResults,
} from '../shared/schemas/session.js';
// McpManager import removed - accessed via McpContextEnricher.mcpManager public property
import { PocScaffolder, validatePocOutput } from './pocScaffolder.js';
import { TestRunner } from './testRunner.js';
import { CodeGenerator, isPathWithinDirectory, isUnsafePath } from './codeGenerator.js';
import { McpContextEnricher } from './mcpContextEnricher.js';
import { GitHubMcpAdapter } from './githubMcpAdapter.js';
import type { CheckpointState } from './checkpointState.js';
import type { TemplateEntry } from './templateRegistry.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RalphLoopOptions {
  /** CopilotClient for LLM interactions */
  client: CopilotClient;
  /** IO for user-visible output */
  io: LoopIO;
  /** The workshop session with selection and plan populated */
  session: WorkshopSession;
  /** Activity spinner for visual feedback */
  spinner?: ActivitySpinner;
  /** Maximum iterations before forced termination (default: 10) */
  maxIterations?: number;
  /** Working directory for the PoC (default: ./poc/<sessionId>/) */
  outputDir?: string;
  /** Callback for session persistence after each iteration */
  onSessionUpdate?: (session: WorkshopSession) => Promise<void>;
  /** Event listener for telemetry */
  onEvent?: (event: SofiaEvent) => void;
  /** MCP context enricher (optional) */
  enricher?: McpContextEnricher;
  /** GitHub MCP adapter (optional) */
  githubAdapter?: GitHubMcpAdapter;
  /** Override TestRunner for testing */
  testRunner?: TestRunner;
  /** Override PocScaffolder for testing */
  scaffolder?: PocScaffolder;
  /** Checkpoint state for resume behavior */
  checkpoint?: CheckpointState;
  /** Template entry for install/test commands */
  templateEntry?: TemplateEntry;
}

export interface RalphLoopResult {
  /** Updated session with poc state filled in */
  session: WorkshopSession;
  /** Final status of the loop */
  finalStatus: 'success' | 'failed' | 'partial';
  /** Why the loop stopped */
  terminationReason: 'tests-passing' | 'max-iterations' | 'user-stopped' | 'error';
  /** Total iterations executed */
  iterationsCompleted: number;
  /** Output directory for the PoC */
  outputDir: string;
}

// ── npm helper ───────────────────────────────────────────────────────────────

function runInstallCommand(
  cwd: string,
  installCommand = 'npm install',
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const parts = installCommand.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const child = spawn(cmd, args, {
      cwd,
      shell: false,
      stdio: 'pipe',
    });

    const stderr: string[] = [];
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr.push(chunk.toString());
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr.join('').slice(-500) || 'npm install failed' });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

// ── RalphLoop ────────────────────────────────────────────────────────────────

/**
 * Orchestrates the Ralph loop: scaffold → install → iterate → terminate.
 *
 * Implements the full lifecycle from the ralph-loop contract:
 * 1. Validate session (selection + plan present)
 * 2. Scaffold PoC (iteration 1)
 * 3. npm install
 * 4. For each iteration 2..max: run tests → check → build prompt → LLM → apply → persist
 * 5. Return result with final status
 */
export class RalphLoop {
  private readonly options: Required<
    Pick<RalphLoopOptions, 'client' | 'io' | 'session' | 'maxIterations' | 'outputDir'>
  > &
    RalphLoopOptions;

  private aborted = false;
  private sigintHandler: (() => void) | null = null;
  /** Mutable reference to the latest session state, used by the SIGINT handler (F010). */
  private currentSession: WorkshopSession;

  constructor(options: RalphLoopOptions) {
    const outputDir = options.outputDir ?? join(process.cwd(), 'poc', options.session.sessionId);

    this.options = {
      maxIterations: 10,
      onSessionUpdate: async () => {},
      onEvent: () => {},
      ...options,
      outputDir,
    };
    this.currentSession = options.session;
  }

  /**
   * Run the Ralph loop.
   *
   * Returns when: all tests pass, max iterations reached, user stopped (Ctrl+C), or error.
   */
  async run(): Promise<RalphLoopResult> {
    const {
      session: initialSession,
      io,
      client,
      maxIterations,
      outputDir,
      onEvent,
      spinner,
    } = this.options;

    const onSessionUpdate = this.options.onSessionUpdate ?? (async () => {});

    // ── Validate session ───────────────────────────────────────────────────
    if (!initialSession.selection) {
      throw new Error(
        'Session is missing a selection. Run the Select phase first before generating a PoC.',
      );
    }
    if (!initialSession.plan) {
      throw new Error(
        'Session is missing an implementation plan. Run the Plan phase first before generating a PoC.',
      );
    }

    let session = { ...initialSession };
    const startTime = Date.now();

    // ── Setup SIGINT handler ───────────────────────────────────────────────
    const safeOnEvent = onEvent ?? (() => {});
    this.setupSigintHandler(session, onSessionUpdate, safeOnEvent);

    // ── Resume detection ───────────────────────────────────────────────────
    const checkpoint = this.options.checkpoint;
    const templateEntry = this.options.templateEntry;
    const installCommand = templateEntry?.installCommand ?? 'npm install';
    const testCommandStr = templateEntry?.testCommand;

    // Seed iterations from prior session state (FR-001)
    const iterations: PocIteration[] = checkpoint?.hasPriorRun
      ? [...checkpoint.priorIterations]
      : [];

    // If last iteration was incomplete, pop it and re-run (FR-001a)
    if (checkpoint?.lastIterationIncomplete && iterations.length > 0) {
      io.writeActivity(
        `Re-running incomplete iteration ${iterations.length + 1} (no test results recorded)`,
      );
    }

    // ── Determine repo source ──────────────────────────────────────────────
    const githubAdapter = this.options.githubAdapter;
    const repoSource: 'local' | 'github-mcp' = githubAdapter?.isAvailable()
      ? 'github-mcp'
      : 'local';

    if (repoSource === 'local') {
      io.writeActivity(`GitHub MCP not available — using local output: ${outputDir}`);
    }

    // ── Build scaffold context ─────────────────────────────────────────────
    const scaffoldCtx = PocScaffolder.buildContext(session, outputDir, templateEntry);
    const techStack = scaffoldCtx.techStack;

    // ── Scaffold (skip if resuming with valid output dir) ──────────────────
    const shouldSkipScaffold = checkpoint?.canSkipScaffold === true;

    if (shouldSkipScaffold) {
      io.writeActivity('Skipping scaffold — output directory and .sofia-metadata.json present');
    } else {
      // FR-007: Re-scaffold when output dir is missing but iterations exist
      if (checkpoint?.hasPriorRun) {
        io.writeActivity('Output directory missing — re-scaffolding for resumed session');
      }

      io.writeActivity('Scaffolding PoC project structure...');
      spinner?.startThinking();

      const scaffolder = this.options.scaffolder ?? new PocScaffolder();
      const scaffoldStart = Date.now();

      let scaffoldResult;
      try {
        scaffoldResult = await scaffolder.scaffold(scaffoldCtx);
      } catch (err: unknown) {
        spinner?.stop();
        const msg = err instanceof Error ? err.message : String(err);
        return this.terminate(
          session,
          iterations,
          'failed',
          'error',
          startTime,
          outputDir,
          repoSource,
          techStack,
          onEvent,
          `Scaffold failed: ${msg}`,
        );
      }

      const scaffoldIteration: PocIteration = {
        iteration: iterations.length + 1,
        startedAt: new Date(scaffoldStart).toISOString(),
        endedAt: new Date().toISOString(),
        outcome: 'scaffold',
        filesChanged: scaffoldResult.createdFiles,
        changesSummary: `Scaffold created ${scaffoldResult.createdFiles.length} files`,
      };
      iterations.push(scaffoldIteration);

      spinner?.stop();
      io.writeActivity(`Scaffold complete: ${scaffoldResult.createdFiles.length} files created`);

      // Persist after scaffold
      session = this.updateSessionPoc(
        session,
        iterations,
        repoSource,
        outputDir,
        undefined,
        techStack,
      );
      await onSessionUpdate(session);

      // Push scaffold to GitHub if available
      if (githubAdapter?.isAvailable()) {
        await githubAdapter.createRepository({
          name: scaffoldCtx.projectName,
          description: scaffoldCtx.ideaDescription,
        });
        io.writeActivity(`Created GitHub repository: ${githubAdapter.getRepoUrl()}`);
      }
    }

    // ── Dependency install (FR-003: always re-run on resume) ───────────────
    if (!this.aborted) {
      io.writeActivity(`Re-running dependency installation (${installCommand})`);
      spinner?.startThinking();

      const installResult = await runInstallCommand(outputDir, installCommand);
      spinner?.stop();

      if (!installResult.success) {
        io.writeActivity(`${installCommand} failed: ${installResult.error}`);
        return this.terminate(
          session,
          iterations,
          'failed',
          'error',
          startTime,
          outputDir,
          repoSource,
          techStack,
          onEvent,
          `${installCommand} failed: ${installResult.error}`,
        );
      }

      io.writeActivity(`${installCommand} complete`);
    }

    // ── Iteration loop ─────────────────────────────────────────────────────
    const testRunner = this.options.testRunner ??
      new TestRunner(testCommandStr ? { testCommand: testCommandStr } : undefined);
    // Push scaffold files to GitHub after install
    if (githubAdapter?.isAvailable() && githubAdapter.getRepoUrl()) {
      const filesWithContent = await Promise.all(
        scaffoldResult.createdFiles.map(async (f) => {
          if (isUnsafePath(f) || !isPathWithinDirectory(f, outputDir)) {
            io.writeActivity(`Warning: skipping out-of-bounds file path for push: ${f}`);
            return null;
          }
          try {
            const content = await readFile(resolve(outputDir, f), 'utf-8');
            return { path: f, content };
          } catch (err) {
            io.writeActivity(
              `Warning: could not read file for push: ${f} — ${err instanceof Error ? err.message : String(err)}`,
            );
            return { path: f, content: '' };
          }
        }),
      );
      const validFiles = filesWithContent.filter(
        (file): file is { path: string; content: string } => file !== null,
      );
      await githubAdapter.pushFiles({
        repoUrl: githubAdapter.getRepoUrl()!,
        files: validFiles,
        commitMessage: 'chore: initial scaffold',
      });
    }

    // ── Iteration 2..max ──────────────────────────────────────────────────
    const codeGenerator = new CodeGenerator(outputDir);
    const enricher = this.options.enricher;

    let stuckIterations = 0;
    let prevFailingTests: string[] = [];

    // FR-004: Build prior iteration history for LLM context
    const priorHistoryContext = checkpoint?.hasPriorRun
      ? this.buildPriorHistoryContext(checkpoint.priorIterations)
      : '';

    const startIterNum = iterations.length + 1;

    for (let iterNum = startIterNum; iterNum <= maxIterations; iterNum++) {
      if (this.aborted) break;

      const iterStart = Date.now();
      safeOnEvent(createActivityEvent(`Starting iteration ${iterNum} of ${maxIterations}`));

      // ── Run tests ──────────────────────────────────────────────────────
      io.writeActivity(`Iteration ${iterNum}/${maxIterations}: Running tests...`);
      spinner?.startThinking();

      const testResults = await testRunner.run(outputDir);
      spinner?.stop();

      safeOnEvent(
        createActivityEvent(
          `Test results: ${testResults.passed} passed, ${testResults.failed} failed`,
        ),
      );

      // ── Check if all tests pass ────────────────────────────────────────
      if (testResults.failed === 0 && testResults.total > 0) {
        io.writeActivity(`All ${testResults.passed} tests pass! Loop complete.`);

        const successIteration: PocIteration = {
          iteration: iterNum,
          startedAt: new Date(iterStart).toISOString(),
          endedAt: new Date().toISOString(),
          outcome: 'tests-passing',
          filesChanged: [],
          testResults,
        };
        iterations.push(successIteration);

        session = this.updateSessionPoc(
          session,
          iterations,
          repoSource,
          outputDir,
          githubAdapter?.getRepoUrl(),
          techStack,
          'success',
          'tests-passing',
          Date.now() - startTime,
          testResults,
        );
        await onSessionUpdate(session);
        safeOnEvent(createActivityEvent('Ralph loop terminated: tests-passing'));
        this.cleanupSigint();

        // Validate PoC output; downgrade to 'partial' if validation fails
        const validation = await validatePocOutput(outputDir);
        if (!validation.valid) {
          const issues = [
            ...validation.missingFiles.map((f) => `missing: ${f}`),
            ...validation.errors,
          ];
          io.writeActivity(`PoC validation warning: ${issues.join('; ')}`);

          session = this.updateSessionPoc(
            session,
            iterations,
            repoSource,
            outputDir,
            githubAdapter?.getRepoUrl(),
            techStack,
            'partial',
            'tests-passing',
            Date.now() - startTime,
            testResults,
          );
          await onSessionUpdate(session);

          return {
            session,
            finalStatus: 'partial',
            terminationReason: 'tests-passing',
            iterationsCompleted: iterNum,
            outputDir,
          };
        }

        return {
          session,
          finalStatus: 'success',
          terminationReason: 'tests-passing',
          iterationsCompleted: iterNum,
          outputDir,
        };
      }

      // ── Check for stuck iterations (same failures) ─────────────────────
      const currentFailingTests = testResults.failures.map((f) => f.testName);
      if (
        currentFailingTests.length > 0 &&
        JSON.stringify(currentFailingTests.sort()) === JSON.stringify(prevFailingTests.sort())
      ) {
        stuckIterations++;
      } else {
        stuckIterations = 0;
      }
      prevFailingTests = currentFailingTests;

      // ── Enrich context (MCP) ───────────────────────────────────────────
      let mcpContext = '';
      if (enricher) {
        try {
          const enriched = await enricher.enrich({
            // enricher.mcpManager is a public readonly property on McpContextEnricher
            mcpManager: enricher.mcpManager,
            dependencies: session.plan?.dependencies ?? [],
            architectureNotes: session.plan?.architectureNotes ?? '',
            stuckIterations,
            failingTests: currentFailingTests,
          });
          mcpContext = enriched.combined;
        } catch {
          // Degrade gracefully
        }
      }

      // ── Build LLM prompt ───────────────────────────────────────────────
      const filesInPoc = codeGenerator.getFilesInPoc();
      const prevIteration = iterations[iterations.length - 1];
      const prevOutcome = prevIteration?.outcome ?? 'scaffold';

      // Read actual file contents so the LLM can see the code (F003/F004)
      const fileContents = await this.readFileContents(
        outputDir,
        filesInPoc,
        currentFailingTests,
        testResults,
      );

      const prompt = codeGenerator.buildIterationPrompt({
        iteration: iterNum,
        maxIterations,
        previousOutcome: prevOutcome,
        testResults,
        filesInPoc,
        mcpContext: [priorHistoryContext, mcpContext].filter(Boolean).join('\n') || undefined,
        fileContents,
      });

      const promptSummary = codeGenerator.buildPromptContextSummary({
        iteration: iterNum,
        maxIterations,
        previousOutcome: prevOutcome,
        testResults,
        filesInPoc,
        mcpContext: mcpContext || undefined,
      });

      safeOnEvent(createActivityEvent(`Sending iteration ${iterNum} prompt to LLM`));

      // ── LLM turn (single-turn, auto-completing) ────────────────────────
      io.writeActivity(`Generating code for iteration ${iterNum}...`);
      spinner?.startThinking();

      let llmResponse = '';
      let llmError: string | undefined;

      try {
        llmResponse = await this.runSingleLlmTurn(client, session, prompt);
      } catch (err: unknown) {
        llmError = err instanceof Error ? err.message : String(err);
      }

      spinner?.stop();

      if (llmError || !llmResponse) {
        io.writeActivity(`LLM error in iteration ${iterNum}: ${llmError ?? 'empty response'}`);

        const errIteration: PocIteration = {
          iteration: iterNum,
          startedAt: new Date(iterStart).toISOString(),
          endedAt: new Date().toISOString(),
          outcome: 'error',
          filesChanged: [],
          errorMessage: llmError ?? 'LLM returned empty response',
          llmPromptContext: promptSummary,
          testResults,
        };
        iterations.push(errIteration);

        session = this.updateSessionPoc(
          session,
          iterations,
          repoSource,
          outputDir,
          githubAdapter?.getRepoUrl(),
          techStack,
        );
        await onSessionUpdate(session);
        continue; // Continue to next iteration — LLM may recover
      }

      safeOnEvent(createActivityEvent(`LLM generated code for iteration ${iterNum}`));

      // ── Apply code changes ─────────────────────────────────────────────
      const applyResult = await codeGenerator.applyChanges(llmResponse);
      applyResult.llmPromptContext = promptSummary;

      io.writeActivity(
        `Applied ${applyResult.writtenFiles.length} file(s): ${applyResult.writtenFiles.slice(0, 5).join(', ')}`,
      );

      // Re-run install command if dependencies changed
      if (applyResult.dependenciesChanged) {
        io.writeActivity(`New dependencies detected — running ${installCommand}...`);
        spinner?.startThinking();
        const reinstall = await runInstallCommand(outputDir, installCommand);
        spinner?.stop();

        if (!reinstall.success) {
          io.writeActivity(`npm install failed in iteration ${iterNum}: ${reinstall.error}`);
          const errIteration: PocIteration = {
            iteration: iterNum,
            startedAt: new Date(iterStart).toISOString(),
            endedAt: new Date().toISOString(),
            outcome: 'error',
            filesChanged: applyResult.writtenFiles,
            errorMessage: `npm install failed: ${reinstall.error}`,
            llmPromptContext: promptSummary,
          };
          iterations.push(errIteration);
          session = this.updateSessionPoc(
            session,
            iterations,
            repoSource,
            outputDir,
            githubAdapter?.getRepoUrl(),
            techStack,
          );
          await onSessionUpdate(session);
          continue; // Continue — LLM may fix the bad dependency
        }
      }

      // Push iteration files to GitHub if available
      if (githubAdapter?.isAvailable() && githubAdapter.getRepoUrl()) {
        const filesWithContent = await Promise.all(
          applyResult.writtenFiles.map(async (f) => {
            if (isUnsafePath(f) || !isPathWithinDirectory(f, outputDir)) {
              io.writeActivity(`Warning: skipping out-of-bounds file path for push: ${f}`);
              return null;
            }
            try {
              const content = await readFile(resolve(outputDir, f), 'utf-8');
              return { path: f, content };
            } catch (err) {
              io.writeActivity(
                `Warning: could not read file for push: ${f} — ${err instanceof Error ? err.message : String(err)}`,
              );
              return { path: f, content: '' };
            }
          }),
        );
        const validFiles = filesWithContent.filter(
          (file): file is { path: string; content: string } => file !== null,
        );
        await githubAdapter.pushFiles({
          repoUrl: githubAdapter.getRepoUrl()!,
          files: validFiles,
          commitMessage: `chore: iteration ${iterNum} — ${testResults.failed} test(s) failing`,
        });
      }

      // FR-022: Rescan TODO markers after applying changes
      try {
        await PocScaffolder.scanAndRecordTodos(outputDir);
      } catch {
        // Non-critical — ignore scanning errors
      }

      const failIteration: PocIteration = {
        iteration: iterNum,
        startedAt: new Date(iterStart).toISOString(),
        endedAt: new Date().toISOString(),
        outcome: 'tests-failing',
        filesChanged: applyResult.writtenFiles,
        testResults,
        llmPromptContext: promptSummary,
      };
      iterations.push(failIteration);

      session = this.updateSessionPoc(
        session,
        iterations,
        repoSource,
        outputDir,
        githubAdapter?.getRepoUrl(),
        techStack,
      );
      await onSessionUpdate(session);

      if (this.aborted) break;
    }

    // ── Max iterations reached (or user-stopped) ───────────────────────
    if (this.aborted) {
      this.cleanupSigint();

      // Compute finalStatus for the result, but do NOT persist it to the session.
      // Contract: on user abort, session.poc.finalStatus must remain unset so the
      // session can be resumed later without a stale terminal status. (F012)
      const lastIterForAbort = iterations[iterations.length - 1];
      const lastTestsForAbort = lastIterForAbort?.testResults;
      const abortFinalStatus =
        (lastTestsForAbort?.passed ?? 0) > 0 ? ('partial' as const) : ('failed' as const);

      session = this.updateSessionPoc(
        session,
        iterations,
        repoSource,
        outputDir,
        githubAdapter?.getRepoUrl(),
        techStack,
        undefined, // finalStatus deliberately omitted on user-stop
        'user-stopped',
        Date.now() - startTime,
        lastTestsForAbort,
      );
      await onSessionUpdate(session);
      safeOnEvent(createActivityEvent('Ralph loop terminated: user-stopped'));

      return {
        session,
        finalStatus: abortFinalStatus,
        terminationReason: 'user-stopped',
        iterationsCompleted: iterations.length,
        outputDir,
      };
    }

    // Determine final status based on a final test run after the last code changes (F008)
    io.writeActivity('Running final test pass after last iteration...');
    const lastIter = iterations[iterations.length - 1];
    let finalTestResults: TestResults | undefined;
    try {
      finalTestResults = await testRunner.run(outputDir);
    } catch {
      // If test runner fails, fall back to last iteration's results
    }

    if (finalTestResults && finalTestResults.failed === 0 && finalTestResults.passed > 0) {
      // Last code fix actually resolved all failures!
      const finalIteration: PocIteration = {
        iteration: iterations.length + 1,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        outcome: 'tests-passing',
        filesChanged: [],
        testResults: finalTestResults,
      };
      iterations.push(finalIteration);

      session = this.updateSessionPoc(
        session,
        iterations,
        repoSource,
        outputDir,
        githubAdapter?.getRepoUrl(),
        techStack,
        'success',
        'tests-passing',
        Date.now() - startTime,
        finalTestResults,
      );
      await onSessionUpdate(session);
      safeOnEvent(createActivityEvent('Ralph loop terminated: tests-passing (final run)'));
      this.cleanupSigint();

      // Validate PoC output; downgrade to 'partial' if validation fails
      const validation = await validatePocOutput(outputDir);
      if (!validation.valid) {
        const issues = [
          ...validation.missingFiles.map((f) => `missing: ${f}`),
          ...validation.errors,
        ];
        io.writeActivity(`PoC validation warning: ${issues.join('; ')}`);

        session = this.updateSessionPoc(
          session,
          iterations,
          repoSource,
          outputDir,
          githubAdapter?.getRepoUrl(),
          techStack,
          'partial',
          'tests-passing',
          Date.now() - startTime,
          finalTestResults,
        );
        await onSessionUpdate(session);

        return {
          session,
          finalStatus: 'partial',
          terminationReason: 'tests-passing',
          iterationsCompleted: iterations.length,
          outputDir,
        };
      }

      return {
        session,
        finalStatus: 'success',
        terminationReason: 'tests-passing',
        iterationsCompleted: iterations.length,
        outputDir,
      };
    }

    // Use final test results if available, otherwise fall back to last iteration
    const effectiveTestResults = finalTestResults ?? lastIter?.testResults;
    const someTestsPassed = (effectiveTestResults?.passed ?? 0) > 0;
    const finalStatus = someTestsPassed ? 'partial' : 'failed';

    io.writeActivity(`Max iterations (${maxIterations}) reached. Final status: ${finalStatus}`);
    safeOnEvent(createActivityEvent(`Ralph loop terminated: max-iterations (${finalStatus})`));

    session = this.updateSessionPoc(
      session,
      iterations,
      repoSource,
      outputDir,
      githubAdapter?.getRepoUrl(),
      techStack,
      finalStatus,
      'max-iterations',
      Date.now() - startTime,
      effectiveTestResults,
    );
    await onSessionUpdate(session);
    this.cleanupSigint();

    return {
      session,
      finalStatus,
      terminationReason: 'max-iterations',
      iterationsCompleted: iterations.length,
      outputDir,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Build a concise summary of prior iteration history for LLM context (FR-004).
   */
  private buildPriorHistoryContext(priorIterations: PocIteration[]): string {
    if (priorIterations.length === 0) return '';

    const lines = ['## Prior Iteration History (Resume Context)', ''];
    for (const iter of priorIterations) {
      const status = iter.testResults
        ? `${iter.testResults.passed} passed, ${iter.testResults.failed} failed`
        : iter.outcome;
      const files = iter.filesChanged?.length
        ? ` — files: ${iter.filesChanged.slice(0, 5).join(', ')}`
        : '';
      lines.push(`- Iteration ${iter.iteration}: ${status}${files}`);
    }
    lines.push('');
    return lines.join('\n');
  }

  /** Maximum total size of file contents to include in the prompt (50KB). */
  private static readonly MAX_FILE_CONTENT_BYTES = 50 * 1024;

  /**
   * Read file contents from the PoC directory for inclusion in the iteration prompt.
   *
   * If the total content exceeds MAX_FILE_CONTENT_BYTES, includes only files
   * referenced in test failures plus core files (src/index.ts, package.json).
   */
  private async readFileContents(
    outputDir: string,
    filesInPoc: string[],
    failingTests: string[],
    testResults: TestResults,
  ): Promise<Array<{ path: string; content: string }>> {
    // Flatten the tree listing into actual relative file paths
    const flatFiles = filesInPoc
      .map((f) => f.replace(/^\s+/, ''))
      .filter((f) => !f.endsWith('/') && f.length > 0);

    // Read all file contents
    const allContents: Array<{ path: string; content: string }> = [];
    for (const relPath of flatFiles) {
      try {
        const fullPath = join(outputDir, relPath);
        const content = await readFile(fullPath, 'utf-8');
        allContents.push({ path: relPath, content });
      } catch {
        // skip unreadable files
      }
    }

    // Check total size
    const totalSize = allContents.reduce(
      (sum, f) => sum + Buffer.byteLength(f.content, 'utf-8'),
      0,
    );
    if (totalSize <= RalphLoop.MAX_FILE_CONTENT_BYTES) {
      return allContents;
    }

    // Over budget — filter to only failure-referenced files + core files
    this.options.io.writeActivity(
      `File content exceeds 50KB (${(totalSize / 1024).toFixed(1)}KB), including only failure-referenced files`,
    );
    const coreFiles = new Set(['src/index.ts', 'package.json']);

    // Gather file references from failures
    const failureFiles = new Set<string>();
    for (const failure of testResults.failures) {
      if (failure.file) failureFiles.add(failure.file);
    }

    return allContents.filter((f) => coreFiles.has(f.path) || failureFiles.has(f.path));
  }

  /**
   * Run a single auto-completing LLM turn.
   * Creates a minimal conversation session with the system prompt.
   */
  private async runSingleLlmTurn(
    client: CopilotClient,
    session: WorkshopSession,
    prompt: string,
  ): Promise<string> {
    const { buildSystemPrompt } = await import('../prompts/promptLoader.js');
    let systemPrompt: string;
    try {
      systemPrompt = await buildSystemPrompt('Develop');
    } catch {
      systemPrompt =
        'You are a TypeScript code generator. Output complete files in fenced code blocks with file= paths.';
    }

    const conversationSession = await client.createSession({
      systemPrompt,
      infiniteSessions: {
        backgroundCompactionThreshold: 0.7,
        bufferExhaustionThreshold: 0.9,
      },
    });

    let response = '';
    const stream = conversationSession.send({ role: 'user', content: prompt });

    for await (const event of stream) {
      if (event.type === 'TextDelta') {
        response += event.text;
      }
    }

    return response;
  }

  /**
   * Update the session's poc field with current state.
   */
  private updateSessionPoc(
    session: WorkshopSession,
    iterations: PocIteration[],
    repoSource: 'local' | 'github-mcp',
    outputDir: string,
    repoUrl?: string,
    techStack?: {
      language: string;
      runtime: string;
      testRunner: string;
      buildCommand?: string;
      framework?: string;
    },
    finalStatus?: 'success' | 'failed' | 'partial',
    terminationReason?: 'tests-passing' | 'max-iterations' | 'user-stopped' | 'error',
    totalDurationMs?: number,
    finalTestResults?: PocDevelopmentState['finalTestResults'],
  ): WorkshopSession {
    const poc: PocDevelopmentState = {
      repoSource,
      repoPath: repoSource === 'local' ? outputDir : undefined,
      repoUrl: repoSource === 'github-mcp' ? repoUrl : undefined,
      techStack,
      iterations,
      finalStatus,
      terminationReason,
      totalDurationMs,
      finalTestResults,
    };

    const updated: WorkshopSession = {
      ...session,
      poc,
      updatedAt: new Date().toISOString(),
    };
    // Keep the mutable reference up to date for the SIGINT handler (F010)
    this.currentSession = updated;
    return updated;
  }

  /**
   * Build a terminate result with session updated.
   */
  private async terminate(
    session: WorkshopSession,
    iterations: PocIteration[],
    finalStatus: 'success' | 'failed' | 'partial',
    terminationReason: 'tests-passing' | 'max-iterations' | 'user-stopped' | 'error',
    startTime: number,
    outputDir: string,
    repoSource: 'local' | 'github-mcp',
    techStack?: {
      language: string;
      runtime: string;
      testRunner: string;
      buildCommand?: string;
      framework?: string;
    },
    onEvent?: (event: SofiaEvent) => void,
    errorMessage?: string,
  ): Promise<RalphLoopResult> {
    if (errorMessage) {
      this.options.io.writeActivity(`Error: ${errorMessage}`);
    }

    const updatedSession = this.updateSessionPoc(
      session,
      iterations,
      repoSource,
      outputDir,
      undefined,
      techStack,
      finalStatus,
      terminationReason,
      Date.now() - startTime,
    );

    await this.options.onSessionUpdate?.(updatedSession);
    if (onEvent) onEvent(createActivityEvent(`Ralph loop terminated: ${terminationReason}`));
    this.cleanupSigint();

    return {
      session: updatedSession,
      finalStatus,
      terminationReason,
      iterationsCompleted: iterations.length,
      outputDir,
    };
  }

  /**
   * Setup SIGINT handler for Ctrl+C.
   * Uses `this.currentSession` (mutable) so the handler always persists the latest state (F010).
   */
  private setupSigintHandler(
    _session: WorkshopSession,
    onSessionUpdate: (s: WorkshopSession) => Promise<void>,
    onEvent: (e: SofiaEvent) => void,
  ): void {
    this.sigintHandler = () => {
      this.aborted = true;
      this.options.io.writeActivity('\nCtrl+C detected — stopping after current iteration...');
      onEvent(createActivityEvent('User requested stop (SIGINT)'));
      void onSessionUpdate(this.currentSession);
    };
    process.once('SIGINT', this.sigintHandler);
  }

  /**
   * Remove the SIGINT handler.
   */
  private cleanupSigint(): void {
    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }
  }
}
