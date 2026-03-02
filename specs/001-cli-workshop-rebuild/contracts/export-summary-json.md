# Contract: Export `summary.json`

**Path**: `./exports/<sessionId>/summary.json`

## Format

- Encoding: UTF-8
- JSON object

## Minimum fields

- `sessionId: string`
- `exportedAt: string` (ISO-8601)
- `phase: string`
- `status: string`
- `files: Array<{ path: string; type: string }>`
- `highlights?: string[]`

## Notes

- `files[].path` is relative to the export directory.
- Do not include secrets.
