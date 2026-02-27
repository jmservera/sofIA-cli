/**
 * Export writer.
 *
 * Generates Markdown artifacts per phase and summary.json
 * under the export directory for a session.
 *
 * Contract: specs/001-cli-workshop-rebuild/contracts/export-summary-json.md
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkshopSession, PhaseValue } from '../shared/schemas/session.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportFile {
  path: string;  // Relative to export directory
  type: string;  // 'markdown' | 'json'
}

export interface ExportResult {
  exportDir: string;
  files: ExportFile[];
}

export interface ExportSummary {
  sessionId: string;
  exportedAt: string;
  phase: string;
  status: string;
  files: ExportFile[];
  highlights?: string[];
}

// ── Phase Markdown Generators ────────────────────────────────────────────────

function generateDiscoverMarkdown(session: WorkshopSession): string | null {
  const lines: string[] = ['# Discover Phase\n'];

  if (session.businessContext) {
    lines.push('## Business Context\n');
    lines.push(`**Business**: ${session.businessContext.businessDescription}\n`);
    lines.push('### Challenges\n');
    for (const c of session.businessContext.challenges) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }

  if (session.workflow) {
    lines.push('## Workflow\n');
    lines.push('### Activities\n');
    for (const act of session.workflow.activities) {
      lines.push(`- **${act.name}** (${act.id})`);
    }
    lines.push('');
    if (session.workflow.edges.length > 0) {
      lines.push('### Connections\n');
      for (const edge of session.workflow.edges) {
        lines.push(`- ${edge.from} → ${edge.to}`);
      }
      lines.push('');
    }
  }

  // Include conversation turns for this phase
  const discoverTurns = session.turns?.filter(t => t.phase === 'Discover') ?? [];
  if (discoverTurns.length > 0) {
    lines.push('## Conversation\n');
    for (const turn of discoverTurns) {
      lines.push(`**${turn.role}**: ${turn.content}\n`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function generateIdeateMarkdown(session: WorkshopSession): string | null {
  if (!session.ideas?.length) return null;

  const lines: string[] = ['# Ideate Phase\n'];
  lines.push('## Ideas\n');
  for (const idea of session.ideas) {
    lines.push(`### ${idea.title}\n`);
    lines.push(`${idea.description}\n`);
    if (idea.workflowStepIds.length > 0) {
      lines.push(`**Workflow steps**: ${idea.workflowStepIds.join(', ')}\n`);
    }
  }

  const ideateTurns = session.turns?.filter(t => t.phase === 'Ideate') ?? [];
  if (ideateTurns.length > 0) {
    lines.push('## Conversation\n');
    for (const turn of ideateTurns) {
      lines.push(`**${turn.role}**: ${turn.content}\n`);
    }
  }

  return lines.join('\n');
}

function generateDesignMarkdown(session: WorkshopSession): string | null {
  if (!session.evaluation) return null;

  const lines: string[] = ['# Design Phase\n'];
  lines.push(`## Evaluation\n`);
  lines.push(`**Method**: ${session.evaluation.method}\n`);
  lines.push('### Evaluated Ideas\n');
  for (const eval_ of session.evaluation.ideas) {
    lines.push(`- **${eval_.ideaId}**: Feasibility=${eval_.feasibility ?? 'N/A'}, Value=${eval_.value ?? 'N/A'}`);
  }
  lines.push('');

  return lines.join('\n');
}

function generateSelectMarkdown(session: WorkshopSession): string | null {
  if (!session.selection) return null;

  const lines: string[] = ['# Select Phase\n'];
  lines.push(`## Selection\n`);
  lines.push(`**Selected Idea**: ${session.selection.ideaId}\n`);
  lines.push(`**Rationale**: ${session.selection.selectionRationale}\n`);
  lines.push(`**Confirmed**: ${session.selection.confirmedByUser ? 'Yes' : 'No'}\n`);
  if (session.selection.confirmedAt) {
    lines.push(`**Confirmed At**: ${session.selection.confirmedAt}\n`);
  }

  return lines.join('\n');
}

function generatePlanMarkdown(session: WorkshopSession): string | null {
  if (!session.plan?.milestones?.length) return null;

  const lines: string[] = ['# Plan Phase\n'];
  lines.push('## Milestones\n');
  for (const m of session.plan.milestones) {
    lines.push(`### ${m.title}\n`);
    lines.push(`${m.description}\n`);
  }

  return lines.join('\n');
}

function generateDevelopMarkdown(session: WorkshopSession): string | null {
  if (!session.poc) return null;

  const lines: string[] = ['# Develop Phase\n'];
  lines.push('## PoC Requirements\n');
  if (session.poc.repoUrl) {
    lines.push(`**Repository**: ${session.poc.repoUrl}\n`);
  }
  if (session.poc.status) {
    lines.push(`**Status**: ${session.poc.status}\n`);
  }

  return lines.join('\n');
}

// ── Phase generator mapping ──────────────────────────────────────────────────

const PHASE_GENERATORS: Record<string, (session: WorkshopSession) => string | null> = {
  Discover: generateDiscoverMarkdown,
  Ideate: generateIdeateMarkdown,
  Design: generateDesignMarkdown,
  Select: generateSelectMarkdown,
  Plan: generatePlanMarkdown,
  Develop: generateDevelopMarkdown,
};

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Export a workshop session to the specified directory.
 * Generates Markdown files for each phase with data and a summary.json.
 */
export async function exportSession(
  session: WorkshopSession,
  exportDir: string,
): Promise<ExportResult> {
  await mkdir(exportDir, { recursive: true });

  const files: ExportFile[] = [];

  // Generate phase Markdown files
  for (const [phaseName, generator] of Object.entries(PHASE_GENERATORS)) {
    const content = generator(session);
    if (content) {
      const fileName = `${phaseName.toLowerCase()}.md`;
      await writeFile(join(exportDir, fileName), content, 'utf-8');
      files.push({ path: fileName, type: 'markdown' });
    }
  }

  // Generate highlights
  const highlights: string[] = [];
  if (session.businessContext) {
    highlights.push(`Business: ${session.businessContext.businessDescription}`);
  }
  if (session.selection) {
    highlights.push(`Selected idea: ${session.selection.ideaId}`);
  }
  if (session.plan?.milestones?.length) {
    highlights.push(`${session.plan.milestones.length} milestones planned`);
  }

  // Generate summary.json
  const summary: ExportSummary = {
    sessionId: session.sessionId,
    exportedAt: new Date().toISOString(),
    phase: session.phase,
    status: session.status,
    files,
    highlights: highlights.length > 0 ? highlights : undefined,
  };

  const summaryFileName = 'summary.json';
  await writeFile(
    join(exportDir, summaryFileName),
    JSON.stringify(summary, null, 2),
    'utf-8',
  );
  files.push({ path: summaryFileName, type: 'json' });

  return { exportDir, files };
}
