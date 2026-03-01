# sofia-specs Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-26

## Active Technologies
- Node.js (>=20 LTS) with TypeScript (ES2022 target, ESM) + `@github/copilot-sdk` (LLM orchestration), `commander` (CLI), `ora` (spinner feedback), `marked`/`marked-terminal` (markdown rendering), `pino` (logging), `zod` (schema validation) (002-poc-generation)
- Filesystem — sessions in `.sofia/sessions/<id>.json`, PoC output in `./poc/<sessionId>/` (local) or GitHub repo (MCP) (002-poc-generation)
- Node.js 20 LTS + TypeScript 5.3, Bash (deployment scripts), Bicep (IaC) + `@github/copilot-sdk ^0.1.28`, `@azure/ai-projects` (new), `@azure/identity` (new), `zod ^4.3.6` (005-ai-search-deploy)
- N/A (stateless infrastructure provisioning; session state handled by existing `SessionStore`) (005-ai-search-deploy)

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
- 005-ai-search-deploy: Added Node.js 20 LTS + TypeScript 5.3, Bash (deployment scripts), Bicep (IaC) + `@github/copilot-sdk ^0.1.28`, `@azure/ai-projects` (new), `@azure/identity` (new), `zod ^4.3.6`
- 002-poc-generation: Added Node.js (>=20 LTS) with TypeScript (ES2022 target, ESM) + `@github/copilot-sdk` (LLM orchestration), `commander` (CLI), `ora` (spinner feedback), `marked`/`marked-terminal` (markdown rendering), `pino` (logging), `zod` (schema validation)

- 001-cli-workshop-rebuild: Added Node.js 20 LTS + TypeScript 5.x + `@github/copilot-sdk`, `commander` (CLI), `@inquirer/prompts` (menus), `zod` (schemas), `pino` (logs), `ora` (spinners/activity)

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
