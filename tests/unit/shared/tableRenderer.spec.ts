/**
 * Unit tests for table renderer.
 */
import { describe, it, expect } from 'vitest';

import { renderTable } from '../../../src/shared/tableRenderer.js';

describe('renderTable', () => {
  it('renders a simple table', () => {
    const output = renderTable({
      head: ['Name', 'Score'],
      rows: [
        ['Idea A', '85'],
        ['Idea B', '72'],
      ],
    });
    expect(output).toContain('Name');
    expect(output).toContain('Score');
    expect(output).toContain('Idea A');
    expect(output).toContain('85');
  });

  it('handles empty rows', () => {
    const output = renderTable({
      head: ['Col1'],
      rows: [],
    });
    expect(output).toContain('Col1');
  });

  it('renders without headers', () => {
    const output = renderTable({
      rows: [['a', 'b'], ['c', 'd']],
    });
    expect(output).toContain('a');
    expect(output).toContain('d');
  });
});
