import type { WorkshopSession } from '../shared/schemas/session';
import type { CopilotClient } from '../shared/copilotClient';

export interface DiscoverPhaseDeps {
  state: WorkshopSession;
  copilot: CopilotClient;
  mcp: { callWorkIQ: (state: WorkshopSession) => Promise<any>; webSearch: (query: string) => Promise<any> };
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const loadPrompt = (name: string): string => {
  try {
    return readFileSync(join(process.cwd(), 'src', 'prompts', `${name}.md`), 'utf8');
  } catch {
    return '';
  }
};

export const runDiscoverPhase = async ({ state, copilot, mcp }: DiscoverPhaseDeps) => {
  const artifacts: string[] = [];
  let businessContext: any = state.businessContext ?? {};
  try {
    const workiqResult = await mcp.callWorkIQ(state);
    businessContext.summary = workiqResult?.summary ?? businessContext.summary;
    artifacts.push(`WorkIQ summary: ${workiqResult?.summary ?? ''}`);
  } catch {
    // fallback to web search
    const searchResult = await mcp.webSearch(state.topic?.topicArea ?? '');
    businessContext.research = searchResult?.results ?? [];
    artifacts.push(`web.search results: ${(searchResult?.results ?? []).length}`);
  }
  // Ask clarifying questions via Copilot streaming using discover prompt
  const prompt = loadPrompt('discover');
  const events = copilot.streamConversation([
    { role: 'system', content: prompt },
    { role: 'user', content: businessContext?.summary ?? 'Please describe your business.' },
  ] as any);
  for (const evt of events as any) {
    if (evt.type === 'text-delta') {
      artifacts.push(evt.content);
    }
  }
  if (artifacts.length === 0) {
    artifacts.push('Prompt: Tell me more about your business.');
  }
  return {
    ...state,
    businessContext,
    artifacts: { ...(state.artifacts ?? {}), discover: artifacts },
  } as WorkshopSession & { artifacts: any };
};
