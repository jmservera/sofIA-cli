/**
 * Web search tool backed by Azure AI Foundry Agent Service.
 *
 * Provides a `web.search` tool that can be registered with the Copilot SDK.
 * Uses `@azure/ai-projects` SDK with `DefaultAzureCredential` for authentication.
 * Creates an ephemeral agent with `web_search_preview` on first search call,
 * reuses it for the session, and deletes it on session end.
 *
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
  projectEndpoint: string;
  modelDeploymentName: string;
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
 *
 * Uses the new env vars (`FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_MODEL_DEPLOYMENT_NAME`)
 * instead of legacy vars (`SOFIA_FOUNDRY_AGENT_ENDPOINT`, `SOFIA_FOUNDRY_AGENT_KEY`).
 */
export function isWebSearchConfigured(): boolean {
  return Boolean(
    process.env.FOUNDRY_PROJECT_ENDPOINT &&
    process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME,
  );
}

// ── Citation extraction ──────────────────────────────────────────────────────

/**
 * Extract citations from a Foundry agent response.
 *
 * Parses `url_citation` annotations from the response output items and maps
 * them into `WebSearchResultItem[]`. Deduplicates sources by URL.
 */
export function extractCitations(output: unknown[]): {
  results: WebSearchResultItem[];
  sources: string[];
} {
  const results: WebSearchResultItem[] = [];
  const seenUrls = new Set<string>();

  for (const item of output) {
    const messageItem = item as Record<string, unknown>;
    if (messageItem.type !== 'message') continue;

    const content = messageItem.content as unknown[];
    if (!Array.isArray(content)) continue;

    for (const contentBlock of content) {
      const block = contentBlock as Record<string, unknown>;
      if (block.type !== 'output_text') continue;

      const text = String(block.text ?? '');
      const annotations = block.annotations as unknown[];
      if (!Array.isArray(annotations)) continue;

      for (const annotation of annotations) {
        const ann = annotation as Record<string, unknown>;
        if (ann.type !== 'url_citation') continue;

        const url = String(ann.url ?? '');
        const title = String(ann.title ?? url);
        const startIndex = Number(ann.start_index ?? 0);
        const endIndex = Number(ann.end_index ?? text.length);
        const snippet = text.slice(startIndex, Math.min(endIndex, startIndex + 200)) || title;

        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, snippet });
        }
      }
    }
  }

  return { results, sources: [...seenUrls] };
}

// ── Agent Session ────────────────────────────────────────────────────────────

/**
 * Internal state for the ephemeral web search agent.
 * Manages lazy initialization, query execution, and cleanup.
 */
export interface AgentSessionDeps {
  createClient: (endpoint: string) => unknown;
  getOpenAIClient: (client: unknown) => Promise<unknown>;
  createAgentVersion: (client: unknown, name: string, options: unknown) => Promise<{ name: string; version: string }>;
  deleteAgentVersion: (client: unknown, name: string, version: string) => Promise<void>;
  createConversation: (openAIClient: unknown) => Promise<{ id: string }>;
  deleteConversation: (openAIClient: unknown, id: string) => Promise<void>;
  createResponse: (openAIClient: unknown, conversationId: string, input: string, agentName: string) => Promise<{ output: unknown[] }>;
}

interface AgentSessionState {
  client: unknown;
  openAIClient: unknown;
  agentName: string;
  agentVersion: string;
  conversationId: string;
  initialized: boolean;
}

let sessionState: AgentSessionState | null = null;
let sessionDeps: AgentSessionDeps | null = null;
let sessionConfig: WebSearchConfig | null = null;

/**
 * Create default dependencies using the real Azure SDK.
 */
async function createDefaultDeps(): Promise<AgentSessionDeps> {
  const { AIProjectClient } = await import('@azure/ai-projects');
  const { DefaultAzureCredential } = await import('@azure/identity');

  return {
    createClient: (endpoint: string) =>
      new AIProjectClient(endpoint, new DefaultAzureCredential()),
    getOpenAIClient: async (client: unknown) =>
      (client as InstanceType<typeof AIProjectClient>).getOpenAIClient(),
    createAgentVersion: async (client: unknown, name: string, options: unknown) => {
      const aiClient = client as InstanceType<typeof AIProjectClient>;
      const result = await aiClient.agents.createVersion(
        name,
        options as import('@azure/ai-projects').AgentDefinitionUnion,
      );
      return { name: result.name, version: result.version };
    },
    deleteAgentVersion: async (client: unknown, name: string, version: string) => {
      await (client as InstanceType<typeof AIProjectClient>).agents.deleteVersion(name, version);
    },
    createConversation: async (openAIClient: unknown) => {
      const oai = openAIClient as { conversations: { create: () => Promise<{ id: string }> } };
      return oai.conversations.create();
    },
    deleteConversation: async (openAIClient: unknown, id: string) => {
      const oai = openAIClient as { conversations: { delete: (id: string) => Promise<void> } };
      await oai.conversations.delete(id);
    },
    createResponse: async (openAIClient: unknown, conversationId: string, input: string, agentName: string) => {
      const oai = openAIClient as {
        responses: {
          create: (params: unknown, options: unknown) => Promise<{ output: unknown[] }>;
        };
      };
      return oai.responses.create(
        { conversation: conversationId, input },
        { body: { agent: { name: agentName, type: 'agent_reference' } } },
      );
    },
  };
}

// ── Tool factory ─────────────────────────────────────────────────────────────

/**
 * Create a web search function that calls the Azure AI Foundry Agent Service.
 *
 * The returned function:
 * - Lazily creates an ephemeral agent with web_search_preview on first call
 * - Reuses the agent and conversation for subsequent calls
 * - Returns structured results with URL citations
 * - Degrades gracefully on errors (returns empty results with degraded flag)
 *
 * Pass `deps` for testing to inject mocked SDK clients.
 */
export function createWebSearchTool(
  config: WebSearchConfig,
  deps?: AgentSessionDeps,
): (query: string) => Promise<WebSearchResult> {
  sessionConfig = config;
  sessionDeps = deps ?? null;

  return async (query: string): Promise<WebSearchResult> => {
    try {
      // Lazy initialization
      if (!sessionState?.initialized) {
        const resolvedDeps = sessionDeps ?? await createDefaultDeps();
        sessionDeps = resolvedDeps;

        const client = resolvedDeps.createClient(config.projectEndpoint);
        const openAIClient = await resolvedDeps.getOpenAIClient(client);

        const agent = await resolvedDeps.createAgentVersion(client, 'sofia-web-search', {
          kind: 'prompt',
          model: config.modelDeploymentName,
          instructions: 'You are a web search assistant. Search the web and return relevant results with citations.',
          tools: [{ type: 'web_search_preview' }],
        });

        const conversation = await resolvedDeps.createConversation(openAIClient);

        sessionState = {
          client,
          openAIClient,
          agentName: agent.name,
          agentVersion: agent.version,
          conversationId: conversation.id,
          initialized: true,
        };
      }

      // Execute query
      const response = await sessionDeps!.createResponse(
        sessionState.openAIClient,
        sessionState.conversationId,
        query,
        sessionState.agentName,
      );

      // Extract citations
      const { results, sources } = extractCitations(response.output ?? []);

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

// ── Session cleanup ──────────────────────────────────────────────────────────

/**
 * Destroy the ephemeral web search agent and conversation.
 *
 * Safe to call multiple times. Logs warnings on cleanup failure but does not throw.
 */
export async function destroyWebSearchSession(): Promise<void> {
  if (!sessionState?.initialized || !sessionDeps) {
    sessionState = null;
    return;
  }

  const { client, openAIClient, agentName, agentVersion, conversationId } = sessionState;

  // Reset state first so subsequent calls are no-ops
  sessionState = null;
  sessionConfig = null;

  try {
    await sessionDeps.deleteConversation(openAIClient, conversationId);
  } catch {
    // Log warning but do not throw — stale conversations are cleaned up manually
  }

  try {
    await sessionDeps.deleteAgentVersion(client, agentName, agentVersion);
  } catch {
    // Log warning but do not throw — stale agents are cleaned up by TTL
  }

  sessionDeps = null;
}

// Register cleanup on process exit
process.on('beforeExit', () => {
  void destroyWebSearchSession();
});

