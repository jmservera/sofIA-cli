/**
 * Develop phase module.
 *
 * Exports all components of the PoC Generation & Ralph Loop feature (Feature 002).
 * Orchestrates: scaffold → install → iterate (test → fix → repeat) → complete.
 */

export { PocScaffolder } from './pocScaffolder.js';
export type { ScaffoldContext, ScaffoldResult } from './pocScaffolder.js';

export { TestRunner } from './testRunner.js';

export { CodeGenerator } from './codeGenerator.js';

export { McpContextEnricher } from './mcpContextEnricher.js';

export { GitHubMcpAdapter } from './githubMcpAdapter.js';

export { RalphLoop } from './ralphLoop.js';
export type { RalphLoopOptions, RalphLoopResult } from './ralphLoop.js';

export { deriveCheckpointState } from './checkpointState.js';
export type { CheckpointState } from './checkpointState.js';

export {
  selectTemplate,
  createDefaultRegistry,
  NODE_TS_VITEST_TEMPLATE,
  PYTHON_PYTEST_TEMPLATE,
} from './templateRegistry.js';
export type { TemplateEntry, TemplateRegistry } from './templateRegistry.js';
