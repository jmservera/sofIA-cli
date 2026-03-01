# Research: PoC Generation & Ralph Loop

**Feature ID**: 002-poc-generation  
**Date**: 2026-02-27  
**Status**: Complete

---

## Topic 1: Ralph Loop Pattern

### Findings

The Ralph Loop is an **autonomous, iterative code-generation-test-refine** pattern originally conceived by Geoffrey Huntley ([ghuntley.com/ralph](https://ghuntley.com/ralph/)) and formalized as a Claude Code plugin at [`anthropics/claude-plugins-official/plugins/ralph-loop`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop).

#### Canonical Pattern

The core concept is simple: **a `while true` loop that repeatedly feeds the same prompt to an LLM**, where the LLM's work persists across iterations via the filesystem.

```
┌───────────────────────────────────────────┐
│              Ralph Loop                   │
│                                           │
│   ┌─────────┐     ┌────────────────┐      │
│   │  Prompt  │────▶│ LLM works on   │     │
│   │ (fixed)  │     │ task, modifies  │     │
│   └─────────┘     │ files, runs     │     │
│       ▲           │ tests           │     │
│       │           └───────┬────────┘      │
│       │                   │               │
│       │           ┌───────▼────────┐      │
│       │           │ Check exit     │      │
│       │           │ conditions     │      │
│       │           └───────┬────────┘      │
│       │                   │               │
│       │         ┌─────────┴─────────┐     │
│       │     CONTINUE             STOP     │
│       │         │                   │     │
│       └─────────┘           ┌───────▼──┐  │
│                             │ Complete │  │
│                             └──────────┘  │
└───────────────────────────────────────────┘
```

#### Iteration Steps (per the canonical implementation)

1. **LLM receives the SAME prompt** every iteration (the prompt never changes)
2. **LLM works on the task** — generates/modifies code, runs tests, reviews output
3. **LLM tries to exit** — considers itself "done" for this pass
4. **Stop hook intercepts** — checks termination conditions
5. **If not complete** — blocks exit, feeds the same prompt back, increments iteration counter
6. **Self-reference** — LLM sees its previous work in files and git history

#### Termination Conditions

The canonical implementation uses three termination mechanisms:

| Condition | Mechanism | Priority |
|-----------|-----------|----------|
| **Completion promise** | LLM outputs `<promise>EXACT_TEXT</promise>` tag; stop hook does exact string match | Primary (semantic) |
| **Max iterations** | Counter in state file; stop hook checks `iteration >= max_iterations` | Safety net |
| **State file removal** | User runs `/cancel-ralph` or hook detects corruption | Manual override |

#### State File Format

```markdown
---
active: true
iteration: 1
max_iterations: 10
completion_promise: "All tests passing"
started_at: "2026-02-27T14:30:00Z"
---

Build a REST API for todos.
When complete:
- All CRUD endpoints working
- Tests passing (coverage > 80%)
- Output: <promise>All tests passing</promise>
```

#### Feedback Mechanism

**Key insight**: The feedback is NOT output-to-input piping. Instead:
- The prompt stays the same every iteration
- The LLM's work **persists in files on disk**
- Each iteration, the LLM **reads its own prior work** from the filesystem
- This creates a self-referential improvement loop via file-system state

The stop hook outputs a JSON `block` decision:
```json
{
  "decision": "block",
  "reason": "<the original prompt text>",
  "systemMessage": "🔄 Ralph iteration 5 | To stop: output <promise>DONE</promise>"
}
```

#### Adaptation for sofIA

For sofIA's Develop phase, we need to **internalize** the Ralph loop rather than using external bash hooks. Key differences from the canonical pattern:

| Aspect | Canonical (Claude Code) | sofIA Adaptation |
|--------|------------------------|-------------------|
| Loop mechanism | Bash `while true` / Stop hook | TypeScript `while` loop in `ralphLoop.ts` |
| Feedback | File system persistence | File system + structured `PocIteration` in session |
| Prompt | Fixed markdown file | Dynamic, enriched with test failure context |
| Termination | Promise tag + max iterations | Tests passing + max iterations + user abort |
| State | `.claude/ralph-loop.local.md` | `WorkshopSession.poc.iterations[]` |

**Critical enhancement**: Unlike the canonical Ralph loop where the prompt never changes, sofIA's adaptation should **inject test failure output** into subsequent prompts. This is closer to how the `skill-creator` plugin's `run_loop.py` works — evaluation results from iteration N feed into the improvement prompt for iteration N+1.

### Decision

Implement a **modified Ralph loop** in `src/develop/ralphLoop.ts` with these iteration steps:

1. **Generate/refine code** — Send prompt + test failures to LLM, write output files
2. **Run tests** — Execute test runner, capture structured results
3. **Evaluate termination** — Check: tests pass? max iterations? user abort? stuck detection?
4. **Record iteration** — Persist `PocIteration` to session
5. **Loop or exit** — Feed failures as context into next iteration, or finalize

### Rationale

- Internalizing the loop (vs. external bash) gives us structured state tracking, session persistence, and the ability to enrich prompts with failure context
- Adding test-failure injection improves convergence speed vs. plain prompt repetition
- Keeping the `max_iterations` safety net and adding stuck-detection (same failures N times) prevents infinite loops

### Alternatives Considered

1. **External bash loop wrapping `sofiacli`** — Rejected: loses session integration, no structured state, platform-specific
2. **Pure prompt repetition (canonical Ralph)** — Rejected: slower convergence without failure context injection
3. **LangGraph-style state machine** — Rejected: over-engineered for this use case, adds a heavy dependency

---

## Topic 2: Test Runner Invocation from Node.js

### Findings

#### Approach: `child_process.spawn` with JSON reporter

```typescript
import { spawn } from 'node:child_process';

interface TestResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: TestFailure[];
}

interface TestFailure {
  name: string;
  message: string;
  stack?: string;
}

async function runTests(cwd: string, timeout = 60_000): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['vitest', 'run', '--reporter=json'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      env: { ...process.env, CI: '1', NO_COLOR: '1' },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString();
      const stderr = Buffer.concat(stderrChunks).toString();

      try {
        const json = JSON.parse(stdout);
        resolve(parseVitestJson(json));
      } catch {
        // Fallback: parse exit code
        resolve({
          passed: code === 0 ? 1 : 0,
          failed: code === 0 ? 0 : 1,
          skipped: 0,
          duration: 0,
          failures: code !== 0
            ? [{ name: 'unknown', message: stderr || stdout }]
            : [],
        });
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Test runner failed to start: ${err.message}`));
    });
  });
}
```

#### spawn vs exec

| Factor | `spawn` | `exec` |
|--------|---------|--------|
| Buffer limit | **No limit** (streams) | 1MB default `maxBuffer` |
| Streaming | Yes — can process real-time | No — waits for completion |
| Timeout | Built-in `timeout` option | Built-in `timeout` option |
| Signal handling | Direct `child.kill()` | Same via returned child |
| **Verdict** | **Preferred** | Acceptable for small output |

Use `spawn` because test output can be large (especially with failure stacks).

#### JSON Reporters by Test Runner

| Runner | JSON Flag | Output |
|--------|-----------|--------|
| **Vitest** | `--reporter=json` | `{ numPassedTests, numFailedTests, testResults[] }` |
| **Jest** | `--json` | Same format (Vitest is Jest-compatible) |
| **Node test runner** | `--test-reporter=spec` | TAP output (parse with `tap-parser`) |
| **TAP** | Various | Use `tap-parser` npm package to parse |

**Recommendation**: Use Vitest JSON reporter since the project already uses Vitest. Fall back to exit-code parsing if JSON fails.

#### Timeout Handling

```typescript
const child = spawn('npx', ['vitest', 'run', '--reporter=json'], {
  cwd,
  timeout: 60_000,        // Kill after 60s
  killSignal: 'SIGTERM',  // Graceful first
});

// Belt-and-suspenders: hard kill after grace period
const hardKill = setTimeout(() => {
  if (!child.killed) child.kill('SIGKILL');
}, timeout + 5_000);

child.on('close', () => clearTimeout(hardKill));
```

#### Environment Variables

Set these to prevent interactive/hanging behavior:
```typescript
env: {
  ...process.env,
  CI: '1',           // Disable watch mode, interactive prompts
  NO_COLOR: '1',     // Clean output for parsing
  FORCE_COLOR: '0',  // Redundant safety
}
```

### Decision

Use `child_process.spawn` with Vitest's `--reporter=json` flag. Capture stdout/stderr separately. Apply a configurable timeout (default 60s) with belt-and-suspenders hard kill. Parse JSON output into a `TestResult` struct; fall back to exit-code parsing on malformed output.

### Rationale

- `spawn` handles arbitrarily large output without buffering issues
- JSON reporter gives structured results without regex parsing
- Vitest is already the project's test runner, so the JSON format is well-understood
- Separate stdout/stderr capture allows clean JSON parsing even when warnings appear on stderr

### Alternatives Considered

1. **`exec` with `maxBuffer`** — Rejected: risk of truncation on large test output
2. **TAP protocol** — Rejected: requires additional parser dependency; Vitest's JSON is sufficient
3. **Vitest Node API** — Rejected: tightly couples to Vitest version; `spawn` is runner-agnostic
4. **`node:test` built-in runner** — Rejected: less mature, fewer features than Vitest for this use case

---

## Topic 3: GitHub MCP Repo Creation

### Findings

The GitHub MCP server at `https://api.githubcopilot.com/mcp/` provides tools via the Model Context Protocol. Based on the MCP standard and GitHub's documentation, the available tools include:

#### Available Tools (relevant subset)

| Tool | Description |
|------|-------------|
| `create_repository` | Create a new GitHub repository |
| `create_or_update_file` | Create or update a single file in a repo |
| `push_files` | Push multiple files in a single commit |
| `create_branch` | Create a new branch |
| `create_pull_request` | Open a PR |
| `search_repositories` | Search existing repos |
| `get_file_contents` | Read file from repo |
| `list_branches` | List branches |

#### Tool Calling Pattern via Copilot SDK

The Copilot SDK routes MCP tool calls automatically when MCP servers are configured. The flow is:

```
ConversationSession.send(prompt)
  → SDK resolves MCP servers from config
  → LLM decides to call a tool (e.g., create_repository)
  → SDK routes to GitHub MCP server
  → Server executes against GitHub API
  → Result returned as ToolResult event
```

In sofIA's architecture, MCP tools are invoked **indirectly** — the LLM decides which tools to call based on the system prompt. The `developPocPrompt` would instruct the LLM to:

1. Check if a repo already exists (or use local fallback)
2. Create the repo with `create_repository`
3. Push scaffold files with `push_files` or `create_or_update_file`
4. Create a branch for the PoC work

#### Direct MCP Invocation (Alternative)

For more deterministic control, sofIA could call MCP tools directly without going through the LLM:

```typescript
// Hypothetical direct MCP tool call via SDK
// The Copilot SDK's CopilotSession may expose tool invocation
const result = await sdkSession.invokeTool('create_repository', {
  name: `sofia-poc-${sessionId}`,
  description: 'PoC generated by sofIA workshop',
  private: true,
  auto_init: true,
});
```

However, the current `@github/copilot-sdk` API uses `sendAndWait`, which routes through the LLM. Direct tool invocation would require using the MCP protocol directly (e.g., `@modelcontextprotocol/sdk`).

#### Availability Detection

```typescript
// Check if GitHub MCP is available before attempting repo creation
const mcpManager = new McpManager(config);
const githubAvailable = mcpManager.isAvailable('github');

if (!githubAvailable) {
  // Fall back to local scaffolding (D-003)
  return scaffoldLocally(session, pocDir);
}
```

### Decision

Use **LLM-mediated MCP tool calls** for GitHub repo creation (the LLM decides when/how to call GitHub MCP tools based on the develop prompt). Add explicit availability detection via `McpManager.isAvailable('github')` to enable graceful fallback to local scaffolding. Do NOT attempt direct MCP protocol calls — keep the architecture aligned with how the Copilot SDK works.

### Rationale

- The Copilot SDK already handles MCP routing; adding a parallel MCP client adds complexity
- LLM-mediated calls allow the model to adapt to errors (e.g., repo already exists, permission denied)
- Graceful fallback to local scaffolding (D-003) ensures the feature works without GitHub MCP
- The `McpManager` already has the detection infrastructure

### Alternatives Considered

1. **Direct MCP protocol client** (`@modelcontextprotocol/sdk`) — Rejected: adds a dependency, duplicates SDK functionality, and the control flow becomes harder to test
2. **GitHub REST API directly** — Rejected: requires separate auth, loses MCP abstraction, doesn't benefit from SDK's tool routing
3. **GitHub CLI (`gh repo create`)** — Rejected: requires `gh` installed, additional auth setup, not composable

---

## Topic 4: Local Filesystem PoC Scaffolding

### Findings

#### File Tree Generation Pattern

Recommended approach: **Programmatic generation from in-memory template descriptors**, not template engines.

```typescript
interface ScaffoldFile {
  relativePath: string;
  content: string | ((ctx: ScaffoldContext) => string);
}

interface ScaffoldContext {
  projectName: string;
  sessionId: string;
  description: string;
  techStack: string;
  architectureNotes?: string;
}

const SCAFFOLD_FILES: ScaffoldFile[] = [
  {
    relativePath: 'package.json',
    content: (ctx) => JSON.stringify({
      name: ctx.projectName,
      version: '0.1.0',
      scripts: { test: 'vitest run', build: 'tsc' },
    }, null, 2),
  },
  {
    relativePath: 'README.md',
    content: (ctx) => `# ${ctx.projectName}\n\n${ctx.description}\n`,
  },
  {
    relativePath: 'tsconfig.json',
    content: JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'nodenext', strict: true, outDir: 'dist' },
      include: ['src'],
    }, null, 2),
  },
  {
    relativePath: 'src/index.ts',
    content: '// Entry point — generated by sofIA\n',
  },
  {
    relativePath: 'tests/smoke.test.ts',
    content: (ctx) => `import { describe, it, expect } from 'vitest';\n\ndescribe('${ctx.projectName}', () => {\n  it('should be truthy', () => {\n    expect(true).toBe(true);\n  });\n});\n`,
  },
];
```

#### Idempotency Strategy

```typescript
async function scaffold(
  outputDir: string,
  files: ScaffoldFile[],
  ctx: ScaffoldContext,
  options: { overwrite?: boolean } = {},
): Promise<string[]> {
  const written: string[] = [];

  await mkdir(outputDir, { recursive: true });

  for (const file of files) {
    const fullPath = join(outputDir, file.relativePath);
    const dir = dirname(fullPath);
    await mkdir(dir, { recursive: true });

    // Idempotency: skip existing files unless overwrite is true
    if (!options.overwrite) {
      try {
        await access(fullPath);
        continue; // File exists, skip
      } catch {
        // File doesn't exist, proceed
      }
    }

    const content = typeof file.content === 'function'
      ? file.content(ctx)
      : file.content;

    await writeFile(fullPath, content, 'utf-8');
    written.push(file.relativePath);
  }

  return written;
}
```

#### Platform-Safe Path Handling

```typescript
import { join, resolve, normalize } from 'node:path';

// ALWAYS use path.join() — never string concatenation
const pocDir = join('.', 'poc', sessionId);  // ✅
const pocDir = `./poc/${sessionId}`;          // ❌ Windows path separator issues

// Normalize user-provided paths
const safePath = normalize(userPath);

// Prevent path traversal
function isSafePath(base: string, target: string): boolean {
  const resolvedBase = resolve(base);
  const resolvedTarget = resolve(base, target);
  return resolvedTarget.startsWith(resolvedBase);
}
```

### Decision

Use **programmatic generation from typed template descriptors** (no template engine dependency). Implement idempotency via "skip existing files unless `--overwrite`" semantics. Use `node:path` functions exclusively for all path operations. Output directory: `./poc/<sessionId>/`.

### Rationale

- Template descriptors are fully typed, testable, and don't require a runtime parser
- Skip-existing-files idempotency is simpler and safer than diff-and-merge
- `node:path` handles platform differences automatically
- Keeping scaffolds as code (not files on disk) avoids packaging/distribution issues

### Alternatives Considered

1. **Template engine (Handlebars, EJS)** — Rejected: adds dependency, requires template files to ship, harder to type-check
2. **Yeoman/Plop generators** — Rejected: heavy dependencies, CLI-centric design doesn't compose well
3. **Copy directory tree from `templates/`** — Rejected: requires shipping template files, variable substitution still needed
4. **Git clone template repo** — Partially viable for GitHub MCP path but adds network dependency

---

## Topic 5: Autonomous Loop vs Interactive Loop

### Findings

The current `ConversationLoop` class is fundamentally **interactive**:
- It calls `this.io.readInput()` in a `while` loop waiting for user text
- It uses `DecisionGate` to ask the user what to do next
- It checks for `done` / empty input to break

An autonomous Ralph loop needs to:
- Supply its own "input" (the prompt + test failure context)
- Never block waiting for user input
- Terminate based on programmatic conditions (tests passing, max iterations)
- Still produce streaming output for visibility

#### Architecture Options Analysis

##### Option A: Subclass ConversationLoop

```typescript
class AutonomousLoop extends ConversationLoop {
  override async run(): Promise<WorkshopSession> {
    // Override the main loop behavior
  }
}
```
**Pros**: Reuses streaming/rendering code  
**Cons**: `ConversationLoop.run()` is monolithic; overriding it means reimplementing most of the logic. Fragile inheritance.

##### Option B: New standalone AutonomousLoop class

```typescript
class RalphLoop {
  constructor(private options: RalphLoopOptions) {}

  async run(): Promise<PocDevelopmentState> {
    while (iteration < maxIterations && !testsPass) {
      const code = await this.generate(prompt, failures);
      await this.writeFiles(code);
      const results = await this.runTests();
      failures = results.failures;
      iteration++;
    }
  }
}
```
**Pros**: Clean separation of concerns; purpose-built for the autonomous case  
**Cons**: Duplicates streaming/rendering logic from ConversationLoop

##### Option C: Parameterize ConversationLoop with a "driver"

```typescript
interface LoopDriver {
  getNextInput(session: WorkshopSession, lastResponse: string): Promise<string | null>;
  shouldContinue(session: WorkshopSession): boolean;
}

class InteractiveDriver implements LoopDriver {
  async getNextInput() { return this.io.readInput(); }
  shouldContinue() { return true; } // User controls via "done"
}

class AutonomousDriver implements LoopDriver {
  async getNextInput(session, lastResponse) {
    const testResults = await this.runTests(session.poc.repoPath);
    if (testResults.allPassing) return null; // Signal done
    return formatFailurePrompt(testResults);
  }
  shouldContinue(session) {
    return session.poc.iterations.length < this.maxIterations;
  }
}
```
**Pros**: Open/Closed principle; ConversationLoop stays unchanged; easy to test drivers independently  
**Cons**: ConversationLoop needs refactoring to accept a driver; the streaming and turn-management code becomes shared

##### Option D: Compose ConversationLoop as inner component

```typescript
class RalphLoop {
  async run(): Promise<PocDevelopmentState> {
    for (let i = 0; i < maxIterations; i++) {
      // Use ConversationLoop for a single LLM turn
      const loop = new ConversationLoop({
        client: this.client,
        io: this.createAutoIO(prompt),
        session: this.session,
        phaseHandler: this.handler,
        initialMessage: prompt,
      });
      this.session = await loop.run();

      // Run tests
      const results = await this.runTests();
      if (results.allPassing) break;
      prompt = enrichPromptWithFailures(prompt, results);
    }
  }

  private createAutoIO(prompt: string): LoopIO {
    return {
      write: (text) => this.outputHandler(text),
      writeActivity: (text) => this.outputHandler(text),
      readInput: async () => null,  // Immediately signal "done"
      showDecisionGate: async () => ({ choice: 'continue' }),
      isJsonMode: false,
      isTTY: false,
    };
  }
}
```
**Pros**: Reuses ConversationLoop's streaming exactly; no modification to existing code; each LLM turn is isolated  
**Cons**: Creates a new ConversationLoop per iteration (minor overhead); ConversationLoop does more than needed per call (signal handlers, etc.)

### Decision

**Option D: Compose ConversationLoop as inner component** for the initial implementation, with a path to evolve toward Option C.

The `RalphLoop` class is the outer orchestrator. For each iteration, it creates a `ConversationLoop` with an auto-completing `LoopIO` (returns `null` from `readInput` immediately after the initial message is sent) and uses `initialMessage` to inject the prompt. This approach:

1. Reuses all existing streaming/rendering infrastructure
2. Requires zero changes to `ConversationLoop`
3. Each iteration is isolated (clean session state handoff)
4. The auto-completing `LoopIO` is trivially testable

The `RalphLoop.run()` method owns the outer iteration, test execution, and termination logic.

### Rationale

- Minimizes risk: `ConversationLoop` is battle-tested and unchanged
- The `LoopIO` mock pattern is simple: `readInput: async () => null`
- Each iteration gets a fresh LLM session, preventing context window overflow
- The composition pattern naturally supports the spec's requirement for multiple iteration records

### Alternatives Considered

See Options A–C above. Option C (driver pattern) is the best long-term architecture but requires refactoring `ConversationLoop.run()`, which is out of scope for feature 002's initial implementation.

---

## Topic 6: PocDevelopmentState Schema Extensions

### Findings

The current schema is minimal:

```typescript
// Current (from session.ts)
export const pocIterationSchema = z.object({
  iteration: z.number(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  changesSummary: z.string().optional(),
  testsRun: z.array(z.string()).optional(),
});

export const pocDevelopmentStateSchema = z.object({
  repoPath: z.string().optional(),
  iterations: z.array(pocIterationSchema),
  finalStatus: z.enum(['success', 'failed']).optional(),
});
```

This is insufficient for a working Ralph loop. The following extensions are needed:

#### Per-Iteration Extensions

```typescript
export const testResultSchema = z.object({
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  duration: z.number(),             // milliseconds
  failures: z.array(z.object({
    testName: z.string(),
    message: z.string(),
    stack: z.string().optional(),
  })),
});

export const pocIterationSchema = z.object({
  iteration: z.number(),
  startedAt: z.string(),             // ISO-8601
  endedAt: z.string().optional(),    // ISO-8601
  changesSummary: z.string().optional(),
  
  // NEW: Structured test results
  testResults: testResultSchema.optional(),
  
  // NEW: Files touched in this iteration
  filesChanged: z.array(z.string()).optional(),  // relative paths
  
  // NEW: Prompt context tracking (for audit)
  promptTokensUsed: z.number().optional(),
  responseTokensUsed: z.number().optional(),
  
  // NEW: Iteration outcome classification
  outcome: z.enum([
    'tests-passing',     // All tests pass — can terminate
    'tests-improving',   // Fewer failures than previous iteration
    'tests-regressing',  // More failures than previous iteration
    'tests-stuck',       // Same failures as previous iteration
    'error',             // Runtime error (test runner crash, timeout)
  ]).optional(),

  // DEPRECATED: replaced by testResults
  testsRun: z.array(z.string()).optional(),
});
```

#### Overall State Extensions

```typescript
export const pocDevelopmentStateSchema = z.object({
  repoPath: z.string().optional(),       // local path or GitHub URL
  iterations: z.array(pocIterationSchema),
  finalStatus: z.enum(['success', 'failed', 'partial', 'aborted']).optional(),
  
  // NEW: Technology context
  techStack: z.string().optional(),         // e.g., "Node.js + TypeScript + Express"
  templateUsed: z.string().optional(),      // e.g., "node-ts-api"
  
  // NEW: Timing
  totalDuration: z.number().optional(),     // total ms across all iterations
  
  // NEW: Configuration used
  maxIterations: z.number().optional(),     // configured limit
  testCommand: z.string().optional(),       // e.g., "npm test"
  
  // NEW: Source tracking
  repoSource: z.enum(['github-mcp', 'local', 'existing']).optional(),
  
  // NEW: Termination reason
  terminationReason: z.enum([
    'tests-passing',
    'max-iterations',
    'user-abort',
    'stuck-detected',       // same failures for N consecutive iterations
    'error',
  ]).optional(),
  
  // NEW: Summary for export/audit
  finalTestResults: testResultSchema.optional(),
});
```

#### Audit Trail Compliance

The schema supports audit requirements through:

1. **Per-iteration `testResults`** — exact pass/fail counts and failure messages recorded
2. **`outcome` classification** — machine-readable iteration assessment
3. **`filesChanged`** — what was modified (without storing full diffs, which could be large)
4. **`terminationReason`** — why the loop stopped
5. **Token usage** — cost tracking per iteration
6. **Timestamps** — `startedAt`/`endedAt` on each iteration plus `totalDuration`

What we deliberately **exclude** from the schema (stored elsewhere or not at all):
- Full file contents (too large for JSON state; stored on disk)
- Full LLM conversation history (already in `turns[]`)
- Secrets/tokens (security policy)

### Decision

Extend `PocDevelopmentState` and `PocIteration` as described above. Add the new `TestResult` schema. Expand `finalStatus` to include `'partial'` and `'aborted'`. Add `terminationReason`, `repoSource`, `techStack`, `templateUsed`, `totalDuration`, `maxIterations`, `testCommand`, and `finalTestResults` to the state. Add `testResults`, `filesChanged`, `promptTokensUsed`, `responseTokensUsed`, and `outcome` to iterations. Keep `testsRun` for backward compatibility but mark as deprecated.

### Rationale

- Structured `TestResult` enables the Ralph loop to programmatically compare iterations and detect stuck states
- `outcome` classification enables the termination logic to be data-driven
- `terminationReason` + `repoSource` satisfy D-005 auditability requirements
- Token usage tracking enables cost monitoring for workshop facilitators
- Backward compatibility with existing `testsRun` field prevents breaking existing sessions

### Alternatives Considered

1. **Minimal extension (just add `testResults`)** — Rejected: insufficient for termination logic and audit trail
2. **Separate `RalphLoopState` schema** — Rejected: the PoC state and Ralph loop state are the same thing; splitting adds indirection
3. **Store full diffs per iteration** — Rejected: too large for JSON session files; incompatible with the lightweight session model

---

## Summary of Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | Ralph Loop Pattern | Modified Ralph loop with test-failure injection; internal TypeScript loop, not external bash |
| 2 | Test Runner | `spawn` + Vitest `--reporter=json` + 60s timeout + belt-and-suspenders kill |
| 3 | GitHub MCP | LLM-mediated MCP tool calls with `McpManager` availability detection; local fallback |
| 4 | Local Scaffolding | Programmatic typed template descriptors; skip-existing idempotency; `node:path` for safety |
| 5 | Loop Architecture | Compose: `RalphLoop` owns iteration, uses `ConversationLoop` per turn with auto-completing IO |
| 6 | Schema Extensions | Full extension of `PocDevelopmentState` + `PocIteration` + new `TestResult` schema |
