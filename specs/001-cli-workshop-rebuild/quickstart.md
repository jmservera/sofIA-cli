# Quickstart: sofIA CLI workshop rebuild

This quickstart is for the future implementation repository state once code exists.

## Prereqs

- Node.js 20 LTS
- npm

## Setup

- Install dependencies: `npm install`

## Run (interactive)

- Start: `npm run sofia -- workshop`

## Run (non-interactive)

- Example (JSON output): `npm run sofia -- status --session <id> --json`

## Storage

- Session files: `./.sofia/sessions/<sessionId>.json`
- Exports: `./exports/<sessionId>/`

## Testing

- Unit/integration: `npm test`
- Interactive E2E (PTY): `npm run test:e2e`

## Debug logs

- Enable debug: `npm run sofia -- workshop --debug --log-file ./.sofia/logs/dev.log`

