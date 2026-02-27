# Quickstart: sofIA CLI workshop rebuild

## Prerequisites

- Node.js 20 LTS
- npm

## Setup

```bash
npm install
```

## Run (interactive)

```bash
# Start an interactive workshop (tsx, no build required)
npm run start -- workshop

# Start a new session directly
npm run start -- workshop --new-session
```

## Run (non-interactive / automation)

```bash
# Session status as JSON
npm run start -- status --session <id> --json

# Direct command mode: run a specific phase
npm run start -- workshop --session <id> --phase Discover --non-interactive

# With retry for transient failures
npm run start -- workshop --session <id> --phase Ideate --retry 3 --non-interactive
```

## Run (built mode)

```bash
# Build TypeScript first
npm run build

# Then use the compiled output
npm run sofia -- workshop
npm run sofia -- status --session <id> --json
```

## Storage

- Session files: `.sofia/sessions/<sessionId>.json`
- Exports: `./exports/<sessionId>/`

## Testing

```bash
# Full suite (unit + integration + e2e)
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Interactive E2E (PTY)
npm run test:e2e
```

## Debug logs

```bash
npm run start -- workshop --debug --log-file .sofia/logs/dev.log
```

## Environment variables (optional)

| Variable | Purpose |
|----------|---------|
| `SOFIA_FOUNDRY_AGENT_ENDPOINT` | Azure AI Foundry Bing Search agent endpoint |
| `SOFIA_FOUNDRY_AGENT_KEY` | API key for the Foundry agent |

See [docs/environment.md](../../docs/environment.md) for details.

