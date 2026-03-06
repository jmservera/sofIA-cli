# CLI Usage

## Binary

The CLI is invoked via `npx sofia` (recommended), or `sofia` if installed globally.

```bash
# Recommended: run with npx (no global install needed)
npx sofia <command> [options]

# Or install globally
npm install -g @jmservera/sofia-cli
sofia <command> [options]

# Development mode (tsx, no watch)
npm run start -- <command> [options]

# Watch mode (auto-reloads on file changes)
npm run dev -- <command> [options]
```

## Global Options

| Flag                | Description                                                         |
| ------------------- | ------------------------------------------------------------------- |
| `--version`         | Print version and exit                                              |
| `--help`            | Print help and exit                                                 |
| `--session <id>`    | Target a specific session by ID                                     |
| `--json`            | Machine-readable JSON output only on stdout                         |
| `--debug`           | Enable debug telemetry                                              |
| `--log-file <path>` | Write structured logs to the specified file                         |
| `--non-interactive` | Disallow prompts; fail with an actionable error if input is missing |

## Commands

### `workshop`

Start or resume a governed AI Discovery Workshop session.

```bash
# Interactive: shows a menu to start new or resume existing session
npm run start -- workshop

# Start a new session directly
npm run start -- workshop --new-session

# Direct command mode: run a specific phase on an existing session
npm run start -- workshop --session <id> --phase Discover

# With retry for transient failures
npm run start -- workshop --session <id> --phase Ideate --retry 3
```

**Workshop-specific flags:**

| Flag              | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `--new-session`   | Skip menu and start a new session                      |
| `--phase <phase>` | Jump to a specific phase (requires `--session`)        |
| `--retry <count>` | Retry transient failures N times (direct command mode) |

**Phases** (in order): `Discover`, `Ideate`, `Design`, `Select`, `Plan`, `Develop`

**Direct command mode** is activated when both `--session` and `--phase` are specified. In this mode:

- The workshop runs the specified phase without the interactive menu
- Supports `--non-interactive` for automation (fails fast if input is missing)
- Supports `--retry` to retry recoverable errors with exponential backoff
- `--json` constrains stdout to JSON-only (activity goes to stderr)

### `status`

Display session status and next expected action.

```bash
# Human-readable table
npm run start -- status

# JSON output for a specific session
npm run start -- status --session <id> --json
```

**Output formats:**

- **TTY (human):** A table showing session ID, current phase, status, and last update time
- **JSON mode:** `{ "sessions": [{ "sessionId", "phase", "status", "updatedAt" }] }` or `{ "session": { ... } }` for a single session

### `dev`

Run the **Develop** phase for a completed workshop session. Generates a proof-of-concept (PoC) repository using a Ralph loop — an autonomous, iterative cycle where code is generated, tests run, failures fed back to the LLM, and fixes applied until tests pass or the iteration limit is reached.

```bash
# Generate a PoC from a completed session (uses most recent session by default)
npm run start -- dev

# Target a specific session
npm run start -- dev --session <id>

# Limit iterations and specify output directory
npm run start -- dev --session <id> --max-iterations 5 --output ./my-poc

# Overwrite existing output and start fresh
npm run start -- dev --session <id> --force

# Machine-readable JSON output
npm run start -- dev --session <id> --json
```

**Dev-specific flags:**

| Flag                   | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `--session <id>`       | Session ID (defaults to most recent session)                 |
| `--max-iterations <n>` | Maximum Ralph loop iterations (default: 10)                  |
| `--output <dir>`       | Output directory for the PoC (default: `./poc/<sessionId>/`) |
| `--force`              | Overwrite existing output directory and start fresh          |
| `--json`               | Machine-readable JSON output                                 |
| `--debug`              | Show iteration events during execution                       |

**Lifecycle:**

1. **Validate** — Checks the session has `selection` and `plan` populated (from Select and Plan phases)
2. **Scaffold** — Creates the initial PoC project structure (README, package.json, tsconfig.json, tests, etc.)
3. **Install** — Runs `npm install` in the PoC directory
4. **Iterate** — Runs tests → feeds failures to LLM → applies code changes → repeats
5. **Terminate** — Stops when tests pass, max iterations reached, or user presses Ctrl+C

**GitHub MCP integration:**
When GitHub MCP is available and authorized, the PoC is also pushed to a GitHub repository. When unavailable, it falls back to local-only output with a clear log message.

**JSON output format** (with `--json`):

```json
{
  "sessionId": "abc123",
  "finalStatus": "success",
  "terminationReason": "tests-passing",
  "iterationsCompleted": 4,
  "repoSource": "local",
  "repoPath": "./poc/abc123/",
  "outputDir": "/absolute/path/to/poc/abc123"
}
```

**Recovery options** (shown on non-success outcomes):

```bash
# Resume from where you left off
sofia dev --session <id>

# Allow more iterations
sofia dev --session <id> --max-iterations 20

# Start fresh
sofia dev --session <id> --force
```

### `export`

Export workshop artifacts for a session.

```bash
# Export to default directory (./exports/<sessionId>/)
npm run start -- export --session <id>

# Export to a custom directory
npm run start -- export --session <id> --output ./my-export/
```

**Export-specific flags:**

| Flag             | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| `--output <dir>` | Custom output directory (default: `./exports/<sessionId>/`) |

### `infra`

Manage Azure AI Foundry infrastructure. Groups three sub-commands for deploying, querying, and tearing down Azure resources.

#### `infra deploy`

Deploy Azure AI Foundry resources (resource group, AI Services account, model deployment).

```bash
# Deploy with required resource group
npx sofia infra deploy -g sofia-workshop-rg

# Full options
npx sofia infra deploy -g sofia-workshop-rg -s <subscription-id> -l eastus -n my-foundry -m gpt-4.1-mini
```

| Flag                           | Description                                   |
| ------------------------------ | --------------------------------------------- |
| `-g, --resource-group <name>`  | Resource group name (created if missing) **(required)** |
| `-s, --subscription <id>`      | Azure subscription ID (default: current `az` subscription) |
| `-l, --location <region>`      | Azure region (default: `swedencentral`)       |
| `-n, --account-name <name>`    | Foundry account name (default: `sofia-foundry`) |
| `-m, --model <name>`           | Model deployment name (default: `gpt-4.1-mini`) |

#### `infra gather-env`

Fetch environment values from an existing Azure AI Foundry deployment and write them to `.env`.

```bash
npx sofia infra gather-env -g sofia-workshop-rg
```

| Flag                           | Description                                   |
| ------------------------------ | --------------------------------------------- |
| `-g, --resource-group <name>`  | Resource group containing the resources **(required)** |
| `-s, --subscription <id>`      | Azure subscription ID                         |
| `-n, --account-name <name>`    | AI Services account name (default: `sofia-foundry`) |
| `-m, --model <name>`           | Override model deployment name                |

#### `infra teardown`

Remove the resource group and all contained Azure resources.

```bash
# Interactive confirmation
npx sofia infra teardown -g sofia-workshop-rg

# Skip confirmation prompt
npx sofia infra teardown -g sofia-workshop-rg --yes
```

| Flag                           | Description                                   |
| ------------------------------ | --------------------------------------------- |
| `-g, --resource-group <name>`  | Resource group to delete **(required)**       |
| `--yes`                        | Skip confirmation prompt                      |

## Exit Codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| `0`  | Success                                                |
| `1`  | General error (invalid input, session not found, etc.) |

In JSON mode, errors are emitted as JSON objects with a consistent envelope:

```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session \"abc\" not found."
  }
}
```

## Examples

```bash
# Full interactive workshop flow
npx sofia workshop

# Automation: run Ideate phase, JSON output, no prompts
npx sofia workshop --session abc123 --phase Ideate --json --non-interactive

# Check what phase a session is on
npx sofia status --session abc123 --json

# Export artifacts after completing a workshop
npx sofia export --session abc123

# Enable debug logging to file
npx sofia workshop --debug --log-file .sofia/logs/dev.log

# Deploy Azure infrastructure and configure environment
npx sofia infra deploy -g sofia-workshop-rg
npx sofia infra gather-env -g sofia-workshop-rg

# Tear down when done
npx sofia infra teardown -g sofia-workshop-rg --yes
```
