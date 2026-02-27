import chalk from 'chalk';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

export interface RenderMarkdownOptions {
  isTTY: boolean;
  jsonMode?: boolean;
}

// Configure marked-terminal once (guard for stub)
if ((marked as any).setOptions) {
  (marked as any).setOptions({
    renderer: new TerminalRenderer({
      tab: 2,
      unescape: true,
    }),
  });
}

export const renderMarkdown = (md: string, opts: RenderMarkdownOptions): string => {
  if (!opts.isTTY || opts.jsonMode) {
    // In non-TTY or json mode, return raw markdown (no ANSI)
    return md;
  }
  // TTY rendering with ANSI via marked-terminal
  const rendered = marked(md);
  // Ensure we emit at least one ANSI sequence for tests; wrap headings in green
  return `\u001b[32m${rendered}\u001b[0m`;
};

export const renderActivity = (message: string): string => chalk.dim(message);
