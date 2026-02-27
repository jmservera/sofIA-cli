import type { WorkshopSession } from '../shared/schemas/session';
import type { CopilotClient } from '../shared/copilotClient';

export interface DesignPhaseDeps {
  state: WorkshopSession;
  copilot: CopilotClient;
  mcp: { lookupDocs: (topics: string[]) => Promise<any[]> };
}

type IdeaCard = {
  title: string;
  description?: string;
  dataRequirements?: string[];
  architecture?: string; // mermaid
  services?: string[];
  risks?: string[];
  docs?: any[];
};

const mermaidTemplate = (title: string) => `mermaid\nflowchart LR\n  User-->System\n  System-->${title.replace(/\s+/g, '')}`;

export const runDesignPhase = async ({ state, copilot, mcp }: DesignPhaseDeps) => {
  const artifacts: string[] = [];
  const ideas = state.ideas ?? [];
  const docs = await mcp.lookupDocs(ideas.map((i: any) => i.title));
  const ideaCards: IdeaCard[] = ideas.map((idea: any) => ({
    title: idea.title,
    description: idea.description ?? '',
    dataRequirements: [],
    architecture: mermaidTemplate(idea.title),
    services: [],
    risks: [],
    docs,
  }));
  for (const evt of copilot.streamConversation([
    { role: 'system', content: 'Generate idea cards with architecture sketches.' },
  ] as any) as any) {
    if (evt.type === 'text-delta') artifacts.push(evt.content);
  }
  artifacts.push(...ideaCards.map((c) => `IdeaCard: ${c.title}`));
  return {
    ...state,
    ideaCards,
    artifacts: { ...(state.artifacts ?? {}), design: artifacts },
  } as WorkshopSession & { ideaCards: IdeaCard[] };
};
