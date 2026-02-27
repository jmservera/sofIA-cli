# CLI Usage

## Binary

The CLI is invoked via `npm run start --` (development) or `sofia` (after building and linking).

```bash
# Development mode (tsx, no watch)
npm run start -- <command> [options]

# Watch mode (auto-reloads on file changes)
npm run dev -- <command> [options]

# Built mode (requires `npm run build` first)
npm run sofia -- <command> [options]
```

## Global Options

| Flag | Description |
|------|-------------|
| `--version` | Print version and exit |
| `--help` | Print help and exit |
| `--session <id>` | Target a specific session by ID |
| `--json` | Machine-readable JSON output only on stdout |
| `--debug` | Enable debug telemetry |
| `--log-file <path>` | Write structured logs to the specified file |
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

| Flag | Description |
|------|-------------|
| `--new-session` | Skip menu and start a new session |
| `--phase <phase>` | Jump to a specific phase (requires `--session`) |
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

### `export`

Export workshop artifacts for a session.

```bash
# Export to default directory (./exports/<sessionId>/)
npm run start -- export --session <id>

# Export to a custom directory
npm run start -- export --session <id> --output ./my-export/
```

**Export-specific flags:**

| Flag | Description |
|------|-------------|
| `--output <dir>` | Custom output directory (default: `./exports/<sessionId>/`) |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error (invalid input, session not found, etc.) |

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
npm run start -- workshop

# Automation: run Ideate phase, JSON output, no prompts
npm run start -- workshop --session abc123 --phase Ideate --json --non-interactive

# Check what phase a session is on
npm run start -- status --session abc123 --json

# Export artifacts after completing a workshop
npm run start -- export --session abc123

# Enable debug logging to file
npm run start -- workshop --debug --log-file .sofia/logs/dev.log
```
