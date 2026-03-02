# Contract: CLI Surface

This document defines the public CLI contract. Exact flags/subcommands may evolve, but breaking changes must be deliberate.

## Binary

- Name: `sofia`

## Global options

- `--help`
- `--version`
- `--session <id>`: target an existing session
- `--new-session`: create a new session
- `--non-interactive`: disallow prompts; fail with actionable error if input is missing
- `--json`: emit machine-readable JSON **only** on stdout (no spinners/telemetry)
- `--debug`: enable debug telemetry
- `--log-file <path>`: write structured logs to file

## Commands

### 1) `sofia workshop`

Starts or resumes the governed workshop flow.

- Interactive by default (TTY).
- In non-interactive mode, requires sufficient args or input file (defined in implementation).

Outputs:

- Human: streamed narrative + activity stream (stderr).
- JSON mode: JSON events only on stdout.

### 2) `sofia status`

Displays session status and next expected action.

Outputs:

- Human: concise summary.
- JSON: `{ sessionId, phase, status, updatedAt, nextAction }`.

### 3) `sofia export`

Exports artifacts for a session.

- Default output: `./exports/<sessionId>/`
- Output includes `summary.json` and phase markdown files.

### 4) `sofia dev` (optional)

Developer utilities (may be hidden) for local PoC scaffolding and diagnostics.

## Error contract

- Exit codes are stable and documented in implementation.
- In JSON mode, errors are emitted as JSON objects with:
  - `error.code`
  - `error.message`
  - `error.details?`
