/**
 * Tests for markdownRenderer handling of partial/incremental chunks (T081).
 *
 * Verifies that renderMarkdown doesn't crash on partial markdown input
 * (split headings, incomplete bold, partial tables).
 */
import { describe, it, expect } from 'vitest';

import { renderMarkdown } from '../../../src/shared/markdownRenderer.js';

describe('renderMarkdown incremental chunk handling (T081)', () => {
  it('handles a partial heading (no newline)', () => {
    // During streaming, a heading might arrive without a trailing newline
    const result = renderMarkdown('## Start of head', { isTTY: true });
    expect(result).toBeTruthy();
    expect(result).toContain('Start of head');
  });

  it('handles incomplete bold syntax', () => {
    // Bold started but not closed
    const result = renderMarkdown('Some **bold text without', { isTTY: true });
    expect(result).toBeTruthy();
    expect(result).toContain('bold text without');
  });

  it('handles incomplete code block', () => {
    // Code block opened but not closed
    const result = renderMarkdown('```typescript\nconst x = 1;\n', { isTTY: true });
    expect(result).toBeTruthy();
    expect(result).toContain('const x = 1');
  });

  it('handles partial table row', () => {
    const result = renderMarkdown('| Column 1 | Column 2 |\n| ----', { isTTY: true });
    expect(result).toBeTruthy();
  });

  it('handles empty chunk', () => {
    const result = renderMarkdown('', { isTTY: true });
    expect(result).toBe('');
  });

  it('handles single character chunk', () => {
    const result = renderMarkdown('H', { isTTY: true });
    expect(result).toBeTruthy();
  });

  it('handles newline-only chunk without throwing', () => {
    const result = renderMarkdown('\n', { isTTY: true });
    // A newline-only chunk may produce empty string; it must not throw
    expect(typeof result).toBe('string');
  });

  it('handles incomplete link syntax', () => {
    const result = renderMarkdown('Click [here](http://example', { isTTY: true });
    expect(result).toBeTruthy();
  });

  it('handles partial list item', () => {
    const result = renderMarkdown('- Item one\n- Item tw', { isTTY: true });
    expect(result).toBeTruthy();
    expect(result).toContain('Item one');
  });

  it('renders complete markdown correctly in TTY mode', () => {
    const md = '## Title\n\n- **Bold item**\n- Regular item\n\n```js\nconst x = 1;\n```\n';
    const result = renderMarkdown(md, { isTTY: true });
    expect(result).toContain('Title');
    expect(result).toContain('Bold item');
    expect(result).toContain('Regular item');
  });

  it('returns raw markdown in JSON mode regardless of content', () => {
    const md = '## Partial **heading';
    const result = renderMarkdown(md, { isTTY: true, jsonMode: true });
    expect(result).toBe(md);
  });

  it('handles non-TTY mode with partial markdown', () => {
    const result = renderMarkdown('**incomplete bold', { isTTY: false });
    expect(result).toBeTruthy();
  });
});
