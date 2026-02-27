/**
 * Markdown rendering helper.
 *
 * Uses marked + marked-terminal for rich TTY output.
 * Falls back to plain text for non-TTY / JSON mode.
 */
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

export interface RenderOptions {
  isTTY?: boolean;
  jsonMode?: boolean;
}

// Pre-configured marked instance for TTY rendering.
// Using a dedicated instance avoids stacking renderers
// on the global `marked` when renderMarkdown is called repeatedly.
const ttyMarked = new Marked(markedTerminal());
const plainMarked = new Marked();

/**
 * Render markdown to terminal-friendly output.
 *
 * - TTY mode: renders to ANSI-colored output
 * - Non-TTY mode: strips ANSI, returns readable text
 * - JSON mode: returns raw markdown unchanged
 */
export function renderMarkdown(markdown: string, options: RenderOptions = {}): string {
  if (!markdown) return '';

  const { isTTY = process.stdout.isTTY ?? false, jsonMode = false } = options;

  // In JSON mode, return raw markdown for machine consumption
  if (jsonMode) {
    return markdown;
  }

  if (isTTY) {
    return ttyMarked.parse(markdown, { async: false }) as string;
  }

  // Non-TTY: return plain text (strip markdown syntax minimally)
  return plainMarked.parse(markdown, { async: false }) as string;
}
