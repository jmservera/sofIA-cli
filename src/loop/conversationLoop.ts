/**
 * ConversationLoop abstraction.
 *
 * Orchestrates multi-turn conversations with the LLM in a phase-based workflow.
 * Handles:
 * - Streaming renderer (incremental text output)
 * - Event dispatching (TextDelta, Activity, ToolCall, etc.)
 * - Ctrl+C handling (graceful shutdown)
 * - Decision gates between phases
 *
 * Single entry point for all phase-based conversations to avoid
 * duplicate inline multi-turn loops (FR-015).
 */
import type { ConversationSession, CopilotClient, CopilotMessage, SessionOptions } from '../shared/copilotClient.js';
import type { SofiaEvent } from '../shared/events.js';
import { createActivityEvent } from '../shared/events.js';
import type { PhaseValue } from '../shared/schemas/session.js';
import type { WorkshopSession } from '../shared/schemas/session.js';


// ── Types ────────────────────────────────────────────────────────────────────

export type DecisionGateChoice =
  | 'continue'
  | 'refine'
  | 'choose-phase'
  | 'menu'
  | 'exit';

export interface DecisionGateResult {
  choice: DecisionGateChoice;
  targetPhase?: PhaseValue;
}

export interface LoopIO {
  /** Write text to the user (stdout or equivalent). */
  write(text: string): void;
  /** Write activity/telemetry to stderr. */
  writeActivity(text: string): void;
  /** Read user input. Returns the input string or null on EOF/Ctrl+D. */
  readInput(prompt?: string): Promise<string | null>;
  /** Show the decision gate and get user choice. */
  showDecisionGate(phase: PhaseValue): Promise<DecisionGateResult>;
  /** Check if running in JSON mode. */
  isJsonMode: boolean;
  /** Check if TTY. */
  isTTY: boolean;
}

export interface PhaseHandler {
  /** The phase this handler manages. */
  phase: PhaseValue;
  /** Build the system prompt for this phase. */
  buildSystemPrompt(session: WorkshopSession): string;
  /** Get reference documents to include. */
  getReferences?(session: WorkshopSession): string[];
  /** Post-process the phase result (extract structured data, update session). */
  extractResult(session: WorkshopSession, response: string): Partial<WorkshopSession>;
  /** Optional: determine if the phase is complete based on conversation. */
  isComplete?(session: WorkshopSession, response: string): boolean;
}

export interface ConversationLoopOptions {
  client: CopilotClient;
  io: LoopIO;
  session: WorkshopSession;
  phaseHandler: PhaseHandler;
  onEvent?: (event: SofiaEvent) => void;
  onSessionUpdate?: (session: WorkshopSession) => Promise<void>;
}

// ── ConversationLoop ─────────────────────────────────────────────────────────

export class ConversationLoop {
  private aborted = false;
  private session: WorkshopSession;
  private readonly client: CopilotClient;
  private readonly io: LoopIO;
  private readonly handler: PhaseHandler;
  private readonly onEvent: (event: SofiaEvent) => void;
  private readonly onSessionUpdate: (session: WorkshopSession) => Promise<void>;

  constructor(options: ConversationLoopOptions) {
    this.client = options.client;
    this.io = options.io;
    this.session = { ...options.session };
    this.handler = options.phaseHandler;
    this.onEvent = options.onEvent ?? (() => {});
    this.onSessionUpdate = options.onSessionUpdate ?? (async () => {});
  }

  /** Run the conversation loop for the current phase. */
  async run(): Promise<WorkshopSession> {
    this.setupSignalHandler();

    const systemPrompt = this.handler.buildSystemPrompt(this.session);
    const references = this.handler.getReferences?.(this.session) ?? [];
    const sessionOpts: SessionOptions = { systemPrompt, references };

    const conversationSession = await this.client.createSession(sessionOpts);

    this.emitEvent(createActivityEvent(`Starting ${this.handler.phase} phase`));

    // Main conversation loop
    while (!this.aborted) {
      const userInput = await this.io.readInput(`[${this.handler.phase}] > `);

      if (userInput === null) {
        // EOF / Ctrl+D — treat as "done" signal
        break;
      }

      const trimmed = userInput.trim();
      if (trimmed.toLowerCase() === 'done' || trimmed === '') {
        // Check if handler considers the phase complete
        if (this.handler.isComplete?.(this.session, '') !== false) {
          break;
        }
        // Otherwise continue the conversation
      }

      // Send user message and stream response
      const response = await this.streamResponse(conversationSession, {
        role: 'user',
        content: trimmed,
      });

      // Accumulate turn history
      const now = new Date().toISOString();
      const turns = this.session.turns ?? [];
      turns.push(
        {
          phase: this.handler.phase,
          sequence: turns.length + 1,
          role: 'user',
          content: trimmed,
          timestamp: now,
        },
        {
          phase: this.handler.phase,
          sequence: turns.length + 2,
          role: 'assistant',
          content: response,
          timestamp: now,
        },
      );

      // Extract structured data from the response
      const updates = this.handler.extractResult(this.session, response);

      this.session = {
        ...this.session,
        ...updates,
        turns,
        updatedAt: now,
      };

      // Persist after every turn (FR-039a)
      await this.onSessionUpdate(this.session);
    }

    return this.session;
  }

  /** Stream response from the LLM and render incrementally. */
  private async streamResponse(
    session: ConversationSession,
    message: CopilotMessage,
  ): Promise<string> {
    const chunks: string[] = [];

    for await (const event of session.send(message)) {
      this.emitEvent(event);

      if (event.type === 'TextDelta') {
        chunks.push(event.text);
        if (!this.io.isJsonMode) {
          this.io.write(event.text);
        }
      } else if (event.type === 'Activity') {
        this.io.writeActivity(event.message);
      }
    }

    const fullResponse = chunks.join('');

    // In JSON mode, output the full rendered response
    if (this.io.isJsonMode) {
      this.io.write(JSON.stringify({ phase: this.handler.phase, content: fullResponse }));
    } else {
      this.io.write('\n');
    }

    return fullResponse;
  }

  private emitEvent(event: SofiaEvent): void {
    this.onEvent(event);
  }

  private setupSignalHandler(): void {
    const handler = () => {
      this.aborted = true;
      this.emitEvent(createActivityEvent('Ctrl+C received — finishing current turn'));
    };
    // Avoid MaxListenersExceededWarning when many loops are created in tests
    const current = process.listenerCount('SIGINT');
    if (current >= 10) {
      process.setMaxListeners(current + 1);
    }
    process.once('SIGINT', handler);
  }

  /** Get the current session state. */
  getSession(): WorkshopSession {
    return { ...this.session };
  }
}
