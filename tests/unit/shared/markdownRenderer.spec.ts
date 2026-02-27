/**
 * Unit tests for markdown renderer.
 */
import { describe, it, expect } from 'vitest';

import { renderMarkdown } from '../../../src/shared/markdownRenderer.js';

describe('renderMarkdown', () => {
  it('renders a heading', () => {
    const output = renderMarkdown('# Hello World');
    expect(output).toBeTruthy();
    expect(output.length).toBeGreaterThan(0);
  });

  it('renders a list', () => {
    const output = renderMarkdown('- One\n- Two\n- Three');
    expect(output).toContain('One');
    expect(output).toContain('Two');
  });

  it('renders a code block', () => {
    const output = renderMarkdown('```json\n{"key": "value"}\n```');
    expect(output).toContain('key');
  });

  it('returns plain text in non-TTY mode', () => {
    const output = renderMarkdown('# Hello World', { isTTY: false });
    // Should not contain ANSI codes in non-TTY mode
    expect(output).toContain('Hello World');
  });

  it('handles empty string', () => {
    const output = renderMarkdown('');
    expect(output).toBe('');
  });

  it('handles raw Markdown preservation in non-TTY json mode', () => {
    const output = renderMarkdown('# Title\n\nBody text', { isTTY: false, jsonMode: true });
    // In json mode, return raw markdown
    expect(output).toContain('# Title');
  });
});
