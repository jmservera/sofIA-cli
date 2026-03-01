# Quickstart: sofIA PoC Generation (Develop Phase)

## Prerequisites

- Node.js 20 LTS
- npm
- A completed sofIA workshop session (with Selection and Plan phases done)

## Setup

```bash
npm install
```

## Run PoC generation

```bash
# Start PoC generation for the most recent session
npm run start -- dev

# Start PoC generation for a specific session
npm run start -- dev --session <id>

# Set max iterations (default: 10)
npm run start -- dev --session <id> --max-iterations 5

# Specify output directory (default: ./poc/<sessionId>/)
npm run start -- dev --session <id> --output ./my-poc
```

## What happens

1. **Validation** — Checks the session has completed the Selection and Plan phases
2. **Scaffolding** — Creates a project skeleton in the output directory (package.json, tsconfig.json, README.md, initial src/ and tests/)
3. **Ralph Loop** — Iterates autonomously:
   - Runs tests (`vitest run --reporter=json`)
   - If tests pass → done
   - If tests fail → sends failures + current code to LLM → applies fixes → re-runs tests
4. **Completion** — Writes `.sofia-metadata.json`, updates session state, reports results

## Output

```
./poc/<sessionId>/
├── README.md            # What the PoC does, how to run it
├── package.json         # Dependencies, scripts
├── tsconfig.json        # TypeScript config
├── src/                 # Generated implementation
├── tests/               # Generated tests
└── .sofia-metadata.json # Session linkage & metadata
```

## Run the generated PoC

```bash
cd ./poc/<sessionId>
npm install
npm test        # Run the tests
npm start       # Run the PoC
```

## Storage

- PoC output: `./poc/<sessionId>/` (or custom `--output` path)
- Session state (updated): `.sofia/sessions/<sessionId>.json`
- Exports (updated): `./exports/<sessionId>/`

## Testing the Develop module

```bash
# Unit tests for develop module
npm test -- tests/unit/develop/

# Integration tests (Ralph loop with fakes)
npm test -- tests/integration/ralphLoop.integration.test.ts

# E2E (full PoC generation with real LLM — slow)
npm test -- tests/e2e/pocGeneration.e2e.test.ts
```

## Debug logs

```bash
npm run start -- dev --session <id> --debug --log-file .sofia/logs/dev.log
```

## GitHub MCP integration (optional)

When the GitHub MCP server is available, sofIA can create a GitHub repository for the PoC:

```bash
# PoC generation will auto-detect GitHub MCP availability
# and prompt before creating a repo
npm run start -- dev --session <id>
```

If GitHub MCP is not available, all output stays local — no error, just a different `repoSource` in session state.
