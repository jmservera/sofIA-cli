export interface WebSearchOptions {
  transport?: (endpoint: string, key: string, query: string) => Promise<{ results: any[] }>;
  allowFallback?: boolean;
}

export interface WebSearchResult {
  results?: { title: string; url: string; snippet?: string; sources?: any[] }[];
  fallback?: boolean;
  message?: string;
}

const defaultTransport: WebSearchOptions['transport'] = async (endpoint, key, query) => {
  // Placeholder: real implementation should call Azure AI Foundry agent with Bing Search tool
  const fetchFn: any = (globalThis as any).fetch;
  if (!fetchFn) throw new Error('fetch is not available in this environment');
  const resp = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) {
    throw new Error(`Foundry agent error: ${resp.status}`);
  }
  return (await resp.json()) as { results: any[] };
};

export const searchWeb = async (query: string, opts: WebSearchOptions = {}): Promise<WebSearchResult> => {
  const endpoint = process.env.SOFIA_FOUNDRY_AGENT_ENDPOINT;
  const key = process.env.SOFIA_FOUNDRY_AGENT_KEY;
  if (!endpoint || !key) {
    throw new Error('Foundry agent for web.search not configured. Set SOFIA_FOUNDRY_AGENT_ENDPOINT and SOFIA_FOUNDRY_AGENT_KEY.');
  }
  const transport = opts.transport ?? defaultTransport;
  try {
    const resp = await transport(endpoint, key, query);
    const results = resp?.results?.map((r: any) => ({
      title: r.title ?? r.name ?? '',
      url: r.url ?? r.link ?? '',
      snippet: r.snippet ?? r.description ?? '',
      sources: r.sources ?? r.references ?? [],
    }));
    return { results };
  } catch (err) {
    if (opts.allowFallback) {
      return {
        fallback: true,
        message: 'web.search unavailable; please provide links/notes manually (guided research).',
      };
    }
    throw err;
  }
};
