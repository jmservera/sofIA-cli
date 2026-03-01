# Data Model: Dev Resume & Hardening

**Feature**: 004-dev-resume-hardening  
**Date**: 2026-03-01

## Entity Overview

```
┌──────────────────────┐     uses      ┌──────────────────────┐
│   CheckpointState    │◄─────────────│  developCommand.ts    │
│  (runtime derived)   │               │  (entry point)       │
└──────────┬───────────┘               └──────────┬───────────┘
           │                                      │
           │ reads from                           │ passes to
           ▼                                      ▼
┌──────────────────────┐               ┌──────────────────────┐
│ PocDevelopmentState  │◄──────────────│    RalphLoop         │
│  (session.poc)       │   updates     │  (seeds iterations)  │
│  [EXISTING SCHEMA]   │               └──────────┬───────────┘
└──────────────────────┘                          │
                                                  │ uses
                                                  ▼
                                       ┌──────────────────────┐
                                       │   TemplateRegistry   │
                                       │  (template lookup)   │
                                       └──────────┬───────────┘
                                                  │
                                                  │ contains
                                                  ▼
                                       ┌──────────────────────┐
                                       │   TemplateEntry      │
                                       │  (scaffold config)   │
                                       └──────────────────────┘
```

## Entity Definitions

### CheckpointState (New — runtime-only, not persisted)

Derived from existing `session.poc` to determine resume behavior. This is NOT a new schema — it's a convenience type used by `developCommand.ts` and `RalphLoop.run()` to make resume decisions.

```typescript
export interface CheckpointState {
  /** Whether a prior PoC run exists */
  hasPriorRun: boolean;
  /** Number of fully completed iterations (with testResults) */
  completedIterations: number;
  /** Whether the last iteration was interrupted (no testResults) */
  lastIterationIncomplete: boolean;
  /** The iteration number to resume from */
  resumeFromIteration: number;
  /** Whether scaffolding can be skipped (output dir + metadata exist) */
  canSkipScaffold: boolean;
  /** Final status from prior run, if any */
  priorFinalStatus: 'success' | 'failed' | 'partial' | undefined;
  /** Prior iterations for LLM context seeding */
  priorIterations: PocIteration[];
}
```

**Derivation logic**:

```typescript
function deriveCheckpointState(session: WorkshopSession, outputDir: string): CheckpointState {
  const poc = session.poc;
  if (!poc || poc.iterations.length === 0) {
    return {
      hasPriorRun: false,
      completedIterations: 0,
      lastIterationIncomplete: false,
      resumeFromIteration: 1,
      canSkipScaffold: false,
      priorFinalStatus: undefined,
      priorIterations: [],
    };
  }

  const lastIter = poc.iterations[poc.iterations.length - 1];
  const lastIncomplete = !lastIter.testResults && lastIter.outcome !== 'scaffold';
  const completedIters = lastIncomplete ? poc.iterations.slice(0, -1) : poc.iterations;

  const metadataExists = existsSync(join(outputDir, '.sofia-metadata.json'));

  return {
    hasPriorRun: true,
    completedIterations: completedIters.length,
    lastIterationIncomplete: lastIncomplete,
    resumeFromIteration: completedIters.length + 1,
    canSkipScaffold: metadataExists,
    priorFinalStatus: poc.finalStatus,
    priorIterations: completedIters,
  };
}
```

**Validation rules**:

- `resumeFromIteration` >= 1
- `completedIterations` >= 0
- If `lastIterationIncomplete`, the incomplete iteration is excluded from `priorIterations`
- `canSkipScaffold` requires both output directory AND `.sofia-metadata.json` to exist

---

### TemplateEntry (New — code-defined)

A single scaffold template configuration. Registered in the `TemplateRegistry`.

```typescript
export interface TemplateEntry {
  /** Unique template identifier */
  id: string;
  /** Human-readable name for logging */
  displayName: string;
  /** Scaffold file definitions */
  files: TemplateFile[];
  /** Technology stack for session state */
  techStack: TechStack;
  /** Command to install dependencies (e.g., 'npm install') */
  installCommand: string;
  /** Command to run tests with JSON output (e.g., 'npm test -- --reporter=json') */
  testCommand: string;
  /** Keywords to match from plan's architectureNotes/dependencies */
  matchPatterns: string[];
}
```

**Validation rules**:

- `id` must be unique within the registry
- `files` must include `.sofia-metadata.json`
- `installCommand` must be non-empty
- `testCommand` must be non-empty
- `matchPatterns` must contain at least one pattern (case-insensitive matching)

**Predefined entries**:

| id               | displayName                   | matchPatterns                                        | installCommand                    | testCommand                                               |
| ---------------- | ----------------------------- | ---------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| `node-ts-vitest` | TypeScript + Node.js + Vitest | `['typescript', 'node', 'vitest', 'ts']`             | `npm install`                     | `npm test -- --reporter=json`                             |
| `python-pytest`  | Python + pytest               | `['python', 'fastapi', 'flask', 'django', 'pytest']` | `pip install -r requirements.txt` | `pytest --tb=short -q --json-report --json-report-file=-` |

---

### TemplateRegistry (New — code-defined)

Registry type and selection function. Simple map + match-first-wins logic.

```typescript
export type TemplateRegistry = Map<string, TemplateEntry>;

export function selectTemplate(
  registry: TemplateRegistry,
  architectureNotes?: string,
  dependencies?: string[],
): TemplateEntry {
  const searchText = [architectureNotes ?? '', ...(dependencies ?? [])].join(' ').toLowerCase();

  for (const entry of registry.values()) {
    if (entry.matchPatterns.some((p) => searchText.includes(p.toLowerCase()))) {
      return entry;
    }
  }

  // Default fallback
  return registry.get('node-ts-vitest')!;
}
```

---

### TestFixtureProject (New — test infrastructure)

A minimal project in `tests/fixtures/test-fixture-project/` used by testRunner integration tests. Not a runtime entity — exists only in the test suite.

```
tests/fixtures/test-fixture-project/
├── package.json          # minimal: { "scripts": { "test": "vitest run --reporter=json" } }
├── vitest.config.ts      # minimal config
├── src/
│   └── add.ts            # function add(a, b) { return a + b; }
└── tests/
    ├── passing.test.ts   # test('adds numbers', () => expect(add(1,2)).toBe(3))
    ├── failing.test.ts   # test('fails', () => expect(1).toBe(2))
    └── hanging.test.ts   # test('hangs', async () => await new Promise(() => {}))
```

**Purpose**: Enables FR-016 through FR-019 (real subprocess testing of testRunner).

---

### SofiaMetadata (Extended — file-system artifact)

Current schema in `.sofia-metadata.json` (pocScaffolder.ts L243-L260), extended with TODO tracking.

```typescript
interface SofiaMetadata {
  sessionId: string;
  featureSpec: string;
  generatedAt: string;
  ideaTitle: string;
  totalIterations: number;
  finalStatus: string | null;
  terminationReason: string | null;
  techStack: {
    language: string;
    runtime: string;
    testRunner: string;
  };
  // NEW: FR-022 — scaffold TODO tracking
  todos?: {
    totalInitial: number;
    remaining: number;
    markers: string[]; // e.g., ["src/main.py:12: TODO: Implement business logic"]
  };
}
```

---

## Existing Entities (Modified)

### TechStack (session.ts — schema extension)

The existing `techStackSchema` may need two optional fields for template-defined commands:

```typescript
export const techStackSchema = z.object({
  language: z.string(),
  framework: z.string().optional(),
  testRunner: z.string(),
  buildCommand: z.string().optional(),
  runtime: z.string(),
  // Potential additions for Feature 004:
  installCommand: z.string().optional(), // 'npm install' | 'pip install -r requirements.txt'
  testCommand: z.string().optional(), // full test command with reporter flags
});
```

**Note**: These fields could live solely on `TemplateEntry` rather than in the persisted session schema. If they're only needed at scaffold/runtime and not for resume, keeping them off the session avoids schema migration. Decision: keep `installCommand` and `testCommand` on `TemplateEntry` only. The existing `testRunner` field on `TechStack` (e.g., `'npm test'`) is sufficient for session display purposes.

### PocDevelopmentState (session.ts — no schema change)

The existing schema already supports everything needed for resume:

- `iterations: PocIteration[]` — seeded on resume
- `finalStatus?: 'success' | 'failed' | 'partial'` — undefined = resumable
- `terminationReason?` — read for status messages
- `techStack?` — preserved on resume

No schema migration required. The `.passthrough()` on `WorkshopSession` provides forward compatibility.

## State Transitions

### PoC Lifecycle States

```
                     ┌──────────┐
         first run   │  No PoC  │  session.poc = undefined
                     └────┬─────┘
                          │ sofia dev --session X
                          ▼
                     ┌──────────┐
                     │ Running  │  finalStatus = undefined, iterations growing
                     └────┬─────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Success  │ │ Partial  │ │ Failed   │
        │ final=   │ │ final=   │ │ final=   │
        │'success' │ │'partial' │ │'failed'  │
        └──────────┘ └────┬─────┘ └────┬─────┘
                          │            │
                          ▼            ▼
                     ┌──────────┐ ┌──────────┐
              resume │Resumable │ │Resumable │ resume
        (FR-001/006) │ w/prior  │ │ w/prior  │ (FR-006)
                     └────┬─────┘ └────┬─────┘
                          │            │
                          ▼            ▼
                     ┌──────────┐
                     │ Running  │  (loop continues from prior state)
                     └──────────┘

        ┌──────────────────────────┐
        │  Interrupted (SIGINT)    │  finalStatus = undefined
        │  iterations.length > 0   │  (directly resumable via FR-001)
        └──────────────────────────┘

        Any state + --force → No PoC (FR-008/009/010)
```

### Resume Decision Tree

```
sofia dev --session X
│
├── session.poc undefined?
│   └── YES → Fresh run (scaffold + install + iterate from 1)
│
├── session.poc.finalStatus === 'success'?
│   └── YES → Display "PoC complete" message, exit (FR-005)
│
├── session.poc.finalStatus === 'failed' | 'partial'?
│   └── YES → Default to resume, allow --force override (FR-006)
│       └── Resume: seed iterations, start from N+1
│
├── session.poc.finalStatus undefined + iterations.length > 0?
│   └── YES → Resume (interrupted session) (FR-001)
│       ├── Last iteration has testResults?
│       │   └── YES → Start from iterations.length + 1
│       │   └── NO → Pop incomplete, start from iterations.length (FR-001a)
│       ├── Output dir exists + .sofia-metadata.json?
│       │   └── YES → Skip scaffold (FR-002)
│       │   └── NO → Re-scaffold (FR-007)
│       └── Always re-run npm install (FR-003)
│
└── --force flag set?
    └── YES → Clear poc + delete dir → Fresh run (FR-008/009/010)
```
