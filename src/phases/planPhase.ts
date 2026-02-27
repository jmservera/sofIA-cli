import type { WorkshopSession } from '../shared/schemas/session';

type Milestone = { id: string; title: string; items: string[] };

type Plan = {
  milestones: Milestone[];
  risks: string[];
  successMetrics: string[];
  dependencies?: string[];
};

type PocIntent = {
  targetStack?: string;
  keyScenarios?: string[];
  constraints?: string[];
};

export const runPlanPhase = async ({ state }: { state: WorkshopSession }): Promise<WorkshopSession & { plan: Plan; pocIntent: PocIntent }> => {
  const selection = (state as any).selection;
  const ideaId = selection?.ideaId ?? 'unknown';
  const plan: Plan = {
    milestones: [
      { id: 'm1', title: 'Discovery Wrap-up', items: ['Confirm context', 'Lock KPIs'] },
      { id: 'm2', title: 'PoC Build', items: ['Scaffold', 'Implement core flow', 'Smoke test'] },
      { id: 'm3', title: 'Pilot Prep', items: ['Docs', 'Handover'] },
    ],
    risks: ['Data availability', 'Integration complexity'],
    successMetrics: ['TTFT <= 3s', 'Smoke tests pass', 'Stakeholder approval'],
    dependencies: ['Access to datasets', 'Environment setup'],
  };
  const pocIntent: PocIntent = {
    targetStack: 'Node.js + TypeScript',
    keyScenarios: ['Core workflow automation'],
    constraints: ['No customer data in dev'],
  };
  const artifacts = { ...(state.artifacts ?? {}), plan: [`Plan for ${ideaId}`, ...plan.milestones.map((m) => m.title)] };
  const pocState = { ...(state as any).poc, iterations: [] };
  return {
    ...(state as any),
    plan,
    pocIntent,
    poc: pocState,
    artifacts,
  };
};
