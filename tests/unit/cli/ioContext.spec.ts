/**
 * Tests for writeToolSummary in LoopIO / ioContext (T086).
 *
 * Verifies that tool summaries are correctly formatted in default mode,
 * expanded in --debug mode, and suppressed in JSON/non-TTY mode.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import { Readable } from 'node:stream';

import { createLoopIO } from '../../../src/cli/ioContext.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createCaptureStream(): Writable & { getOutput: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  (stream as Writable & { getOutput: () => string }).getOutput = () => chunks.join('');
  return stream as Writable & { getOutput: () => string };
}

function createMockInput(): Readable {
  const readable = new Readable({ read() {} });
  // Mark as non-TTY by default
  return readable;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('writeToolSummary in LoopIO (T086)', () => {
  describe('default mode (TTY, no debug, no JSON)', () => {
    let errorStream: ReturnType<typeof createCaptureStream>;
    let outputStream: ReturnType<typeof createCaptureStream>;

    beforeEach(() => {
      errorStream = createCaptureStream();
      outputStream = createCaptureStream();
    });

    it('prints "✓ <toolName>: <summary>" to stderr', () => {
      const input = createMockInput();
      (input as NodeJS.ReadStream & { isTTY: boolean }).isTTY = true;

      const io = createLoopIO({
        input,
        output: outputStream,
        errorOutput: errorStream,
      });

      io.writeToolSummary('WorkIQ', 'Found 12 relevant processes');

      const errOutput = errorStream.getOutput();
      expect(errOutput).toContain('✓ WorkIQ: Found 12 relevant processes');
    });

    it('does not write tool summary to stdout', () => {
      const input = createMockInput();
      (input as NodeJS.ReadStream & { isTTY: boolean }).isTTY = true;

      const io = createLoopIO({
        input,
        output: outputStream,
        errorOutput: errorStream,
      });

      io.writeToolSummary('Context7', '8 docs found');

      const stdOutput = outputStream.getOutput();
      expect(stdOutput).toBe('');
    });
  });

  describe('debug mode', () => {
    let errorStream: ReturnType<typeof createCaptureStream>;
    let outputStream: ReturnType<typeof createCaptureStream>;

    beforeEach(() => {
      errorStream = createCaptureStream();
      outputStream = createCaptureStream();
    });

    it('shows tool args and result details in addition to summary', () => {
      const input = createMockInput();
      (input as NodeJS.ReadStream & { isTTY: boolean }).isTTY = true;

      const io = createLoopIO({
        input,
        output: outputStream,
        errorOutput: errorStream,
        debug: true,
      });

      io.writeToolSummary('WorkIQ', 'Found 5 processes', {
        args: { query: 'logistics', limit: 10 },
        result: { count: 5, processes: ['p1', 'p2'] },
      });

      const errOutput = errorStream.getOutput();
      expect(errOutput).toContain('✓ WorkIQ: Found 5 processes');
      expect(errOutput).toContain('query');
      expect(errOutput).toContain('logistics');
      expect(errOutput).toContain('count');
    });
  });

  describe('JSON mode', () => {
    it('omits tool summaries from stdout', () => {
      const errorStream = createCaptureStream();
      const outputStream = createCaptureStream();
      const input = createMockInput();

      const io = createLoopIO({
        json: true,
        input,
        output: outputStream,
        errorOutput: errorStream,
      });

      io.writeToolSummary('WorkIQ', 'Found stuff');

      expect(outputStream.getOutput()).toBe('');
    });
  });

  describe('non-interactive mode', () => {
    it('omits tool summaries from stdout', () => {
      const errorStream = createCaptureStream();
      const outputStream = createCaptureStream();
      const input = createMockInput();

      const io = createLoopIO({
        nonInteractive: true,
        input,
        output: outputStream,
        errorOutput: errorStream,
      });

      io.writeToolSummary('GitHub', 'Repo cloned');

      expect(outputStream.getOutput()).toBe('');
    });
  });
});
