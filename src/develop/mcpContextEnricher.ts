/**
 * MCP Context Enricher.
 *
 * Conditionally queries MCP services to enrich the LLM iteration prompt
 * with up-to-date library docs and architecture guidance:
 *
 * - Context7: library documentation for PoC dependencies
 * - Azure MCP / Microsoft Docs: when plan references Azure services
 * - web.search: when stuck (2+ consecutive iterations with same failures)
 *
 * All MCP queries degrade gracefully — returns empty context when unavailable.
 *
 * Contract: specs/002-poc-generation/tasks.md (T048/T049)
 */
import type { McpManager } from '../mcp/mcpManager.js';
import { isWebSearchConfigured } from '../mcp/webSearch.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EnricherOptions {
  /** MCP manager to check service availability */
  mcpManager: McpManager;
  /** Dependencies listed in the plan (e.g., ["express", "zod"]) */
  dependencies?: string[];
  /** Plan architecture notes (checked for Azure keywords) */
  architectureNotes?: string;
  /** Number of consecutive stuck iterations (same failures) */
  stuckIterations?: number;
  /** Current failing test names for stuck detection */
  failingTests?: string[];
}

export interface EnrichedContext {
  /** Context7 library docs */
  libraryDocs?: string;
  /** Azure/cloud guidance */
  azureGuidance?: string;
  /** Web search results */
  webSearchResults?: string;
  /** Combined context string for prompt injection */
  combined: string;
}

// ── Azure keyword detection ───────────────────────────────────────────────────

const AZURE_KEYWORDS = [
  'azure',
  'cosmos db',
  'cosmosdb',
  'blob storage',
  'service bus',
  'event hub',
  'app service',
  'azure sql',
  'key vault',
  'azure functions',
  'azure openai',
];

function mentionsAzure(text: string): boolean {
  const lower = text.toLowerCase();
  return AZURE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── McpContextEnricher ────────────────────────────────────────────────────────

/**
 * Enriches LLM iteration prompts with context from MCP services.
 *
 * Each method degrades gracefully — returns undefined when service
 * is unavailable rather than throwing.
 */
export class McpContextEnricher {
  /** @internal Exposed for RalphLoop integration */
  readonly mcpManager: McpManager;

  constructor(mcpManager: McpManager) {
    this.mcpManager = mcpManager;
  }

  /**
   * Enrich the iteration context with MCP-sourced information.
   *
   * Queries are conditional on:
   * 1. Context7: available AND dependencies listed in plan
   * 2. Azure MCP: available AND plan references Azure services
   * 3. web.search: configured AND stuckIterations >= 2
   */
  async enrich(options: EnricherOptions): Promise<EnrichedContext> {
    const { dependencies = [], architectureNotes = '', stuckIterations = 0 } = options;

    const parts: string[] = [];
    let libraryDocs: string | undefined;
    let azureGuidance: string | undefined;
    let webSearchResults: string | undefined;

    // Context7: library documentation when dependencies are present
    if (this.mcpManager.isAvailable('context7') && dependencies.length > 0) {
      libraryDocs = await this.queryContext7(dependencies);
      if (libraryDocs) parts.push(`### Library Documentation (Context7)\n\n${libraryDocs}`);
    }

    // Azure MCP: cloud architecture when plan references Azure
    if (this.mcpManager.isAvailable('azure') && mentionsAzure(architectureNotes)) {
      azureGuidance = await this.queryAzureMcp(architectureNotes);
      if (azureGuidance) parts.push(`### Azure Architecture Guidance\n\n${azureGuidance}`);
    }

    // web.search: when stuck for 2+ iterations
    if (isWebSearchConfigured() && stuckIterations >= 2 && options.failingTests?.length) {
      webSearchResults = await this.queryWebSearch(options.failingTests);
      if (webSearchResults) parts.push(`### Web Search Results\n\n${webSearchResults}`);
    }

    return {
      libraryDocs,
      azureGuidance,
      webSearchResults,
      combined: parts.join('\n\n'),
    };
  }

  /**
   * Query Context7 for library documentation.
   *
   * In a real implementation this would call the Context7 MCP tool.
   * This implementation simulates the call and degrades gracefully.
   */
  private async queryContext7(dependencies: string[]): Promise<string | undefined> {
    // Guard: Context7 must be available (checked by caller, but defensive here)
    if (!this.mcpManager.isAvailable('context7')) return undefined;

    try {
      // In production this would call the MCP tool via the Copilot SDK.
      // For now, return structured guidance based on known dependencies.
      const docs: string[] = [];

      for (const dep of dependencies.slice(0, 5)) {
        // Filter out type-only and well-known packages that don't need lookup
        if (dep.startsWith('@types/') || dep === 'typescript' || dep === 'vitest') {
          continue;
        }
        docs.push(`- **${dep}**: See https://www.npmjs.com/package/${dep} for API documentation`);
      }

      return docs.length > 0 ? docs.join('\n') : undefined;
    } catch {
      // Degrade gracefully
      return undefined;
    }
  }

  /**
   * Query Azure MCP for architecture guidance.
   *
   * Degrades gracefully when Azure MCP is unavailable.
   */
  private async queryAzureMcp(architectureNotes: string): Promise<string | undefined> {
    // Guard: Azure MCP must be available (checked by caller, but defensive here)
    if (!this.mcpManager.isAvailable('azure')) return undefined;

    try {
      // In production this would call the Azure MCP / Microsoft Docs MCP tool.
      // For now, return structured guidance based on detected Azure services.
      const detected = AZURE_KEYWORDS.filter((kw) =>
        architectureNotes.toLowerCase().includes(kw),
      );

      if (detected.length === 0) return undefined;

      return [
        `Detected Azure services: ${detected.join(', ')}`,
        'Use the @azure/identity DefaultAzureCredential for authentication.',
        'Prefer connection strings from environment variables (never hardcode).',
      ].join('\n');
    } catch {
      return undefined;
    }
  }

  /**
   * Query web search for solutions to failing tests.
   *
   * Only called when stuckIterations >= 2 to avoid unnecessary API calls.
   */
  private async queryWebSearch(failingTests: string[]): Promise<string | undefined> {
    if (!isWebSearchConfigured()) return undefined;

    try {
      // In production this would call the web.search tool.
      // For now, return structured guidance based on the failing test names.
      const query = failingTests.slice(0, 3).join('; ');
      return `Web search for: "${query}" — no results available in this environment.`;
    } catch {
      return undefined;
    }
  }
}
