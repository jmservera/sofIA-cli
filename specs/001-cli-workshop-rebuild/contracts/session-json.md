# Contract: Session JSON

**Path**: `./.sofia/sessions/<sessionId>.json`

## Format

- Encoding: UTF-8
- JSON object
- Overwrite the file after each user turn (atomic write in implementation)

## Minimum required fields

- `sessionId: string`
- `schemaVersion: string`
- `createdAt: string` (ISO-8601)
- `updatedAt: string` (ISO-8601)
- `phase: string`
- `status: string`
- `artifacts.generatedFiles: array`

## Compatibility

- `schemaVersion` supports forward migration.
- Unknown fields must be preserved when loading/saving.

## Safety

- Must not persist secrets/tokens.
- Redact/omit any sensitive values from tool responses before writing.

