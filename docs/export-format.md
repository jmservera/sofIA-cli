# Export Format

## Overview

The `sofia export` command generates customer-ready artifacts from a workshop session. Exports include per-phase Markdown files and a machine-readable `summary.json`.

## Output Directory

```
exports/<sessionId>/
├── summary.json
├── discover.md
├── ideate.md
├── design.md
├── select.md
├── plan.md
└── develop.md
```

Default path: `./exports/<sessionId>/`
Override with: `--output <dir>`

## summary.json

The summary file provides a machine-readable overview of the export.

```json
{
  "sessionId": "ac516a6f-f5ee-4426-9a61-4d5c9c883ba7",
  "exportedAt": "2026-02-27T10:30:00.000Z",
  "phase": "Plan",
  "status": "Active",
  "files": [
    { "path": "discover.md", "type": "markdown" },
    { "path": "ideate.md", "type": "markdown" },
    { "path": "design.md", "type": "markdown" },
    { "path": "select.md", "type": "markdown" },
    { "path": "plan.md", "type": "markdown" },
    { "path": "summary.json", "type": "json" }
  ],
  "highlights": [
    "Business: Contoso Ltd — supply chain optimization",
    "Selected idea: AI-powered demand forecasting",
    "Plan: 3 milestones over 8 weeks"
  ]
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | Session identifier |
| `exportedAt` | `string` | ISO-8601 timestamp of export |
| `phase` | `string` | Session phase at time of export |
| `status` | `string` | Session status at time of export |
| `files` | `Array<{path, type}>` | List of generated files (paths relative to export dir) |
| `highlights` | `string[]?` | Optional key takeaways from the session |

## Phase Markdown Files

Each completed phase generates a Markdown file with phase-specific content:

| File | Contents |
|------|----------|
| `discover.md` | Business description, challenges, constraints, topic selection |
| `ideate.md` | Activities, workflow map, selected AI Envisioning Cards |
| `design.md` | Idea Cards with descriptions and architecture sketches |
| `select.md` | Evaluation matrix, selected idea, rationale |
| `plan.md` | Implementation milestones, architecture notes, dependencies |
| `develop.md` | PoC requirements, tech stack, iteration history |

Only phases that have been completed (or are in progress) generate Markdown files. If a phase has no data, its file is omitted.

## Safety

- No secrets or tokens are included in exports
- File paths in `summary.json` are relative to the export directory
- Export is idempotent — re-exporting overwrites previous artifacts

## Related

- Export contract: [specs/001-cli-workshop-rebuild/contracts/export-summary-json.md](../specs/001-cli-workshop-rebuild/contracts/export-summary-json.md)
- Export writer source: `src/sessions/exportWriter.ts`
