/**
 * Dynamic PoC Scaffold Generator.
 *
 * Generates initial project structure using LLM based on workshop context,
 * replacing the fixed template approach. Creates meaningful failing tests
 * that drive real implementation aligned with the workshop plan.
 *
 * Contract: Uses Copilot SDK to generate project files dynamically
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import type { CopilotClient } from '../shared/copilotClient.js';
import type { ConversationTurn } from '../shared/schemas/session.js';
import type { WorkshopSession } from '../shared/schemas/session.js';
import { exportWorkshopDocs } from '../sessions/exportWriter.js';

/** Timeout for scaffold LLM calls — 5 minutes to handle large context. */
const SCAFFOLD_TIMEOUT_MS = 300_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface DynamicScaffoldContext {
  /** Workshop session with full context */
  session: WorkshopSession;
  /** Output directory for the PoC */
  outputDir: string;
  /** Copilot client for LLM calls */
  client: CopilotClient;
}

export interface DynamicScaffoldResult {
  /** Files that were created */
  createdFiles: string[];
  /** Tech stack detected/inferred */
  techStack: {
    language: string;
    runtime: string;
    framework?: string;
    testRunner: string;
    buildCommand?: string;
  };
}

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Summarize conversation turns into a compact section for the scaffold prompt.
 * Groups by phase and includes key user/assistant exchanges so the LLM has
 * workshop context without the full (potentially huge) transcript.
 */
function summarizeConversationTurns(turns?: ConversationTurn[]): string {
  if (!turns || turns.length === 0) return '';

  const byPhase = new Map<string, ConversationTurn[]>();
  for (const t of turns) {
    const group = byPhase.get(t.phase) ?? [];
    group.push(t);
    byPhase.set(t.phase, group);
  }

  const sections: string[] = [];
  for (const [phase, phaseTurns] of byPhase) {
    const lines = phaseTurns.map((t) => `- [${t.role}]: ${t.content.slice(0, 300)}`);
    sections.push(`### ${phase}\n${lines.join('\n')}`);
  }

  return `\n## Workshop Conversation Summary\n\n${sections.join('\n\n')}\n`;
}

/**
 * Build a comprehensive prompt for scaffold generation.
 */
function buildScaffoldPrompt(session: WorkshopSession): string {
  const idea = session.ideas?.find((i) => i.id === session.selection?.ideaId);
  const ideaTitle = idea?.title ?? session.selection?.ideaId ?? 'AI Solution';
  const ideaDescription = idea?.description ?? 'AI-powered solution from workshop';

  const businessContext = session.businessContext
    ? `## Business Context\n\n` +
      `Company: ${session.businessContext.businessDescription}\n\n` +
      `Key Challenges:\n${session.businessContext.challenges?.map((c) => `- ${c}`).join('\n') ?? 'N/A'}\n\n`
    : '';

  const planContext = session.plan
    ? `## Implementation Plan\n\n` +
      `Architecture Notes:\n${session.plan.architectureNotes ?? 'Not specified'}\n\n` +
      `Dependencies:\n${session.plan.dependencies?.map((d) => `- ${d}`).join('\n') ?? 'None specified'}\n\n` +
      `Milestones:\n${session.plan.milestones?.map((m) => `- ${m.title}\n  ${m.items.map((i) => `  • ${i}`).join('\n')}`).join('\n') ?? 'Not specified'}\n\n`
    : '';

  const selectionRationale = session.selection?.selectionRationale
    ? `## Why This Idea Was Selected\n\n${session.selection.selectionRationale}\n\n`
    : '';

  const conversationSummary = summarizeConversationTurns(session.turns);

  return `# Generate Proof-of-Concept Project Structure

You are generating the initial project structure for a proof-of-concept that was designed through an AI Discovery Workshop.

${businessContext}
## Selected Idea

**Title**: ${ideaTitle}

**Description**: ${ideaDescription}

${selectionRationale}
${planContext}
## Your Task

Generate a complete, working project structure for this PoC. The project should:

1. **Use the technology stack** described in the plan (infer if not explicitly stated)
2. **Create failing tests** that describe the core functionality from the plan
3. **Include proper project setup** (package.json, tsconfig, .gitignore, README)
4. **Scaffold minimal implementation** that makes tests compile but fail

**CRITICAL**: The tests should describe REAL functionality from the plan, not trivial checks.
Tests should fail initially because the implementation doesn't exist yet.

## Output Format

Respond with fenced code blocks containing complete file contents, using the \`file=\` attribute:

\`\`\`json file=package.json
{
  "name": "my-poc",
  ...
}
\`\`\`

\`\`\`typescript file=src/index.ts
// implementation stub
\`\`\`

\`\`\`typescript file=tests/core.test.ts
// tests describing real functionality
\`\`\`

Generate all necessary files for a working project:
- package.json (with proper dependencies)
- Configuration files (tsconfig.json, .gitignore, etc.)
- Source files (src/) with stubs that throw "Not implemented"
- Test files (tests/) with meaningful assertions about expected behavior
- README.md explaining the PoC and how to run it

Focus on **quality over quantity** - generate files that matter for demonstrating the core idea.
${conversationSummary}`;
}

/**
 * Parse code blocks from LLM response.
 */
function parseCodeBlocks(response: string): Array<{ file: string; content: string }> {
  const blocks: Array<{ file: string; content: string }> = [];

  // Match fenced code blocks with file= attribute
  const regex = /```(?:\w+)?\s+file=([^\s]+)\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(response)) !== null) {
    const file = match[1].trim();
    const content = match[2];
    blocks.push({ file, content });
  }

  return blocks;
}

/**
 * Infer tech stack from generated files.
 */
function inferTechStack(
  files: Array<{ file: string; content: string }>,
): DynamicScaffoldResult['techStack'] {
  const hasPackageJson = files.some((f) => f.file === 'package.json');
  const hasTypeScript = files.some((f) => f.file.endsWith('.ts') || f.file === 'tsconfig.json');
  const hasPython = files.some(
    (f) => f.file.endsWith('.py') || f.file === 'requirements.txt' || f.file === 'pyproject.toml',
  );

  // Try to parse package.json for more details
  let testRunner = 'npm test';
  let framework: string | undefined;
  let buildCommand: string | undefined;

  const packageJson = files.find((f) => f.file === 'package.json');
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson.content);
      testRunner = pkg.scripts?.test ?? 'npm test';
      buildCommand = pkg.scripts?.build;

      // Detect framework from dependencies
      if (pkg.dependencies?.['express'] || pkg.devDependencies?.['express']) framework = 'Express';
      if (pkg.dependencies?.['react'] || pkg.devDependencies?.['react']) framework = 'React';
      if (pkg.dependencies?.['fastify'] || pkg.devDependencies?.['fastify']) framework = 'Fastify';
    } catch {
      // Ignore parse errors
    }
  }

  if (hasTypeScript) {
    return {
      language: 'TypeScript',
      runtime: 'Node.js 20',
      framework,
      testRunner,
      buildCommand,
    };
  }

  if (hasPython) {
    return {
      language: 'Python',
      runtime: 'Python 3.11+',
      testRunner: 'pytest',
      buildCommand: undefined,
    };
  }

  // Default to Node.js
  return {
    language: hasPackageJson ? 'JavaScript' : 'TypeScript',
    runtime: 'Node.js 20',
    testRunner,
    buildCommand,
  };
}

// ── Main Generator ───────────────────────────────────────────────────────────

/**
 * Generate initial PoC scaffold using LLM.
 *
 * Replaces the template-based PocScaffolder with dynamic generation
 * that's grounded in the workshop session context.
 */
export async function generateDynamicScaffold(
  context: DynamicScaffoldContext,
): Promise<DynamicScaffoldResult> {
  const { session, outputDir, client } = context;

  // Build comprehensive prompt from session
  const prompt = buildScaffoldPrompt(session);

  // Create conversation session with system prompt and extended timeout
  const conversationSession = await client.createSession({
    systemPrompt:
      'You are a senior software architect generating proof-of-concept project structures for AI solutions.',
    timeout: SCAFFOLD_TIMEOUT_MS,
  });

  // Send user prompt and collect response
  let fullResponse = '';
  const stream = conversationSession.send({
    role: 'user',
    content: prompt,
  });

  for await (const event of stream) {
    if (event.type === 'TextDelta') {
      fullResponse += event.text;
    }
  }

  // Parse file blocks from response
  const files = parseCodeBlocks(fullResponse);

  if (files.length === 0) {
    throw new Error('LLM did not generate any files. Response: ' + fullResponse.substring(0, 500));
  }

  // Write files to disk
  const createdFiles: string[] = [];

  for (const { file, content } of files) {
    const fullPath = join(outputDir, file);

    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    // Write file
    await writeFile(fullPath, content, 'utf-8');
    createdFiles.push(file);
  }

  // Export workshop documentation
  try {
    const workshopResult = await exportWorkshopDocs(session, outputDir);
    createdFiles.push(...workshopResult.createdFiles);
  } catch {
    // Non-fatal - PoC is still usable without workshop docs
  }

  // Create .sofia-metadata.json
  const metadata = {
    sessionId: session.sessionId,
    featureSpec: '002-poc-generation',
    generatedAt: new Date().toISOString(),
    ideaTitle:
      session.ideas?.find((i) => i.id === session.selection?.ideaId)?.title ?? 'AI Solution',
    totalIterations: 0,
    finalStatus: null,
    terminationReason: null,
    generatedBy: 'dynamic-scaffold',
  };

  const metadataPath = join(outputDir, '.sofia-metadata.json');
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
  createdFiles.push('.sofia-metadata.json');

  // Infer tech stack from generated files
  const techStack = inferTechStack(files);

  return {
    createdFiles,
    techStack,
  };
}
