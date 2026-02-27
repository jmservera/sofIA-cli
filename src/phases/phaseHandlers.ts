/**
 * Phase handler factory.
 *
 * Creates PhaseHandler instances for each workshop phase.
 * Each handler:
 *   - Builds the system prompt from canonical prompts
 *   - Provides grounding document references
 *   - Extracts structured data from LLM responses
 */
import type { PhaseHandler } from '../loop/conversationLoop.js';
import type { PhaseValue, WorkshopSession } from '../shared/schemas/session.js';
import { buildSystemPrompt, getPhaseReferences } from '../prompts/promptLoader.js';
import {
  extractBusinessContext,
  extractWorkflow,
  extractIdeas,
  extractEvaluation,
  extractSelection,
  extractPlan,
  extractPocState,
} from './phaseExtractors.js';

// ── Discover Phase ──────────────────────────────────────────────────────────

function createDiscoverHandler(): PhaseHandler {
  let cachedPrompt: string | null = null;
  let cachedRefs: string[] | null = null;

  return {
    phase: 'Discover',

    buildSystemPrompt(_session: WorkshopSession): string {
      // Lazy-loaded in run() but we need sync return.
      // The prompt is pre-loaded before the loop starts.
      return cachedPrompt ?? 'You are an AI Discovery Workshop facilitator helping with the Discover phase.';
    },

    getReferences(_session: WorkshopSession): string[] {
      return cachedRefs ?? [];
    },

    extractResult(session: WorkshopSession, response: string): Partial<WorkshopSession> {
      const updates: Partial<WorkshopSession> = {};
      const bc = extractBusinessContext(response);
      if (bc) updates.businessContext = bc;
      const wf = extractWorkflow(response);
      if (wf) updates.workflow = wf;
      return updates;
    },

    isComplete(session: WorkshopSession, _response: string): boolean {
      // Discover is complete when we have business context and workflow
      return !!(session.businessContext && session.workflow);
    },

    // Extension: allows pre-loading async prompts
    async _preload() {
      cachedPrompt = await buildSystemPrompt('Discover');
      cachedRefs = await getPhaseReferences('Discover');
    },
  } as PhaseHandler & { _preload(): Promise<void> };
}

// ── Ideate Phase ────────────────────────────────────────────────────────────

function createIdeateHandler(): PhaseHandler & { _preload(): Promise<void> } {
  let cachedPrompt: string | null = null;
  let cachedRefs: string[] | null = null;

  return {
    phase: 'Ideate',

    buildSystemPrompt(session: WorkshopSession): string {
      // Include context from Discover phase
      const context = session.businessContext
        ? `\n\n## Previous Context\n- Business: ${session.businessContext.businessDescription}\n- Challenges: ${session.businessContext.challenges.join(', ')}`
        : '';
      return (cachedPrompt ?? 'You are facilitating the Ideate phase.') + context;
    },

    getReferences(_session: WorkshopSession): string[] {
      return cachedRefs ?? [];
    },

    extractResult(session: WorkshopSession, response: string): Partial<WorkshopSession> {
      const ideas = extractIdeas(response);
      if (ideas && ideas.length > 0) {
        // Merge with existing ideas (append, deduplicate by id)
        const existing = session.ideas ?? [];
        const existingIds = new Set(existing.map((i) => i.id));
        const merged = [...existing, ...ideas.filter((i) => !existingIds.has(i.id))];
        return { ideas: merged };
      }
      return {};
    },

    isComplete(session: WorkshopSession, _response: string): boolean {
      return !!(session.ideas && session.ideas.length > 0);
    },

    async _preload() {
      cachedPrompt = await buildSystemPrompt('Ideate');
      cachedRefs = await getPhaseReferences('Ideate');
    },
  };
}

// ── Design Phase ────────────────────────────────────────────────────────────

function createDesignHandler(): PhaseHandler & { _preload(): Promise<void> } {
  let cachedPrompt: string | null = null;
  let cachedRefs: string[] | null = null;

  return {
    phase: 'Design',

    buildSystemPrompt(session: WorkshopSession): string {
      const ideasCtx = session.ideas?.length
        ? `\n\n## Ideas from Ideate Phase\n${session.ideas.map((i) => `- **${i.title}**: ${i.description}`).join('\n')}`
        : '';
      return (cachedPrompt ?? 'You are facilitating the Design phase.') + ideasCtx;
    },

    getReferences(_session: WorkshopSession): string[] {
      return cachedRefs ?? [];
    },

    extractResult(session: WorkshopSession, response: string): Partial<WorkshopSession> {
      const evaluation = extractEvaluation(response);
      if (evaluation) return { evaluation };
      return {};
    },

    isComplete(session: WorkshopSession, _response: string): boolean {
      return !!(session.evaluation);
    },

    async _preload() {
      cachedPrompt = await buildSystemPrompt('Design');
      cachedRefs = await getPhaseReferences('Design');
    },
  };
}

// ── Select Phase ────────────────────────────────────────────────────────────

function createSelectHandler(): PhaseHandler & { _preload(): Promise<void> } {
  let cachedPrompt: string | null = null;
  let cachedRefs: string[] | null = null;

  return {
    phase: 'Select',

    buildSystemPrompt(session: WorkshopSession): string {
      const evalCtx = session.evaluation
        ? `\n\n## Evaluation Results\nMethod: ${session.evaluation.method}\nIdeas evaluated: ${session.evaluation.ideas.length}`
        : '';
      return (cachedPrompt ?? 'You are facilitating the Select phase.') + evalCtx;
    },

    getReferences(_session: WorkshopSession): string[] {
      return cachedRefs ?? [];
    },

    extractResult(session: WorkshopSession, response: string): Partial<WorkshopSession> {
      const selection = extractSelection(response);
      if (selection) return { selection };
      return {};
    },

    isComplete(session: WorkshopSession, _response: string): boolean {
      return !!(session.selection?.confirmedByUser);
    },

    async _preload() {
      cachedPrompt = await buildSystemPrompt('Select');
      cachedRefs = await getPhaseReferences('Select');
    },
  };
}

// ── Plan Phase ──────────────────────────────────────────────────────────────

function createPlanHandler(): PhaseHandler & { _preload(): Promise<void> } {
  let cachedPrompt: string | null = null;
  let cachedRefs: string[] | null = null;

  return {
    phase: 'Plan',

    buildSystemPrompt(session: WorkshopSession): string {
      const selCtx = session.selection
        ? `\n\n## Selected Idea\nIdea: ${session.selection.ideaId}\nRationale: ${session.selection.selectionRationale}`
        : '';
      return (cachedPrompt ?? 'You are facilitating the Plan phase.') + selCtx;
    },

    getReferences(_session: WorkshopSession): string[] {
      return cachedRefs ?? [];
    },

    extractResult(session: WorkshopSession, response: string): Partial<WorkshopSession> {
      const plan = extractPlan(response);
      if (plan) return { plan };
      return {};
    },

    isComplete(session: WorkshopSession, _response: string): boolean {
      return !!(session.plan?.milestones?.length);
    },

    async _preload() {
      cachedPrompt = await buildSystemPrompt('Plan');
      cachedRefs = await getPhaseReferences('Plan');
    },
  };
}

// ── Develop Boundary Phase ──────────────────────────────────────────────────

function createDevelopHandler(): PhaseHandler & { _preload(): Promise<void> } {
  let cachedPrompt: string | null = null;
  let cachedRefs: string[] | null = null;

  return {
    phase: 'Develop',

    buildSystemPrompt(session: WorkshopSession): string {
      const planCtx = session.plan
        ? `\n\n## Implementation Plan\nMilestones: ${session.plan.milestones.map((m) => m.title).join(', ')}`
        : '';
      return (cachedPrompt ?? 'You are facilitating the Develop boundary phase.') + planCtx;
    },

    getReferences(_session: WorkshopSession): string[] {
      return cachedRefs ?? [];
    },

    extractResult(session: WorkshopSession, response: string): Partial<WorkshopSession> {
      const poc = extractPocState(response);
      if (poc) return { poc };
      return {};
    },

    isComplete(session: WorkshopSession, _response: string): boolean {
      return !!(session.poc);
    },

    async _preload() {
      cachedPrompt = await buildSystemPrompt('Develop');
      cachedRefs = await getPhaseReferences('Develop');
    },
  };
}

// ── Factory ─────────────────────────────────────────────────────────────────

export type PreloadablePhaseHandler = PhaseHandler & { _preload(): Promise<void> };

const PHASE_FACTORIES: Record<PhaseValue, () => PreloadablePhaseHandler> = {
  Discover: createDiscoverHandler as () => PreloadablePhaseHandler,
  Ideate: createIdeateHandler,
  Design: createDesignHandler,
  Select: createSelectHandler,
  Plan: createPlanHandler,
  Develop: createDevelopHandler,
  Complete: createDiscoverHandler as () => PreloadablePhaseHandler, // Placeholder
};

/**
 * Create a phase handler for the given phase.
 * Call `_preload()` before using in a ConversationLoop to load prompts.
 */
export function createPhaseHandler(phase: PhaseValue): PreloadablePhaseHandler {
  const factory = PHASE_FACTORIES[phase];
  if (!factory) {
    throw new Error(`No handler for phase: ${phase}`);
  }
  const handler = factory();
  // Override the phase to match what was requested
  handler.phase = phase;
  return handler;
}

/**
 * Get the ordered list of workshop phases (excluding Complete).
 */
export function getPhaseOrder(): PhaseValue[] {
  return ['Discover', 'Ideate', 'Design', 'Select', 'Plan', 'Develop'];
}

/**
 * Get the next phase after the given one, or null if at the end.
 */
export function getNextPhase(current: PhaseValue): PhaseValue | null {
  const order = getPhaseOrder();
  const idx = order.indexOf(current);
  if (idx === -1 || idx >= order.length - 1) return null;
  return order[idx + 1];
}
