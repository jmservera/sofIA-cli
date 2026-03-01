# CLI Contracts: Dev Resume & Hardening

**Feature**: 004-dev-resume-hardening  
**Date**: 2026-03-01

## `sofia dev` Command Contract

### Synopsis

```
sofia dev --session <id> [--force] [--max-iterations <n>] [--output-dir <path>] [--debug]
```

### Resume Behavior (New)

| Session State                                | `--force` | Behavior                                       |
| -------------------------------------------- | --------- | ---------------------------------------------- |
| `poc` undefined                              | N/A       | Fresh run: scaffold → install → iterate from 1 |
| `poc.finalStatus` = `'success'`              | `false`   | Exit with "PoC already complete" message       |
| `poc.finalStatus` = `'success'`              | `true`    | Reset poc → fresh run                          |
| `poc.finalStatus` = `'failed'`/`'partial'`   | `false`   | Resume from last iteration (default)           |
| `poc.finalStatus` = `'failed'`/`'partial'`   | `true`    | Reset poc → fresh run                          |
| `poc.finalStatus` undefined + iterations > 0 | `false`   | Resume from last completed iteration           |
| `poc.finalStatus` undefined + iterations > 0 | `true`    | Reset poc → fresh run                          |

### Exit Codes

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| `0`  | PoC completed successfully (tests passing) or already complete |
| `0`  | PoC resumed and completed                                      |
| `1`  | Error during execution                                         |
| `0`  | User interrupted (Ctrl+C) — session saved for resume           |

### Info-Level Resume Logs (FR-007a)

All resume decisions produce info-level log messages (visible without `--debug`):

```
Resuming session abc123 from iteration 5 (4 completed iterations found)
Re-running incomplete iteration 4 (no test results recorded)
Skipping scaffold — output directory and .sofia-metadata.json present
Re-running dependency installation (npm install)
Selected template: node-ts-vitest (matched 'typescript' in architecture notes)
```

### `--force` Reset Contract

When `--force` is specified:

1. Delete output directory (`rm -rf <outputDir>`)
2. Clear `session.poc` entirely (`session.poc = undefined`)
3. Persist session (`store.save(session)`)
4. Proceed with fresh scaffold → install → iterate from 1

**Post-condition**: `session.poc.iterations` is empty after first `updateSessionPoc` call.

---

## Template Registry Contract

### Template Selection

```typescript
// Input: plan's architectureNotes + dependencies
// Output: TemplateEntry
selectTemplate(registry, architectureNotes?, dependencies?): TemplateEntry
```

**Selection rules** (first match wins, case-insensitive):

1. Concatenate `architectureNotes` + `dependencies` into search text
2. For each registry entry (in registration order), check if any `matchPattern` appears in search text
3. If match found → return that entry
4. If no match → return `node-ts-vitest` (default)

### Registered Templates

#### `node-ts-vitest` (default)

| Field          | Value                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| installCommand | `npm install`                                                                                                             |
| testCommand    | `npm test -- --reporter=json`                                                                                             |
| matchPatterns  | `typescript`, `node`, `vitest`, `ts`                                                                                      |
| files          | `.gitignore`, `package.json`, `tsconfig.json`, `README.md`, `src/index.ts`, `tests/index.test.ts`, `.sofia-metadata.json` |

#### `python-pytest`

| Field          | Value                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| installCommand | `pip install -r requirements.txt`                                                                                                           |
| testCommand    | `pytest --tb=short -q --json-report --json-report-file=-`                                                                                   |
| matchPatterns  | `python`, `fastapi`, `flask`, `django`, `pytest`                                                                                            |
| files          | `.gitignore`, `requirements.txt`, `pytest.ini`, `README.md`, `src/__init__.py`, `src/main.py`, `tests/test_main.py`, `.sofia-metadata.json` |

---

## Workshop → Dev Transition Contract

### Plan Phase Completion Output

When the Plan phase completes in `sofia workshop`, the following message MUST be displayed:

```markdown
### Ready for PoC Generation

The Plan phase is complete. To generate the proof-of-concept, run:
```

sofia dev --session <actual-session-id>

```

This will scaffold a project matching your plan's technology stack, install dependencies,
and iteratively generate code until all tests pass.
```

### Interactive Mode Offer (FR-021, SHOULD)

In interactive mode, after the above message, the system SHOULD offer:

```
? Would you like to start PoC development now? (Y/n)
```

- **Yes** (default): Invoke `developCommand` internally with the current session
- **No**: Save session and exit with the command displayed above

---

## `.sofia-metadata.json` Extended Schema

```json
{
  "sessionId": "string",
  "featureSpec": "string",
  "generatedAt": "ISO 8601 string",
  "ideaTitle": "string",
  "totalIterations": 0,
  "finalStatus": "string | null",
  "terminationReason": "string | null",
  "techStack": {
    "language": "string",
    "runtime": "string",
    "testRunner": "string"
  },
  "templateId": "string",
  "todos": {
    "totalInitial": 0,
    "remaining": 0,
    "markers": ["string"]
  }
}
```

New fields:

- `templateId`: Which template was used (for resume context)
- `todos`: TODO marker tracking (FR-022)
