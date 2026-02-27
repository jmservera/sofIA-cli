# sofIA CLI Documentation

sofIA is an AI Discovery Workshop CLI that guides facilitators through the structured process of discovering, ideating, designing, selecting, and planning AI solutions for business needs.

## Table of Contents

- [CLI Usage](./cli-usage.md) — Commands, flags, and examples
- [Session Model](./session-model.md) — Session lifecycle, phases, and persistence
- [Export Format](./export-format.md) — Exported artifacts and summary JSON structure
- [Environment Variables](./environment.md) — Configuration via environment
- [Architecture](./architecture.md) — Module overview and data flow

## Quick Start

```bash
# Install dependencies
npm install

# Start an interactive workshop
npm run start -- workshop

# Check session status
npm run start -- status

# Export session artifacts
npm run start -- export --session <id>
```

For the full specification, see [specs/001-cli-workshop-rebuild/](../specs/001-cli-workshop-rebuild/).
