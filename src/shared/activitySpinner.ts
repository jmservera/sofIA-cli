/**
 * Activity spinner module.
 *
 * Wraps `ora` to provide unified visual feedback during LLM processing,
 * tool calls, and internal operations (FR-043a, FR-043c).
 *
 * Spinner lifecycle:
 *   User input → startThinking() → "Thinking..."
 *     → ToolCall event → startToolCall(name) → "⠋ <name>..."
 *     → ToolResult event → completeToolCall(name, summary) → "✓ <name>: <summary>"
 *                        → startThinking() (if more processing expected)
 *     → TextDelta event → stop() → stream text
 *
 * All operations are no-ops when non-TTY or JSON mode.
 */
import ora from 'ora';
import type { Ora } from 'ora';

export interface ActivitySpinnerOptions {
  isTTY: boolean;
  isJsonMode: boolean;
  debugMode?: boolean;
  /** Override stream for testing (default: process.stderr). */
  stream?: NodeJS.WritableStream;
}

export class ActivitySpinner {
  private spinner: Ora | null = null;
  private _active = false;
  private readonly enabled: boolean;
  private readonly debug: boolean;
  private readonly stream: NodeJS.WritableStream;

  constructor(options: ActivitySpinnerOptions) {
    this.enabled = options.isTTY && !options.isJsonMode;
    this.debug = options.debugMode ?? false;
    this.stream = options.stream ?? process.stderr;
  }

  /** Display "Thinking..." spinner during silent gaps. */
  startThinking(): void {
    if (!this.enabled) return;

    if (this._active && this.spinner) {
      this.spinner.text = 'Thinking...';
      return;
    }

    this.spinner = ora({
      text: 'Thinking...',
      stream: this.stream,
    }).start();
    this._active = true;
  }

  /** Transition spinner to show tool-specific status. */
  startToolCall(toolName: string): void {
    if (!this.enabled) return;

    if (this._active && this.spinner) {
      this.spinner.text = `${toolName}...`;
    } else {
      this.spinner = ora({
        text: `${toolName}...`,
        stream: this.stream,
      }).start();
      this._active = true;
    }
  }

  /**
   * Stop spinner and print a one-line tool completion summary.
   * The summary line remains visible in the output stream.
   */
  completeToolCall(toolName: string, summary: string): void {
    if (!this.enabled) return;

    if (this._active && this.spinner) {
      this.spinner.stop();
    }
    this._active = false;

    this.stream.write(`✓ ${toolName}: ${summary}\n`);
  }

  /** Stop any active spinner. */
  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
    }
    this.spinner = null;
    this._active = false;
  }

  /** Check if a spinner is currently active. */
  isActive(): boolean {
    return this._active;
  }
}

/**
 * Create a no-op spinner for tests or non-TTY environments.
 */
export function createNoOpSpinner(): ActivitySpinner {
  return new ActivitySpinner({ isTTY: false, isJsonMode: true });
}
