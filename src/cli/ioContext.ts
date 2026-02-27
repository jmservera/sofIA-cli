/**
 * IO Context.
 *
 * Detects TTY vs non-TTY, JSON mode, and provides the LoopIO
 * implementation for the ConversationLoop based on CLI options.
 */
import * as readline from 'node:readline';

import type { LoopIO, DecisionGateResult, DecisionGateChoice } from '../loop/conversationLoop.js';
import type { PhaseValue } from '../shared/schemas/session.js';
import { renderMarkdown } from '../shared/markdownRenderer.js';

export interface IoContextOptions {
  json?: boolean;
  nonInteractive?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  errorOutput?: NodeJS.WritableStream;
}

/**
 * Create a LoopIO implementation based on CLI context.
 */
export function createLoopIO(options: IoContextOptions = {}): LoopIO {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const isTTY = !options.nonInteractive && Boolean((input as NodeJS.ReadStream).isTTY);
  const isJsonMode = options.json ?? false;

  let rl: readline.Interface | null = null;

  function getReadline(): readline.Interface {
    if (!rl) {
      rl = readline.createInterface({
        input: input as NodeJS.ReadableStream,
        output: isTTY ? (output as NodeJS.WritableStream) : undefined,
        terminal: isTTY,
      });
    }
    return rl;
  }

  return {
    write(text: string): void {
      (output as NodeJS.WritableStream).write(text);
    },

    writeActivity(text: string): void {
      if (!isJsonMode) {
        (errorOutput as NodeJS.WritableStream).write(`[activity] ${text}\n`);
      }
    },

    async readInput(prompt?: string): Promise<string | null> {
      if (options.nonInteractive) {
        return null; // Non-interactive mode: no input
      }

      return new Promise((resolve) => {
        const r = getReadline();
        r.question(prompt ?? '> ', (answer) => {
          resolve(answer);
        });
        r.once('close', () => resolve(null));
      });
    },

    async showDecisionGate(phase: PhaseValue): Promise<DecisionGateResult> {
      if (isJsonMode || options.nonInteractive) {
        return { choice: 'continue' };
      }

      const phaseOrder: PhaseValue[] = [
        'Discover', 'Ideate', 'Design', 'Select', 'Plan', 'Develop', 'Complete',
      ];
      const currentIdx = phaseOrder.indexOf(phase);
      const nextPhase = currentIdx < phaseOrder.length - 1 ? phaseOrder[currentIdx + 1] : null;

      const rendered = renderMarkdown(
        `\n---\n\n**Phase "${phase}" complete.**\n\n` +
        `Options:\n` +
        `  1. Continue to ${nextPhase ?? 'Complete'}\n` +
        `  2. Refine current phase\n` +
        `  3. Return to main menu\n` +
        `  4. Exit\n`,
        { isTTY },
      );
      (output as NodeJS.WritableStream).write(rendered);

      return new Promise((resolve) => {
        const r = getReadline();
        r.question('Choose [1-4]: ', (answer) => {
          const choiceMap: Record<string, DecisionGateChoice> = {
            '1': 'continue',
            '2': 'refine',
            '3': 'menu',
            '4': 'exit',
          };
          const choice = choiceMap[answer.trim()] ?? 'continue';
          resolve({
            choice,
            targetPhase: choice === 'continue' ? (nextPhase ?? undefined) : undefined,
          });
        });
      });
    },

    isJsonMode,
    isTTY,
  };
}

/**
 * Close any open readline interfaces.
 */
export function closeIO(_io: LoopIO): void {
  // The IO might hold a readline interface — no-op if not applicable
}
