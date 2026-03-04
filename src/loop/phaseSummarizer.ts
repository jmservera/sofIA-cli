/**
 * Post-phase summarization utility.
 *
 * When the conversation loop finishes a phase and the expected structured
 * session field is still null, this module makes a one-shot LLM call to
 * extract structured data from the full conversation transcript.
 *
 * Contract: specs/006-workshop-extraction-fixes/contracts/summarization-and-export.md
 * FRs: FR-001 through FR-007
 */
import type { CopilotClient } from '../shared/copilotClient.js';
import type { PhaseValue, WorkshopSession } from '../shared/schemas/session.js';
import type { PhaseHandler } from './conversationLoop.js';
import { loadSummarizationPrompt } from '../prompts/promptLoader.js';

// ── Phase → session field mapping ────────────────────────────────────────────

const PHASE_SESSION_FIELD: Record<string, keyof WorkshopSession> = {
  Discover: 'businessContext',
  Ideate: 'ideas',
  Design: 'evaluation',
  Select: 'selection',
  Plan: 'plan',
  Develop: 'poc',
};

/**
 * Check whether a phase needs post-phase summarization.
 * Returns true if the session field for this phase is null/undefined.
 */
export function needsSummarization(phase: PhaseValue, session: WorkshopSession): boolean {
  const fieldName = PHASE_SESSION_FIELD[phase];
  if (!fieldName) return false;
  const value = session[fieldName];
  return value === undefined || value === null;
}

/**
 * Build a concatenated transcript from conversation turns for a specific phase.
 */
export function buildPhaseTranscript(phase: PhaseValue, session: WorkshopSession): string {
  const turns = (session.turns ?? []).filter((t) => t.phase === phase);
  if (turns.length === 0) return '';
  return turns.map((t) => `[${t.role}]: ${t.content}`).join('\n\n');
}

/**
 * Post-phase summarization call.
 *
 * If the expected structured field for `phase` is still null after the
 * conversation loop, makes a one-shot LLM call to extract it from the
 * full transcript.
 *
 * Returns partial session updates (may be empty if extraction still fails).
 * Never throws — summarization is a best-effort fallback.
 */
export async function phaseSummarize(
  client: CopilotClient,
  phase: PhaseValue,
  session: WorkshopSession,
  handler: PhaseHandler,
): Promise<Partial<WorkshopSession>> {
  // Skip if field is already populated
  if (!needsSummarization(phase, session)) {
    return {};
  }

  // Build the transcript
  const transcript = buildPhaseTranscript(phase, session);
  if (!transcript) {
    return {};
  }

  try {
    // Load the phase-specific summarization prompt
    const systemPrompt = await loadSummarizationPrompt(phase);

    // Create a new session for the summarization call (avoids polluting context)
    const summarizationSession = await client.createSession({ systemPrompt });

    // Send the transcript as a single user message and collect the full response
    const chunks: string[] = [];
    for await (const event of summarizationSession.send({
      role: 'user',
      content: transcript,
    })) {
      if (event.type === 'TextDelta') {
        chunks.push(event.text);
      }
    }
    const response = chunks.join('');

    // Extract structured data using the phase handler's extractResult
    const updates = handler.extractResult(session, response);

    // For Design phase, also extract Mermaid diagram (FR-007a)
    // Store in plan.architectureNotes if available (session schema doesn't have
    // a dedicated architectureDiagram field)
    if (phase === 'Design') {
      const mermaidMatch = response.match(/```mermaid\s*\n([\s\S]*?)\n```/);
      if (mermaidMatch) {
        const diagram = mermaidMatch[1].trim();
        if (!updates.plan) {
          updates.plan = { milestones: [], architectureNotes: diagram };
        }
      }
    }

    return updates;
  } catch {
    // Summarization failure is non-fatal — log and return empty
    return {};
  }
}
