# sofia-specs Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-26

## Active Technologies
- TypeScript (ES2022 target) on Node.js ≥ 20 LTS, ESM (`"type": "module"`) + `@github/copilot-sdk` ^0.1.28, `commander` ^11.1.0, `zod` ^4.3.6, `pino` ^8.17.2, `ora` ^7.0.1, `chalk` ^5.2.0 (004-dev-resume-hardening)
- Local JSON files via `SessionStore` (atomic write-then-rename to `.sofia/sessions/<id>.json`) (004-dev-resume-hardening)
- Node.js 20 LTS + TypeScript 5.3, Bash (deployment scripts), Bicep (IaC) + `@github/copilot-sdk ^0.1.28`, `@azure/ai-projects` (new), `@azure/identity` (new), `zod ^4.3.6` (005-ai-search-deploy)
- N/A (stateless infrastructure provisioning; session state handled by existing `SessionStore`) (005-ai-search-deploy)
- Node.js (>=20 LTS) with TypeScript 5.3 (ES2022 target, ESM) + `@github/copilot-sdk` ^0.1.28 (primary MCP + LLM surface), `zod` ^4 (response validation), `pino` ^8 (structured logging), `@upstash/context7-mcp` (stdio MCP subprocess), `@azure/mcp` (stdio MCP subprocess), `@microsoft/workiq` (stdio MCP subprocess) (003-mcp-transport-integration)
- Filesystem — session JSON at `.sofia/sessions/<id>.json`, PoC output at `./poc/<sessionId>/`; MCP config from `.vscode/mcp.json` (003-mcp-transport-integration)

- Node.js 20 LTS + TypeScript 5.x + `@github/copilot-sdk`, `commander` (CLI), `@inquirer/prompts` (menus), `zod` (schemas), `pino` (logs), `ora` (spinners/activity) (001-cli-workshop-rebuild)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

Node.js 20 LTS + TypeScript 5.x: Follow standard conventions

## Recent Changes
- 004-dev-resume-hardening: Added TypeScript (ES2022 target) on Node.js ≥ 20 LTS, ESM (`"type": "module"`) + `@github/copilot-sdk` ^0.1.28, `commander` ^11.1.0, `zod` ^4.3.6, `pino` ^8.17.2, `ora` ^7.0.1, `chalk` ^5.2.0
- 005-ai-search-deploy: Added Node.js 20 LTS + TypeScript 5.3, Bash (deployment scripts), Bicep (IaC) + `@github/copilot-sdk ^0.1.28`, `@azure/ai-projects` (new), `@azure/identity` (new), `zod ^4.3.6`
- 003-mcp-transport-integration: Added Node.js (>=20 LTS) with TypeScript 5.3 (ES2022 target, ESM) + `@github/copilot-sdk` ^0.1.28 (primary MCP + LLM surface), `zod` ^4 (response validation), `pino` ^8 (structured logging), `@upstash/context7-mcp` (stdio MCP subprocess), `@azure/mcp` (stdio MCP subprocess), `@microsoft/workiq` (stdio MCP subprocess)
- 002-poc-generation: Added Node.js (>=20 LTS) with TypeScript (ES2022 target, ESM) + `@github/copilot-sdk` (LLM orchestration), `commander` (CLI), `ora` (spinner feedback), `marked`/`marked-terminal` (markdown rendering), `pino` (logging), `zod` (schema validation)

- 001-cli-workshop-rebuild: Added Node.js 20 LTS + TypeScript 5.x + `@github/copilot-sdk`, `commander` (CLI), `@inquirer/prompts` (menus), `zod` (schemas), `pino` (logs), `ora` (spinners/activity)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
