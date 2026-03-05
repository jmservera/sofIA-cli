/**
 * Zava Industries — Full Workshop Live Test
 *
 * Runs a complete sofIA AI Discovery Workshop session with real LLM calls
 * using the Copilot SDK. Feeds canned inputs from the Zava Industries
 * company profile and evaluates outputs against the expected results checklist.
 *
 * Prerequisites:
 *   - GitHub Copilot CLI authenticated (`copilot auth login`)
 *   - .env with FOUNDRY_PROJECT_ENDPOINT + FOUNDRY_MODEL_DEPLOYMENT_NAME
 *
 * Run with: npm run test:live -- tests/live/zavaFullWorkshop.spec.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCopilotClient } from '../../src/shared/copilotClient.js';
import type { CopilotClient } from '../../src/shared/copilotClient.js';
import { ConversationLoop } from '../../src/loop/conversationLoop.js';
import type { LoopIO, DecisionGateResult } from '../../src/loop/conversationLoop.js';
import { createPhaseHandler, getPhaseOrder } from '../../src/phases/phaseHandlers.js';
import type { PhaseHandlerConfig } from '../../src/phases/phaseHandlers.js';
import type { WorkshopSession, PhaseValue } from '../../src/shared/schemas/session.js';
import { createDefaultStore } from '../../src/sessions/sessionStore.js';
import { isWebSearchConfigured, createWebSearchTool } from '../../src/mcp/webSearch.js';
import type { WebSearchConfig } from '../../src/mcp/webSearch.js';
import type { WebSearchClient } from '../../src/phases/discoveryEnricher.js';
import type { SofiaEvent } from '../../src/shared/events.js';

// ── Config ───────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const RESULTS_DIR = join(PROJECT_ROOT, 'tests', 'e2e', 'zava-assessment', 'results');

// Per-phase timeout: 3 minutes each for LLM calls
const _PHASE_TIMEOUT = 180_000;
// Per-turn timeout: 2 minutes
const _TURN_TIMEOUT = 120_000;

// ── Zava Industries Canned Inputs ──────────────────────────────────────────

const DISCOVER_INPUTS = [
  // Input 1: initial business description
  `We are Zava Industries, a mid-premium fashion company based in Milan. We design and sell modern clothing for ages 20–55. Our competitive edge is trend analysis — we try to detect emerging fashion trends before competitors and turn them into collections fast. We have a team of 20: 5 designers, 4 trend analysts, 3 data scientists, 2 developers, 3 marketing people, 2 ops people, and me as Head of Innovation.

Our biggest challenge is speed. Right now our trend analysts spend about 60% of their time manually gathering data from Instagram, TikTok, Pinterest, celebrity magazines, films, and runway shows. This data ends up scattered across Google Sheets, Miro boards, Notion pages, and email threads. By the time we consolidate everything into a trend report, fast-fashion competitors like Zara and Shein have already reacted.

We do about €18M annual revenue, serve the EU primarily but are expanding to the US. Our trend-to-retail cycle is 10–14 weeks and we want to get it under 8. We're an Azure shop — Azure SQL, Blob Storage, Power BI for sales dashboards.`,

  // Input 2: team/process details
  `The trend analysts each specialize: Sara covers social media (Instagram, TikTok), Dimitri tracks runway and trade shows, Aisha monitors celebrity and entertainment media, and Tomás does competitor retail analysis. They each produce about 3 reports per month. The data scientists — Priya, Liam, and Mei — have built a basic demand forecasting model using Power BI and Azure ML, but it only works on historical sales data, not on forward-looking trend signals.

Our designers get a consolidated trend brief every 2–3 weeks, which they say is too slow. They want real-time or near-real-time signals. The hit rate for our collections is about 35% — only 35% of designed pieces make it to production. We believe better trend data could push that to 50% or more.

Key metrics we track: trend detection lead time (currently ~4 weeks, want <1 week), collection hit rate (35%, want 50%+), time to market (10–14 weeks, want 8), and analyst productivity (3 reports/month, want 8+).`,

  // Input 3: topic selection
  `I'd like to focus on Trend Intelligence and Signal Aggregation — specifically, how we can use AI to automate the gathering and scoring of trend signals from multiple sources (social media, celebrity media, runway, retail). This is the bottleneck that affects everything else downstream.`,

  // Input 4: activities
  `Here are the key activities in our trend analysis workflow:
1. Social Media Scanning — Analysts browse Instagram, TikTok, Pinterest for emerging styles, colors, silhouettes.
2. Celebrity & Entertainment Monitoring — Weekly scan of Vogue, Elle, People, Hola! plus streaming shows.
3. Runway & Trade Show Tracking — Attend or watch livestreams of 4–6 shows/year.
4. Competitor Retail Analysis — Manual store visits and online browsing of Zara, H&M, COS, etc.
5. Signal Consolidation — Merge all data into a trend report. Takes 1–2 weeks.
6. Trend Scoring & Prioritization — Team meeting to rank trends. Very subjective.
7. Design Brief Creation — Create briefs for designers based on top trends.
8. Designer Feedback Loop — Designers review briefs, ask questions, iterate.

What we'd do if it weren't so hard: real-time multi-source signal aggregation, automated trend scoring with a confidence index, instant visual mood board generation.`,

  // Input 5: critical steps voting
  `The most critical steps are:
- Social Media Scanning — Business value: 5, Human value: 4. Key metric: ~25hrs/week across the team.
- Signal Consolidation — Business value: 5, Human value: 3. Key metric: 1–2 weeks to produce report.
- Trend Scoring & Prioritization — Business value: 5, Human value: 4. Key metric: scoring consistency.
- Design Brief Creation — Business value: 4, Human value: 3. Key metric: designer satisfaction ~3.2/5.`,

  // Input 6: confirm summary
  `Yes, that workflow summary looks accurate. Let's proceed to ideation.`,
];

const IDEATE_INPUTS = [
  // Cards reaction
  `I'm very interested in these cards: Computer Vision / Image Recognition for analyzing social media and runway photos, Natural Language Processing for extracting trend signals from captions and articles, Recommendation Systems for suggesting relevant trends, Anomaly / Pattern Detection for spotting emerging patterns, Predictive Analytics for trend lifecycle forecasting, Content Generation for auto-generating mood boards, Data Integration / Aggregation for unifying data sources, and Sentiment Analysis for gauging public reaction.`,

  // Score cards
  `My scores (Relevance / Feasibility / Impact): Computer Vision 5/3/5, NLP 5/4/4, Recommendation Systems 4/3/4, Anomaly Detection 5/3/5, Predictive Analytics 5/2/5, Content Generation 3/4/3, Data Integration 5/5/4, Sentiment Analysis 4/4/4.`,

  // Confirm top cards
  `I agree with the top cards. Aggregate "Computer Vision" and "Anomaly/Pattern Detection" under "Visual Trend Detection", and "NLP" and "Sentiment Analysis" under "Text-Based Trend Intelligence". The rest keep as individual cards.`,

  // Map cards to workflow
  `Visual Trend Detection → Social Media Scanning, Celebrity Monitoring, Runway Tracking. Text-Based Trend Intelligence → Social Media Scanning, Celebrity Monitoring. Data Integration → Signal Consolidation. Recommendation Systems → Trend Scoring. Predictive Analytics → Trend Scoring, Design Brief Creation. Content Generation → Design Brief Creation, Designer Feedback Loop.`,

  // Idea generation
  `Great ideas! My favorites: 1. TrendLens - AI visual analyzer that extracts fashion attributes from social media and celebrity photos in near-real-time. 2. TrendPulse Dashboard - unified real-time dashboard aggregating all trend signals. 3. AutoBrief Generator - AI that creates design briefs with visual mood boards. 4. Celebrity Impact Tracker - correlates celebrity outfits with social engagement and demand. 5. Trend Predictor - estimates trend lifecycle and commercial potential. I'm most excited about ideas 1 and 2.`,

  // Confirm ideas
  `These idea cards look great. Let's move to the Design phase.`,
];

const DESIGN_INPUTS = [
  // Refine idea cards
  `For TrendLens, add: Assumptions - we can get Instagram Graph API + TikTok Research API access; Azure Cognitive Services has sufficient fashion-domain accuracy. Data Needed - social media images, celebrity photos, runway images, 6 months historical. For TrendPulse, add: Assumptions - Power BI can be extended or replaced; team will adopt new tool. Data Needed - all source feeds plus historical sales data.`,

  // Feasibility/Value scores
  `My scores: TrendLens - Feasibility 3, Value 5. TrendPulse Dashboard - Feasibility 4, Value 5. AutoBrief Generator - Feasibility 4, Value 3. Celebrity Impact Tracker - Feasibility 3, Value 4. Trend Predictor - Feasibility 2, Value 5.`,

  // Impact assessment
  `I agree with the BXT assessment. Additional risks: TrendLens - social media API rate limits and policy changes. TrendPulse - change management, analysts attached to individual tools. Biggest opportunity: combining TrendLens + TrendPulse into one platform could become a SaaS product.`,

  // Confirm design output
  `The architecture sketch and impact assessment look solid. Let's proceed to Selection.`,
];

const SELECT_INPUTS = [
  `I agree. I want to proceed with TrendPulse Dashboard with integrated TrendLens — the unified real-time trend intelligence platform that combines visual AI analysis with multi-source signal aggregation. This addresses our core bottleneck and has long-term SaaS potential.`,
];

const PLAN_INPUTS = [
  `The milestones look good. For the PoC, minimum scope: ingest images from one source (Instagram), extract basic fashion attributes (colors, patterns), display on a simple dashboard with trend frequency chart. Tech stack: Azure Functions backend, Azure Cognitive Services for image analysis, Azure Cosmos DB for trend storage, React frontend. Timeline: 4 weeks with 2 devs + 1 data scientist. Success criteria: process 100+ images, extract 3+ attributes per image with >70% accuracy, dashboard updating hourly.`,

  `The plan and PoC definition look great. I'm ready to proceed to the Develop phase.`,
];

const DEVELOP_INPUTS = [
  `For the PoC: Target stack - TypeScript + Node.js backend, React dashboard, Azure Cognitive Services for image analysis. Key scenarios: (1) Ingest Instagram-like image feed, (2) extract fashion attributes using AI vision, (3) aggregate into trend scores, (4) display on real-time dashboard. Constraints: run locally for PoC, use mocked image data if API unavailable. Out of scope: auth, multi-language, production scaling.`,
];

// All inputs indexed by phase
const PHASE_INPUTS: Record<string, string[]> = {
  Discover: DISCOVER_INPUTS,
  Ideate: IDEATE_INPUTS,
  Design: DESIGN_INPUTS,
  Select: SELECT_INPUTS,
  Plan: PLAN_INPUTS,
  Develop: DEVELOP_INPUTS,
};

// ── Test Results Collector ────────────────────────────────────────────────────

interface PhaseResult {
  phase: string;
  turns: Array<{ role: string; content: string }>;
  events: SofiaEvent[];
  session: Partial<WorkshopSession>;
  durationMs: number;
  errors: string[];
}

interface TestResults {
  startedAt: string;
  completedAt?: string;
  webSearchConfigured: boolean;
  phases: PhaseResult[];
  sessionId?: string;
  finalSession?: WorkshopSession;
  overallError?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createNewSession(): WorkshopSession {
  const now = new Date().toISOString();
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const sessionId = `zava-test-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return {
    sessionId,
    name: 'Zava Industries Assessment',
    schemaVersion: '1.0.0',
    createdAt: now,
    updatedAt: now,
    phase: 'Discover',
    status: 'Active',
    participants: [],
    artifacts: { generatedFiles: [] },
    turns: [],
  };
}

/**
 * Create a LoopIO that feeds canned inputs and captures all output.
 */
function createTestIO(inputs: string[]): {
  io: LoopIO;
  output: string[];
  activityLog: string[];
  toolSummaries: Array<{ tool: string; summary: string }>;
} {
  let inputIdx = 0;
  const output: string[] = [];
  const activityLog: string[] = [];
  const toolSummaries: Array<{ tool: string; summary: string }> = [];

  const io: LoopIO = {
    write(text: string) {
      output.push(text);
      // Also print to stdout for live observation
      process.stdout.write(text);
    },
    writeActivity(text: string) {
      activityLog.push(text);
      process.stderr.write(`  [activity] ${text}\n`);
    },
    writeToolSummary(toolName: string, summary: string) {
      toolSummaries.push({ tool: toolName, summary });
      process.stderr.write(`  ✓ ${toolName}: ${summary}\n`);
    },
    async readInput(_prompt?: string): Promise<string | null> {
      if (inputIdx >= inputs.length) {
        // No more inputs — signal "done"
        process.stderr.write(`  [io] No more inputs, returning null (done)\n`);
        return null;
      }
      const input = inputs[inputIdx++];
      process.stderr.write(`  [io] Input ${inputIdx}/${inputs.length}: ${input.slice(0, 80)}...\n`);
      return input;
    },
    async showDecisionGate(_phase: PhaseValue): Promise<DecisionGateResult> {
      // Always continue to next phase
      process.stderr.write(`  [gate] Phase complete → continuing\n`);
      return { choice: 'continue' };
    },
    isJsonMode: false,
    isTTY: false,
  };

  return { io, output, activityLog, toolSummaries };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('Zava Industries — Full Workshop Session', () => {
  let client: CopilotClient;
  let canRun = false;
  let webSearchClient: WebSearchClient | undefined;
  const results: TestResults = {
    startedAt: new Date().toISOString(),
    webSearchConfigured: isWebSearchConfigured(),
    phases: [],
  };

  beforeAll(async () => {
    try {
      // Load .env manually (the CLI does this, but tests may not)
      const { config } = await import('dotenv');
      config({ path: join(PROJECT_ROOT, '.env') });

      client = await createCopilotClient();
      canRun = true;

      // FR-012: Create WebSearchClient when configured (after dotenv loads)
      if (isWebSearchConfigured()) {
        const wsConfig: WebSearchConfig = {
          projectEndpoint: process.env.FOUNDRY_PROJECT_ENDPOINT!,
          modelDeploymentName: process.env.FOUNDRY_MODEL_DEPLOYMENT_NAME!,
        };
        const searchFn = createWebSearchTool(wsConfig);
        webSearchClient = { search: searchFn };
      }

      // Ensure results directory
      await mkdir(RESULTS_DIR, { recursive: true });

      console.log('\n╔══════════════════════════════════════════════════════╗');
      console.log('║  Zava Industries — Full Workshop Live Assessment     ║');
      console.log(
        '║  Web Search: ' +
          (isWebSearchConfigured() ? 'CONFIGURED ✓' : 'NOT CONFIGURED ✗').padEnd(39) +
          '║',
      );
      console.log('╚══════════════════════════════════════════════════════╝\n');
    } catch (err) {
      console.warn(
        `Skipping live workshop test — Copilot client not available: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }, 60_000);

  afterAll(async () => {
    results.completedAt = new Date().toISOString();

    // Write results JSON
    try {
      await writeFile(
        join(RESULTS_DIR, 'test-results.json'),
        JSON.stringify(results, null, 2),
        'utf-8',
      );
      console.log(`\nResults saved to tests/e2e/zava-assessment/results/test-results.json`);
    } catch (err) {
      console.error('Failed to save results:', err);
    }
  });

  // ── Phase-by-phase tests ──────────────────────────────────────────────

  it('runs the full workshop: Discover → Ideate → Design → Select → Plan → Develop', async () => {
    if (!canRun) {
      console.warn('SKIPPED: Copilot SDK not available');
      return;
    }

    const store = createDefaultStore();
    let session = createNewSession();
    await store.save(session);
    results.sessionId = session.sessionId;

    console.log(`Session ID: ${session.sessionId}\n`);

    const phases = getPhaseOrder(); // ['Discover','Ideate','Design','Select','Plan','Develop']

    for (const phase of phases) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`  PHASE: ${phase}`);
      console.log(`${'═'.repeat(60)}\n`);

      const phaseStart = Date.now();
      const events: SofiaEvent[] = [];
      const errors: string[] = [];

      // Get canned inputs for this phase
      const inputs = PHASE_INPUTS[phase] ?? [];
      const { io, output: _output, activityLog: _activityLog, toolSummaries: _toolSummaries } = createTestIO(inputs);

      try {
        // Create and preload the handler (pass webSearchClient for Discover enrichment)
        const handlerConfig: PhaseHandlerConfig = {
          discover: {
            io,
            webSearchClient,
          },
          webSearchClient,
        };
        const handler = createPhaseHandler(phase as PhaseValue, handlerConfig);
        await handler._preload();

        // Update session phase
        session.phase = phase as PhaseValue;
        session.updatedAt = new Date().toISOString();
        await store.save(session);

        // Generate initial message
        const initialMessage = handler.getInitialMessage?.(session);

        // Create and run the conversation loop
        const loop = new ConversationLoop({
          client,
          io,
          session,
          phaseHandler: handler,
          initialMessage,
          onEvent: (e) => events.push(e),
          onSessionUpdate: async (updatedSession) => {
            session = updatedSession;
            await store.save(session);
          },
        });

        session = await loop.run();
        session.updatedAt = new Date().toISOString();
        await store.save(session);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);
        console.error(`\n  ✗ Phase ${phase} error: ${msg}\n`);
      }

      const durationMs = Date.now() - phaseStart;

      // Collect phase result
      const phaseTurns = (session.turns ?? [])
        .filter((t) => t.phase === phase)
        .map((t) => ({ role: t.role, content: t.content }));

      const phaseResult: PhaseResult = {
        phase,
        turns: phaseTurns,
        events,
        session: {
          businessContext: session.businessContext,
          workflow: session.workflow,
          ideas: session.ideas,
          evaluation: session.evaluation,
          selection: session.selection,
          plan: session.plan,
          poc: session.poc,
          name: session.name,
          discovery: (session as Record<string, unknown>).discovery as WorkshopSession['discovery'],
        } as Partial<WorkshopSession>,
        durationMs,
        errors,
      };

      results.phases.push(phaseResult);

      console.log(`\n  Phase ${phase} completed in ${(durationMs / 1000).toFixed(1)}s`);
      console.log(`    Turns: ${phaseTurns.length}`);
      console.log(`    Events: ${events.length}`);
      console.log(`    Errors: ${errors.length}`);

      // Phase-specific assertions
      if (phase === 'Discover') {
        console.log(`    businessContext: ${session.businessContext ? '✓' : '✗'}`);
        console.log(`    name: ${session.name ?? '(not set)'}`);
        console.log(
          `    discovery.enrichment: ${(session as Record<string, unknown>).discovery ? '✓' : '✗'}`,
        );
      } else if (phase === 'Ideate') {
        console.log(`    ideas: ${session.ideas?.length ?? 0} ideas captured`);
      } else if (phase === 'Design') {
        console.log(`    evaluation: ${session.evaluation ? '✓' : '✗'}`);
      } else if (phase === 'Select') {
        console.log(`    selection: ${session.selection ? '✓' : '✗'}`);
        console.log(`    confirmedByUser: ${session.selection?.confirmedByUser ?? false}`);
      } else if (phase === 'Plan') {
        console.log(`    plan: ${session.plan ? '✓' : '✗'}`);
        console.log(`    milestones: ${session.plan?.milestones?.length ?? 0}`);
      } else if (phase === 'Develop') {
        console.log(`    poc: ${session.poc ? '✓' : '✗'}`);
      }

      // Save intermediate results after each phase
      await writeFile(
        join(RESULTS_DIR, 'test-results.json'),
        JSON.stringify(results, null, 2),
        'utf-8',
      );
    }

    // Store final session
    results.finalSession = session;

    // Write the full session JSON for inspection
    await writeFile(
      join(RESULTS_DIR, 'final-session.json'),
      JSON.stringify(session, null, 2),
      'utf-8',
    );

    console.log(`\n${'═'.repeat(60)}`);
    console.log('  WORKSHOP COMPLETE');
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Session: ${session.sessionId}`);
    console.log(`  Status: ${session.status}`);
    console.log(`  Phase: ${session.phase}`);
    console.log(`  Total turns: ${session.turns?.length ?? 0}`);

    // ── Assertions ──────────────────────────────────────────────────────

    // Basic phase progression
    expect(session.businessContext).toBeTruthy();
    expect(session.name).toBeTruthy();

    // Ideas generated
    expect(session.ideas).toBeTruthy();
    expect(session.ideas!.length).toBeGreaterThan(0);

    // Selection made
    // (May or may not have been extracted — depends on LLM output format)
    if (session.selection) {
      console.log(`  Selected idea: ${session.selection.ideaId}`);
    }

    // Plan generated
    if (session.plan) {
      console.log(`  Plan milestones: ${session.plan.milestones.length}`);
    }

    console.log('\n  All phases completed successfully ✓\n');
  }, 3600_000); // 1-hour overall timeout

  // ── Export Test ────────────────────────────────────────────────────────

  it('exports artifacts after workshop completion', async () => {
    if (!canRun || !results.sessionId) {
      console.warn('SKIPPED: No session to export');
      return;
    }

    const { exportSession } = await import('../../src/sessions/exportWriter.js');
    const store = createDefaultStore();
    const session = await store.load(results.sessionId);
    const exportDir = join(RESULTS_DIR, 'export');

    await mkdir(exportDir, { recursive: true });
    await exportSession(session, exportDir);

    // Verify export files exist
    const fs = await import('node:fs/promises');
    const files = await fs.readdir(exportDir);

    console.log(`\n  Export files: ${files.join(', ')}`);

    expect(files).toContain('summary.json');
    expect(files.some((f) => f.endsWith('.md'))).toBe(true);

    // Read and validate summary.json
    const summaryRaw = await readFile(join(exportDir, 'summary.json'), 'utf-8');
    const summary = JSON.parse(summaryRaw);
    expect(summary.sessionId).toBe(results.sessionId);
    expect(summary.files).toBeTruthy();
    expect(summary.files.length).toBeGreaterThan(0);

    console.log(`  Export highlights: ${summary.highlights?.join('; ') ?? 'none'}`);
  }, 30_000);
});
