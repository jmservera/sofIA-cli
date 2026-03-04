/**
 * Context summarizer.
 *
 * Builds a compact, deterministic summary of all prior-phase structured
 * session fields for injection into subsequent phase system prompts.
 * Replaces ad-hoc per-handler context blocks with a unified projection.
 *
 * FRs: FR-016, FR-017, FR-018
 */
import type { WorkshopSession } from '../shared/schemas/session.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SummarizedPhaseContext {
  businessSummary?: string;
  challenges?: string[];
  topicArea?: string;
  workflowSteps?: string[];
  enrichmentHighlights?: string[];
  ideaSummaries?: Array<{ id: string; title: string; description: string }>;
  evaluationSummary?: string;
  selectionSummary?: string;
  planMilestones?: string[];
  architectureNotes?: string;
}

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build a summarized context object from all structured session fields.
 * Missing fields are omitted (undefined) for graceful degradation.
 */
export function buildSummarizedContext(session: WorkshopSession): SummarizedPhaseContext {
  const ctx: SummarizedPhaseContext = {};

  // Discover
  if (session.businessContext) {
    ctx.businessSummary = session.businessContext.businessDescription;
    ctx.challenges = session.businessContext.challenges;
  }

  if (session.topic) {
    ctx.topicArea = session.topic.topicArea;
  }

  if (session.workflow?.activities?.length) {
    ctx.workflowSteps = session.workflow.activities.map((a) => a.name);
  }

  // Discovery enrichment
  if (session.discovery?.enrichment) {
    const enrichment = session.discovery.enrichment;
    const highlights: string[] = [];
    if (enrichment.industryTrends?.length) {
      highlights.push(...enrichment.industryTrends.slice(0, 3));
    }
    if (enrichment.companyNews?.length) {
      highlights.push(...enrichment.companyNews.slice(0, 3));
    }
    if (enrichment.workiqInsights?.teamExpertise?.length) {
      highlights.push(`Team expertise: ${enrichment.workiqInsights.teamExpertise.join(', ')}`);
    }
    if (highlights.length > 0) {
      ctx.enrichmentHighlights = highlights;
    }
  }

  // Ideate
  if (session.ideas?.length) {
    ctx.ideaSummaries = session.ideas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      description: idea.description,
    }));
  }

  // Design
  if (session.evaluation) {
    ctx.evaluationSummary = `Method: ${session.evaluation.method}, ${session.evaluation.ideas.length} ideas evaluated`;
  }

  // Select
  if (session.selection) {
    ctx.selectionSummary = `Selected: ${session.selection.ideaId} — ${session.selection.selectionRationale}`;
  }

  // Plan
  if (session.plan?.milestones?.length) {
    ctx.planMilestones = session.plan.milestones.map((m) => m.title);
  }
  if (session.plan?.architectureNotes) {
    ctx.architectureNotes = session.plan.architectureNotes;
  }

  return ctx;
}

// ── Renderer ─────────────────────────────────────────────────────────────────

/**
 * Render a summarized context into a compact markdown section
 * for injection into phase system prompts.
 */
export function renderSummarizedContext(ctx: SummarizedPhaseContext): string {
  const sections: string[] = [];

  if (ctx.businessSummary) {
    sections.push(`### Business Context\n- **Business**: ${ctx.businessSummary}`);
    if (ctx.challenges?.length) {
      sections.push(`- **Challenges**: ${ctx.challenges.join(', ')}`);
    }
  }

  if (ctx.topicArea) {
    sections.push(`- **Focus Area**: ${ctx.topicArea}`);
  }

  if (ctx.workflowSteps?.length) {
    sections.push(`### Workflow\n${ctx.workflowSteps.map((s) => `- ${s}`).join('\n')}`);
  }

  if (ctx.enrichmentHighlights?.length) {
    sections.push(
      `### Discovery Enrichment\n${ctx.enrichmentHighlights.map((h) => `- ${h}`).join('\n')}`,
    );
  }

  if (ctx.ideaSummaries?.length) {
    sections.push(
      `### Ideas\n${ctx.ideaSummaries.map((i) => `- **${i.title}**: ${i.description}`).join('\n')}`,
    );
  }

  if (ctx.evaluationSummary) {
    sections.push(`### Evaluation\n- ${ctx.evaluationSummary}`);
  }

  if (ctx.selectionSummary) {
    sections.push(`### Selection\n- ${ctx.selectionSummary}`);
  }

  if (ctx.planMilestones?.length) {
    sections.push(
      `### Plan\n${ctx.planMilestones.map((m) => `- ${m}`).join('\n')}`,
    );
    if (ctx.architectureNotes) {
      sections.push(`- **Architecture**: ${ctx.architectureNotes}`);
    }
  }

  if (sections.length === 0) return '';

  return `\n\n## Prior Phase Context\n\n${sections.join('\n\n')}`;
}
