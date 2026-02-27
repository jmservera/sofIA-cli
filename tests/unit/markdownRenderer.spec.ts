import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/shared/markdownRenderer';

describe('renderMarkdown', () => {
  const sample = '# Title\n\n- item 1\n- item 2\n\n**bold** _italic_';

  it('renders ANSI output when TTY and not JSON mode', () => {
    const out = renderMarkdown(sample, { isTTY: true, jsonMode: false });
    expect(out).toMatch(/Title/);
    // chalk/marked-terminal typically adds ANSI sequences (\u001b[)
    expect(out).toMatch(/\u001b\[/);
  });

  it('returns plain markdown when non-TTY or jsonMode', () => {
    const out = renderMarkdown(sample, { isTTY: false, jsonMode: false });
    expect(out).toContain('# Title');
    expect(out).not.toMatch(/\u001b\[/);

    const jsonOut = renderMarkdown(sample, { isTTY: true, jsonMode: true });
    expect(jsonOut).toContain('# Title');
    expect(jsonOut).not.toMatch(/\u001b\[/);
  });
});
