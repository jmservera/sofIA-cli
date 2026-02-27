/**
 * Markdown rendering helper.
 *
 * Uses marked + marked-terminal for rich TTY output.
 * Falls back to plain text for non-TTY / JSON mode.
 */
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

export interface RenderOptions {
  isTTY?: boolean;
  jsonMode?: boolean;
}

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
    // Configure marked-terminal for ANSI output
    marked.use(markedTerminal());
    return marked.parse(markdown) as string;
  }

  // Non-TTY: return plain text (strip markdown syntax minimally)
  return marked.parse(markdown, { async: false }) as string;
}
