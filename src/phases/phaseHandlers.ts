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
import type { LoopIO } from '../loop/conversationLoop.js';
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
  extractSessionName,
} from './phaseExtractors.js';
import { DiscoveryEnricher } from './discoveryEnricher.js';
import type { WebSearchClient } from './discoveryEnricher.js';
import type { McpManager } from '../mcp/mcpManager.js';

// ── Initial message helper ──────────────────────────────────────────────────

const PHASE_INTROS: Record<PhaseValue, string> = {
  Discover:
    'Introduce the Discover phase. Ask about the business, its challenges, and what area to focus on.',
  Ideate:
    'Introduce the Ideate phase. Review the business context and workflow, then brainstorm AI-powered ideas.',
  Design:
    'Introduce the Design phase. Review the generated ideas and help evaluate them using a feasibility-value matrix.',
  Select:
    'Introduce the Select phase. Present the top-ranked ideas and help the user choose the best one to implement.',
  Plan: 'Introduce the Plan phase. Create an implementation plan with milestones for the selected idea.',
  Develop:
    'Introduce the Develop phase. Generate proof-of-concept code for the planned implementation.',
  Complete: 'The workshop is complete. Summarize the results.',
};

const PHASE_RESUMES: Record<PhaseValue, string> = {
  Discover:
    'We are resuming the Discover phase. Summarize what was discussed so far and ask the next question.',
  Ideate:
    'We are resuming the Ideate phase. Summarize the ideas generated so far and continue brainstorming.',
  Design:
    'We are resuming the Design phase. Summarize the evaluation progress and continue with the next step.',
  Select: 'We are resuming the Select phase. Summarize the selection process so far and continue.',
  Plan: 'We are resuming the Plan phase. Summarize the plan progress and continue with the next milestone.',
  Develop:
    'We are resuming the Develop phase. Summarize the PoC development progress and continue.',
  Complete: 'The workshop is complete. Summarize the results.',
};

/**
 * Generate the initial message for a phase based on session state.
 * New sessions get an introduction; resumed sessions get a progress summary prompt.
 */
function buildInitialMessage(phase: PhaseValue, session: WorkshopSession): string {
  const phaseTurns = (session.turns ?? []).filter((t) => t.phase === phase);
  if (phaseTurns.length > 0) {
    return PHASE_RESUMES[phase];
  }
  return PHASE_INTROS[phase];
}

// ── Discover Phase ──────────────────────────────────────────────────────────

export interface DiscoverHandlerConfig {
  /** IO for permission prompts */
  io?: LoopIO;
  /** MCP manager for WorkIQ tool calls */
  mcpManager?: McpManager;
  /** Web search client */
  webSearchClient?: WebSearchClient;
}

function createDiscoverHandler(config?: DiscoverHandlerConfig): PhaseHandler {
  let cachedPrompt: string | null = null;
  let cachedRefs: string[] | null = null;
  let enrichmentDone = false;

  return {
    phase: 'Discover',

    buildSystemPrompt(_session: WorkshopSession): string {
      // Lazy-loaded in run() but we need sync return.
      // The prompt is pre-loaded before the loop starts.
      return (
        cachedPrompt ??
        'You are an AI Discovery Workshop facilitator helping with the Discover phase.'
      );
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
      // First-write-wins: only set name if session doesn't already have one
      if (!session.name) {
        const sessionName = extractSessionName(response);
        if (sessionName) updates.name = sessionName;
      }
      return updates;
    },

    async postExtract(session: WorkshopSession): Promise<Partial<WorkshopSession>> {
      // Trigger enrichment once when businessContext is first available
      if (enrichmentDone || !session.businessContext) return {};
      enrichmentDone = true;

      const enricher = new DiscoveryEnricher();
      const io = config?.io;
      const mcpManager = config?.mcpManager;
      const webSearchClient = config?.webSearchClient;

      // Only run enrichment if at least one source is available
      if (!webSearchClient && (!mcpManager || !mcpManager.isAvailable('workiq'))) {
        return {};
      }

      const companySummary = session.businessContext.businessDescription;

      try {
        const enrichment = await enricher.enrich({
          companySummary,
          mcpManager:
            mcpManager ??
            ({ isAvailable: () => false, callTool: async () => ({}) } as unknown as McpManager),
          io: io ?? {
            write: () => {},
            writeActivity: () => {},
            writeToolSummary: () => {},
            readInput: async () => null,
            showDecisionGate: async () => ({ choice: 'continue' as const }),
            isJsonMode: false,
            isTTY: false,
          },
          webSearchClient,
        });

        return {
          discovery: {
            enrichment,
          },
        };
      } catch {
        // Enrichment failure is non-fatal
        return {};
      }
    },

    isComplete(session: WorkshopSession, _response: string): boolean {
      // Discover is complete when we have business context and workflow
      return !!(session.businessContext && session.workflow);
    },

    getInitialMessage(session: WorkshopSession): string {
      return buildInitialMessage('Discover', session);
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

    getInitialMessage(session: WorkshopSession): string {
      return buildInitialMessage('Ideate', session);
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
      return !!session.evaluation;
    },

    getInitialMessage(session: WorkshopSession): string {
      return buildInitialMessage('Design', session);
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
      return !!session.selection?.confirmedByUser;
    },

    getInitialMessage(session: WorkshopSession): string {
      return buildInitialMessage('Select', session);
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
      return !!session.plan?.milestones?.length;
    },

    getInitialMessage(session: WorkshopSession): string {
      return buildInitialMessage('Plan', session);
    },

    async _preload() {
      cachedPrompt = await buildSystemPrompt('Plan');
      cachedRefs = await getPhaseReferences('Plan');
    },
  };
}

// ── Develop Boundary Phase ──────────────────────────────────────────────────
// T021: This handler covers the boundary (requirements capture) phase.
// For full PoC generation, use `sofia dev` which invokes the RalphLoop
// (src/develop/ralphLoop.ts) directly. The develop-boundary.md prompt is
// kept for backward compatibility.

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
      return !!session.poc;
    },

    getInitialMessage(session: WorkshopSession): string {
      return buildInitialMessage('Develop', session);
    },

    async _preload() {
      cachedPrompt = await buildSystemPrompt('Develop');
      cachedRefs = await getPhaseReferences('Develop');
    },
  };
}

// ── Factory ─────────────────────────────────────────────────────────────────

export type PreloadablePhaseHandler = PhaseHandler & { _preload(): Promise<void> };

export interface PhaseHandlerConfig {
  /** Discovery enrichment config (only used for Discover phase) */
  discover?: DiscoverHandlerConfig;
}

const PHASE_FACTORIES: Record<
  PhaseValue,
  (config?: PhaseHandlerConfig) => PreloadablePhaseHandler
> = {
  Discover: (config) => createDiscoverHandler(config?.discover) as PreloadablePhaseHandler,
  Ideate: () => createIdeateHandler(),
  Design: () => createDesignHandler(),
  Select: () => createSelectHandler(),
  Plan: () => createPlanHandler(),
  Develop: () => createDevelopHandler(),
  Complete: () => createDiscoverHandler() as PreloadablePhaseHandler, // Placeholder
};

/**
 * Create a phase handler for the given phase.
 * Call `_preload()` before using in a ConversationLoop to load prompts.
 */
export function createPhaseHandler(
  phase: PhaseValue,
  config?: PhaseHandlerConfig,
): PreloadablePhaseHandler {
  const factory = PHASE_FACTORIES[phase];
  if (!factory) {
    throw new Error(`No handler for phase: ${phase}`);
  }
  const handler = factory(config);
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
