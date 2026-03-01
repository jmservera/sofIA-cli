# Architecture

## Module Overview

```
src/
├── cli/                     # CLI entrypoints and command handlers
│   ├── index.ts             # Main entrypoint (commander setup)
│   ├── workshopCommand.ts   # Interactive workshop menu and flow
│   ├── developCommand.ts    # `sofia dev` — PoC generation handler
│   ├── statusCommand.ts     # Session status display
│   ├── exportCommand.ts     # Artifact export handler
│   ├── directCommands.ts    # Non-interactive direct command mode
│   ├── ioContext.ts         # TTY/non-TTY detection, JSON mode, I/O
│   └── preflight.ts         # Pre-flight environment checks
├── develop/                 # PoC generation & Ralph loop
│   ├── index.ts             # Barrel export
│   ├── ralphLoop.ts         # Autonomous iteration orchestrator
│   ├── pocScaffolder.ts     # PoC project scaffolding + output validation
│   ├── codeGenerator.ts     # LLM-driven code generation & prompt building
│   ├── testRunner.ts        # Test execution and result parsing
│   ├── mcpContextEnricher.ts# MCP-driven context enrichment (Context7, Azure, web search)
│   └── githubMcpAdapter.ts  # GitHub MCP repo creation adapter
├── loop/
│   └── conversationLoop.ts  # Multi-turn conversation orchestrator
├── phases/
│   ├── phaseHandlers.ts     # Phase handler factory (one per phase)
│   └── phaseExtractors.ts   # JSON block extraction + Zod validation
├── sessions/
│   ├── sessionStore.ts      # Read/write session JSON files
│   ├── sessionManager.ts    # Backtracking, phase transitions
│   ├── exportWriter.ts      # Markdown + summary.json generation
│   └── exportPaths.ts       # Export directory path resolution
├── mcp/
│   ├── mcpManager.ts        # MCP server connection manager
│   └── webSearch.ts         # Azure AI Foundry Bing Search tool
├── prompts/
│   └── promptLoader.ts      # Cached prompt template composition
├── logging/
│   └── logger.ts            # Pino logger with PII redaction
├── shared/
│   ├── schemas/
│   │   └── session.ts       # Zod schemas for all session entities
│   ├── copilotClient.ts     # Copilot SDK abstraction + test fakes
│   ├── errorClassifier.ts   # Error categorization (9 types)
│   ├── events.ts            # Activity/telemetry event model
│   ├── markdownRenderer.ts  # marked + marked-terminal rendering
│   ├── tableRenderer.ts     # cli-table3 wrapper
│   └── data/
│       ├── cards.json        # AI Envisioning Cards dataset
│       └── cardsLoader.ts    # Cards dataset loader
└── vendor/
    └── zod.ts               # Re-export of zod/v4
```

## Data Flow

```
User Input
    │
    ▼
┌─────────────────┐     ┌──────────────────┐
│  CLI Commands   │────▶│  workshopCommand  │
│  (index.ts)     │     │  statusCommand    │
│                 │     │  exportCommand    │
│                 │     │  directCommands   │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────▼───────────┐
                    │   ConversationLoop     │
                    │   (multi-turn chat)    │
                    └────────────┬───────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                   ▼
     ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐
     │ PhaseHandlers  │  │ CopilotClient│  │ SessionStore     │
     │ (per-phase     │  │ (SDK or fake)│  │ (JSON persist)   │
     │  logic)        │  └──────────────┘  └──────────────────┘
     └────────┬───────┘
              │
       ┌──────┴──────┐
       ▼              ▼
┌──────────────┐  ┌─────────────────┐
│ promptLoader │  │ phaseExtractors │
│ (templates)  │  │ (Zod parse)     │
└──────────────┘  └─────────────────┘
```

## Key Design Patterns

### PhaseHandler Interface

Each workshop phase implements the `PhaseHandler` interface:

```typescript
interface PhaseHandler {
  phase: PhaseValue;
  buildSystemPrompt(session: WorkshopSession): string;
  getReferences(session: WorkshopSession): Reference[];
  extractResult(text: string): unknown;
  isComplete(session: WorkshopSession): boolean;
}
```

### ConversationLoop

The `ConversationLoop` orchestrates multi-turn conversations between the user, the Copilot client, and the active `PhaseHandler`. It handles:

- Streaming responses with real-time rendering
- Activity/telemetry event emission
- Ctrl+C signal handling for graceful shutdown
- Session persistence after every turn

### LoopIO Interface

I/O is abstracted behind `LoopIO` for testability:

- **TTY mode:** Interactive prompts via terminal
- **Non-TTY mode:** Reads from stdin, writes JSON to stdout
- **JSON mode:** Activity events go to stderr, structured data to stdout

### Error Classification

Errors are classified into 9 categories with recovery hints:

| Category     | Recoverable | Example               |
| ------------ | ----------- | --------------------- |
| `connection` | Yes         | Network unreachable   |
| `dns`        | Yes         | DNS resolution failed |
| `timeout`    | Yes         | Request timed out     |
| `auth`       | No          | Invalid credentials   |
| `rate-limit` | Yes         | Too many requests     |
| `not-found`  | No          | Resource not found    |
| `validation` | No          | Invalid input         |
| `mcp`        | Yes         | MCP server down       |
| `internal`   | No          | Unexpected error      |

### Pre-flight Checks

Before starting a workshop, `runPreflightChecks()` runs environment validations in parallel:

- Copilot SDK connectivity
- MCP server readiness
- Web search tool availability

Each check reports pass/warn/fail with a message. Required checks block startup; optional checks emit warnings.

## Testing Architecture

```
tests/
├── unit/           # Single-module tests with mocks
├── integration/    # Multi-module flow tests
└── e2e/            # PTY-based interactive tests
```

- **Test runner:** Vitest with v8 coverage
- **Mocking:** `vi.mock()` at module boundaries
- **Fakes:** `createFakeCopilotClient()` for deterministic chat responses
- **TDD workflow:** Red → Green → Review for all new behavior

## Related

- Feature 001 spec: [specs/001-cli-workshop-rebuild/spec.md](../specs/001-cli-workshop-rebuild/spec.md)
- Feature 001 plan: [specs/001-cli-workshop-rebuild/plan.md](../specs/001-cli-workshop-rebuild/plan.md)
- Feature 002 spec: [specs/002-poc-generation/spec.md](../specs/002-poc-generation/spec.md)
- Feature 002 plan: [specs/002-poc-generation/plan.md](../specs/002-poc-generation/plan.md)
- Research notes: [specs/001-cli-workshop-rebuild/research.md](../specs/001-cli-workshop-rebuild/research.md)
