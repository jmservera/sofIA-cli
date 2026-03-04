/**
 * Phase extraction utilities.
 *
 * Parsers that extract structured data from LLM responses.
 * Each extractor tries to find a JSON block in the response
 * and validates it against the expected schema.
 */
import { z } from '../vendor/zod.js';
import {
  businessContextSchema,
  workflowMapSchema,
  ideaCardSchema,
  ideaEvaluationSchema,
  selectedIdeaSchema,
  implementationPlanSchema,
  pocDevelopmentStateSchema,
  type BusinessContext,
  type WorkflowMap,
  type IdeaCard,
  type IdeaEvaluation,
  type SelectedIdea,
  type ImplementationPlan,
  type PocDevelopmentState,
} from '../shared/schemas/session.js';

// ---------------------------------------------------------------------------
// JSON block extraction
// ---------------------------------------------------------------------------

/**
 * Extract the first JSON object or array from a response string.
 * Tries:
 *   1. Markdown fenced code block (```json ... ```)
 *   2. First `{...}` or `[...]` in plain text
 *
 * Returns the parsed value, or null if nothing valid is found.
 */
export function extractJsonBlock(response: string): unknown {
  // 1. Try fenced code block
  const fenceMatch = response.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // 2. Try raw JSON — find first { or [
  const objectMatch = response.match(/(\{[\s\S]*\})/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[1]);
    } catch {
      // fall through
    }
  }

  const arrayMatch = response.match(/(\[[\s\S]*\])/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[1]);
    } catch {
      // fall through
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Multi-block JSON extraction (FR-007)
// ---------------------------------------------------------------------------

/**
 * Extract ALL JSON objects/arrays from a response string.
 * Uses /g flag for fenced blocks and bracket-depth counting for raw JSON.
 * Returns an array of parsed values.
 */
export function extractAllJsonBlocks(response: string): unknown[] {
  const results: unknown[] = [];
  const seen = new Set<string>();

  // 1. Try all fenced code blocks
  const fenceRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  let fenceMatch;
  while ((fenceMatch = fenceRegex.exec(response)) !== null) {
    const raw = fenceMatch[1].trim();
    if (seen.has(raw)) continue;
    try {
      const parsed = JSON.parse(raw);
      results.push(parsed);
      seen.add(raw);
    } catch {
      // skip invalid JSON
    }
  }

  // 2. Try bracket-depth counter for raw JSON (only if no fenced blocks found)
  if (results.length === 0) {
    for (const opener of ['{', '['] as const) {
      const closer = opener === '{' ? '}' : ']';
      let depth = 0;
      let start = -1;

      for (let i = 0; i < response.length; i++) {
        const ch = response[i];
        if (ch === opener) {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === closer) {
          depth--;
          if (depth === 0 && start >= 0) {
            const raw = response.slice(start, i + 1);
            if (!seen.has(raw)) {
              try {
                const parsed = JSON.parse(raw);
                results.push(parsed);
                seen.add(raw);
              } catch {
                // skip invalid
              }
            }
            start = -1;
          }
        }
      }
    }
  }

  return results;
}

/**
 * Extract the first JSON block from a response that validates against a Zod schema.
 * Tries each extracted block with safeParse, returns the first valid match.
 */
export function extractJsonBlockForSchema<T>(
  response: string,
  schema: z.ZodType<T>,
): T | null {
  const blocks = extractAllJsonBlocks(response);
  for (const block of blocks) {
    const result = schema.safeParse(block);
    if (result.success) return result.data;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Typed extractors
// ---------------------------------------------------------------------------

function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Extract BusinessContext from an LLM response containing a JSON block.
 */
export function extractBusinessContext(response: string): BusinessContext | null {
  const json = extractJsonBlock(response);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return safeParse(businessContextSchema, json);
}

/**
 * Extract WorkflowMap from an LLM response containing a JSON block.
 */
export function extractWorkflow(response: string): WorkflowMap | null {
  const json = extractJsonBlock(response);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return safeParse(workflowMapSchema, json);
}

/**
 * Extract IdeaCard[] from an LLM response.
 * Supports both a raw array and an `{ ideas: [...] }` wrapper.
 */
export function extractIdeas(response: string): IdeaCard[] | null {
  const json = extractJsonBlock(response);
  if (!json) return null;

  // Raw array
  if (Array.isArray(json)) {
    const parsed = z.array(ideaCardSchema).safeParse(json);
    return parsed.success ? parsed.data : null;
  }

  // Wrapper object with `ideas` key
  if (typeof json === 'object' && 'ideas' in (json as Record<string, unknown>)) {
    const parsed = z.array(ideaCardSchema).safeParse((json as Record<string, unknown>).ideas);
    return parsed.success ? parsed.data : null;
  }

  return null;
}

/**
 * Extract IdeaEvaluation from an LLM response.
 */
export function extractEvaluation(response: string): IdeaEvaluation | null {
  const json = extractJsonBlock(response);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return safeParse(ideaEvaluationSchema, json);
}

/**
 * Extract SelectedIdea from an LLM response.
 */
export function extractSelection(response: string): SelectedIdea | null {
  const json = extractJsonBlock(response);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return safeParse(selectedIdeaSchema, json);
}

/**
 * Extract ImplementationPlan from an LLM response.
 */
export function extractPlan(response: string): ImplementationPlan | null {
  const json = extractJsonBlock(response);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return safeParse(implementationPlanSchema, json);
}

/**
 * Extract a sessionName string from an LLM response JSON block.
 * Returns the trimmed name, or null if not present/empty.
 */
export function extractSessionName(response: string): string | null {
  const json = extractJsonBlock(response);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  if (typeof obj.sessionName !== 'string') return null;
  const trimmed = obj.sessionName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extract PocDevelopmentState from an LLM response.
 */
export function extractPocState(response: string): PocDevelopmentState | null {
  const json = extractJsonBlock(response);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return safeParse(pocDevelopmentStateSchema, json);
}
