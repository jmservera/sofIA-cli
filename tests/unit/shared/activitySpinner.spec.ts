/**
 * Tests for ActivitySpinner module (T084).
 *
 * Verifies spinner lifecycle methods: startThinking, startToolCall,
 * completeToolCall, stop, isActive, TTY/JSON suppression, and
 * that ora is configured with discardStdin: false to avoid
 * conflicting with the app's readline on process.stdin.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ActivitySpinner, createNoOpSpinner } from '../../../src/shared/activitySpinner.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Create a writable stream that captures output. */
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ActivitySpinner (T084)', () => {
  describe('TTY mode (enabled)', () => {
    let stream: ReturnType<typeof createCaptureStream>;
    let spinner: ActivitySpinner;

    beforeEach(() => {
      stream = createCaptureStream();
      spinner = new ActivitySpinner({
        isTTY: true,
        isJsonMode: false,
        stream,
      });
    });

    it('startThinking() starts a spinner', () => {
      spinner.startThinking();
      expect(spinner.isActive()).toBe(true);
      spinner.stop();
    });

    it('startToolCall() starts/updates spinner with tool name', () => {
      spinner.startToolCall('WorkIQ');
      expect(spinner.isActive()).toBe(true);
      spinner.stop();
    });

    it('startThinking() then startToolCall() transitions spinner text', () => {
      spinner.startThinking();
      expect(spinner.isActive()).toBe(true);
      spinner.startToolCall('Context7');
      expect(spinner.isActive()).toBe(true);
      spinner.stop();
    });

    it('completeToolCall() stops spinner and prints summary', () => {
      spinner.startToolCall('WorkIQ');
      spinner.completeToolCall('WorkIQ', 'Found 12 processes');

      expect(spinner.isActive()).toBe(false);
      // Summary output is now handled by io.writeToolSummary(),
      // not by the spinner itself.
    });

    it('stop() clears any active spinner', () => {
      spinner.startThinking();
      expect(spinner.isActive()).toBe(true);
      spinner.stop();
      expect(spinner.isActive()).toBe(false);
    });

    it('isActive() returns false when no spinner is running', () => {
      expect(spinner.isActive()).toBe(false);
    });

    it('stop() is safe to call when no spinner is active', () => {
      expect(() => spinner.stop()).not.toThrow();
    });

    it('completeToolCall() works even if spinner was already stopped', () => {
      spinner.completeToolCall('GitHub', '3 repos found');
      // Should not throw; summary output handled by io.writeToolSummary()
    });

    it('handles multiple sequential tool calls', () => {
      // First tool
      spinner.startToolCall('WorkIQ');
      spinner.completeToolCall('WorkIQ', 'Found 5 processes');

      // Second tool
      spinner.startToolCall('Context7');
      spinner.completeToolCall('Context7', '12 docs retrieved');

      // Spinner should be inactive after all tools complete
      expect(spinner.isActive()).toBe(false);
      // Summary output handled by io.writeToolSummary(), not the spinner
    });
  });

  describe('non-TTY mode (disabled)', () => {
    let stream: ReturnType<typeof createCaptureStream>;
    let spinner: ActivitySpinner;

    beforeEach(() => {
      stream = createCaptureStream();
      spinner = new ActivitySpinner({
        isTTY: false,
        isJsonMode: false,
        stream,
      });
    });

    it('startThinking() is a no-op', () => {
      spinner.startThinking();
      expect(spinner.isActive()).toBe(false);
    });

    it('startToolCall() is a no-op', () => {
      spinner.startToolCall('WorkIQ');
      expect(spinner.isActive()).toBe(false);
    });

    it('completeToolCall() is a no-op (no output)', () => {
      spinner.completeToolCall('WorkIQ', 'Found stuff');
      expect(stream.getOutput()).toBe('');
    });

    it('stop() is safe and a no-op', () => {
      expect(() => spinner.stop()).not.toThrow();
    });
  });

  describe('JSON mode (disabled)', () => {
    let stream: ReturnType<typeof createCaptureStream>;
    let spinner: ActivitySpinner;

    beforeEach(() => {
      stream = createCaptureStream();
      spinner = new ActivitySpinner({
        isTTY: true,
        isJsonMode: true,
        stream,
      });
    });

    it('all operations are no-ops in JSON mode', () => {
      spinner.startThinking();
      expect(spinner.isActive()).toBe(false);
      spinner.startToolCall('WorkIQ');
      expect(spinner.isActive()).toBe(false);
      spinner.completeToolCall('WorkIQ', 'data');
      expect(stream.getOutput()).toBe('');
      spinner.stop();
    });
  });

  describe('createNoOpSpinner', () => {
    it('returns a spinner where all operations are no-ops', () => {
      const noop = createNoOpSpinner();
      expect(noop.isActive()).toBe(false);
      noop.startThinking();
      expect(noop.isActive()).toBe(false);
      noop.startToolCall('TestTool');
      expect(noop.isActive()).toBe(false);
      noop.stop();
    });
  });

  describe('ora configuration', () => {
    it('creates ora with discardStdin: false to avoid stdin conflicts', () => {
      const stream = createCaptureStream();
      const spinner = new ActivitySpinner({ isTTY: true, isJsonMode: false, stream });

      // Start thinking to trigger ora creation
      spinner.startThinking();

      // Access the internal ora instance to verify the option.
      // ora stores options in a private field, but we can verify behaviour
      // by checking that the spinner was created (isActive) and that our
      // code explicitly passes discardStdin: false in the source.
      expect(spinner.isActive()).toBe(true);

      // Verify via source inspection: read the activitySpinner source and
      // confirm discardStdin: false is present in all ora() calls
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../src/shared/activitySpinner.ts'),
        'utf8',
      );
      // Count ora constructor calls vs discardStdin: false occurrences
      const oraCallCount = (source.match(/ora\(\{/g) || []).length;
      const discardFalseCount = (source.match(/discardStdin:\s*false/g) || []).length;
      expect(oraCallCount).toBeGreaterThan(0);
      expect(discardFalseCount).toBe(oraCallCount);

      spinner.stop();
    });
  });
});
