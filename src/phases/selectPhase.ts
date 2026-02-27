import type { WorkshopSession } from '../shared/schemas/session';

type BxtScore = { business: number; experience: number; technical: number; rationale: string };
type EvaluationItem = { ideaId: string; scores: BxtScore; classification: string };

type SelectResult = {
  evaluation: { items: EvaluationItem[] };
  selection: { ideaId: string; selectionRationale: string; confirmedByUser: boolean };
};

const scoreIdea = (title: string): BxtScore => ({
  business: title.length % 5,
  experience: (title.length + 2) % 5,
  technical: (title.length + 3) % 5,
  rationale: `Scored based on heuristic for ${title}`,
});

export const runSelectPhase = async ({ state }: { state: WorkshopSession }): Promise<WorkshopSession & SelectResult> => {
  const ideas = (state as any).ideas ?? [];
  const items: EvaluationItem[] = ideas.map((idea: any, idx: number) => ({
    ideaId: idea.title ?? `idea-${idx}`,
    scores: scoreIdea(idea.title ?? `idea-${idx}`),
    classification: 'Viable',
  }));
  // Simple selection: max business score
  const sorted = [...items].sort((a, b) => b.scores.business - a.scores.business);
  const top = sorted[0];
  const selection = {
    ideaId: top?.ideaId ?? ideas[0]?.title ?? 'unknown',
    selectionRationale: 'Highest business impact per BXT scoring',
    confirmedByUser: true,
  };
  const artifacts = { ...(state.artifacts ?? {}), select: items.map((i) => `${i.ideaId}:${i.scores.business}`) };
  return {
    ...(state as any),
    evaluation: { items },
    selection,
    artifacts,
  };
};
