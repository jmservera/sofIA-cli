# Quickstart: Dev Resume & Hardening

**Feature**: 004-dev-resume-hardening  
**Date**: 2026-03-01

## Prerequisites

- Node.js >= 20 LTS
- npm (bundled with Node.js)
- sofIA CLI installed (`npm run build && npm link`)
- A workshop session that has completed the Plan phase

## Quick Verification

### 1. Resume a session after interruption

```bash
# Start a dev session
sofia dev --session abc123

# Interrupt with Ctrl+C after 2 iterations complete
# The CLI displays: "Use `sofia dev --session abc123` to resume"

# Resume — should skip scaffold, re-run npm install, resume from iteration 3
sofia dev --session abc123

# Expected output:
# ℹ Resuming session abc123 from iteration 3 (2 completed iterations found)
# ℹ Skipping scaffold — output directory and .sofia-metadata.json present
# ℹ Re-running dependency installation (npm install)
# Iteration 3/10: Running tests…
```

### 2. Force-restart a session

```bash
# Force restart — clears both output directory and session state
sofia dev --session abc123 --force

# Expected output:
# ℹ Cleared existing output directory and session state (--force)
# Scaffolding PoC project…
# Iteration 1/10: Running tests…
```

### 3. Template selection

```bash
# Create a plan with Python/FastAPI architecture notes
# Then run dev — should auto-select python-pytest template
sofia dev --session python-plan-123

# Expected output:
# ℹ Selected template: python-pytest (matched 'python' in architecture notes)
# Scaffolding PoC project…
```

## Development Setup

```bash
# Clone and install
git clone <repo-url>
cd sofia-cli
git checkout 004-dev-resume-hardening
npm install

# Run tests (targeted)
npm test -- tests/unit/develop/ralphLoop.spec.ts
npm test -- tests/unit/develop/templateRegistry.spec.ts
npm test -- tests/unit/cli/developCommand.spec.ts
npm test -- tests/integration/testRunnerReal.spec.ts

# Run all tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```

## Key Files to Modify

| File                              | Change                                      |
| --------------------------------- | ------------------------------------------- |
| `src/develop/ralphLoop.ts`        | Resume iteration seeding in `run()`         |
| `src/cli/developCommand.ts`       | Resume detection, `--force` session reset   |
| `src/develop/templateRegistry.ts` | **New**: template registry + selection      |
| `src/develop/pocScaffolder.ts`    | Use registry, extract template into entries |
| `src/develop/testRunner.ts`       | Make test command configurable              |
| `src/phases/phaseHandlers.ts`     | Workshop→dev transition guidance            |
| `src/cli/workshopCommand.ts`      | Display `sofia dev` command after Plan      |

## TDD Workflow Reminder

Per constitution (Principle V):

1. **Red**: Write failing tests first
2. **Green**: Implement minimum code to pass
3. **Review**: Run Test Review Checklist, add tests for gaps

```bash
# Example: adding resume test
# 1. Write test in tests/unit/develop/ralphLoop.spec.ts
# 2. Run it — should fail
npm test -- tests/unit/develop/ralphLoop.spec.ts --testNamePattern "resumes from"
# 3. Implement resume logic in src/develop/ralphLoop.ts
# 4. Run again — should pass
npm test -- tests/unit/develop/ralphLoop.spec.ts
# 5. Full suite
npm test
# 6. Type + lint
npm run typecheck && npm run lint
```
