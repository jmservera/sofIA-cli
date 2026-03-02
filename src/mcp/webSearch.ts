/**
 * Web search tool backed by Azure AI Foundry Bing Search agent.
 *
 * Provides a `web.search` tool that can be registered with the Copilot SDK.
 * When configured, calls an Azure AI Foundry agent with Bing Search tools.
 * When not configured or on error, degrades gracefully.
 */
import type { ToolDefinition } from '../shared/copilotClient.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResult {
  results: WebSearchResultItem[];
  sources?: string[];
  /** If true, the search degraded (Foundry unavailable/error). */
  degraded?: boolean;
  /** Error message when degraded. */
  error?: string;
}

export interface WebSearchConfig {
  endpoint: string;
  apiKey: string;
  /** Override fetch for testing. */
  fetchFn?: typeof fetch;
}

// ── Tool definition ──────────────────────────────────────────────────────────

export const WEB_SEARCH_TOOL_DEFINITION: ToolDefinition = {
  name: 'web.search',
  description:
    'Search the web for information about companies, industries, technologies, and trends. ' +
    'Returns structured results with title, URL, and snippet.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string.',
      },
    },
    required: ['query'],
  },
};

// ── Configuration check ──────────────────────────────────────────────────────

/**
 * Check if web search is configured via environment variables.
 */
export function isWebSearchConfigured(): boolean {
  return Boolean(process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT && process.env.SOFIA_FOUNDRY_AGENT_KEY);
}

// ── Tool factory ─────────────────────────────────────────────────────────────

/**
 * Create a web search function that calls the Azure AI Foundry Bing Search agent.
 *
 * The returned function:
 * - Sends a POST request to the Foundry agent endpoint
 * - Returns structured results (title, url, snippet, sources)
 * - Degrades gracefully on network/server errors (returns empty results with degraded flag)
 */
export function createWebSearchTool(
  config: WebSearchConfig,
): (query: string) => Promise<WebSearchResult> {
  const fetchFn = config.fetchFn ?? globalThis.fetch;

  return async (query: string): Promise<WebSearchResult> => {
    try {
      const response = await fetchFn(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        return {
          results: [],
          degraded: true,
          error: `Foundry agent returned ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;

      // Validate response shape
      if (!Array.isArray(data.results)) {
        return {
          results: [],
          degraded: true,
          error: 'Foundry agent returned unexpected response format',
        };
      }

      const results: WebSearchResultItem[] = (data.results as unknown[]).map((item: unknown) => {
        const r = item as Record<string, unknown>;
        return {
          title: String(r.title ?? ''),
          url: String(r.url ?? ''),
          snippet: String(r.snippet ?? ''),
        };
      });

      const sources = Array.isArray(data.sources)
        ? (data.sources as unknown[]).map(String)
        : undefined;

      return { results, sources };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        results: [],
        degraded: true,
        error: message,
      };
    }
  };
}
