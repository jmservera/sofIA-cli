/**
 * Prompt loader.
 *
 * Loads canonical prompts from src/prompts/ and composes them into
 * system prompts for each workshop phase. Includes grounding documents
 * (AI Discovery Cards data, Design Thinking methodology) as reference context.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PhaseValue } from '../shared/schemas/session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Prompt file mapping ─────────────────────────────────────────────────────

const PROMPT_FILES: Record<string, string> = {
  system: 'system.md',
  discover: 'discover.md',
  ideate: 'ideate.md',
  design: 'design.md',
  select: 'select.md',
  plan: 'plan.md',
  develop: 'develop-boundary.md',
};

const PHASE_TO_PROMPT: Record<PhaseValue, string> = {
  Discover: 'discover',
  Ideate: 'ideate',
  Design: 'design',
  Select: 'select',
  Plan: 'plan',
  Develop: 'develop',
  Complete: 'system', // No phase-specific prompt for Complete
};

// ── Reference document paths ────────────────────────────────────────────────

const REFERENCE_DOCS: Record<string, string> = {
  designThinking: join(__dirname, '..', 'originalPrompts', 'design_thinking.md'),
  designThinkingPersona: join(__dirname, '..', 'originalPrompts', 'design_thinking_persona.md'),
  facilitatorPersona: join(__dirname, '..', 'originalPrompts', 'facilitator_persona.md'),
  guardrails: join(__dirname, '..', 'originalPrompts', 'guardrails.md'),
  documentGenerator: join(__dirname, '..', 'originalPrompts', 'document_generator_persona.md'),
  documentExample: join(__dirname, '..', 'originalPrompts', 'document_generator_example.md'),
};

// Which reference docs to include for each phase
const PHASE_REFERENCES: Record<PhaseValue, string[]> = {
  Discover: ['facilitatorPersona', 'guardrails'],
  Ideate: ['facilitatorPersona', 'designThinkingPersona', 'designThinking', 'guardrails'],
  Design: ['designThinkingPersona', 'designThinking', 'guardrails'],
  Select: ['facilitatorPersona', 'guardrails'],
  Plan: ['facilitatorPersona', 'guardrails'],
  Develop: ['guardrails'],
  Complete: ['documentGenerator', 'documentExample', 'guardrails'],
};

// ── Cache ────────────────────────────────────────────────────────────────────

const promptCache = new Map<string, string>();

async function loadPromptFile(name: string): Promise<string> {
  if (promptCache.has(name)) {
    return promptCache.get(name)!;
  }

  const fileName = PROMPT_FILES[name];
  if (!fileName) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  const filePath = join(__dirname, fileName);
  const content = await readFile(filePath, 'utf-8');
  promptCache.set(name, content);
  return content;
}

async function loadReferenceDoc(key: string): Promise<string> {
  if (promptCache.has(`ref:${key}`)) {
    return promptCache.get(`ref:${key}`)!;
  }

  const filePath = REFERENCE_DOCS[key];
  if (!filePath) {
    throw new Error(`Unknown reference doc: ${key}`);
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    promptCache.set(`ref:${key}`, content);
    return content;
  } catch {
    // Reference doc not found — non-fatal, return empty
    return '';
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the complete system prompt for a given phase.
 * Combines the base system prompt with phase-specific instructions.
 */
export async function buildSystemPrompt(phase: PhaseValue): Promise<string> {
  const systemPrompt = await loadPromptFile('system');
  const phaseKey = PHASE_TO_PROMPT[phase];

  if (phaseKey === 'system') {
    return systemPrompt;
  }

  const phasePrompt = await loadPromptFile(phaseKey);
  return `${systemPrompt}\n\n---\n\n${phasePrompt}`;
}

/**
 * Get the list of reference document paths for a given phase.
 * These should be attached as references in the conversation session
 * so the LLM can ground its responses in the workshop methodology.
 */
export async function getPhaseReferences(phase: PhaseValue): Promise<string[]> {
  const refKeys = PHASE_REFERENCES[phase] ?? [];
  const paths: string[] = [];

  for (const key of refKeys) {
    const filePath = REFERENCE_DOCS[key];
    if (filePath) {
      paths.push(filePath);
    }
  }

  return paths;
}

/**
 * Load a reference document's content by key.
 */
export async function loadReference(key: string): Promise<string> {
  return loadReferenceDoc(key);
}

/**
 * Clear the prompt cache (useful for tests).
 */
export function clearPromptCache(): void {
  promptCache.clear();
}

/**
 * List all available prompt names.
 */
export function listPrompts(): string[] {
  return Object.keys(PROMPT_FILES);
}

/**
 * List all available reference document keys.
 */
export function listReferences(): string[] {
  return Object.keys(REFERENCE_DOCS);
}
