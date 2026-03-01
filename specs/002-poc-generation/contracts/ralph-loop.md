# Contract: Ralph Loop Iteration

Defines the interface contract for the Ralph loop — the autonomous code-generation-test-refine cycle that powers the Develop phase.

## RalphLoop interface

```typescript
interface RalphLoopOptions {
  /** CopilotClient for LLM interactions. */
  client: CopilotClient;
  /** IO for user-visible output (spinner, activity, streaming text). */
  io: LoopIO;
  /** The workshop session with selection and plan populated. */
  session: WorkshopSession;
  /** Activity spinner for visual feedback. */
  spinner?: ActivitySpinner;
  /** Maximum iterations before forced termination (default: 10). */
  maxIterations?: number;
  /** Working directory for the PoC (default: ./poc/<sessionId>/). */
  outputDir?: string;
  /** Callback for session persistence after each iteration. */
  onSessionUpdate?: (session: WorkshopSession) => Promise<void>;
  /** Event listener for telemetry. */
  onEvent?: (event: SofiaEvent) => void;
}

interface RalphLoopResult {
  /** Updated session with poc state filled in. */
  session: WorkshopSession;
  /** Final status of the loop. */
  finalStatus: 'success' | 'failed' | 'partial';
  /** Why the loop stopped. */
  terminationReason: 'tests-passing' | 'max-iterations' | 'user-stopped' | 'error';
  /** Total iterations executed. */
  iterationsCompleted: number;
}
```

## Loop lifecycle

```
1. Validate session (selection + plan present)
2. Scaffold PoC (iteration 1 / outcome: "scaffold")
   └─ Create project structure, README, package.json, initial tests
3. Install dependencies (npm install in outputDir)
4. For iteration = 2..maxIterations:
   a. Run tests
   b. If all pass → terminate (tests-passing)
   c. Parse test failures
   d. Build LLM prompt with: plan context + current code + test failures
   e. Send to LLM via ConversationLoop (auto-completing, single turn)
   f. Apply generated code changes to filesystem
   g. If new dependencies added to package.json → re-run npm install
   h. Persist iteration to session
   i. Check user abort (Ctrl+C) → terminate (user-stopped)
5. If maxIterations reached → terminate (max-iterations)
```

> **Note**: Scaffold is always iteration 1 (`outcome: "scaffold"`). LLM-driven refinement
> iterations start at 2. This aligns with the data model where `PocIteration.iteration`
> is 1-indexed and the first entry always has `outcome: "scaffold"`.

## Iteration prompt contract

Each iteration sends the LLM a message containing:

```
## Current State
- Iteration: {N} of {max}
- Previous outcome: {tests-passing | tests-failing | scaffold}

## Test Results
- Passed: {N}, Failed: {N}, Skipped: {N}
- Failures:
  1. {testName}: {message} (at {file}:{line})
  ...

## Files in PoC
{tree listing of current files}

## Task
Fix the failing tests. Respond with the complete updated file contents
for each file you need to modify, using fenced code blocks with file paths.
```

## Code change format

The LLM must respond with fenced code blocks that include the file path:

````
```typescript file=src/index.ts
// complete file content
```
````

The code generator parses these blocks and writes them to disk.

## Termination conditions

| Condition | `finalStatus` | `terminationReason` |
|-----------|--------------|---------------------|
| All tests pass | `success` | `tests-passing` |
| Max iterations reached, some tests pass | `partial` | `max-iterations` |
| Max iterations reached, no tests pass | `failed` | `max-iterations` |
| User presses Ctrl+C | session preserved as-is | `user-stopped` |
| Unrecoverable error (LLM timeout, disk error) | `failed` | `error` |

## Error handling

- **LLM timeout**: Log the error, record iteration as `outcome: "error"`, continue to next iteration if retries remain.
- **Test runner timeout (60s)**: Record as `outcome: "error"` with `errorMessage`, feed timeout info to next iteration.
- **Filesystem error**: Fail fast with clear error, preserve session state.
- **Missing session data**: Fail fast before scaffolding with guidance to run Plan phase first.
