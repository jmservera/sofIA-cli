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
} from '../shared/schemas/session.js';
// McpManager import removed - accessed via McpContextEnricher.mcpManager public property
import { PocScaffolder } from './pocScaffolder.js';
import { TestRunner } from './testRunner.js';
import { CodeGenerator, isPathWithinDirectory, isUnsafePath } from './codeGenerator.js';
import { McpContextEnricher } from './mcpContextEnricher.js';
import { GitHubMcpAdapter } from './githubMcpAdapter.js';

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

function runNpmInstall(cwd: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['install'], {
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

  constructor(options: RalphLoopOptions) {
    const outputDir =
      options.outputDir ?? join(process.cwd(), 'poc', options.session.sessionId);

    this.options = {
      maxIterations: 10,
      onSessionUpdate: async () => {},
      onEvent: () => {},
      ...options,
      outputDir,
    };
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

    const iterations: PocIteration[] = [];

    // ── Determine repo source ──────────────────────────────────────────────
    const githubAdapter = this.options.githubAdapter;
    const repoSource: 'local' | 'github-mcp' =
      githubAdapter?.isAvailable() ? 'github-mcp' : 'local';

    if (repoSource === 'local') {
      io.writeActivity(`GitHub MCP not available — using local output: ${outputDir}`);
    }

    // ── Build scaffold context ─────────────────────────────────────────────
    const scaffoldCtx = PocScaffolder.buildContext(session, outputDir);
    const techStack = scaffoldCtx.techStack;

    // ── Iteration 1: Scaffold ──────────────────────────────────────────────
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
      iteration: 1,
      startedAt: new Date(scaffoldStart).toISOString(),
      endedAt: new Date().toISOString(),
      outcome: 'scaffold',
      filesChanged: scaffoldResult.createdFiles,
      changesSummary: `Scaffold created ${scaffoldResult.createdFiles.length} files`,
    };
    iterations.push(scaffoldIteration);

    spinner?.stop();
    io.writeActivity(
      `Scaffold complete: ${scaffoldResult.createdFiles.length} files created`,
    );

    // Persist after scaffold
    session = this.updateSessionPoc(session, iterations, repoSource, outputDir, undefined, techStack);
    await onSessionUpdate(session);

    // Push scaffold to GitHub if available
    if (githubAdapter?.isAvailable()) {
      await githubAdapter.createRepository({
        name: scaffoldCtx.projectName,
        description: scaffoldCtx.ideaDescription,
      });
      io.writeActivity(`Created GitHub repository: ${githubAdapter.getRepoUrl()}`);
    }

    // ── npm install ────────────────────────────────────────────────────────
    if (!this.aborted) {
      io.writeActivity('Running npm install...');
      spinner?.startThinking();

      const installResult = await runNpmInstall(outputDir);
      spinner?.stop();

      if (!installResult.success) {
        io.writeActivity(`npm install failed: ${installResult.error}`);
        // Fail fast after scaffold npm install failure
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
          `npm install failed: ${installResult.error}`,
        );
      }

      io.writeActivity('npm install complete');
    }

    // ── Iteration 2..max ──────────────────────────────────────────────────
    const testRunner = this.options.testRunner ?? new TestRunner();
    const codeGenerator = new CodeGenerator(outputDir);
    const enricher = this.options.enricher;

    let stuckIterations = 0;
    let prevFailingTests: string[] = [];

    for (let iterNum = 2; iterNum <= maxIterations; iterNum++) {
      if (this.aborted) break;

      const iterStart = Date.now();
      safeOnEvent(createActivityEvent(`Starting iteration ${iterNum} of ${maxIterations}`));

      // ── Run tests ──────────────────────────────────────────────────────
      io.writeActivity(`Iteration ${iterNum}/${maxIterations}: Running tests...`);
      spinner?.startThinking();

      const testResults = await testRunner.run(outputDir);
      spinner?.stop();

      safeOnEvent(
        createActivityEvent(`Test results: ${testResults.passed} passed, ${testResults.failed} failed`),
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

      const prompt = codeGenerator.buildIterationPrompt({
        iteration: iterNum,
        maxIterations,
        previousOutcome: prevOutcome,
        testResults,
        filesInPoc,
        mcpContext: mcpContext || undefined,
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

        session = this.updateSessionPoc(session, iterations, repoSource, outputDir, githubAdapter?.getRepoUrl(), techStack);
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

      // Re-run npm install if dependencies changed
      if (applyResult.dependenciesChanged) {
        io.writeActivity('New dependencies detected — running npm install...');
        spinner?.startThinking();
        const reinstall = await runNpmInstall(outputDir);
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
          session = this.updateSessionPoc(session, iterations, repoSource, outputDir, githubAdapter?.getRepoUrl(), techStack);
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
              io.writeActivity(`Warning: could not read file for push: ${f} — ${err instanceof Error ? err.message : String(err)}`);
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

      session = this.updateSessionPoc(session, iterations, repoSource, outputDir, githubAdapter?.getRepoUrl(), techStack);
      await onSessionUpdate(session);

      if (this.aborted) break;
    }

    // ── Max iterations reached (or user-stopped) ───────────────────────
    if (this.aborted) {
      this.cleanupSigint();
      session = this.updateSessionPoc(
        session,
        iterations,
        repoSource,
        outputDir,
        githubAdapter?.getRepoUrl(),
        techStack,
        'failed',
        'user-stopped',
        Date.now() - startTime,
      );
      await onSessionUpdate(session);
      safeOnEvent(createActivityEvent('Ralph loop terminated: user-stopped'));

      return {
        session,
        finalStatus: 'failed',
        terminationReason: 'user-stopped',
        iterationsCompleted: iterations.length,
        outputDir,
      };
    }

    // Determine final status based on last test results
    const lastIter = iterations[iterations.length - 1];
    const lastTestResults = lastIter?.testResults;
    const someTestsPassed = (lastTestResults?.passed ?? 0) > 0;
    const finalStatus = someTestsPassed ? 'partial' : 'failed';

    io.writeActivity(
      `Max iterations (${maxIterations}) reached. Final status: ${finalStatus}`,
    );
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
      lastTestResults,
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

    const conversationSession = await client.createSession({ systemPrompt });

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
    techStack?: { language: string; runtime: string; testRunner: string; buildCommand?: string; framework?: string },
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

    return {
      ...session,
      poc,
      updatedAt: new Date().toISOString(),
    };
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
    techStack?: { language: string; runtime: string; testRunner: string; buildCommand?: string; framework?: string },
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
   */
  private setupSigintHandler(
    session: WorkshopSession,
    onSessionUpdate: (s: WorkshopSession) => Promise<void>,
    onEvent: (e: SofiaEvent) => void,
  ): void {
    this.sigintHandler = () => {
      this.aborted = true;
      this.options.io.writeActivity('\nCtrl+C detected — stopping after current iteration...');
      onEvent(createActivityEvent('User requested stop (SIGINT)'));
      void onSessionUpdate(session);
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
