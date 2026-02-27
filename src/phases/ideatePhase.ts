import type { WorkshopSession } from '../shared/schemas/session';
import type { CopilotClient } from '../shared/copilotClient';
import type { CardsDataset } from '../shared/data/cardsLoader';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface IdeatePhaseDeps {
  state: WorkshopSession;
  copilot: CopilotClient;
  cardsLoader: { loadCardsDataset: () => Promise<CardsDataset> };
}

type Idea = { title: string; rationale?: string; mappedCards?: string[] };

const loadPrompt = (name: string) => {
  try {
    return readFileSync(join(process.cwd(), 'src', 'prompts', `${name}.md`), 'utf8');
  } catch {
    return '';
  }
};

export const runIdeatePhase = async ({ state, copilot, cardsLoader }: IdeatePhaseDeps) => {
  const artifacts: string[] = [];
  const dataset = await cardsLoader.loadCardsDataset();
  const cards = dataset.cards ?? [];
  artifacts.push(`Loaded ${cards.length} cards`);

  const prompt = loadPrompt('ideate');
  const needsClarification = !state.workflow || !(state as any).workflow?.activities?.length;
  const messages: any[] = [{ role: 'system', content: prompt }];
  if (needsClarification) {
    messages.push({ role: 'user', content: 'We need more detail about the workflow' });
  }
  for (const evt of copilot.streamConversation(messages) as any) {
    if (evt.type === 'text-delta') artifacts.push(evt.content);
  }

  const ideas: Idea[] = cards.slice(0, 3).map((card: any) => ({ title: card.title, mappedCards: [card.cardId ?? card.id] }));
  artifacts.push(...ideas.map((i) => `Idea: ${i.title}`));

  return {
    ...state,
    cards,
    ideas,
    promptsAsked: needsClarification ? artifacts.filter((a) => a.includes('?')) : [],
    artifacts: { ...(state.artifacts ?? {}), ideate: artifacts },
  } as WorkshopSession & { cards: any; ideas: Idea[]; promptsAsked?: string[] };
};
